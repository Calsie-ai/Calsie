type Row = Record<string, unknown>;

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const MODEL = Deno.env.get("OPENAI_CONTACT_RESOLVER_MODEL") || "gpt-4o-mini";

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function text(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function cleanEmail(value: unknown): string | null {
  const email = text(value).toLowerCase().replace(/^mailto:/, "").split("?")[0].replace(/[),.;:'"\]>]+$/g, "");
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function extractEmails(value: unknown): string[] {
  const source = typeof value === "string" ? value : JSON.stringify(value || {});
  const matches = source.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return [...new Set(matches.map(cleanEmail).filter(Boolean) as string[])];
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return reply({ ok: false, error: "Use POST" }, 405);
    if (!OPENAI_API_KEY) return reply({ ok: false, error: "Missing OPENAI_API_KEY" }, 500);

    const input = await req.json().catch(() => ({})) as Row;
    const company = text(input.company_name || input.company);
    const title = text(input.job_title || input.title);
    const location = text(input.location);
    const description = text(input.description).slice(0, 12000);
    const rawPayload = input.raw_payload || {};
    const applyUrl = text(input.apply_url || input.job_url);
    const emailCandidates = [...new Set([
      ...extractEmails(description),
      ...extractEmails(rawPayload),
      ...(Array.isArray(input.email_candidates) ? input.email_candidates.map(cleanEmail).filter(Boolean) as string[] : []),
    ])];

    if (!company || !title) {
      return reply({ ok: false, error: "company_name and job_title are required" }, 400);
    }

    const payload = {
      company_name: company,
      job_title: title,
      location,
      apply_url: applyUrl,
      description,
      raw_payload: rawPayload,
      email_candidates: emailCandidates,
    };

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.1,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "job_contact_resolution",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                decision: { type: "string", enum: ["use_direct_email", "search_company", "manual_review"] },
                selected_email: { type: ["string", "null"] },
                search_query: { type: ["string", "null"] },
                confidence: { type: "number", minimum: 0, maximum: 1 },
                reason: { type: "string" },
              },
              required: ["decision", "selected_email", "search_query", "confidence", "reason"],
            },
          },
        },
        messages: [
          {
            role: "system",
            content: "You are Applix's job contact resolver. Use only supplied facts. Never invent an email. A selected email must exactly match one item in email_candidates. If a suitable email is explicitly present in the job information, choose use_direct_email. Otherwise choose search_company and create one concise search query using the exact company name, job title, and useful location plus contact, careers, recruitment, or email. Do not reject a company merely because it offers several different services. Choose manual_review only when the company identity is too ambiguous. Return JSON only.",
          },
          { role: "user", content: JSON.stringify(payload) },
        ],
      }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`OpenAI failed ${response.status}: ${JSON.stringify(body).slice(0, 600)}`);

    const result = JSON.parse(body.choices?.[0]?.message?.content || "{}");
    const selectedEmail = cleanEmail(result.selected_email);
    const selectedIsCandidate = selectedEmail ? emailCandidates.includes(selectedEmail) : false;

    if (result.decision === "use_direct_email" && !selectedIsCandidate) {
      return reply({
        ok: true,
        model: MODEL,
        decision: "manual_review",
        selected_email: null,
        search_query: null,
        confidence: 0,
        reason: "Model selected an email that was not present in the supplied job data.",
        email_candidates: emailCandidates,
        usage: body.usage || null,
      });
    }

    return reply({
      ok: true,
      model: MODEL,
      decision: result.decision,
      selected_email: selectedEmail,
      search_query: text(result.search_query) || null,
      confidence: Number(result.confidence || 0),
      reason: text(result.reason),
      email_candidates: emailCandidates,
      usage: body.usage || null,
    });
  } catch (error) {
    return reply({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
