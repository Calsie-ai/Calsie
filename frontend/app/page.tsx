"use client";

import { useState } from "react";
import { getSupabaseClient } from "../lib/supabaseClient";
import AppFooter from "./components/AppFooter";
import PricingSection from "./components/PricingSection";

const BRAND_DISPLAY = "Calsie | Jobs";
const BRAND_NAME = "Calsie Jobs";

const navLinks = [
  { label: "Features", href: "#features" },
 