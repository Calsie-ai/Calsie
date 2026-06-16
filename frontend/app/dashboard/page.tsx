"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "../../lib/supabaseClient";

type Campaign = {
  id: string;
  name: string;
  location: string | null;
  target_business_type: string | null;
  search: { target_role?: string; target_location?: string | null } | null;
  outreach: { daily_cap?: number; hourly_cap?: number; campaign_days?: number } | null;
  status: string;
  created_at: string;
};

type JobTrackerRow = {
  queue_id: string;
  campaign_id: string;
  campaign_name: string;
  job_name: string;
  company_name: string;
  website: string | null;
  progress: string;
  ai_subject?: string | null;
};

const TEST_RECIPIENT_EMAIL = "hostsajan@gmail.com";

const JOB_PROGRESS_OPTIONS = [
  { value: "generated", label: "Generated" },
  { value: "emailed", label: "Email sent" },
  { value: "email_replied", label: "Email replied" },
  { value: "interview_set", label: "Interview set" },
  { value: "interview_done", label: "Done interview" },
  { value: "offer", label: "Offer" },
  { value: "rejected", label: "Rejected" },
  { value: "closed", label: "Closed" },
];

function getCampaignRole(campaign: Campaign) {
  return campaign.search?.target_role || campaign.target_business_type || "Target not set";
}

function getCampaignLocation(campaign: Campaign) {
  return campaign.search?.target_location || campaign.location || "";
}

function getDailyCap(campaign: Campaign) {
  return campaign.outreach?.daily_cap || 100;
}

function getHourlyCap(campaign: Campaign) {
  return campaign.outreach?.hourly_cap || 5;
}

function getCampaignDays(campaign: Campaign) {
  return campaign.outreach?.campaign_days || 10;
}

function shortJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function textValue(value: unknown) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function getFirstValue(row: any, keys: string[]) {
  for (const key of keys) {
    const value = textValue(row?.[key]);
    if (value) return value;
  }
  return "";
}

