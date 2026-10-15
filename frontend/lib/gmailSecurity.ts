import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const JOBS_PROJECT_URL = "https://ibgmpamvkvjzdxirzxzr.supabase.co";
export const GMAIL_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/gmail.send"];
export const GMAIL_STATE_TTL_SECONDS = 600;

export function encryptionKey(value: string | undefined): Buffer {
  if (!value || !/^[A-Za-z0-9+/]{43}=$/.test(value)) throw new Error("GMAIL_CONFIGURATION");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("GMAIL_CONFIGURATION");
  return key;
}
export function assertJobsProject(url: string | undefined) {
  if (url !== JOBS_PROJECT_URL) throw new Error("GMAIL_PROJECT_MISMATCH");
}
export function seal(value: unknown, key: Buffer, purpose: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(purpose));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}
export function unseal<T>(value: string, key: Buffer, purpose: string): T {
  const [version, iv, tag, data, extra] = value.split(".");
  if (version !== "v1" || !iv || !tag || !data || extra) throw new Error("GMAIL_INVALID_STATE");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(purpose));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8")) as T;
}
export function nonceHash(nonce: string): string {
  return createHash("sha256").update(nonce).digest("hex");
}
export function matchesState(state: string | null, nonce: string) {
  if (!state || !/^[A-Za-z0-9_-]{43}$/.test(state) || !/^[A-Za-z0-9_-]{43}$/.test(nonce)) return false;
  return timingSafeEqual(Buffer.from(state), Buffer.from(nonce));
}
export function hasSendScope(scope: unknown) {
  return typeof scope === "string" && scope.split(/\s+/).includes(GMAIL_SCOPES[2]);
}
