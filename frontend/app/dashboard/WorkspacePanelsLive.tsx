"use client";

import { useEffect, useMemo, useState, type ComponentProps } from "react";
import { getSupabaseClient } from "../../lib/supabaseClient";
import OverviewDashboard from "./OverviewDashboard";
import WorkspacePanels from "./WorkspacePanels";
import { isCampaignRunning, type CampaignTemplate } from "./workspace-data";

type BaseProps = ComponentProps<typeof WorkspacePanels>;
type Props = BaseProps & { approvedCount: number; passedCount: number; purchasedTemplate?: CampaignTemplate | null; onOpenTracker: () => void };

type Row = {
  id: string;
  title: string;
  campaign_name: string;
  image_url: string | null;
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
};

export function mapTemplate(row: Row): CampaignTemplate {
  return {
    id: row.id,
    title: row