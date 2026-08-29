import type { WorkspaceTab } from "../app/dashboard/workspace-data";
import { inferAustralianPostcode } from "./australianPostcode.ts";
import { isDashboardPanel } from "./dashboardNavigation.ts";
import { safeInternalPath } from "./navigation.ts";

export const PENDING_INTENT_STORAGE_KEY = "applix.pendingIntent.v1";
export const PENDING_INTENT_TTL_MS = 24 * 60 * 60 * 1000;

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_FORM_BYTES = 20_000;
const MAX_FORM_DEPTH = 3;
const MAX_FORM_KEYS = 64;
const SAFE_PATH_SENTINEL = "/__invalid_pending_intent__";
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const INTENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,191}$/;
const SENSITIVE_KEY_PATTERN = /(access.?token|refresh.?token|password|secret|service.?role|stripe|oauth.?token|file.?object|resume.?content)/i;

const INTENT_TYPES = [
  "create_campaign",
  "purchase_template",
  "connect_gmail",
  "upload_resume",
] as const;

export type PendingIntentType = (typeof INTENT_TYPES)[number];

export type PendingIntentV1 = {
  version: 1;
  id: string;
  type: PendingIntentType;
  returnPath: string;
  panel: WorkspaceTab;
  templateId?: string;
  templateSlug?: string;
  campaignId?: string;
  postcode?: string;
  prompt?: string;
  formValues?: Record<string, unknown>;
  currentStep?: string;
  intendedAction?: string;
  createdAt: string;
  expiresAt: string;
  userHint?: string;
};

export type PendingIntentStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type StorageOptions = {
  storage?: PendingIntentStorage | null;
  now?: Date;
};

export type SavePendingIntentInput = Omit<
  PendingIntentV1,
  "version" | "id" | "createdAt" | "expiresAt"
> & {
  id?: string;
};

function getStorage(storage?: PendingIntentStorage | null) {
  if (storage !== undefined) return storage;
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isBoundedString(value: unknown, maximum: number, allowEmpty = false) {
  return typeof value === "string"
    && (allowEmpty || value.trim().length > 0)
    && value.length <= maximum;
}

function isOptionalBoundedString(value: unknown, maximum: number) {
  return value === undefined || isBoundedString(value, maximum);
}

function isValidIdentifier(value: unknown) {
  return typeof value === "string" && IDENTIFIER_PATTERN.test(value);
}

function isValidIsoTimestamp(value: unknown) {
  if (typeof value !== "string") return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

function isSafeReturnPath(value: unknown) {
  if (typeof value !== "string") return false;
  return safeInternalPath(value, SAFE_PATH_SENTINEL) === value;
}

function isSafeFormValue(value: unknown, depth: number, keyCounter: { value: number }): boolean {
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "string") return value.length <= 4_000;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "function" || typeof value === "symbol" || typeof value === "bigint" || value === undefined) return false;
  if (depth >= MAX_FORM_DEPTH) return false;

  if (Array.isArray(value)) {
    return value.length <= 64
      && value.every((item) => isSafeFormValue(item, depth + 1, keyCounter));
  }

  if (!isRecord(value)) return false;
  const entries = Object.entries(value);
  keyCounter.value += entries.length;
  if (keyCounter.value > MAX_FORM_KEYS) return false;

  return entries.every(([key, item]) => (
    key.length > 0
    && key.length <= 80
    && !SENSITIVE_KEY_PATTERN.test(key)
    && isSafeFormValue(item, depth + 1, keyCounter)
  ));
}

function isSafeFormValues(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  try {
    if (JSON.stringify(value).length > MAX_FORM_BYTES) return false;
  } catch {
    return false;
  }
  return isSafeFormValue(value, 0, { value: 0 });
}

function isAllowedType(value: unknown): value is PendingIntentType {
  return typeof value === "string" && (INTENT_TYPES as readonly string[]).includes(value);
}

function hasExpectedWorkflow(intent: PendingIntentV1) {
  const parsed = new URL(intent.returnPath, "https://applix.invalid");
  if (intent.type === "create_campaign") {
    return intent.panel === "campaign"
      && parsed.pathname === "/campaign/new"
      && parsed.searchParams.get("restoreIntent") === "1";
  }
  if (intent.type === "purchase_template") {
    return intent.panel === "templates"
      && parsed.pathname === "/dashboard"
      && parsed.searchParams.get("panel") === "templates"
      && parsed.searchParams.get("restoreIntent") === "1";
  }
  if (intent.type === "connect_gmail") {
    return intent.panel === "gmail"
      && parsed.pathname === "/dashboard"
      && parsed.searchParams.get("panel") === "gmail"
      && parsed.searchParams.get("restoreIntent") === "1";
  }
  return intent.panel === "resume"
    && parsed.pathname === "/dashboard"
    && parsed.searchParams.get("panel") === "resume"
    && parsed.searchParams.get("restoreIntent") === "1";
}

