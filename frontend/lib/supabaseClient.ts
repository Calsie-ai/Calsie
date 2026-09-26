import { oauthReturnFromUrl } from "./oauthReturn";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

// Capture only return metadata before Supabase consumes the token fragment.
// Access/refresh tokens are never copied into this record.
export const initialOAuthReturn = typeof window === "undefined" ? null : {
  pathname: window.location.pathname,
  next: new URLSearchParams(window.location.search).get("next"),
  result: oauthReturnFromUrl(window.location.href),
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

const originalSignInWithOAuth = supabase.auth.signInWithOAuth.bind(supabase.auth);

supabase.auth.signInWithOAuth = ((credentials) => {
  if (credentials?.provider === "google") {
    return originalSignInWithOAuth({
      ...credentials,
      options: {
        ...credentials.options,
        queryParams: {
          ...credentials.options?.queryParams,
          prompt: "select_account",
        },
      },
    });
  }

  return originalSignInWithOAuth(credentials);
}) as typeof supabase.auth.signInWithOAuth;

export function getSupabaseClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error("Missing Supabase environment variables. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel.");
  }

  return supabase;
}
