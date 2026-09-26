"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../providers/AuthProvider";
import { rememberOAuthDestination, consumeOAuthDestination, oauthSessionStorage } from "../../lib/oauthReturn";
import { safeInternalPath } from "../../lib/navigation";
import { supabase } from "../../lib/supabaseClient";
import { normaliseAppError, withActionTimeout } from "../../lib/actionState";
import "./login-theme.css";

function cleanEmail(value: string) {
  return value.trim().toLowerCase();
}

function friendlyAuthError(error: unknown) {
  const raw = String(error instanceof Error ? error.message : "").toLowerCase();
  if (raw.includes("invalid login credentials")) return "Wrong email or password. If you forgot it, use Reset password below.";
  if (raw.includes("email not confirmed") || raw.includes("confirm")) return "Your email is not confirmed yet. Check your inbox for the confirmation email before logging in.";
  if (raw.includes("invalid path specified")) return "The login redirect path was invalid. Refresh this page and try again.";
  if (raw.includes("fetch") || raw.includes("network") || raw.includes("timeout")) return "Applix could not reach the login server. Check internet connection or Supabase environment settings.";
  return normaliseAppError(error, "Login failed. Please check your details and try again.");
}

const GoogleIcon = () => (
  <svg viewBox="0 0 48 48" aria-hidden="true" width="18" height="18">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
    <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.6 15.6 18.9 13 24 13c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6 29.6 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6C29.7 34.9 27 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.6 5.6C41.4 36 44 30.5 44 24c0-1.3-.1-2.7-.4-3.5z" />
  </svg>
);

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" width="17" height="17">
        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="17" height="17">
      <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M10.6 5.2c.45-.08.92-.13 1.4-.13 6.4 0 10 7 10 7a17.7 17.7 0 0 1-3.6 4.5M6.6 6.6C4 8.3 2 12 2 12s3.6 7 10 7c1.4 0 2.7-.3 3.8-.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MessageIcon({ type }: { type: "success" | "error" | "info" }) {
  if (type === "success") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12.5l2.5 2.5L16 9.5" />
      </svg>
    );
  }
  if (type === "error") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <line x1="12" y1="7.5" x2="12" y2="13" />
        <line x1="12" y1="16.5" x2="12" y2="16.5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="11" x2="12" y2="16.5" />
      <line x1="12" y1="7.5" x2="12" y2="7.5" />
    </svg>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh, status } = useAuth();
  const nextPath = safeInternalPath(searchParams.get("next"));
  const oauthFailed = searchParams.get("oauthError") === "1";
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState(searchParams.get("oauthError") ? "Google sign-in could not be completed. Please try again." : "");
  const [messageType, setMessageType] = useState<"success" | "error" | "info">(searchParams.get("oauthError") ? "error" : "info");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [redirectWhenAuthenticated, setRedirectWhenAuthenticated] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const submittingRef = useRef(false);
  const oauthTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || (!redirectWhenAuthenticated && mode !== "login")) return;
    if (oauthFailed && !redirectWhenAuthenticated) return;
    router.replace(nextPath);
    router.refresh();
  }, [mode, nextPath, oauthFailed, redirectWhenAuthenticated, router, status]);

  /* The OAuth handoff navigates the tab away, so the success path never runs
     its own cleanup. If the user cancels at Google, hits Back, or the redirect
     never fires, the button would otherwise sit on "Opening…" forever. */
  useEffect(() => {
    const clearPending = () => {
      setGoogleLoading(false);
      if (oauthTimer.current) {
        clearTimeout(oauthTimer.current);
        oauthTimer.current = null;
      }
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) clearPending();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") clearPending();
    };
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
      if (oauthTimer.current) clearTimeout(oauthTimer.current);
    };
  }, []);

  async function handleGoogleAuth() {
    if (googleLoading || loading) return;
    setMessage("");
    setGoogleLoading(true);

    if (oauthTimer.current) clearTimeout(oauthTimer.current);
    oauthTimer.current = setTimeout(() => {
      setGoogleLoading(false);
      setMessageType("error");
      setMessage("Could not open Google sign-in. Try again, or log in with email instead.");
    }, 12000);

    try {
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
      rememberOAuthDestination(nextPath, oauthSessionStorage());
      const { error } = await withActionTimeout(supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } }));
      if (error) throw error;
    } catch (error) {
      if (oauthTimer.current) {
        clearTimeout(oauthTimer.current);
        oauthTimer.current = null;
      }
      consumeOAuthDestination(oauthSessionStorage());
      setMessageType("error");
      setMessage(friendlyAuthError(error));
      setGoogleLoading(false);
    }
  }

  async function handlePasswordReset() {
    if (submittingRef.current) return;
    const authEmail = cleanEmail(email);
    if (!authEmail || !authEmail.includes("@")) {
      setMessageType("error");
      setMessage("Enter your full email address first, then Applix can send a reset link.");
      return;
    }

    submittingRef.current = true;
    setLoading(true);
    setMessage("");
    try {
      const redirectTo = `${window.location.origin}/reset-password?next=${encodeURIComponent(nextPath)}`;
      const { error } = await withActionTimeout(supabase.auth.resetPasswordForEmail(authEmail, { redirectTo }));
      if (error) throw error;
      setMessageType("success");
      setMessage("Password reset link sent. Check your email, then open the link to choose a new password.");
    } catch (error) {
      setMessageType("error");
      setMessage(friendlyAuthError(error));
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  }

  async function handleAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    if (mode === "reset") {
      await handlePasswordReset();
      return;
    }

    const authEmail = cleanEmail(email);
    const authPassword = password.trim();
    if (!authEmail || !authEmail.includes("@")) {
      setMessageType("error");
      setMessage("Enter your full email address, for example name@gmail.com.");
      return;
    }
    if (authPassword.length < 6) {
      setMessageType("error");
      setMessage("Password must be at least 6 characters. If you forgot it, press Reset password.");
      return;
    }
    if (mode === "signup" && !fullName.trim()) {
      setMessageType("error");
      setMessage("Enter your full name before creating an account.");
      return;
    }
    if (mode === "signup" && authPassword !== confirmPassword.trim()) {
      setMessageType("error");
      setMessage("Both passwords must match. Retype your confirmation and try again.");
      return;
    }
    if (mode === "signup" && !agreeTerms) {
      setMessageType("error");
      setMessage("Please agree to the Terms of Service and Privacy Policy to continue.");
      return;
    }

    submittingRef.current = true;
    setLoading(true);
    setMessage("");
    try {
      if (mode === "signup") {
        const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
        const { data, error } = await withActionTimeout(supabase.auth.signUp({
          email: authEmail,
          password: authPassword,
          options: { emailRedirectTo: redirectTo, data: { full_name: fullName.trim() } },
        }));
        if (error) throw error;
        if (!data.session) {
          setMessageType("success");
          setMessage("Account created. Please check your email to confirm your account, then log in.");
          setMode("login");
          return;
        }
        setMessage("Account ready. Opening Applix…");
      } else {
        const { error } = await withActionTimeout(supabase.auth.signInWithPassword({ email: authEmail, password: authPassword }));
        if (error) throw error;
        setMessage("Login successful. Opening Applix…");
      }

      setMessageType("success");
      setRedirectWhenAuthenticated(true);
      const session = await refresh();
      if (!session) throw new Error("Login succeeded but the session could not be restored. Please try again.");
    } catch (error) {
      setRedirectWhenAuthenticated(false);
      setMessageType("error");
      setMessage(friendlyAuthError(error));
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  }

  const heading = mode === "signup" ? "Create your account." : mode === "reset" ? "Reset your password." : "Welcome back.";
  const subtitle =
    mode === "reset"
      ? "Enter your email and we'll send you a link to choose a new password."
      : mode === "signup"
        ? "Free to create, free to browse. You only pay when you choose a campaign template."
        : "Log in to pick up your resume profile, job matches and prepared applications.";
  const submitLabel = mode === "login" ? "Log in" : mode === "signup" ? "Create account" : "Send reset link";

  return (
    <div className="csa-auth">
      <div className="csa-panel">
      <aside className="csa-aside">
        <div className="csa-aside-top">
          <h2>The simplest way to land your next care role.</h2>
        </div>

        <div className="csa-aside-visual">
          <img src="/images/agecare.jpg" alt="A support worker helping an aged care client at home" />
          <div className="csa-aside-chip">
            <span className="csa-aside-chip-dot" />
            <span>96% match · Aged Care Support Worker</span>
          </div>
        </div>

        <div className="csa-aside-trust">
          <span className="csa-aside-trust-label">Real roles at providers like</span>
          <div className="csa-aside-logos">
            <span className="csa-aside-logo"><img src="/images/Layer_1_3.webp" alt="Goodstart Early Learning" /></span>
            <span className="csa-aside-logo"><img src="/images/Medibank-Private-Logo-Vector.svg-.png" alt="Medibank Private" /></span>
            <span className="csa-aside-logo"><img src="/images/Ramsay_Health_Care_logo.svg" alt="Ramsay Health Care" /></span>
            <span className="csa-aside-logo"><img src="/images/REG.AX_BIG-f46e4ff5.png" alt="Regis Aged Care" /></span>
          </div>
        </div>
      </aside>

      <main className="csa-main">
        <section className="csa-card">
          <div className="csa-card-top">
            <Link href="/" className="csa-brand" aria-label="Calsie Jobs home">
              <img src="/favicon.svg" alt="" />
              Calsie <span className="badge">Jobs</span>
            </Link>
          </div>

          <div className="csa-head" key={mode}>
            <h1>{heading}</h1>
            <p className="csa-sub">{subtitle}</p>
          </div>

          {mode !== "reset" ? (
            <>
              <button
                type="button"
                className="csa-google"
                disabled={googleLoading || loading}
                onClick={handleGoogleAuth}
              >
                {googleLoading ? (
                  <><span className="csa-spinner is-dark" aria-hidden="true" />Opening Google…</>
                ) : (
                  <><GoogleIcon />Continue with Google</>
                )}
              </button>
              <div className="csa-divider">
                <span>or continue with email</span>
              </div>
            </>
          ) : null}

          <form onSubmit={handleAuth} className="csa-form">
            {/* Always mounted so it can animate open/closed. `disabled` keeps a
                collapsed field out of the tab order and out of validation. */}
            <div className={`csa-collapse ${mode === "signup" ? "is-open" : ""}`}>
              <div className="csa-collapse-inner">
                <div className="csa-field">
                  <input
                    id="csa-name"
                    className="csa-input"
                    disabled={loading || mode !== "signup"}
                    required={mode === "signup"}
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="Full name"
                    aria-label="Full name"
                    autoComplete="name"
                  />
                </div>
              </div>
            </div>

            <div className="csa-field">
              <input
                id="csa-email"
                className="csa-input"
                disabled={loading}
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Email address"
                aria-label="Email address"
                type="email"
                autoComplete="email"
                inputMode="email"
              />
            </div>

            <div className={`csa-collapse ${mode !== "reset" ? "is-open" : ""}`}>
              <div className="csa-collapse-inner">
                <div className="csa-field">
                  {mode === "login" ? (
                    <div className="csa-field-top">
                      <button
                        type="button"
                        className="csa-inline-link"
                        disabled={loading}
                        onClick={() => { setMode("reset"); setMessage(""); }}
                      >
                        Forgot password?
                      </button>
                    </div>
                  ) : null}
                  <div className="csa-pw">
                    <input
                      id="csa-password"
                      className="csa-input"
                      disabled={loading || mode === "reset"}
                      required={mode !== "reset"}
                      minLength={6}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Password"
                      aria-label="Password"
                      type={showPassword ? "text" : "password"}
                      autoComplete={mode === "login" ? "current-password" : "new-password"}
                    />
                    <button
                      type="button"
                      className="csa-pw-toggle"
                      disabled={loading || mode === "reset"}
                      tabIndex={mode === "reset" ? -1 : 0}
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      <EyeIcon open={showPassword} />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className={`csa-collapse ${mode === "signup" ? "is-open" : ""}`}>
              <div className="csa-collapse-inner">
                <div className="csa-field">
                  <input
                    id="csa-confirm"
                    className="csa-input"
                    disabled={loading || mode !== "signup"}
                    required={mode === "signup"}
                    minLength={6}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Confirm password"
                    aria-label="Confirm password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                  />
                  {mode === "signup" && confirmPassword.length > 0 ? (
                    <span className={confirmPassword.trim() === password.trim() ? "csa-match is-ok" : "csa-match"}>
                      {confirmPassword.trim() === password.trim() ? "Passwords match" : "Doesn't match yet"}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className={`csa-collapse ${mode === "signup" ? "is-open" : ""}`}>
              <div className="csa-collapse-inner">
                <label className="csa-checkbox">
                  <input
                    type="checkbox"
                    disabled={loading || mode !== "signup"}
                    required={mode === "signup"}
                    checked={agreeTerms}
                    onChange={(event) => setAgreeTerms(event.target.checked)}
                  />
                  <span>
                    I agree to the <Link href="/terms">Terms of Service</Link> &amp; <Link href="/privacy">Privacy Policy</Link>
                  </span>
                </label>
              </div>
            </div>

            <button disabled={loading || status === "loading"} className="csa-submit" type="submit">
              {loading ? (
                <><span className="csa-spinner" aria-hidden="true" />Please wait…</>
              ) : (
                <span className="csa-label-swap" key={mode}>{submitLabel}</span>
              )}
            </button>

            {mode === "reset" ? (
              <div className="csa-linkrow">
                <button type="button" className="csa-link" disabled={loading} onClick={() => { setMode("login"); setMessage(""); }}>
                  ← Back to log in
                </button>
              </div>
            ) : (
              <p className="csa-switch">
                {mode === "login" ? (
                  <>Don&apos;t have an account?{" "}
                    <button type="button" className="csa-switch-link" disabled={loading} onClick={() => { setMode("signup"); setMessage(""); }}>
                      Sign up
                    </button>
                  </>
                ) : (
                  <>Already have an account?{" "}
                    <button type="button" className="csa-switch-link" disabled={loading} onClick={() => { setMode("login"); setMessage(""); }}>
                      Log in
                    </button>
                  </>
                )}
              </p>
            )}

            {message ? (
              <div
                aria-live={messageType === "error" ? "assertive" : "polite"}
                role={messageType === "error" ? "alert" : "status"}
                className={`csa-msg ${messageType === "success" ? "is-success" : messageType === "error" ? "is-error" : "is-info"}`}
              >
                <span className="csa-msg-icon"><MessageIcon type={messageType} /></span>
                <span>{message}</span>
              </div>
            ) : null}
          </form>

          {mode !== "signup" ? (
            <p className="csa-foot">
              By continuing you agree to our <Link href="/terms">Terms of Service</Link> and{" "}
              <Link href="/privacy">Privacy Policy</Link>.
            </p>
          ) : null}
        </section>
      </main>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="csa-loading">Loading your Calsie Jobs account…</div>}>
      <LoginContent />
    </Suspense>
  );
}
