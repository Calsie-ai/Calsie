import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createHash } from "node:crypto";
import { STRIPE_CANCEL_PATH, STRIPE_SUCCESS_PATH } from "../../../../lib/externalReturn";
import { safeInternalPath } from "../../../../lib/navigation";
import { registerCheckoutPurchase } from "../../../../lib/server/stripeWebhookStore";
import { resolveAppOrigin } from "../../../../lib/serverOrigin";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://bnshgtrqbfuphhhdgccs.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";

function getStripe() {
  return STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;
}

type CheckoutBody = {
  access_token?: string;
  intent_id?: string;
  intended_action?: string;
  originating_path?: string;
  return_path?: string;
  return_panel?: string;
  template_id?: string;
  postcode?: string;
};

type CurrentUser = {
  id?: string;
  email?: string;
};

type TemplateRow = {
  id: string;
  slug: string;
  title: string;
  campaign_name: string | null;
  description: string | null;
  price_amount: number;
  currency: string;
  price_label: string | null;
  payment_required: boolean;
};

function cleanPostcode(value: unknown) {
  return String(value ?? "").trim();
}

function validAustralianPostcode(value: string) {
  if (!/^\d{4}$/.test(value)) return false;
  const number = Number.parseInt(value, 10);
  return (
    (number >= 200 && number <= 299) ||
    (number >= 800 && number <= 999) ||
    (number >= 1000 && number <= 2599) ||
    (number >= 2600 && number <= 2618) ||
    (number >= 2619 && number <= 2899) ||
    (number >= 2900 && number <= 2920) ||
    (number >= 2921 && number <= 2999) ||
    (number >= 3000 && number <= 3999) ||
    (number >= 4000 && number <= 4999) ||
    (number >= 5000 && number <= 5999) ||
    (number >= 6000 && number <= 6999) ||
    (number >= 7000 && number <= 7999) ||
    (number >= 8000 && number <= 8999) ||
    (number >= 9000 && number <= 9999)
  );
}

async function getCurrentUser(accessToken: string) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: SUPABASE_ANON_KEY,
    },
    cache: "no-store",
  });

  if (!response.ok) return null;
  return response.json().catch(() => null) as Promise<CurrentUser | null>;
}

