import { safeInternalPath } from "./navigation.ts";

export const OAUTH_DESTINATION_KEY = "calsie.oauthDestination.v1";
export const OAUTH_DESTINATION_TTL = 10 * 60 * 1000;
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function rememberOAuthDestination(next: string, storage: Store | null, now = Date.now()) {
  try { storage?.setItem(OAUTH_DESTINATION_KEY, JSON.stringify({ next: safeInternalPath(next), createdAt: now })); } catch { /* Callback query still carries next if storage is blocked. */ }
}

export function consumeOAuthDestination(storage: Store | null, now = Date.now()) {
  try {
    const raw = storage?.getItem(OAUTH_DESTINATION_KEY);
    storage?.removeItem(OAUTH_DESTINATION_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (typeof value.createdAt !== "number" || !Number.isFinite(value.createdAt) || value.createdAt > now || now - value.createdAt > OAUTH_DESTINATION_TTL || typeof value.next !== "string") return null;
    return safeInternalPath(value.next);
  } catch { return null; }
}

export function oauthReturnFromUrl(href: string) {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.slice(1));
  const type = hash.get("type") || url.searchParams.get("type");
  if (type === "recovery" || (type && type !== "signin")) return { kind: "none" as const };
  if (hash.has("error") || hash.has("error_description") || url.searchParams.has("error")) return { kind: "error" as const };
  const code = url.searchParams.get("code");
  if (code) return { kind: "code" as const, code };
  if (hash.get("access_token") && hash.get("refresh_token")) return { kind: "session" as const };
  return { kind: "none" as const };
}

export function oauthSessionStorage(): Store | null {
  try { return window.sessionStorage; } catch { return null; }
}
