import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function adminClient(request: NextRequest) {
  if (!url || !anonKey || !serviceKey) throw new Error("Missing Supabase server environment variables.");
  const token = request.headers.get("authorization")?.