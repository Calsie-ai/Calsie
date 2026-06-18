import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve((_req) => {
  return new Response(
    JSON.stringify({
      ok: true,
      service: "applix-health",
      message: "Supabase deploy pipeline is working.",
      checked_at: new Date().toISOString()
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    }
  );
});
