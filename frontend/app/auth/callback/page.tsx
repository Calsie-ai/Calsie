"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../../providers/AuthProvider";
import { getSupabaseClient } from "../../../lib/supabaseClient";
import { loginPathFor, safeInternalPath } from "../../../lib/navigation";
import "./callback-theme.css";

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useAuth();
  const started = useRef(false);
  const [message, setMessage] = useState("Finishing sign-in…");
  const [isError, setIsError] = useState(false);

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
          setIsError(true);
          setMessage("Login session was not created. Returning you to login…");
          redirectTimer = window.setTimeout(() => router.replace(loginPathFor(nextPath)), 1500);
          return;
        }

        router.replace(nextPath);
        router.refresh();
      } catch (error) {
        setIsError(true);
        setMessage(error instanceof Error ? error.message : "Sign-in failed.");
        redirectTimer = window.setTimeout(() => router.replace(loginPathFor(nextPath)), 2000);
      }
    }

    void finishLogin();
    return () => {
      if (redirectTimer) window.clearTimeout(redirectTimer);
    };
  }, [refresh, router, searchParams]);

  return <AuthCallbackShell message={message} isError={isError} />;
}

function AuthCallbackShell({ message, isError = false }: { message: string; isError?: boolean }) {
  return (
    <main className="cac-shell">
      <section className="cac-card" aria-live="polite" role="status">
        <span className="cac-brand">
          <img src="/favicon.svg" alt="" />
          Calsie <span className="badge">Jobs</span>
        </span>
        {isError ? null : <span className="cac-spinner" aria-hidden="true" />}
        <p className={isError ? "cac-message is-error" : "cac-message"}>{message}</p>
      </section>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<AuthCallbackShell message="Finishing sign-in…" />}>
      <AuthCallbackContent />
    </Suspense>
  );
}

