"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseClient } from "../../../lib/supabaseClient";

function safeNextPath(value: string | null) {
  if (!value) return "/dashboard";
  if (!value.startsWith("/")) return "/dashboard";
  if (value.startsWith("//")) return "/dashboard";
  if (value.includes("http://") || value.includes("https://")) return "/dashboard";
  return value;
}

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("Finishing Google login...");

  useEffect(() => {
    async function finishLogin() {
      const supabase = getSupabaseClient();
      const nextPath = safeNextPath(searchParams.get("next"));

      try {
        const code = searchParams.get("code");

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }

        const { data, error } = await supabase.auth.getSession();

        if (error) throw error;

        if (!data.session) {
          setMessage("Login session was not created. Please try Google login again.");
          window.setTimeout(() => router.replace("/"), 1500);
          return;
        }

        router.replace(nextPath);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Google login failed.");
        window.setTimeout(() => router.replace("/"), 2000);
      }
    }

    finishLogin();
  }, [router, searchParams]);

  return <AuthCallbackShell message={message} />;
}

function AuthCallbackShell({ message }: { message: string }) {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#fff7fb",
        fontFamily: "Arial, Helvetica, sans-serif",
        color: "#16131a",
        textAlign: "center",
        padding: 24,
      }}
    >
      <section
        style={{
          width: "min(420px, 100%)",
          borderRadius: 28,
          padding: 28,
          background: "rgba(255,255,255,.78)",
          boxShadow: "0 18px 45px rgba(0,0,0,.12)",
        }}
      >
        <img src="/applix-logo.svg" alt="Applix logo" style={{ width: 90 }} />
        <h1 style={{ color: "#ff5ca8", fontSize: 42, margin: "12px 0" }}>
          APPLIX
        </h1>
        <p style={{ fontWeight: 900 }}>{message}</p>
      </section>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<AuthCallbackShell message="Finishing Google login..." />}>
      <AuthCallbackContent />
    </Suspense>
  );
}
