"use client";

import { useEffect, useMemo, useState, type ComponentProps } from "react";
import { getSupabaseClient } from "../../lib/supabaseClient";
import OverviewDashboard from "./OverviewDashboard";
import WorkspacePanels from "./WorkspacePanels";
import type { CampaignTemplate } from "./workspace-data";

type BaseProps = ComponentProps<typeof WorkspacePanels>;
type Props = BaseProps