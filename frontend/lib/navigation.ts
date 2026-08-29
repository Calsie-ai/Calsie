export const DEFAULT_POST_AUTH_PATH = "/dashboard?panel=overview";

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const ENCODED_PATH_SEPARATOR = /%(?:2f|5c)/i;

export function safeInternalPath(
  value: string | null | undefined,
  fallback = DEFAULT_POST_AUTH_PATH,
) {
  if (!value || CONTROL_CHARACTERS.test(value) || value.includes("\\")) {
    return fallback;
  }

  if (!value.startsWith("/") || value.startsWith("//") || ENCODED_PATH_SEPARATOR.test(value)) {
    return fallback;
  }

  try {
    const decoded = decodeURI(value);
    if (decoded.startsWith("//") || decoded.includes("\\")) return fallback;
    const parsed = new URL(value, "https://applix.invalid");
    if (parsed.origin !== "https://applix.invalid") return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function loginPathFor(returnPath: string) {
  return `/login?next=${encodeURIComponent(safeInternalPath(returnPath))}`;
}

