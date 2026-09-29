import { createClient } from "@supabase/supabase-js";

// Calsie identity, templates, campaigns and dashboard state live in the main
// project. The public key is safe for browsers; RLS controls data access.
const supabaseUrl = "https://bnshgtrqbfuphhhdgccs.supabase.co";
const supabaseAnonKey = "sb_publishable_HLFwtpqvm2UVxVgzR9WhBQ_KL_B1Tfo";

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
