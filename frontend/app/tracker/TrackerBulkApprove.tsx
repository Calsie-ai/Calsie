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