async function getTemplate(templateId: string) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/campaign_templates?id=eq.${encodeURIComponent(templateId)}&is_active=eq.true&select=id,slug,title,campaign_name,description,price_amount,currency,price_label,payment_required&limit=1`,
    {
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_SERVICE_ROLE_KEY,
      },
      cache: "no-store",
    },
  );
  const rows = await response.json().catch(() => []);
  if (!response.ok) throw new Error("Could not load the selected template.");
  return (Array.isArray(rows) ? rows[0] : null) as TemplateRow | null;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as CheckoutBody;
    const accessToken = body.access_token?.trim();
    const templateId = body.template_id?.trim();
    const postcode = cleanPostcode(body.postcode);
    const intentId = body.intent_id?.trim() || "";
    const returnPath = safeInternalPath(body.return_path, "/dashboard?panel=templates");
    const originatingPath = safeInternalPath(body.originating_path, "/payment?restoreIntent=1");

    if (!accessToken) {
      return NextResponse.json({ ok: false, error: "Missing access token." }, { status: 401 });
    }
    if (!templateId) {
      return NextResponse.json({ ok: false, error: "Missing selected template." }, { status: 400 });
    }
    if (!validAustralianPostcode(postcode)) {
      return NextResponse.json({ ok: false, error: "Enter a valid 4-digit Australian postcode." }, { status: 400 });
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,191}$/.test(intentId)) {
      return NextResponse.json({ ok: false, error: "The saved checkout draft is invalid. Return to templates and try again." }, { status: 400 });
    }
    if (body.return_panel !== "templates" || body.intended_action !== "continue_to_checkout") {
      return NextResponse.json({ ok: false, error: "The checkout return state is invalid." }, { status: 400 });
    }
    if (returnPath !== body.return_path || !returnPath.startsWith("/dashboard?")) {
      return NextResponse.json({ ok: false, error: "The checkout return path is invalid." }, { status: 400 });
    }
    if (originatingPath !== body.originating_path || !originatingPath.startsWith("/payment")) {
      return NextResponse.json({ ok: false, error: "The checkout origin path is invalid." }, { status: 400 });
    }
    const stripe = getStripe();
    if (!stripe || !STRIPE_SECRET_KEY) {
      return NextResponse.json({ ok: false, error: "Missing STRIPE_SECRET_KEY in Vercel." }, { status: 500 });
    }
    if (!SUPABASE_ANON_KEY) {
      return NextResponse.json({ ok: false, error: "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY." }, { status: 500 });
    }
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ ok: false, error: "Missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
    }

    const currentUser = await getCurrentUser(accessToken);
    if (!currentUser?.id) {
      return NextResponse.json({ ok: false, error: "Could not verify user." }, { status: 401 });
    }

    const template = await getTemplate(templateId);
    if (!template) {
      return NextResponse.json({ ok: false, error: "The selected template is unavailable." }, { status: 404 });
    }
    if (template.payment_required === false) {
      return NextResponse.json({ ok: false, error: "This template does not require payment." }, { status: 400 });
    }
    if (!Number.isInteger(template.price_amount) || template.price_amount <= 0) {
      return NextResponse.json({ ok: false, error: "The selected template has invalid pricing." }, { status: 409 });
    }

    const templateName = template.campaign_name || template.title;
    const currency = (template.currency || "aud").toLowerCase();
    const metadata: Record<string, string> = {
      user_id: currentUser.id,
      email: currentUser.email || "",
      template_id: template.id,
      template_slug: template.slug || "",
      template_name: templateName,
      postcode,
      price_amount: String(template.price_amount),
      currency,
      price_label: template.price_label || "one-time",
      pending_intent_id: intentId,
      return_panel: "templates",
      return_path: returnPath,
      originating_path: originatingPath,
      intended_action: "continue_to_checkout",
    };

    const appOrigin = resolveAppOrigin();

    const idempotencyKey = `applix-checkout-${createHash("sha256")
      .update(`${currentUser.id}:${intentId}:${template.id}:${postcode}`)
      .digest("hex")
      .slice(0, 40)}`;
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: currentUser.email || undefined,
      client_reference_id: currentUser.id,
      line_items: [{
        price_data: {
          currency,
          unit_amount: template.price_amount,
          product_data: {
            name: templateName,
            description: template.description || `${templateName} campaign template`,
            metadata: {
              template_id: template.id,
              template_slug: template.slug || "",
            },
          },
        },
        quantity: 1,
      }],
      success_url: `${appOrigin}${STRIPE_SUCCESS_PATH}`,
      cancel_url: `${appOrigin}${STRIPE_CANCEL_PATH}`,
      metadata,
      payment_intent_data: { metadata },
      allow_promotion_codes: true,
    }, { idempotencyKey });

    if (!session.url) {
      throw new Error("Stripe did not return a checkout URL.");
    }

    await registerCheckoutPurchase({
      userId: currentUser.id,
      email: currentUser.email || null,
      customerId: typeof session.customer === "string" ? session.customer : session.customer?.id || null,
      checkoutSessionId: session.id,
      checkoutCreatedAt: new Date(session.created * 1000).toISOString(),
      templateId: template.id,
      planName: templateName,
      expectedAmount: template.price_amount,
      currency,
      livemode: session.livemode,
      postcode,
      pendingIntentId: intentId,
      safeMetadata: {
        pending_intent_id: intentId,
        template_slug: template.slug,
        price_label: template.price_label || "one-time",
        expected_price_amount: template.price_amount,
        return_panel: "templates",
        return_path: returnPath,
        originating_path: originatingPath,
        intended_action: "continue_to_checkout",
      },
    });

    return NextResponse.json({
      ok: true,
      checkout_url: session.url,
      template_id: template.id,
      postcode,
      price_amount: template.price_amount,
      currency,
      mode: "payment",
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: "Could not create secure checkout. Your campaign details were kept." }, { status: 500 });
  }
}
