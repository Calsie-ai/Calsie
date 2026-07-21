"use client";

import { useState } from "react";
import { getSupabaseClient } from "../lib/supabaseClient";
import AppFooter from "./components/AppFooter";
import PricingSection from "./components/PricingSection";

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "How it Works", href: "#how-it-works" },
  { label: "Pricing", href: "#pricing" },
 