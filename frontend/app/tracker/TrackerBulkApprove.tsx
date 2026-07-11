"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getSupabaseClient } from "../../lib/supabaseClient";

const PAGE_SIZE = 20;
const FINISHED = new Set(["approved", "queued", "applied", "declined", "rejected"]);

export default function TrackerBulkApprove() {
  const [mount, setMount] = useState<Element | null>(null);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const find = () => {
      const card = document.querySelector(".table-card");
      if (card) setMount(card);
