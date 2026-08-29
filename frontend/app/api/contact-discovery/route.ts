import { NextResponse } from "next/server";

type ContactDiscoveryPayload = {
  job?: any;
  profile?: any;
  resumeDraft?: any;
};

const PREFERRED_EMAIL_PREFIXES = ["careers", "recruitment", "jobs", "hr", "talent", "people"];
const FALLBACK_EMAIL_PREFIXES = ["info", "admin", "contact"];

export async function POST(request: Request) {
  let payload: ContactDiscoveryPayload;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const job = payload.job || {};
  const profile = payload.profile || {};
  const scraperUrl = process.env.RENDER_SCRAPER_URL;

  if (scraperUrl) {
    try {
      const response = await fetch(`${scraperUrl.replace(/\/$/, "")}/contact-discovery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobTitle: job.title || "",
          company: job.company || "",
          location: job.location || "",
          applyUrl: job.applyUrl || "",
          description: job.description || "",
          industry: profile.industry || "",
          specialisation: profile.industry_specialisation || "",
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return NextResponse.json(normaliseContactResult(data, job));
      }
    } catch {
      // Fall back to local lightweight detection below.
    }
  }

  const localEmail = findBestEmail(job.description || "");

  if (localEmail) {
    return NextResponse.json({
      ok: true,
      status: "found_email",
      applicationMethod: "email",
      hiringEmail: localEmail,
      contactConfidence: getEmailConfidence(localEmail),
      sourceUrl: job.applyUrl || null,
      notes: ["Found a public email in the job description."],
    });
  }

  return NextResponse.json({
    ok: true,
    status: job.applyUrl ? "found_apply_link" : "not_found",
    applicationMethod: job.applyUrl ? "apply_link" : "unknown",
    hiringEmail: null,
    contactConfidence: "none",
    sourceUrl: job.applyUrl || null,
    notes: job.applyUrl
      ? ["No public hiring email found yet. Use the job application gateway."]
      : ["No public hiring email or application URL found yet."],
  });
}

function normaliseContactResult(data: any, job: any) {
  const hiringEmail = data.hiringEmail || data.hiring_email || null;
  const sourceUrl = data.sourceUrl || data.source_url || job.applyUrl || null;
  const applicationMethod = data.applicationMethod || data.application_method || (hiringEmail ? "email" : sourceUrl ? "apply_link" : "unknown");

  return {
    ok: true,
    status: hiringEmail ? "found_email" : sourceUrl ? "found_apply_link" : "not_found",
    applicationMethod,
    hiringEmail,
    contactConfidence: data.contactConfidence || data.contact_confidence || (hiringEmail ? getEmailConfidence(hiringEmail) : "none"),
    sourceUrl,
    notes: Array.isArray(data.notes) && data.notes.length ? data.notes : ["Contact discovery completed."],
  };
}

function findBestEmail(text: string) {
  const emails = Array.from(new Set((text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []).map((email) => email.toLowerCase())));
  if (!emails.length) return null;

  return emails.sort((a, b) => scoreEmail(b) - scoreEmail(a))[0];
}

function scoreEmail(email: string) {
  const prefix = email.split("@")[0];
  if (PREFERRED_EMAIL_PREFIXES.some((item) => prefix.includes(item))) return 3;
  if (FALLBACK_EMAIL_PREFIXES.some((item) => prefix.includes(item))) return 2;
  return 1;
}

function getEmailConfidence(email: string) {
  const score = scoreEmail(email);
  if (score >= 3) return "high";
  if (score === 2) return "medium";
  return "low";
}
