"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseClient } from "../../../lib/supabaseClient";

const roleSuggestions = [
  "Support Worker", "Disability Support Worker", "Community Support Worker", "Retail Assistant",
  "Kitchen Hand", "Cleaner", "Warehouse Worker", "Admin Assistant", "Customer Service",
  "Security Guard", "Barista", "Driver",
];