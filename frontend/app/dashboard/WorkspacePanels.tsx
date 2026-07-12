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

export default function WorkspacePanels({
  active,
  campaign,
  resume