import { serve } from "std/http/server.ts";
import { createClient } from "supabase";

type Row = Record<string, any>;

type EmailResult = {
  email: string | null;
  confidence: number;
  source: string;
  raw: unknown;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const EMAIL_FINDER_URL = Deno.env.get("EMAIL_FINDER_URL") || "";
const EMAIL_FINDER_API_KEY = Deno.env.get("EMAIL_FINDER_API_KEY") || "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function text(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const clean = String(value).trim();
  return clean ? clean : null;
}

function cleanEmail(value: unknown): string | null {
  const email = text(value)?.toLowerCase() || null;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;

  const blocked = [
    "hostsajan",
    "example.com",
    "test.com",
    "noreply",
    "no-reply",
    "indeed.com",
    "linkedin.com",
    "seek.com",
    "google.com",
  ];

  return blocked.some((part) => email.includes(part)) ? null : email;
}

function normaliseCompany(value: unknown): string | null {
  return text(value)?.toLowerCase().replace(/\s+/g, " ") || null;
}

function normaliseDomain(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;

  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const host = new URL(withProtocol).hostname.toLowerCase();
    return host.replace(/^www\./, "") || null;
  } catch {
    return raw
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0] || null;
  }
}

function companyWebsite(job: Row): string | null {
  return (
    text(job.company_website) ||
    text(job.raw_payload?.company_website) ||
    text(job.raw_payload?.website) ||
    text(job.raw_payload?.companyWebsite) ||
    text(job.raw_payload?.employer_website) ||
    null
  );
}

function rawEmailCandidates(payload: unknown): unknown[] {
  const body = payload as Row;
  return [
    body?.email,
    body?.found_email,
    body?.contact_email,
    body?.company_email,
    body?.data?.email,
    body?.data?.found_email,
    body?.data?.contact_email,
    ...(Array.isArray(body?.emails) ? body.emails : []),
    ...(Array.isArray(body?.data?.emails) ? body.data.emails : []),
    ...(Array.isArray(body?.results) ? body.results.map((item: Row) => item.email || item.value) : []),
  ];
}

function confidenceFromPayload(payload: unknown): number {
  const body = payload as Row;
  const value = body?.confidence || body?.score || body?.data?.confidence || body?.data?.score;
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : 0;
}

async function findReusableEmail(supabase: ReturnType<typeof createClient>, job: Row) {
  const company = normaliseCompany(job.company);
  const domain = normaliseDomain(companyWebsite(job));

  if (company) {
    const byCompany = await supabase
      .from("lead_contact_emails")
      .select("id,email,reuse_count")
      .eq("status", "active")
      .ilike("company_name", job.company)
      .order("last_used_at", { ascending: false, nullsFirst: false })
      .limit(10);

    if (byCompany.error) throw new Error(byCompany.error.message);

    const match = (byCompany.data || [])
      .map((row: Row) => ({ ...row, email: cleanEmail(row.email) }))
      .find((row: Row) => row.email);
    if (match) return match;
  }

  if (domain) {
    const byDomain = await supabase
      .from("lead_contact_emails")
      .select("id,email,reuse_count")
      .eq("status", "active")
      .ilike("company_website", `%${domain}%`)
      .order("last_used_at", { ascending: false, nullsFirst: false })
      .limit(10);

    if (byDomain.error) throw new Error(byDomain.error.message);

    const match = (byDomain.data || [])
      .map((row: Row) => ({ ...row, email: cleanEmail(row.email) }))
      .find((row: Row) => row.email);
    if (match) return match;
  }

  return null;
}

async function callEmailFinder(job: Row): Promise<EmailResult> {
  if (!EMAIL_FINDER_URL || !EMAIL_FINDER_API_KEY) {
    return {
      email: null,
      confidence: 0,
      source: "email_finder_not_configured",
      raw: { error: "EMAIL_FINDER_URL or EMAIL_FINDER_API_KEY is missing" },
    };
  }

  const response = await fetch(EMAIL_FINDER_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${EMAIL_FINDER_API_KEY}`,
      "x-api-key": EMAIL_FINDER_API_KEY,
    },
    body: JSON.stringify({
      company_name: job.company,
      company_website: companyWebsite(job),
      job_title: job.title,
      job_url: job.apply_url,
      raw_payload: job.raw_payload || {},
    }),
  });

  const textBody = await response.text().catch(() => "");
  let payload: unknown = textBody;
  try {
    payload = textBody ? JSON.parse(textBody) : {};
  } catch {
    payload = { raw: textBody };
  }

  if (!response.ok) {
    throw new Error(`Email finder failed ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
  }

  return {
    email: rawEmailCandidates(payload).map(cleanEmail).find(Boolean) || null,
    confidence: confidenceFromPayload(payload),
    source: "email_finder_api",
    raw: payload,
  };
}

