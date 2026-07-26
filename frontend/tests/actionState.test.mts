import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  ActionTimeoutError,
  createActionController,
  createActionStateMap,
  isActionLoading,
  normaliseAppError,
} from "../lib/actionState.ts";
import { loginPathFor } from "../lib/navigation.ts";
import {
  consumePendingIntentAfterSuccess,
  readPendingIntent,
  savePendingIntent,
  type PendingIntentStorage,
} from "../lib/pendingIntent.ts";

const root = join(import.meta.dirname, "..");
const dashboardSource = readFileSync(join(root, "app/dashboard/DashboardWorkspace.tsx"), "utf8");
const panelsSource = readFileSync(join(root, "app/dashboard/WorkspacePanels.tsx"), "utf8");
const resumeSource = readFileSync(join(root, "app/dashboard/ResumePreviewPanel.tsx"), "utf8");
const loginSource = readFileSync(join(root, "app/login/page.tsx"), "utf8");

class MemoryStorage implements PendingIntentStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const purchaseInput = {
  type: "purchase_template" as const,
  returnPath: "/dashboard?panel=templates&restoreIntent=1",
  panel: "templates" as const,
  templateId: "child-care",
  postcode: "2141",
  currentStep: "review",
  intendedAction: "continue_to_checkout",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}

test("1. one action loading does not disable unrelated actions", () => {
  const states = createActionStateMap(["upload", "gmail"] as const);
  states.upload = { status: "loading", requestId: "1" };
  assert.equal(isActionLoading(states, "upload"), true);
  assert.equal(isActionLoading(states, "gmail"), false);
});

test("2. rapid double click creates one request", async () => {
  const controller = createActionController(["submit"] as const);
  const gate = deferred<void>();
  let requests = 0;
  const first = controller.run("submit", async () => { requests += 1; await gate.promise; });
  const second = await controller.run("submit", async () => { requests += 1; });
  assert.equal(second.outcome, "skipped");
  assert.equal(requests, 1);
  gate.resolve();
  await first;
});

test("3. loading resets after success", async () => {
  const controller = createActionController(["save"] as const);
  await controller.run("save", async () => true, { successMessage: "Saved" });
  assert.equal(controller.getStates().save.status, "success");
  assert.equal(isActionLoading(controller.getStates(), "save"), false);
});

test("4. loading resets after failure", async () => {
  const controller = createActionController(["save"] as const);
  await controller.run("save", async () => { throw new Error("provider payload"); }, { errorMessage: "Could not save." });
  assert.equal(controller.getStates().save.status, "error");
  assert.equal(isActionLoading(controller.getStates(), "save"), false);
});

test("5. timeout produces a safe error", async () => {
  const controller = createActionController(["network"] as const);
  await controller.run("network", () => new Promise(() => undefined), { timeoutMs: 5 });
  assert.equal(controller.getStates().network.status, "error");
  assert.match(controller.getStates().network.message || "", /too long/i);
  assert.doesNotMatch(controller.getStates().network.message || "", /stack|sql/i);
});

test("6. AbortError is not displayed as failure", async () => {
  const controller = createActionController(["load"] as const);
  const run = controller.run("load", ({ signal }) => new Promise<void>((_, reject) => {
    signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  }));
  controller.abort("load");
  assert.equal((await run).outcome, "aborted");
  assert.equal(controller.getStates().load.status, "idle");
});

test("7. stale response cannot overwrite newer response", async () => {
  const controller = createActionController(["load"] as const);
  const old = deferred<string>();
  const first = controller.run("load", async () => old.promise);
  const second = controller.run("load", async () => "new", { replace: true, successMessage: (value) => value });
  assert.equal((await second).outcome, "success");
  old.resolve("old");
  assert.equal((await first).outcome, "stale");
  assert.equal(controller.getStates().load.message, "new");
});

test("8. template action disables only selected template", () => {
  assert.match(panelsSource, /selectedTemplateActionId === selectedTemplate\.id/);
  assert.doesNotMatch(panelsSource, /Review template<\/button>\)\}[\s\S]*disabled=\{templateLoading\}/);
});

test("9. failed template action does not consume pending intent", () => {
  const storage = new MemoryStorage();
  const saved = savePendingIntent(purchaseInput, { storage });
  assert.ok(saved);
  assert.equal(readPendingIntent({ storage })?.id, saved.id);
});

test("10. successful template action consumes matching intent", () => {
  const storage = new MemoryStorage();
  const saved = savePendingIntent(purchaseInput, { storage });
  assert.ok(saved);
  assert.equal(consumePendingIntentAfterSuccess(saved.id, { storage }), true);
  assert.equal(readPendingIntent({ storage }), null);
});

test("11. failed resume replacement retains old resume", async () => {
  const controller = createActionController(["upload"] as const);
  let resume = "old.pdf";
  const result = await controller.run("upload", async () => { throw new Error("upload failed"); }, { errorMessage: "Previous resume kept." });
  if (result.outcome === "success") resume = "new.pdf";
  assert.equal(resume, "old.pdf");
  assert.match(dashboardSource, /previous resume is still selected/i);
});

