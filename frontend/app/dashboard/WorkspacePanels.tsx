"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CAMPAIGN_PLAN,
  CAMPAIGN_TEMPLATES,
  campaignLocation,
  campaignRole,
  type CampaignRecord,
  type CampaignTemplate,
  type WorkspaceTab,
} from "./workspace-data";
import {
  GMAIL_CONNECTION_CONSENT_TEXT,
  GMAIL_DEDICATED_EMAIL_CONFIRMATION_TEXT,
  GMAIL_PRIVACY_POLICY_VERSION,
  GMAIL_PRIVACY_SUMMARY,
  GMAIL_SEND_SCOPE,
}