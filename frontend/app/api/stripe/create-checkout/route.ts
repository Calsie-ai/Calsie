import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://bnshgtrqbfuphhhdgccs.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://calsie.com.au");

const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

type CheckoutBody = {
  access_token?: string;
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

async function upsertPendingCheckout(params: {
  userId: string;
  email: string | null;
  customerId: string | null;
  sessionId: string;
  template: TemplateRow;
  postcode: string;
}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/applix_subscriptions?on_conflict=user_id`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      user_id: params.userId,
      email: params.email,
      stripe_customer_id: params.customerId,
      stripe_subscription_id: null,
      stripe_checkout_session_id: params.sessionId,
      stripe_payment_intent_id: null,
      status: "checkout_started",
      plan_name: params.template.campaign_name || params.template.title,
      price_amount: params.template.price_amount,
      currency: params.template.currency.toLowerCase(),
      current_period_end: null,
      template_id: params.template.id,
      postcode: params.postcode,
      checkout_metadata: {
        template_slug: params.template.slug,
        price_label: params.template.price_label || "one-time",
      },
      updated_at: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Could not save checkout status${details ? `: ${details.slice(0, 240)}` : "."}`);
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as CheckoutBody;
    const accessToken = body.access_token?.trim();
    const templateId = body.template_id?.trim();
    const postcode = cleanPostcode(body.postcode);

    if (!accessToken) {
      return NextResponse.json({ ok: false, error: "Missing access token." }, { status: 401 });
    }
    if (!templateId) {
      return NextResponse.json({ ok: false, error: "Missing selected template." }, { status: 400 });
    }
    if (!validAustralianPostcode(postcode)) {
      return NextResponse.json({ ok: false, error: "Enter a valid 4-digit Australian postcode." }, { status: 400 });
    }
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
    };

    const successParams = new URLSearchParams({
      payment: "success",
      template: template.id,
      postcode,
    });
    const cancelParams = new URLSearchParams({
      template: template.id,
      postcode,
      payment: "cancelled",
    });
    const successUrl = `${APP_URL}/dashboard?${successParams.toString()}&session_id={CHECKOUT_SESSION_ID}`;

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
      success_url: successUrl,
      cancel_url: `${APP_URL}/payment?${cancelParams.toString()}`,
      metadata,
      payment_intent_data: { metadata },
      allow_promotion_codes: true,
    });

    if (!session.url) {
      throw new Error("Stripe did not return a checkout URL.");
    }

    await upsertPendingCheckout({
      userId: currentUser.id,
      email: currentUser.email || null,
      customerId: typeof session.customer === "string" ? session.customer : session.customer?.id || null,
      sessionId: session.id,
      template,
      postcode,
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
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not create checkout." }, { status: 500 });
  }
}
