import { oauthReturnFromUrl } from "./oauthReturn";
import { createClient } from "@supabase/supabase-js";

// Independent Calsie identity and agent state live with the Jobs catalogue.
const supabaseUrl = "https://ibgmpamvkvjzdxirzxzr.supabase.co";
const supabaseAnonKey = "sb_publishable_tcLwrdaARcGb1aDhTLJohA_U5XT1jIS";

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
  return supabase;
}