async function saveReusableEmail(
  supabase: ReturnType<typeof createClient>,
  job: Row,
  email: string,
  result: EmailResult,
) {
  const now = new Date().toISOString();
  const payload = {
    user_identifier: text(job.user_identifier) || text(job.user_id) || "system",
    campaign_id: job.campaign_id || null,
    job_id: job.id,
    company_name: job.company,
    company_website: companyWebsite(job),
    email,
    email_type: "job_contact",
    source: result.source,
    confidence: result.confidence,
    status: "active",
    raw_source: {
      job_id: job.id,
      job_url: job.apply_url,
      source: result.source,
      provider_result: result.raw,
    },
    last_used_at: now,
    updated_at: now,
  };

  const existing = await supabase
    .from("lead_contact_emails")
    .select("id,reuse_count")
    .eq("user_identifier", payload.user_identifier)
    .eq("email", payload.email)
    .limit(1);

  if (existing.error) throw new Error(existing.error.message);

  const existingRow = (existing.data || [])[0];
  if (existingRow) {
    const update = await supabase
      .from("lead_contact_emails")
      .update({
        campaign_id: payload.campaign_id,
        job_id: payload.job_id,
        company_name: payload.company_name,
        company_website: payload.company_website,
        email_type: payload.email_type,
        source: payload.source,
        confidence: payload.confidence,
        status: payload.status,
        raw_source: payload.raw_source,
        reuse_count: Number(existingRow.reuse_count || 0) + 1,
        last_used_at: now,
        updated_at: now,
      })
      .eq("id", existingRow.id)
      .select("id")
      .single();

    if (update.error) throw new Error(update.error.message);
    return update.data.id as string;
  }

  const insert = await supabase
    .from("lead_contact_emails")
    .insert(payload)
    .select("id")
    .single();

  if (insert.error) throw new Error(insert.error.message);
  return insert.data.id as string;
}

async function updateJob(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  patch: Row,
) {
  const result = await supabase
    .from("jobs")
    .update({
      ...patch,
      email_extraction_attempted_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (result.error) throw new Error(result.error.message);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ ok: false, error: "Use POST" }, 405);
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json({ ok: false, error: "Missing Supabase service role configuration" }, 500);
    }

    const input = await req.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(25, Number(input.limit || 10)));
    const campaignId = text(input.campaign_id);
    const userId = text(input.user_id);
    const now = new Date().toISOString();

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    let query = supabase
      .from("jobs")
      .select("*")
      .is("extracted_email", null)
      .or("email_extraction_status.is.null,email_extraction_status.in.(not_started,failed)")
      .lt("email_extraction_attempt_count", 1)
      .not("company", "is", null)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (campaignId) query = query.eq("campaign_id", campaignId);
    if (userId) query = query.eq("user_id", userId);

    const { data: jobs, error } = await query;
    if (error) throw new Error(error.message);

    let reusedCount = 0;
    let apiCalledCount = 0;
    let foundCount = 0;
    let notFoundCount = 0;
    let skippedCount = 0;

    for (const job of jobs || []) {
      const attemptCount = Number(job.email_extraction_attempt_count || 0);

      if (cleanEmail(job.extracted_email) || attemptCount >= 1 || !text(job.company)) {
        skippedCount += 1;
        continue;
      }

      const reusable = await findReusableEmail(supabase, job);
      if (reusable?.email) {
        await updateJob(supabase, job.id, {
          extracted_email: reusable.email,
          email_contact_id: reusable.id,
          apply_method: "email",
          email_extraction_status: "found",
          email_extraction_source: "reused_lead_contact_emails",
          email_extraction_confidence: 80,
          email_extraction_error: null,
          email_extraction_attempt_count: attemptCount + 1,
        });

        const reuseUpdate = await supabase
          .from("lead_contact_emails")
          .update({
            reuse_count: Number(reusable.reuse_count || 0) + 1,
            last_used_at: now,
            updated_at: now,
          })
          .eq("id", reusable.id);

        if (reuseUpdate.error) throw new Error(reuseUpdate.error.message);

        reusedCount += 1;
        foundCount += 1;
        continue;
      }

      const nextAttemptCount = attemptCount + 1;

      try {
        if (!EMAIL_FINDER_URL || !EMAIL_FINDER_API_KEY) {
          await updateJob(supabase, job.id, {
            apply_method: "url",
            email_extraction_status: "failed",
            email_extraction_source: "email_finder_not_configured",
            email_extraction_error: "EMAIL_FINDER_URL or EMAIL_FINDER_API_KEY is missing",
            email_extraction_attempt_count: nextAttemptCount,
          });

          skippedCount += 1;
          continue;
        }

        apiCalledCount += 1;
        const result = await callEmailFinder(job);
        const email = cleanEmail(result.email);

        if (email) {
          const contactId = await saveReusableEmail(supabase, job, email, result);

          await updateJob(supabase, job.id, {
            extracted_email: email,
            email_contact_id: contactId,
            apply_method: "email",
            email_extraction_status: "found",
            email_extraction_source: result.source,
            email_extraction_confidence: result.confidence,
            email_extraction_error: null,
            email_extraction_attempt_count: nextAttemptCount,
          });

          foundCount += 1;
        } else {
          await updateJob(supabase, job.id, {
            apply_method: "url",
            email_extraction_status: "not_found",
            email_extraction_source: result.source,
            email_extraction_confidence: result.confidence,
            email_extraction_error: null,
            email_extraction_attempt_count: nextAttemptCount,
          });

          notFoundCount += 1;
        }
      } catch (error) {
        await updateJob(supabase, job.id, {
          apply_method: "url",
          email_extraction_status: "failed",
          email_extraction_error: error instanceof Error ? error.message : String(error),
          email_extraction_attempt_count: nextAttemptCount,
        });
        skippedCount += 1;
      }
    }

    return json({
      ok: true,
      function: "enrich-job-emails",
      limit,
      reused_count: reusedCount,
      api_called_count: apiCalledCount,
      found_count: foundCount,
      not_found_count: notFoundCount,
      skipped_count: skippedCount,
    });
  } catch (error) {
    return json({
      ok: false,
      function: "enrich-job-emails",
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
