"use client";

import type { Session, User } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { consumeOAuthDestination, oauthSessionStorage } from "../../lib/oauthReturn";
import { loginPathFor, safeInternalPath } from "../../lib/navigation";
import { getSupabaseClient, initialOAuthReturn } from "../../lib/supabaseClient";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthContextValue = {
  status: AuthStatus;
  user: User | null;
  session: Session | null;
  error: Error | null;
  refresh: () => Promise<Session | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const oauthReturnPathRef = useRef<string | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const applySession = useCallback((nextSession: Session | null) => {
    setSession(nextSession);
    setStatus(nextSession ? "authenticated" : "unauthenticated");
    setError(null);
  }, []);

  const refresh = useCallback(async () => {
    const supabase = getSupabaseClient();
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      const nextError = sessionError instanceof Error
        ? sessionError
        : new Error("Could not restore your session.");
      setSession(null);
      setStatus("unauthenticated");
      setError(nextError);
      throw nextError;
    }

    applySession(data.session);
    return data.session;
  }, [applySession]);

  useEffect(() => {
    let active = true;
    const supabase = getSupabaseClient();

    // A rejected callback URL can fall back to Supabase's Site URL (the home
    // page). Complete only an actual OAuth return, not normal home visits.
    const homeReturn = initialOAuthReturn?.pathname === "/" && initialOAuthReturn.result.kind !== "none"
      ? initialOAuthReturn : null;
    if (homeReturn && !oauthReturnPathRef.current) {
      const savedNext = consumeOAuthDestination(oauthSessionStorage());
      oauthReturnPathRef.current = safeInternalPath(homeReturn.next || savedNext);
    }
    const returnPath = oauthReturnPathRef.current;
    if (homeReturn?.result.kind === "error") {
      window.location.replace(`${loginPathFor(returnPath!)}&oauthError=1`);
      return;
    }

    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) {
        setSession(null);
        setStatus("unauthenticated");
        setError(sessionError);
        if (homeReturn) window.location.replace(`${loginPathFor(returnPath!)}&oauthError=1`);
        return;
      }
      applySession(data.session);
      if (homeReturn) {
        // getSession waits for SDK initialization, which may already have
        // exchanged a code. Forward only codes that did not create a session.
        const destination = data.session ? returnPath!
          : homeReturn.result.kind === "code"
            ? `/auth/callback?code=${encodeURIComponent(homeReturn.result.code)}&next=${encodeURIComponent(returnPath!)}`
            : `${loginPathFor(returnPath!)}&oauthError=1`;
        window.location.replace(destination);
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) applySession(nextSession);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [applySession]);

  const signOut = useCallback(async () => {
    const { error: signOutError } = await getSupabaseClient().auth.signOut();
    if (signOutError) throw signOutError;
    applySession(null);
  }, [applySession]);

  const value = useMemo<AuthContextValue>(() => ({
    status,
    user: session?.user ?? null,
    session,
    error,
    refresh,
    signOut,
  }), [error, refresh, session, signOut, status]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}

