import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import test from "node:test";
import ts from "typescript";
const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "..");
function load(relative: string, mocks: Record<string, any> = {}): any {
  const js = ts.transpileModule(readFileSync(resolve(root, relative), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function("require", "exports", "module", js)((name: string) => mocks[name] || require(name), module.exports, module);
  return module.exports;
}
const security = load("lib/gmailSecurity.ts");
const key = randomBytes(32), nonce = randomBytes(32).toString("base64url");
const userId = "11111111-1111-4111-8111-111111111111";
const config = { key, origin: "https://calsie.com.au", cookieName: "__Host-calsie-gmail", secure: true, clientId: "client", clientSecret: "secret", redirectUri: "https://calsie.com.au/api/google/callback" };
const binding = { attemptId: "22222222-2222-4222-8222-222222222222", userId, nonce, accessToken: "session-token", expiresAt: Date.now() + 600000 };
const SERVER = "../../../../lib/gmailServer", SECURITY = "../../../../lib/gmailSecurity";
async function callback(options: Record<string, any> = {}) {
  const calls: any[] = [], providerCalls: string[] = [];
  const route = load("app/api/google/callback/route.ts", { [SERVER]: {
    gmailConfig: () => config, gmailUser: async () => { if (options.authError) throw new Error("auth"); return { id: options.otherUser ? "other" : userId }; },
    transition: async (action: string, uid: string, data: any) => { calls.push({ action, uid, data }); return { ok: options[action] !== false }; },
  }, [SECURITY]: security });
  const query = new URLSearchParams({ state: options.state ?? nonce, code: "sensitive-code" });
  if (options.denied) query.set("error", "access_denied");
  const cookie = options.corrupt ? "corrupt" : security.seal({ ...binding, ...(options.expired ? { expiresAt: 0 } : {}) }, key, "oauth-browser");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: any) => {
    providerCalls.push(String(input));
    if (String(input).endsWith("/token")) return Response.json({ access_token: "sensitive-access", ...(options.noRefresh ? {} : { refresh_token: "sensitive-refresh" }), scope: options.noScope ? "openid email" : security.GMAIL_SCOPES.join(" "), token_type: "Bearer", expires_in: 3600 });
    return Response.json({ email: "dedicated@gmail.com", sub: "google-id", email_verified: true });
  };
  try {
    const response = await route.GET({ nextUrl: new URL(`${config.redirectUri}?${query}`), cookies: { get: () => ({ value: cookie }) } });
    assert.equal(response.status, 303);
    assert.match(response.headers.get("set-cookie")!, /Max-Age=0/);
    const location = response.headers.get("location")!;
    assert.equal(new URL(location).origin, config.origin);
    assert.doesNotMatch(location, /sensitive-|session-token/);
    return { location, calls, providerCalls };
  } finally { globalThis.fetch = originalFetch; }
}
test("encrypted credentials reject tampering, wrong user and wrong key", () => {
  const ciphertext = security.seal({ token: "secret" }, key, `gmail-tokens:${userId}`);
  assert.doesNotMatch(ciphertext, /secret/);
  assert.deepEqual(security.unseal(ciphertext, key, `gmail-tokens:${userId}`), { token: "secret" });
  assert.throws(() => security.unseal(ciphertext, key, "gmail-tokens:other"));
  assert.throws(() => security.unseal(ciphertext, randomBytes(32), `gmail-tokens:${userId}`));
  assert.throws(() => security.unseal(ciphertext.slice(0, -4), key, `gmail-tokens:${userId}`));
  assert.notEqual(ciphertext, security.seal({ token: "secret" }, key, `gmail-tokens:${userId}`));
});
test("old/missing project and malformed encryption key fail closed", () => {
  assert.throws(() => security.assertJobsProject("https://bnshgtrqbfuphhhdgccs.supabase.co"));
  assert.throws(() => security.assertJobsProject(undefined));
  assert.throws(() => security.encryptionKey("x"));
  assert.equal(security.encryptionKey(key.toString("base64")).length, 32);
});
test("wrong user, expired or corrupt state and expired login reject before provider calls", async () => {
  for (const options of [{ corrupt: true }, { state: "wrong" }, { expired: true }, { otherUser: true }, { authError: true }]) {
    const result = await callback(options);
    assert.match(result.location, /gmail=error/); assert.equal(result.providerCalls.length, 0); assert.equal(result.calls.length, 0);
  }
});
test("denial consumes attempt and logs failure without token exchange", async () => {
  const result = await callback({ denied: true });
  assert.match(result.location, /reason=access_denied/);
  assert.deepEqual(result.calls.map(c => c.action), ["claim", "fail"]); assert.equal(result.providerCalls.length, 0);
});
test("replayed/consumed attempt cannot exchange code", async () => {
  const result = await callback({ claim: false });
  assert.match(result.location, /reason=invalid_state/); assert.equal(result.providerCalls.length, 0);
});
test("missing refresh token or gmail.send scope cannot connect", async () => {
  for (const options of [{ noRefresh: true }, { noScope: true }]) {
    const result = await callback(options);
    assert.match(result.location, /reason=exchange_failed/);
    assert.deepEqual(result.calls.map(c => c.action), ["claim", "fail"]);
    assert.equal(result.providerCalls.filter(p => p.endsWith("/revoke")).length, 0);
  }
});
test("dedicated Gmail differs from login; encrypted credentials bind to verified Calsie user", async () => {
  const result = await callback(); assert.match(result.location, /gmail=connected/);
  assert.deepEqual(result.calls.map(c => c.action), ["claim", "complete"]);
  const saved = result.calls[1]; assert.equal(saved.uid, userId); assert.equal(saved.data.gmail_email, "dedicated@gmail.com");
  assert.equal(security.unseal(saved.data.token_ciphertext, key, `gmail-tokens:${userId}`).refresh_token, "sensitive-refresh");
  assert.doesNotMatch(JSON.stringify(saved), /sensitive-access|sensitive-refresh/);
});
test("cancelled/disconnected completion fails without revoking newer Google grant", async () => {
  const result = await callback({ complete: false }); assert.match(result.location, /reason=storage_failed/);
  assert.deepEqual(result.calls.map(c => c.action), ["claim", "complete", "fail"]);
  assert.equal(result.providerCalls.filter(p => p.endsWith("/revoke")).length, 0);
});
test("status derives user from bearer authentication and exposes only metadata", async () => {
  const route = load("app/api/applix/gmail-status/route.ts", { [SERVER]: {
    bearer: () => "session-token", gmailUser: async () => ({ id: userId }),
    transition: async (action: string, id: string) => { assert.equal(id, userId); assert.equal(action, "status"); return { connected: true, gmail_email: "dedicated@gmail.com" }; },
  } });
  const response = await route.GET(new Request("https://calsie.com.au/api/applix/gmail-status?user_id=other"));
  assert.deepEqual(await response.json(), { ok: true, connected: true, gmail_email: "dedicated@gmail.com" }); assert.equal(response.headers.get("cache-control"), "no-store");
});
test("disconnect clears local credential before provider revocation and exposes unknown outcome safely", async () => {
  const calls: string[] = [];
  const route = load("app/api/applix/revoke-gmail/route.ts", { [SERVER]: {
    bearer: () => "token", requireOrigin: () => {}, gmailUser: async () => ({ id: userId }), gmailConfig: () => config,
    transition: async (action: string, id: string, data: any) => { assert.equal(id, userId); calls.push(action); if (action === "disconnect") return { token_ciphertext: security.seal({ refresh_token: "secret" }, key, `gmail-tokens:${userId}`) }; assert.equal(data.confirmed, false); return {}; },
  }, [SECURITY]: security });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { calls.push("provider-revoke"); return Response.json({ error: "unavailable" }, { status: 503 }); };
  try {
    const response = await route.POST(new Request("https://calsie.com.au/api/applix/revoke-gmail", { method: "POST" })); const result = await response.json();
    assert.deepEqual(calls, ["disconnect", "provider-revoke", "revocation_result"]); assert.equal(result.connected, false); assert.equal(result.revocation_confirmed, false);
    assert.doesNotMatch(JSON.stringify(result), /secret|token_ciphertext/);
  } finally { globalThis.fetch = originalFetch; }
});
test("server auth validates user before session lookup and rejects revoked sessions", async () => {
  const names = ["GMAIL_SUPABASE_URL", "GMAIL_SUPABASE_SERVICE_ROLE_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REDIRECT_URI", "GMAIL_TOKEN_ENCRYPTION_KEY"];
  const saved = Object.fromEntries(names.map(n => [n, process.env[n]]));
  Object.assign(process.env, { GMAIL_SUPABASE_URL: security.JOBS_PROJECT_URL, GMAIL_SUPABASE_SERVICE_ROLE_KEY: "new-service-key", GOOGLE_CLIENT_ID: "client", GOOGLE_CLIENT_SECRET: "secret", GOOGLE_REDIRECT_URI: config.redirectUri, GMAIL_TOKEN_ENCRYPTION_KEY: key.toString("base64") });
  let verified = false, active = false, rpcCount = 0;
  const server = load("lib/gmailServer.ts", { "./gmailSecurity": security, "@supabase/supabase-js": { createClient: (url: string, credential: string) => {
    assert.equal(url, security.JOBS_PROJECT_URL); assert.equal(credential, "new-service-key");
    return { auth: { getUser: async () => ({ data: { user: verified ? { id: userId } : null }, error: !verified }) },
      rpc: async (name: string, params: any) => { rpcCount++; assert.equal(name, "calsie_gmail_transition"); assert.equal(params.p_action, "session_active"); assert.equal(params.p_user_id, userId); return { data: { ok: active }, error: null }; } };
  } } });
  const token = `header.${Buffer.from(JSON.stringify({ session_id: "33333333-3333-4333-8333-333333333333", sub: "forged-other-user" })).toString("base64url")}.signature`;
  try {
    await assert.rejects(server.gmailUser(token), /GMAIL_AUTH_REQUIRED/); assert.equal(rpcCount, 0);
    verified = true; await assert.rejects(server.gmailUser(token), /GMAIL_AUTH_REQUIRED/); assert.equal(rpcCount, 1);
    active = true; assert.equal((await server.gmailUser(token)).id, userId);
    assert.throws(() => server.requireOrigin(new Request("https://preview.vercel.app/api/connect", { headers: { origin: config.origin } })), /GMAIL_ORIGIN_REJECTED/);
    assert.throws(() => server.requireOrigin(new Request("https://calsie.com.au/api/connect", { headers: { origin: "https://evil.test" } })), /GMAIL_ORIGIN_REJECTED/);
  } finally { for (const n of names) if (saved[n] === undefined) delete process.env[n]; else process.env[n] = saved[n]; }
});
test("connect requires both current consents and creates browser-bound HttpOnly state", async () => {
  const calls: string[] = [];
  const consent = { privacy_accepted: true, dedicated_email_confirmed: true, policy_version: "version" };
  const route = load("app/api/applix/connect-gmail/route.ts", { [SERVER]: {
    requireOrigin: () => {}, bearer: () => "session-token", gmailUser: async () => ({ id: userId }), gmailConfig: () => config,
    transition: async (action: string) => { calls.push(action); return { ok: true }; },
  }, [SECURITY]: security, "../../../dashboard/gmail-consent": { GMAIL_PRIVACY_POLICY_VERSION: "version", GMAIL_CONNECTION_CONSENT_TEXT: "privacy", GMAIL_DEDICATED_EMAIL_CONFIRMATION_TEXT: "dedicated" } });
  for (const body of [{}, { ...consent, privacy_accepted: false }, { ...consent, dedicated_email_confirmed: false }, { ...consent, policy_version: "outdated" }]) {
    const response = await route.POST(new Request("https://calsie.com.au/api/connect", { method: "POST", body: JSON.stringify(body) })); assert.equal(response.status, 400);
  }
  assert.equal(calls.length, 0);
  const response = await route.POST(new Request("https://calsie.com.au/api/connect", { method: "POST", body: JSON.stringify(consent) }));
  assert.equal(response.status, 200); assert.deepEqual(calls, ["begin"]);
  const cookies = response.headers.get("set-cookie")!; assert.match(cookies, /HttpOnly/); assert.match(cookies, /Secure/); assert.match(cookies, /SameSite=lax/); assert.match(cookies, /Max-Age=600/);
  const data = await response.json(); const url = new URL(data.authorization_url); assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("scope"), security.GMAIL_SCOPES.join(" ")); assert.equal(url.searchParams.get("access_type"), "offline"); assert.equal(url.searchParams.get("prompt"), "consent select_account");
  const ciphertext = cookies.split(";")[0].split("=").slice(1).join("=");
  const bound = security.unseal(decodeURIComponent(ciphertext), key, "oauth-browser"); assert.equal(bound.userId, userId); assert.equal(bound.nonce, url.searchParams.get("state"));
});
