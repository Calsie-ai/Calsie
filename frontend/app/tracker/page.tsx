"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseClient } from "../../lib/supabaseClient";
import styles from "./tracker.module.css";

type Campaign = {
  id: string;
  name: string | null;
  target_business_type: string | null;
  location: string | null;
  status: string | null;
};

type ReviewJob