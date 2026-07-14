"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "../../lib/supabaseClient";

type Campaign = { id: string; name?: string | null; target_business_type?: string | null; location?: string | null; search?: { target_role?: string | null; target_location?: string | null } | null; created_at?: string | null };
type AgentStatus = "found" | "prepared"