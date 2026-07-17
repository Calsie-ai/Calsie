"use client";

import { useMemo, useState } from "react";
import WorkspaceSidebar from "../dashboard/WorkspaceSidebar";
import WorkspacePanels from "../dashboard/WorkspacePanels";
import type {
  CampaignRecord,
  CampaignTemplate,
  WorkspaceTab,
} from "../dashboard/workspace-data";
import trackerStyles from "../tracker/tracker.module.css";

const MOCK_CAMPAIGN: CampaignRecord = {
  id: "design-preview-campaign",
  name: