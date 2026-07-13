"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ComponentProps } from "react";
import { getSupabaseClient } from "../../lib/supabaseClient";
import WorkspacePanels from "./WorkspacePanels";
import type { CampaignTemplate } from "./workspace-data";

type Props = ComponentProps<typeof WorkspacePanels>;

type TemplateRow = {
  id: string;
  slug: string;
  title: string;
  role: string;
  location: string;
  description: string;
  category: string;
  query_terms: string[];
  include_title_terms: string[];
  exclude_title_terms: string[];
  description_keywords: string[];
  job_types: string[];
  posted_within_days: number;
  daily_job_limit: number;
  daily_email_limit: number;
  hourly_email_limit: number;
  campaign_days: number;
  total_cap: number;
  require_email: boolean;
  require_user_approval: boolean;
};

export type LiveCampaignTemplate = CampaignTemplate & {
  slug: string;
  dailyJobLimit: number;
  dailyEmailLimit: number;
