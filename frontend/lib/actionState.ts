export const DASHBOARD_ACTION_KEYS = [
  "loadDashboard",
  "loadTemplates",
  "useTemplate",
  "uploadResume",
  "connectGmail",
  "revokeGmail",
  "startCampaign",
  "pauseCampaign",
  "findJobs",
  "restoreIntent",
  "discardIntent",
  "verifyPayment",
  "logout",
] as const;

export type DashboardActionKey = (typeof DASHBOARD_ACTION_KEYS)[number];
export type ActionStatus = "idle" | "loading" | "success" | "error";

export type ActionState = {
  status: ActionStatus;
  message?: string;
  requestId?: string;
};

export type ActionStateMap<Key extends string = DashboardActionKey> = Record<Key, ActionState>;

export type AppNotice<Key extends string = DashboardActionKey> = {
  type: "success" | "error" | "info" | "warning";
  message: string;
  actionKey?: Key;
};

export const ACTION_TIMEOUTS = {
  ordinary: 15_000,
  upload: 60_000,
  payment: 20_000,
  gmail: 20_000,
  campaignSearch: 30_000,
} as const;

export class ActionTimeoutError extends Error {
  constructor(message = "This action took too long. Please check your connection and try again.") {
    super(message);
    this.name = "ActionTimeoutError";
  }
}

export function withActionTimeout<T>(
  promise: Promise<T>,
  milliseconds: number = ACTION_TIMEOUTS.ordinary,
  onTimeout?: () => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout?.();
      reject(new ActionTimeoutError());
    }, milliseconds);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

export function createActionStateMap<Key extends string>(keys: readonly Key[]): ActionStateMap<Key> {
  return Object.fromEntries(keys.map((key) => [key, { status: "idle" }])) as ActionStateMap<Key>;
}

export function isActionLoading<Key extends string>(states: ActionStateMap<Key>, key: Key) {
  return states[key].status === "loading";
}

export function isAbortError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === "AbortError")
    || (error instanceof Error && error.name === "AbortError")
  );
}

function errorText(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error) {
    const candidate = error as { message?: unknown; error_description?: unknown; code?: unknown };
    if (typeof candidate.message === "string") return candidate.message;
    if (typeof candidate.error_description === "string") return candidate.error_description;
    if (typeof candidate.code === "string") return candidate.code;
  }
  return typeof error === "string" ? error : "";
}

export function normaliseAppError(error: unknown, fallback = "Something went wrong. Please try again.") {
  if (isAbortError(error)) return null;
  if (error instanceof ActionTimeoutError) return error.message;

  const raw = errorText(error).toLowerCase();
  if (raw.includes("jwt") || raw.includes("session") || raw.includes("not authenticated") || raw.includes("auth session missing")) {
    return "Your session expired. Sign in again to continue.";
  }
  if (raw.includes("failed to fetch") || raw.includes("network") || raw.includes("load failed")) {
    return "The service could not be reached. Check your internet connection and try again.";
  }
  if (raw.includes("invalid json") || raw.includes("unexpected end of json") || raw.includes("json response")) {
    return "The service returned an invalid response. Please try again.";
  }
  if (raw.includes("timeout") || raw.includes("timed out") || raw.includes("too long")) {
    return "This action took too long. Check your connection and try again.";
  }
  if (raw.includes("invalid login credentials")) {
    return "Wrong email or password. If you forgot it, reset your password.";
  }
  if (raw.includes("email not confirmed")) {
    return "Your email is not confirmed yet. Check your inbox before signing in.";
  }
  return fallback;
}

export function isSessionExpiryError(error: unknown) {
  const raw = errorText(error).toLowerCase();
  return raw.includes("jwt") || raw.includes("session") || raw.includes("not authenticated") || raw.includes("auth session missing");
}

export async function readJsonResponse<T>(response: Response, fallback: string): Promise<T> {
  let result: T;
  try {
    result = await response.json() as T;
  } catch {
    throw new Error("Invalid JSON response");
  }
  if (!response.ok) {
    const candidate = result as { error?: unknown; message?: unknown };
    const providerMessage = typeof candidate.error === "string"
      ? candidate.error
      : typeof candidate.message === "string"
        ? candidate.message
        : "";
    throw new Error(providerMessage || fallback);
  }
  return result;
}

