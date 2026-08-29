"use client";

import type { Session, User } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getSupabaseClient } from "../../lib/supabaseClient";

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

    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) {
        setSession(null);
        setStatus("unauthenticated");
        setError(sessionError);
        return;
      }
      applySession(data.session);
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

