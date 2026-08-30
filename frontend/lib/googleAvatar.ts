// Resolving which picture to show for a user, and where it came from.
//
// Supabase Auth already stores the Google profile picture in the user's auth
// metadata for anyone who signed in with Google or linked Google to their
// account — so the "use their Gmail picture" default costs no extra OAuth
// scope, no API call and no round trip. It is read-only: Calsie never writes
// back to Google, so changing the picture here cannot change their Google one.
//
// Pure logic, no React and no Supabase, so it can be unit-tested directly
// (see tests/googleAvatar.test.mts).

export type AvatarSource = "upload" | "google" | "initial";

export type ResolvedAvatar = {
  /** Image URL to render, or "" when there is no picture to show. */
  src: string;
  source: AvatarSource;
};

/**
 * Google serves avatars from *.googleusercontent.com. auth metadata is
 * writable by the user themselves (`auth.updateUser`), so treat it as
 * untrusted and refuse to render an arbitrary host from it.
 */
export function isGoogleAvatarUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  return url.hostname === "googleusercontent.com" || url.hostname.endsWith(".googleusercontent.com");
}

type MetadataLike = Record<string, unknown> | null | undefined;

/**
 * The Google picture from Supabase auth metadata, or null.
 * Supabase writes `avatar_url`; the raw Google claim is `picture`. Different
 * accounts in this project have one, the other, or both — so check both.
 */
export function googleAvatarFromMetadata(metadata: MetadataLike): string | null {
  if (!metadata) return null;
  for (const key of ["avatar_url", "picture"]) {
    const value = metadata[key];
    if (isGoogleAvatarUrl(value)) return value;
  }
  return null;
}

/**
 * Google avatar URLs carry their size in the path, e.g. "...=s96-c". The
 * default 96px is soft on a retina display at our 96px render size, so ask
 * for a larger one. Any URL that does not carry the marker is returned as-is.
 */
export function sizedGoogleAvatar(url: string, size = 192): string {
  if (!isGoogleAvatarUrl(url)) return url;
  if (!Number.isFinite(size) || size <= 0) return url;
  const target = Math.min(Math.round(size), 512);
  // Matches the "=s96-c" / "=s96" suffix Google appends.
  return url.replace(/=s\d+(-c)?$/, `=s${target}$1`);
}

export type AvatarInputs = {
  /** Public URL of a picture the user uploaded to Calsie. */
  uploadedUrl?: string | null;
  /** Google picture from auth metadata. */
  googleUrl?: string | null;
  /** User asked not to use their Google picture. */
  hideGoogle?: boolean;
};

/**
 * Precedence: a picture uploaded to Calsie always wins, then the Google
 * picture unless the user opted out, then initials.
 */
export function resolveAvatar({ uploadedUrl, googleUrl, hideGoogle }: AvatarInputs): ResolvedAvatar {
  if (typeof uploadedUrl === "string" && uploadedUrl.trim()) {
    return { src: uploadedUrl, source: "upload" };
  }
  if (!hideGoogle && isGoogleAvatarUrl(googleUrl)) {
    return { src: sizedGoogleAvatar(googleUrl), source: "google" };
  }
  return { src: "", source: "initial" };
}

/** Key used inside profiles.preferences for the opt-out. */
export const HIDE_GOOGLE_AVATAR_KEY = "hide_google_avatar";

export function readHideGoogleAvatar(preferences: unknown): boolean {
  if (!preferences || typeof preferences !== "object") return false;
  return (preferences as Record<string, unknown>)[HIDE_GOOGLE_AVATAR_KEY] === true;
}
