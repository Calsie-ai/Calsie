import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import {
  configuredStripeLivemode,
  getStripeServerClient,
  receiveStripeEvent,
} from "../../../../lib/server/stripeWebhookProcessor";
import {
  stripeDatabaseIsConfigured,
  StripeDatabaseError,
} from "../../../../lib/server/stripeWebhookStore";

export const runtime = "nodejs";

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024;

function response(outcome: string, status = 200) {
  return NextResponse.json({
    ok: status >= 200 && status < 300,
    received: status >= 200 && status < 300,
    outcome,
  }, { status });
}

export async function POST(req: Request) {
  const stripe = getStripeServerClient();
  if (
    !stripe
    || !STRIPE_WEBHOOK_SECRET
    || !stripeDatabaseIsConfigured()
    || configuredStripeLivemode() === null
  ) {
    return response("temporarily_unavailable", 500);
  }

  const contentLength = Number(req.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_WEBHOOK_BODY_BYTES) {
    return response("payload_too_large", 413);
  }

  let body: string;
  try {
    body = await req.text();
  } catch {
    return response("invalid_payload", 400);
  }
  if (Buffer.byteLength(body, "utf8") > MAX_WEBHOOK_BODY_BYTES) {
    return response("payload_too_large", 413);
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return response("invalid_signature", 400);
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
  } catch {
    return response("invalid_signature", 400);
  }

  try {
    const outcome = await receiveStripeEvent(
      stripe,
      event,
      createHash("sha256").update(body, "utf8").digest("hex"),
    );
    if (outcome === "retryable_failed") {
      return response("retryable_failure", 500);
    }
    return response(outcome);
  } catch (error) {
    if (error instanceof StripeDatabaseError) {
      return response("retryable_failure", 500);
    }
    return response("retryable_failure", 500);
  }
}
