export const STRIPE_SUCCESS_PATH = "/dashboard?panel=templates&payment=success&session_id={CHECKOUT_SESSION_ID}";
export const STRIPE_CANCEL_PATH = "/dashboard?panel=templates&payment=cancelled";

export const PAYMENT_RETURN_PARAMS = ["payment", "session_id"] as const;
export const GMAIL_RETURN_PARAMS = ["gmail", "reason"] as const;

export const GMAIL_ERROR_REASONS = [
  "access_denied",
  "invalid_state",
  "expired_state",
  "account_mismatch",
  "exchange_failed",
  "storage_failed",
  "unknown",
] as const;

export type GmailErrorReason = (typeof GMAIL_ERROR_REASONS)[number];

export type ExternalReturnKind =
  | "stripe_success"
  | "stripe_cancelled"
  | "gmail_connected"
  | "gmail_error";

export type ExternalReturnPhase =
  | "idle"
  | "departing"
  | "returned"
  | "verifying"
  | "confirmed"
  | "pending"
  | "cancelled"
  | "failed"
  | "processed";

export type ExternalReturnState = {
  kind: ExternalReturnKind | null;
  phase: ExternalReturnPhase;
  key: string;
};

export type ExternalReturnEvent =
  | { type: "depart"; kind: ExternalReturnKind; key?: string }
  | { type: "return"; kind: ExternalReturnKind; key?: string }
  | { type: "verify" }
  | { type: "confirm" }
  | { type: "pending" }
  | { type: "cancel" }
  | { type: "fail" }
  | { type: "process" }
  | { type: "reset" };

export const IDLE_EXTERNAL_RETURN: ExternalReturnState = {
  kind: null,
  phase: "idle",
  key: "",
};

type SearchParamsReader = {
  get(name: string): string | null;
};

export type ParsedExternalReturn =
  | { kind: "stripe_success"; sessionId: string | null; invalidSession: boolean }
  | { kind: "stripe_cancelled" }
  | { kind: "gmail_connected" }
  | { kind: "gmail_error"; reason: GmailErrorReason };

export type PaymentVerificationStatus =
  | "confirmed"
  | "pending"
  | "failed"
  | "expired"
  | "cancelled"
  | "mismatch"
  | "not_found";

export type PaymentVerificationResponse = {
  ok: boolean;
  status: PaymentVerificationStatus;
  checkoutSessionId?: string;
  templateId?: string;
  postcode?: string;
  paymentStatus?: "paid" | "no_payment_required";
};

export function isCheckoutSessionId(value: unknown): value is string {
  return typeof value === "string"
    && /^cs_(?:test|live)_[A-Za-z0-9_]{8,240}$/.test(value);
}

export function isGmailErrorReason(value: unknown): value is GmailErrorReason {
  return typeof value === "string"
    && (GMAIL_ERROR_REASONS as readonly string[]).includes(value);
}

export function parseExternalReturn(params: SearchParamsReader): ParsedExternalReturn | null {
  const payment = params.get("payment");
  if (payment === "success") {
    const rawSessionId = params.get("session_id");
    return {
      kind: "stripe_success",
      sessionId: isCheckoutSessionId(rawSessionId) ? rawSessionId : null,
      invalidSession: !isCheckoutSessionId(rawSessionId),
    };
  }
  if (payment === "cancelled") return { kind: "stripe_cancelled" };

  const gmail = params.get("gmail");
  if (gmail === "connected") return { kind: "gmail_connected" };
  if (gmail === "error") {
    const reason = params.get("reason");
    return {
      kind: "gmail_error",
      reason: isGmailErrorReason(reason) ? reason : "unknown",
    };
  }
  return null;
}

export function transitionExternalReturn(
  state: ExternalReturnState,
  event: ExternalReturnEvent,
): ExternalReturnState {
  if (event.type === "reset") return IDLE_EXTERNAL_RETURN;
  if (event.type === "depart") {
    return { kind: event.kind, phase: "departing", key: event.key || "" };
  }
  if (event.type === "return") {
    return { kind: event.kind, phase: "returned", key: event.key || "" };
  }
  if (event.type === "verify") return { ...state, phase: "verifying" };
  if (event.type === "confirm") return { ...state, phase: "confirmed" };
  if (event.type === "pending") return { ...state, phase: "pending" };
  if (event.type === "cancel") return { ...state, phase: "cancelled" };
  if (event.type === "fail") return { ...state, phase: "failed" };
  return { ...state, phase: "processed" };
}

export function paymentVerificationKey(sessionId: string, intentId: string) {
  return `${sessionId}:${intentId}`;
}

export function gmailReturnMessage(reason: GmailErrorReason) {
  const messages: Record<GmailErrorReason, string> = {
    access_denied: "Gmail connection was cancelled. Your existing connection and campaign were kept.",
    invalid_state: "This Gmail connection link could not be verified. Start a new connection from the Gmail panel.",
    expired_state: "This Gmail connection request expired. Start a new connection from the Gmail panel.",
    account_mismatch: "The selected Google account did not match your signed-in account. Your existing connection was kept.",
    exchange_failed: "Google could not finish the Gmail connection. Try connecting again.",
    storage_failed: "Gmail was authorized but the connection could not be saved. Try connecting again.",
    unknown: "Gmail could not be connected. Your existing connection and campaign were kept.",
  };
  return messages[reason];
}

export function isConfirmedPaymentStatus(value: PaymentVerificationResponse) {
  return value.ok
    && value.status === "confirmed"
    && (value.paymentStatus === "paid" || value.paymentStatus === "no_payment_required");
}