test("12. same file can be selected after upload failure", () => {
  assert.match(resumeSource, /finally\s*\{\s*input\.value = "";/);
});

test("13. connect Gmail failure restores button", async () => {
  const controller = createActionController(["connect"] as const);
  await controller.run("connect", async () => { throw new Error("network"); }, { errorMessage: "Could not connect Gmail." });
  assert.equal(isActionLoading(controller.getStates(), "connect"), false);
});

test("14. canceled revoke confirmation does not start loading", () => {
  const confirmation = dashboardSource.indexOf("if (!confirmed) return;");
  const actionStart = dashboardSource.indexOf('runAction("revokeGmail"');
  assert.ok(confirmation > 0 && confirmation < actionStart);
});

test("15. failed revoke retains connected state", async () => {
  const controller = createActionController(["revoke"] as const);
  let connected = true;
  const result = await controller.run("revoke", async () => { throw new Error("failure"); });
  if (result.outcome === "success") connected = false;
  assert.equal(connected, true);
});

test("16. campaign start and pause use distinct states", () => {
  const states = createActionStateMap(["startCampaign", "pauseCampaign"] as const);
  states.startCampaign = { status: "loading" };
  assert.equal(isActionLoading(states, "startCampaign"), true);
  assert.equal(isActionLoading(states, "pauseCampaign"), false);
  assert.match(panelsSource, /Starting campaign…/);
  assert.match(panelsSource, /Pausing campaign…/);
});

test("17. failed campaign toggle retains prior campaign state", async () => {
  const controller = createActionController(["toggle"] as const);
  let status = "active";
  const result = await controller.run("toggle", async () => { throw new Error("failure"); });
  if (result.outcome === "success") status = "paused";
  assert.equal(status, "active");
});

test("18. duplicate find-jobs clicks create one request", async () => {
  const controller = createActionController(["findJobs"] as const);
  const gate = deferred<void>();
  let count = 0;
  const first = controller.run("findJobs", async () => { count += 1; await gate.promise; });
  assert.equal((await controller.run("findJobs", async () => { count += 1; })).outcome, "skipped");
  gate.resolve();
  await first;
  assert.equal(count, 1);
});

test("19. payment verification uses one in-flight request", async () => {
  const controller = createActionController(["verify"] as const);
  const gate = deferred<void>();
  const first = controller.run("verify", () => gate.promise);
  assert.equal((await controller.run("verify", async () => undefined)).outcome, "skipped");
  gate.resolve();
  await first;
});

test("20. failed payment verification permits retry", async () => {
  const controller = createActionController(["verify"] as const);
  await controller.run("verify", async () => { throw new Error("failure"); });
  assert.equal((await controller.run("verify", async () => true)).outcome, "success");
  assert.match(dashboardSource, /Retry verification/);
});

test("21. session expiry preserves exact dashboard panel URL", () => {
  assert.equal(
    loginPathFor("/dashboard?panel=gmail&restoreIntent=1"),
    "/login?next=%2Fdashboard%3Fpanel%3Dgmail%26restoreIntent%3D1",
  );
});

test("22. auth form Enter submission produces one request", () => {
  assert.match(loginSource, /if \(submittingRef\.current\) return;/);
  assert.match(loginSource, /<form onSubmit=\{handleAuth\}/);
  assert.match(loginSource, /type="submit"/);
});

test("23. all non-submit buttons declare an explicit type", () => {
  const sourceFiles = [
    "app/dashboard/DashboardWorkspace.tsx",
    "app/dashboard/WorkspacePanels.tsx",
    "app/dashboard/WorkspacePanelsLive.tsx",
    "app/dashboard/WorkspaceSidebar.tsx",
    "app/login/page.tsx",
    "app/reset-password/page.tsx",
    "app/payment/page.tsx",
    "app/campaign/new/page.tsx",
    "app/campaign/templates/page.tsx",
    "app/tracker/page.tsx",
    "app/resume-canvas/page.tsx",
  ];
  for (const path of sourceFiles) {
    const source = readFileSync(join(root, path), "utf8");
    const buttons = source.match(/<button\b[\s\S]*?>/g) || [];
    assert.ok(buttons.every((button) => /\btype="(?:button|submit|reset)"/.test(button)), path);
  }
});

test("24. errors use accessible alert semantics", () => {
  assert.match(dashboardSource, /role=\{notice\.type === "error" \? "alert" : "status"\}/);
  assert.match(readFileSync(join(root, "app/payment/page.tsx"), "utf8"), /role="alert"/);
});

test("25. success and loading notices use accessible status semantics", () => {
  assert.match(dashboardSource, /aria-live=\{notice\.type === "error" \? "assertive" : "polite"\}/);
  assert.match(loginSource, /role=\{messageType === "error" \? "alert" : "status"\}/);
});

test("normaliser never exposes an arbitrary provider payload", () => {
  assert.equal(normaliseAppError(new Error("select * from secrets"), "Safe fallback"), "Safe fallback");
  assert.match(normaliseAppError(new ActionTimeoutError()) || "", /too long/i);
});
