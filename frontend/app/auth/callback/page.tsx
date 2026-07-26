"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../../providers/AuthProvider";
import { getSupabaseClient } from "../../../lib/supabaseClient";
import { loginPathFor, safeInternalPath } from "../../../lib/navigation";

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useAuth();
  const started = useRef(false);
  const [message, setMessage] = useState("Finishing Google login…");

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let redirectTimer: number | undefined;

    async function finishLogin() {
      const nextPath = safeInternalPath(searchParams.get("next"));

      try {
        const code = searchParams.get("code");
        if (code) {
          const { error } = await getSupabaseClient().auth.exchangeCodeForSession(code);
          if (error) throw error;
        }

        const session = await refresh();
        if (!session) {
          setMessage("Login session was not created. Returning you to login…");
          redirectTimer = window.setTimeout(() => router.replace(loginPathFor(nextPath)), 1500);
          return;
        }

        router.replace(nextPath);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Google login failed.");
        redirectTimer = window.setTimeout(() => router.replace(loginPathFor(nextPath)), 2000);
      }
    }

    void finishLogin();
    return () => {
      if (redirectTimer) window.clearTimeout(redirectTimer);
    };
  }, [refresh, router, searchParams]);

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
        aria-live="polite"
        role="status"
        style={{
          width: "min(420px, 100%)",
          borderRadius: 28,
          padding: 28,
          background: "rgba(255,255,255,.78)",
          boxShadow: "0 18px 45px rgba(0,0,0,.12)",
        }}
      >
        <img src="/applix-logo.svg" alt="Applix logo" style={{ width: 90 }} />
        <h1 style={{ color: "#ff5ca8", fontSize: 42, margin: "12px 0" }}>APPLIX</h1>
        <p style={{ fontWeight: 900 }}>{message}</p>
      </section>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<AuthCallbackShell message="Finishing Google login…" />}>
      <AuthCallbackContent />
    </Suspense>
  );
}