export type ActionRunResult<T> =
  | { outcome: "success"; value: T; requestId: string }
  | { outcome: "error"; error: unknown; requestId: string }
  | { outcome: "aborted" | "stale" | "skipped"; requestId?: string };

export type ActionRunOptions<T> = {
  timeoutMs?: number;
  replace?: boolean;
  successMessage?: string | ((value: T) => string);
  errorMessage?: string;
};

type InFlight = {
  controller: AbortController;
  requestId: string;
};

export type ActionController<Key extends string> = {
  abort: (key: Key) => void;
  abortAll: () => void;
  getStates: () => ActionStateMap<Key>;
  run: <T>(
    key: Key,
    task: (context: { signal: AbortSignal; requestId: string }) => Promise<T>,
    options?: ActionRunOptions<T>,
  ) => Promise<ActionRunResult<T>>;
  subscribe: (listener: (states: ActionStateMap<Key>) => void) => () => void;
};

let requestSequence = 0;

export function createActionController<Key extends string>(keys: readonly Key[]): ActionController<Key> {
  let states = createActionStateMap(keys);
  const inFlight = new Map<Key, InFlight>();
  const listeners = new Set<(states: ActionStateMap<Key>) => void>();

  const update = (key: Key, state: ActionState) => {
    states = { ...states, [key]: state };
    listeners.forEach((listener) => listener(states));
  };

  const abort = (key: Key) => {
    inFlight.get(key)?.controller.abort();
  };

  const run: ActionController<Key>["run"] = async (key, task, options = {}) => {
    const existing = inFlight.get(key);
    if (existing && !options.replace) return { outcome: "skipped", requestId: existing.requestId };
    existing?.controller.abort();

    const controller = new AbortController();
    const requestId = `${Date.now().toString(36)}-${(++requestSequence).toString(36)}`;
    inFlight.set(key, { controller, requestId });
    update(key, { status: "loading", requestId });

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutMs = options.timeoutMs ?? ACTION_TIMEOUTS.ordinary;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new ActionTimeoutError());
      }, timeoutMs);
    });

    try {
      const value = await Promise.race([task({ signal: controller.signal, requestId }), timeout]);
      if (inFlight.get(key)?.requestId !== requestId) return { outcome: "stale", requestId };
      const message = typeof options.successMessage === "function"
        ? options.successMessage(value)
        : options.successMessage;
      update(key, { status: "success", message, requestId });
      return { outcome: "success", value, requestId };
    } catch (error) {
      if (inFlight.get(key)?.requestId !== requestId) return { outcome: "stale", requestId };
      if (isAbortError(error)) {
        update(key, { status: "idle" });
        return { outcome: "aborted", requestId };
      }
      const message = normaliseAppError(error, options.errorMessage);
      update(key, { status: "error", message: message || options.errorMessage, requestId });
      return { outcome: "error", error, requestId };
    } finally {
      if (timer) clearTimeout(timer);
      if (inFlight.get(key)?.requestId === requestId) {
        inFlight.delete(key);
        if (states[key].status === "loading") update(key, { status: "idle" });
      }
    }
  };

  return {
    abort,
    abortAll: () => {
      inFlight.forEach(({ controller }) => controller.abort());
      inFlight.clear();
      keys.forEach((key) => {
        if (states[key].status === "loading") update(key, { status: "idle" });
      });
    },
    getStates: () => states,
    run,
    subscribe: (listener) => {
      listeners.add(listener);
      listener(states);
      return () => listeners.delete(listener);
    },
  };
}

export function noticeForAction<Key extends string>(
  key: Key,
  state: ActionState,
): AppNotice<Key> | null {
  if (!state.message) return null;
  return {
    actionKey: key,
    message: state.message,
    type: state.status === "error" ? "error" : state.status === "success" ? "success" : "info",
  };
}