function normalizeWebsite(value: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function getProgressLabel(value: string) {
  return JOB_PROGRESS_OPTIONS.find((option) => option.value === value)?.label || value;
}

export default function DashboardPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [jobTrackerRows, setJobTrackerRows] = useState<JobTrackerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [trackerLoading, setTrackerLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [gmailStatus, setGmailStatus] = useState("Not connected");
  const [connectingGmail, setConnectingGmail] = useState(false);
  const [launchingCampaignId, setLaunchingCampaignId] = useState("");
  const [updatingTrackerId, setUpdatingTrackerId] = useState("");
  const [launchResult, setLaunchResult] = useState<any>(null);

  async function loadJobTrackerRows(campaignList: Campaign[]) {
    if (!campaignList.length) {
      setJobTrackerRows([]);
      return;
    }

    setTrackerLoading(true);

    try {
      const supabase = getSupabaseClient();
      const campaignById = new Map(campaignList.map((campaign) => [campaign.id, campaign]));
      const campaignIds = campaignList.map((campaign) => campaign.id);

      const { data: queueData, error: queueError } = await supabase
        .from("outreach_queue")
        .select("id,campaign_id,campaign_lead_id,status,review_status,recipient_email,ai_notes,created_at")
        .in("campaign_id", campaignIds)
        .order("created_at", { ascending: false })
        .limit(100);

      if (queueError) {
        setJobTrackerRows([]);
        return;
      }

      const queueRows = queueData || [];
      const leadIds = Array.from(new Set(queueRows.map((row: any) => row.campaign_lead_id).filter(Boolean)));
      const leadById = new Map<string, any>();

      if (leadIds.length) {
        const { data: leadsData } = await supabase
          .from("campaign_leads")
          .select("*")
          .in("id", leadIds);

        for (const lead of leadsData || []) {
          leadById.set(String(lead.id), lead);
        }
      }

      const rows = queueRows.map((queue: any) => {
        const campaign = campaignById.get(String(queue.campaign_id));
        const lead = leadById.get(String(queue.campaign_lead_id)) || {};
        const aiNotes = typeof queue.ai_notes === "object" && queue.ai_notes !== null ? queue.ai_notes : {};
        const companyName =
          getFirstValue(lead, ["company_name", "business_name", "name", "title", "employer", "organisation"]) ||
          "Company not found";
        const jobName =
          getFirstValue(lead, ["job_title", "role", "position", "title", "business_category", "category"]) ||
          aiNotes.ai_subject ||
          getCampaignRole(campaign || ({} as Campaign));
        const website = normalizeWebsite(
          getFirstValue(lead, ["website", "website_url", "url", "domain", "company_website"])
        );

        return {
          queue_id: String(queue.id),
          campaign_id: String(queue.campaign_id),
          campaign_name: campaign?.name || "Campaign",
          job_name: jobName,
          company_name: companyName,
          website,
          progress: aiNotes.job_tracker_status || (queue.status === "sent" ? "emailed" : "generated"),
          ai_subject: aiNotes.ai_subject || null,
        } as JobTrackerRow;
      });

      setJobTrackerRows(rows);
    } catch {
      setJobTrackerRows([]);
    } finally {
      setTrackerLoading(false);
    }
  }

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);
      setErrorMessage("");
      setSuccessMessage("");

      try {
        const supabase = getSupabaseClient();
        const { data: userData, error: userError } = await supabase.auth.getUser();

        if (userError || !userData.user) {
          router.replace("/");
          return;
        }

        setEmail(userData.user.email || "");

        const { data, error } = await supabase
          .from("campaigns")
          .select("id,name,location,target_business_type,search,outreach,status,created_at")
          .eq("user_id", userData.user.id)
          .order("created_at", { ascending: false });

        if (error) {
          setErrorMessage(error.message);
          return;
        }

        const loadedCampaigns = (data || []) as Campaign[];
        setCampaigns(loadedCampaigns);
        await loadJobTrackerRows(loadedCampaigns);

        const { data: authData } = await supabase
          .from("user_email_authorizations")
          .select("status,provider_email")
          .eq("user_identifier", userData.user.email || userData.user.id)
          .eq("provider", "google")
          .maybeSingle();

        if (authData?.status) {
          setGmailStatus(authData.provider_email ? `${authData.status}: ${authData.provider_email}` : authData.status);
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Could not load dashboard.");
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, [router]);

  async function signOut() {
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
    router.replace("/");
  }

  async function connectGmail() {
    setConnectingGmail(true);
    setErrorMessage("");
    setSuccessMessage("");
    setLaunchResult(null);

    try {
      const supabase = getSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        throw new Error("Missing login session. Please sign in again.");
      }

      const response = await fetch("/api/applix/connect-gmail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: accessToken,
          return_to: `${window.location.origin}/dashboard`,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Google authorization URL was not returned.");
      }

      window.location.href = data.authorization_url;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not start Gmail connection.");
      setConnectingGmail(false);
    }
  }

  async function launchApplixTest(campaignId: string) {
    setLaunchingCampaignId(campaignId);
    setErrorMessage("");
    setSuccessMessage("");
    setLaunchResult(null);

    try {
      const supabase = getSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        throw new Error("Missing login session. Please sign in again.");
      }

      const response = await fetch("/api/applix/launch-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: accessToken,
          campaign_id: campaignId,
          batch_size: 10,
          user_identifier: email,
        }),
      });

      const data = await response.json().catch(() => ({}));
      setLaunchResult(data.result || data);

      const result = data.result || {};
      const version = result.version || "unknown";
      const sentCount = result.sent_count ?? 0;
      const gmailStatusCode = result.gmail_send_status ?? "not returned";
      const disabled = result.sends_disabled_in_this_gateway;

      if (!response.ok || !data.ok) {
        const errors = Array.isArray(result.errors) ? result.errors.join(" | ") : data.error;
        throw new Error(errors || "Could not launch Applix test.");
      }

      setSuccessMessage(`Launch result: ${version}. Sent count: ${sentCount}. Gmail status: ${gmailStatusCode}. Sending disabled: ${disabled}. Test inbox: ${TEST_RECIPIENT_EMAIL}.`);
      await loadJobTrackerRows(campaigns);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not launch Applix test.");
    } finally {
      setLaunchingCampaignId("");
    }
  }

  async function updateJobProgress(row: JobTrackerRow, nextProgress: string) {
    setUpdatingTrackerId(row.queue_id);
    setErrorMessage("");
    setSuccessMessage("");

    const previousRows = jobTrackerRows;
    setJobTrackerRows((rows) => rows.map((item) => item.queue_id === row.queue_id ? { ...item, progress: nextProgress } : item));

    try {
      const supabase = getSupabaseClient();
      const { data: currentRow, error: readError } = await supabase
        .from("outreach_queue")
        .select("ai_notes")
        .eq("id", row.queue_id)
        .maybeSingle();

      if (readError) throw readError;

      const existingNotes = typeof currentRow?.ai_notes === "object" && currentRow.ai_notes !== null ? currentRow.ai_notes : {};
      const { error: updateError } = await supabase
        .from("outreach_queue")
        .update({
          ai_notes: {
            ...existingNotes,
            job_tracker_status: nextProgress,
            job_tracker_status_label: getProgressLabel(nextProgress),
            job_tracker_updated_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.queue_id);

      if (updateError) throw updateError;

      setSuccessMessage(`Updated ${row.company_name} to ${getProgressLabel(nextProgress)}.`);
    } catch (error) {
      setJobTrackerRows(previousRows);
      setErrorMessage(error instanceof Error ? error.message : "Could not update job progress.");
    } finally {
      setUpdatingTrackerId("");
    }
  }

  return (
    <main className="app-shell">
      <section className="dashboard-card">
        <div className="dashboard-header">
          <div>
            <p className="eyebrow">Dashboard</p>
            <h1>Welcome to Applix</h1>
            {email && <p className="muted">Signed in as {email}</p>}
          </div>
          <button className="ghost-button" type="button" onClick={signOut}>Sign out</button>
        </div>

        <div className="empty-state">
          <h2>Google consent</h2>
          <p>Connect Gmail so Applix can prepare and test outreach from your connected account. Real recipients stay off during test mode.</p>
          <p className="muted">Status: {gmailStatus}</p>
          <button className="primary-button" type="button" onClick={connectGmail} disabled={connectingGmail || !email}>
            {connectingGmail ? "Opening Google..." : "Connect Gmail"}
          </button>
        </div>

        <div className="empty-state">
          <h2>Master Resume</h2>
          <p>Upload, parse and save your resume source. Applix keeps the original layout and stores parsed JSON separately.</p>
          <Link className="primary-link" href="/resume-canvas">Upload / Edit Master Resume</Link>
        </div>

        <div className="empty-state">
          <h2>Test launch plan</h2>
          <p>TEST MODE is ON. Real recipients are OFF. The test run should show the live backend version, sent count, Gmail status and any errors below.</p>
        </div>

        {loading && <p className="muted">Loading your campaigns...</p>}
        {errorMessage && <p className="error-text">{errorMessage}</p>}
        {successMessage && <p className="form-status success-status">{successMessage}</p>}
        {launchResult && (
          <pre className="form-status" style={{ whiteSpace: "pre-wrap", overflowX: "auto" }}>
            {shortJson({
              version: launchResult.version,
              ok: launchResult.ok,
              sent_count: launchResult.sent_count,
              gmail_send_status: launchResult.gmail_send_status,
              gmail_error: launchResult.gmail_error,
              sends_disabled_in_this_gateway: launchResult.sends_disabled_in_this_gateway,
              user_identifier: launchResult.user_identifier,
              errors: launchResult.errors,
            })}
          </pre>
        )}

        {!loading && campaigns.length === 0 && (
          <div className="empty-state">
            <h2>No campaign yet</h2>
            <p>Create your first campaign so Applix knows what jobs to target and how many emails to send daily.</p>
            <Link className="primary-link" href="/campaign/new">Start campaign now</Link>
          </div>
        )}

        {!loading && campaigns.length > 0 && (
          <div className="campaign-list">
            <div className="section-title-row">
              <h2>Your campaigns</h2>
              <Link className="primary-link small" href="/campaign/new">New campaign</Link>
            </div>
            {campaigns.map((campaign) => {
              const role = getCampaignRole(campaign);
              const location = getCampaignLocation(campaign);
              const dailyCap = getDailyCap(campaign);
              const hourlyCap = getHourlyCap(campaign);
              const days = getCampaignDays(campaign);
              const launching = launchingCampaignId === campaign.id;

              return (
                <article className="campaign-row" key={campaign.id}>
                  <div>
                    <h3>{campaign.name}</h3>
                    <p>{role}{location ? ` in ${location}` : ""}</p>
                    <button className="primary-button small-action" type="button" onClick={() => launchApplixTest(campaign.id)} disabled={launching || gmailStatus === "Not connected"}>
                      {launching ? "Launching test..." : "Launch Applix Test"}
                    </button>
                  </div>
                  <div className="campaign-meta">
                    <span>{campaign.status}</span>
                    <span>{hourlyCap}/hour</span>
                    <span>{dailyCap}/day</span>
                    <span>{days} days</span>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {!loading && (
          <div className="empty-state" style={{ marginTop: 24 }}>
            <div className="section-title-row">
              <h2>Job tracker</h2>
              <button className="ghost-button" type="button" onClick={() => loadJobTrackerRows(campaigns)} disabled={trackerLoading || campaigns.length === 0}>
                {trackerLoading ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            <p className="muted">Track each generated job/company and move it through your application progress.</p>

            {jobTrackerRows.length === 0 ? (
              <p className="muted">No tracker rows yet. Launch a campaign test first to generate queue rows.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: "12px", borderBottom: "1px solid rgba(148, 163, 184, 0.25)" }}>Job / Company</th>
                      <th style={{ textAlign: "left", padding: "12px", borderBottom: "1px solid rgba(148, 163, 184, 0.25)", width: 260 }}>Tracker progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobTrackerRows.map((row) => (
                      <tr key={row.queue_id}>
                        <td style={{ padding: "12px", borderBottom: "1px solid rgba(148, 163, 184, 0.18)", verticalAlign: "top" }}>
                          <strong>{row.job_name}</strong>
                          <p className="muted" style={{ margin: "4px 0" }}>{row.company_name}</p>
                          {row.website ? (
                            <a className="primary-link small" href={row.website} target="_blank" rel="noreferrer">
                              Open company website
                            </a>
                          ) : (
                            <span className="muted">No website found</span>
                          )}
                          <p className="muted" style={{ margin: "6px 0 0" }}>Campaign: {row.campaign_name}</p>
                        </td>
                        <td style={{ padding: "12px", borderBottom: "1px solid rgba(148, 163, 184, 0.18)", verticalAlign: "top" }}>
                          <select
                            value={row.progress}
                            onChange={(event) => updateJobProgress(row, event.target.value)}
                            disabled={updatingTrackerId === row.queue_id}
                            style={{ width: "100%", padding: "10px", borderRadius: 10 }}
                          >
                            {JOB_PROGRESS_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
