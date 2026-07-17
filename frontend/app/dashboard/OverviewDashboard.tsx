"use client";

import { campaignLocation, campaignRole, type CampaignRecord, type CampaignTemplate } from "./workspace-data";

const DAY_MS = 24 * 60 * 60 * 1000;

type Props = {
  campaign: CampaignRecord | null;
  purchasedTemplate?: CampaignTemplate | null;
  resumeReady: boolean;
  resumeName: string;
  gmailReady: boolean;
  approvedCount: number;
  passedCount: number;
  onOpenTracker: () => void;
};

function positiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function campaignTiming(campaign: CampaignRecord | null) {
  const outreach = campaign?.outreach || {};
  const totalDays = positiveInteger(outreach.campaign_days, 30);
  const dailyJobLimit = positiveInteger(outreach.daily_job_limit, 24);
  const hasStarted