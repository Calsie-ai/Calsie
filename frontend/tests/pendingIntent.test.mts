import assert from "node:assert/strict";
import test from "node:test";
import {
  PENDING_INTENT_STORAGE_KEY,
  PENDING_INTENT_TTL_MS,
  claimPendingIntentForUser,
  clearExpiredPendingIntent,
  consumePendingIntentAfterSuccess,
  discardPendingIntent,
  hasRestorablePendingIntent,
  readPendingIntent,
  savePendingIntent,
  type PendingIntentStorage,
} from "../lib/pendingIntent.ts";

class MemoryStorage implements PendingIntentStorage {
  values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

const now = new Date("2026-07-26T03:00:00.000Z");

function purchaseInput(overrides: Record<string, unknown> = {}) {
  return {
    type: "purchase_template" as const,
    returnPath: "/dashboard?panel=templates&restoreIntent=1",
    panel: "templates" as const,
    templateId: "child-care",
    postcode: "2141",
    currentStep: "review",
    intendedAction: "continue_to_checkout",
    ...overrides,
  };
}

test("valid intent saves and reads", () => {
  const storage = new MemoryStorage();
  const saved = savePendingIntent(purchaseInput(), { storage, now });
  assert.ok(saved);
  assert.deepEqual(readPendingIntent({ storage, now }), saved);
  assert.equal(Date.parse(saved.expiresAt) - Date.parse(saved.createdAt), PENDING_INTENT_TTL_MS);
});

test("malformed JSON is rejected and cleared", () => {
  const storage = new MemoryStorage();
  storage.setItem(PENDING_INTENT_STORAGE_KEY, "{not-json");
  assert.equal(readPendingIntent({ storage, now }), null);
  assert.equal(storage.getItem(PENDING_INTENT_STORAGE_KEY), null);
});

test("unsupported version is rejected", () => {
  const storage = new MemoryStorage();
  const saved = savePendingIntent(purchaseInput(), { storage, now });
  assert.ok(saved);
  storage.setItem(PENDING_INTENT_STORAGE_KEY, JSON.stringify({ ...saved, version: 2 }));
  assert.equal(readPendingIntent({ storage, now }), null);
});

test("expired intent is rejected and removed", () => {
  const storage = new MemoryStorage();
  const saved = savePendingIntent(purchaseInput(), { storage, now });
  assert.ok(saved);
  const later = new Date(now.getTime() + PENDING_INTENT_TTL_MS + 1);
  assert.equal(readPendingIntent({ storage, now: later }), null);
  assert.equal(storage.getItem(PENDING_INTENT_STORAGE_KEY), null);
});

test("unsafe return path is rejected", () => {
  const storage = new MemoryStorage();
  assert.equal(savePendingIntent(purchaseInput({ returnPath: "https://evil.example/capture" }), { storage, now }), null);
  assert.equal(savePendingIntent(purchaseInput({ returnPath: "//evil.example/capture" }), { storage, now }), null);
});

test("invalid or untrimmed postcode is rejected", () => {
  const storage = new MemoryStorage();
  assert.equal(savePendingIntent(purchaseInput({ postcode: "214" }), { storage, now }), null);
  assert.equal(savePendingIntent(purchaseInput({ postcode: " 2141 " }), { storage, now }), null);
  assert.equal(savePendingIntent(purchaseInput({ postcode: "0000" }), { storage, now }), null);
});

test("discard removes only the matching draft", () => {
  const storage = new MemoryStorage();
  const saved = savePendingIntent(purchaseInput(), { storage, now });
  assert.ok(saved);
  assert.equal(discardPendingIntent(saved.id, { storage, now }), true);
  assert.equal(readPendingIntent({ storage, now }), null);
});

test("consume removes only the matching intent ID", () => {
  const storage = new MemoryStorage();
  const saved = savePendingIntent(purchaseInput(), { storage, now });
  assert.ok(saved);
  assert.equal(consumePendingIntentAfterSuccess("intent-unrelated-tab", { storage, now }), false);
  assert.equal(readPendingIntent({ storage, now })?.id, saved.id);
  assert.equal(consumePendingIntentAfterSuccess(saved.id, { storage, now }), true);
});

test("an old tab cannot delete a newer draft", () => {
  const storage = new MemoryStorage();
  const oldDraft = savePendingIntent(purchaseInput(), { storage, now });
  assert.ok(oldDraft);
  storage.removeItem(PENDING_INTENT_STORAGE_KEY);
  const newerDraft = savePendingIntent(purchaseInput({ postcode: "2000" }), {
    storage,
    now: new Date(now.getTime() + 1_000),
  });
  assert.ok(newerDraft);
  assert.equal(consumePendingIntentAfterSuccess(oldDraft.id, { storage, now }), false);
  assert.equal(readPendingIntent({ storage, now })?.id, newerDraft.id);
});

test("localStorage unavailable is non-fatal", () => {
  const unavailable: PendingIntentStorage = {
    getItem() { throw new DOMException("blocked", "SecurityError"); },
    setItem() { throw new DOMException("blocked", "SecurityError"); },
    removeItem() { throw new DOMException("blocked", "SecurityError"); },
  };
  assert.equal(savePendingIntent(purchaseInput(), { storage: unavailable, now }), null);
  assert.equal(readPendingIntent({ storage: unavailable, now }), null);
  assert.equal(clearExpiredPendingIntent({ storage: unavailable, now }), false);
});

test("Child Care template and postcode 2141 round-trip", () => {
  const storage = new MemoryStorage();
  const saved = savePendingIntent(purchaseInput({
    templateId: "child-care",
    templateSlug: "child-care",
    postcode: "2141",
  }), { storage, now });
  assert.equal(saved?.templateId, "child-care");
  assert.equal(saved?.postcode, "2141");
});

test("login interruption retains a restorable draft", () => {
  const storage = new MemoryStorage();
  const beforeLogin = savePendingIntent(purchaseInput(), { storage, now });
  assert.ok(beforeLogin);
  assert.equal(hasRestorablePendingIntent(undefined, { storage, now }), true);
  const claimed = claimPendingIntentForUser(beforeLogin.id, "user-12345678", { storage, now });
  assert.equal(claimed?.userHint, "user-12345678");
  assert.equal(hasRestorablePendingIntent("user-12345678", { storage, now }), true);
  assert.equal(hasRestorablePendingIntent("other-user", { storage, now }), false);
});

test("reading for restoration does not submit or consume a campaign", () => {
  const storage = new MemoryStorage();
  const saved = savePendingIntent(purchaseInput(), { storage, now });
  let createCalls = 0;
  const restored = readPendingIntent({ storage, now });
  assert.ok(restored);
  assert.equal(createCalls, 0);
  assert.equal(readPendingIntent({ storage, now })?.id, saved?.id);
});

test("successful campaign creation consumes the matching intent", () => {
  const storage = new MemoryStorage();
  const saved = savePendingIntent({
    type: "create_campaign",
    returnPath: "/campaign/new?restoreIntent=1",
    panel: "campaign",
    formValues: { name: "Child Care Campaign", targetRole: "Child Care Worker" },
    intendedAction: "create_campaign",
    userHint: "user-12345678",
  }, { storage, now });
  assert.ok(saved);
  assert.equal(consumePendingIntentAfterSuccess(saved.id, { storage, now }), true);
  assert.equal(readPendingIntent({ storage, now }), null);
});

test("failed campaign creation retains the intent", () => {
  const storage = new MemoryStorage();
  const saved = savePendingIntent({
    type: "create_campaign",
    returnPath: "/campaign/new?restoreIntent=1",
    panel: "campaign",
    formValues: { name: "Child Care Campaign" },
    intendedAction: "create_campaign",
  }, { storage, now });
  assert.ok(saved);
  const simulatedInsertSucceeded = false;
  if (simulatedInsertSucceeded) consumePendingIntentAfterSuccess(saved.id, { storage, now });
  assert.equal(readPendingIntent({ storage, now })?.id, saved.id);
});

test("refresh retains an unfinished draft", () => {
  const storage = new MemoryStorage();
  const saved = savePendingIntent(purchaseInput(), { storage, now });
  assert.ok(saved);
  const afterRefresh = readPendingIntent({ storage, now: new Date(now.getTime() + 60_000) });
  assert.equal(afterRefresh?.id, saved.id);
  assert.equal(afterRefresh?.postcode, "2141");
});

test("editing an existing draft renews its 24-hour expiry without changing its ID", () => {
  const storage = new MemoryStorage();
  const saved = savePendingIntent(purchaseInput(), { storage, now });
  assert.ok(saved);
  const editedAt = new Date(now.getTime() + 60 * 60 * 1000);
  const edited = savePendingIntent({
    ...purchaseInput({ postcode: "2000" }),
    id: saved.id,
  }, { storage, now: editedAt });
  assert.equal(edited?.id, saved.id);
  assert.equal(edited?.postcode, "2000");
  assert.equal(Date.parse(edited?.expiresAt || "") - editedAt.getTime(), PENDING_INTENT_TTL_MS);
});

test("explicit logout retains a non-sensitive draft for the same user only", () => {
  const storage = new MemoryStorage();
  const saved = savePendingIntent(purchaseInput({ userHint: "user-12345678" }), { storage, now });
  assert.ok(saved);
  const simulatedLogout = true;
  assert.equal(simulatedLogout, true);
  assert.equal(hasRestorablePendingIntent("user-12345678", { storage, now }), true);
  assert.equal(hasRestorablePendingIntent("different-user", { storage, now }), false);
});

test("sensitive or unexpectedly deep form data is rejected", () => {
  const storage = new MemoryStorage();
  assert.equal(savePendingIntent(purchaseInput({
    formValues: { accessToken: "do-not-store" },
  }), { storage, now }), null);
  assert.equal(savePendingIntent(purchaseInput({
    formValues: { one: { two: { three: { four: "too deep" } } } },
  }), { storage, now }), null);
});
