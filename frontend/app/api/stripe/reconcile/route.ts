import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  configuredStripeLivemode,
  getStripeServerClient,
  processClaimedStripeEventById,
} from "../../../../lib/server/stripeWebhookProcessor";
import {
  claimStripeEvents,
  rejectExhaustedStripeEvents,
  stripeDatabaseIsConfigured,
} from "../../../../lib/server/stripeWebhookStore";

export const runtime = "nodejs";

const RECONCILIATION_ENABLED =
  process.env.STRIPE_RECONCILIATION_ENABLED === "true";
const RECONCILIATION_SECRET =
  process.env.STRIPE_RECONCILIATION_SECRET || "";

function authorized(req: Request) {
  const supplied = req.headers.get("authorization") || "";
  const expected = `Bearer ${RECONCILIATION_SECRET}`;
  if (!RECONCILIATION_SECRET || supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

export async function POST(req: Request) {
  if (!RECONCILIATION_ENABLED) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const stripe = getStripeServerClient();
  if (
    !stripe
    || !stripeDatabaseIsConfigured()
    || configuredStripeLivemode() === null
  ) {
    return NextResponse.json({ ok: false, error: "temporarily_unavailable" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({})) as { batch_size?: number };
  const requestedBatchSize = Number(body.batch_size ?? 10);
  const batchSize = Number.isFinite(requestedBatchSize)
    ? Math.min(Math.max(Math.trunc(requestedBatchSize), 1), 25)
    : 10;

  try {
    const rejectedBeforeClaim = await rejectExhaustedStripeEvents();
    const claimed = await claimStripeEvents(batchSize);
    const results = [];
    for (const ledgerEvent of claimed) {
      const outcome = await processClaimedStripeEventById(
        stripe,
        ledgerEvent.stripe_event_id,
        ledgerEvent.processing_attempt_count,
      );
      results.push({
        event_id: ledgerEvent.stripe_event_id,
        outcome,
      });
    }
    const rejectedAfterClaim = await rejectExhaustedStripeEvents();

    return NextResponse.json({
      ok: true,
      claimed: claimed.length,
      exhausted: Number(rejectedBeforeClaim || 0) + Number(rejectedAfterClaim || 0),
      results,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "temporarily_unavailable" }, { status: 503 });
  }
}
