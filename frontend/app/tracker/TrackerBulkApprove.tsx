"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getSupabaseClient } from "../../lib/supabaseClient";

export default function TrackerBulkApprove() {
  const [mount, setMount] = useState<Element | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const find = () => setMount(document.querySelector(".table-card"));
    find();
    const timer = window.setInterval(find, 500);
    return () => window.clearInterval(timer);
  }, []);

  async function approveBatch() {
    setBusy(true);
    setMessage("");
    try {
      const supabase = getSupabaseClient();
      const { data: auth } = await supabase.auth.getUser();
      const { data: session } = await supabase.auth.getSession();
      const user = auth.user;
      const token = session.session?.access_token;
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!user || !token || !url || !key) throw new Error("Missing login session or Supabase configuration.");

      const { data: campaign } = await supabase.from("campaigns").select("id").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!campaign?.id) throw new Error("No campaign found.");

      const { data: jobs, error } = await supabase.from("jobs").select("id").eq("user_id", user.id).eq("campaign_id", campaign.id).not("status", "in", "(approved,queued,applied,declined,rejected)").order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      if (!jobs?.length) throw new Error("No unreviewed jobs are available on this batch.");

      let approved = 0;
      for (const job of jobs) {
        const response = await fetch(`${url}/functions/v1/approve-job-for-outreach`, { method: "POST", headers: { "content-type": "application/json", apikey: key, authorization: `Bearer ${token}` }, body: JSON.stringify({ job_id: job.id }) });
        if (response.ok) approved += 1;
      }

      const prepared = await fetch(`${url}/functions/v1/prepare-approved-applications`, { method: "POST", headers: { "content-type": "application/json", apikey: key, authorization: `Bearer ${token}` }, body: JSON.stringify({ campaign_id: campaign.id, limit: 20 }) });
      const result = await prepared.json().catch(() => ({}));
      if (!prepared.ok || result?.ok === false) throw new Error(result?.error || "Bulk preparation failed.");

      setMessage(`${approved} jobs approved. Applix is queueing enrichment and drafts.`);
      window.setTimeout(() => window.location.reload(), 1200);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Bulk approval failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!mount) return null;
  return createPortal(<div className="tracker-bulk-approve"><button type="button" onClick={() => void approveBatch()} disabled={busy}>{busy ? "Approving and queueing..." : "Approve next 20 & queue"}</button>{message && <p>{message}</p>}</div>, mount);
}
