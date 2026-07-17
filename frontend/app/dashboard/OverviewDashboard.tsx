"use client";

import { campaignLocation, campaignRole, type CampaignRecord, type CampaignTemplate } from "./workspace-data";

export default function OverviewDashboard({ campaign, purchasedTemplate, resumeReady, resumeName, gmailReady, approvedCount, passedCount, onOpenTracker }: {
  campaign: CampaignRecord | null;
  purchasedTemplate?: CampaignTemplate | null;
  resumeReady: boolean;
  resumeName: string;
  gmailReady: boolean;
  approvedCount: number;
  passedCount: number;
  onOpenTracker: () => void;
}) {
  const status = campaign?.status || "Not