export function validatePendingIntent(
  value: unknown,
  now = new Date(),
): PendingIntentV1 | null {
  if (!isRecord(value)) return null;
  if (value.version !== 1) return null;
  if (typeof value.id !== "string" || !INTENT_ID_PATTERN.test(value.id)) return null;
  if (!isAllowedType(value.type) || !isDashboardPanel(value.panel)) return null;
  if (!isSafeReturnPath(value.returnPath)) return null;
  if (!isValidIsoTimestamp(value.createdAt) || !isValidIsoTimestamp(value.expiresAt)) return null;

  const createdAt = Date.parse(String(value.createdAt));
  const expiresAt = Date.parse(String(value.expiresAt));
  const nowMilliseconds = now.getTime();
  if (expiresAt <= createdAt || expiresAt - createdAt > PENDING_INTENT_TTL_MS) return null;
  if (createdAt > nowMilliseconds + MAX_CLOCK_SKEW_MS || expiresAt <= nowMilliseconds) return null;

  if (value.postcode !== undefined && (
    typeof value.postcode !== "string"
    || value.postcode !== value.postcode.trim()
    || !inferAustralianPostcode(value.postcode).valid
  )) return null;

  if (value.templateId !== undefined && !isValidIdentifier(value.templateId)) return null;
  if (value.templateSlug !== undefined && !isValidIdentifier(value.templateSlug)) return null;
  if (value.campaignId !== undefined && !isValidIdentifier(value.campaignId)) return null;
  if (value.userHint !== undefined && !isValidIdentifier(value.userHint)) return null;
  if (!isOptionalBoundedString(value.prompt, 4_000)) return null;
  if (!isOptionalBoundedString(value.currentStep, 100)) return null;
  if (!isOptionalBoundedString(value.intendedAction, 100)) return null;
  if (value.formValues !== undefined && !isSafeFormValues(value.formValues)) return null;

  const intent = value as PendingIntentV1;
  return hasExpectedWorkflow(intent) ? intent : null;
}

function removeMatchingIntent(
  intentId: string,
  options: StorageOptions = {},
) {
  const storage = getStorage(options.storage);
  if (!storage) return false;

  try {
    const current = readPendingIntent(options);
    if (!current || current.id !== intentId) return false;
    storage.removeItem(PENDING_INTENT_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

function createIntentId() {
  try {
    if (typeof globalThis.crypto?.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }
  } catch {
    // Fall through to a non-sensitive local identifier.
  }
  return `intent-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function savePendingIntent(
  input: SavePendingIntentInput,
  options: StorageOptions = {},
): PendingIntentV1 | null {
  const storage = getStorage(options.storage);
  if (!storage) return null;

  const now = options.now ?? new Date();
  const current = readPendingIntent({ ...options, storage });
  if (input.id && current && current.id !== input.id) {
    return null;
  }

  const id = input.id || createIntentId();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + PENDING_INTENT_TTL_MS).toISOString();
  const candidate: PendingIntentV1 = {
    ...input,
    version: 1,
    id,
    createdAt,
    expiresAt,
  };
  const intent = validatePendingIntent(candidate, now);
  if (!intent) return null;

  try {
    storage.setItem(PENDING_INTENT_STORAGE_KEY, JSON.stringify(intent));
    return intent;
  } catch {
    return null;
  }
}

export function readPendingIntent(
  options: StorageOptions = {},
): PendingIntentV1 | null {
  const storage = getStorage(options.storage);
  if (!storage) return null;

  try {
    const raw = storage.getItem(PENDING_INTENT_STORAGE_KEY);
    if (!raw) return null;
    const intent = validatePendingIntent(JSON.parse(raw), options.now ?? new Date());
    if (intent) return intent;
    storage.removeItem(PENDING_INTENT_STORAGE_KEY);
    return null;
  } catch {
    try {
      storage.removeItem(PENDING_INTENT_STORAGE_KEY);
    } catch {
      // Storage is unavailable. Treat it as an absent intent.
    }
    return null;
  }
}

export function clearExpiredPendingIntent(
  options: StorageOptions = {},
) {
  const storage = getStorage(options.storage);
  if (!storage) return false;

  try {
    const raw = storage.getItem(PENDING_INTENT_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const expiresAt = typeof parsed.expiresAt === "string" ? Date.parse(parsed.expiresAt) : Number.NaN;
    if (Number.isFinite(expiresAt) && expiresAt > (options.now ?? new Date()).getTime()) return false;
    storage.removeItem(PENDING_INTENT_STORAGE_KEY);
    return true;
  } catch {
    try {
      storage.removeItem(PENDING_INTENT_STORAGE_KEY);
      return true;
    } catch {
      return false;
    }
  }
}

export function hasRestorablePendingIntent(
  userHint?: string,
  options: StorageOptions = {},
) {
  const intent = readPendingIntent(options);
  if (!intent) return false;
  return !intent.userHint || intent.userHint === userHint;
}

export function claimPendingIntentForUser(
  intentId: string,
  userHint: string,
  options: StorageOptions = {},
) {
  const intent = readPendingIntent(options);
  if (!intent || intent.id !== intentId || !isValidIdentifier(userHint)) return null;
  if (intent.userHint && intent.userHint !== userHint) return null;
  return savePendingIntent({ ...intent, id: intent.id, userHint }, options);
}

export function consumePendingIntentAfterSuccess(
  intentId: string,
  options: StorageOptions = {},
) {
  return removeMatchingIntent(intentId, options);
}

export function discardPendingIntent(
  intentId: string,
  options: StorageOptions = {},
) {
  return removeMatchingIntent(intentId, options);
}

export function pendingIntentMatchesWorkflow(
  intent: PendingIntentV1,
  pathname: string,
  panel?: WorkspaceTab,
) {
  const parsed = new URL(intent.returnPath, "https://applix.invalid");
  return parsed.pathname === pathname && (!panel || intent.panel === panel);
}
