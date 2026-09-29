import { createClient } from "@supabase/supabase-js";

// Independent Calsie identity and agent state live with the Jobs catalogue.
const supabaseUrl = "https://ibgmpamvkvjzdxirzxzr.supabase.co";
const supabaseAnonKey = "sb_publishable_tcLwrdaARcGb1aDhTLJohA_U5XT1jIS";

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
