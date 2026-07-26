type AppOriginEnvironment = {
  APP_URL?: string;
  NEXT_PUBLIC_APP_URL?: string;
  VERCEL_ENV?: string;
  VERCEL_PROJECT_PRODUCTION_URL?: string;
  VERCEL_URL?: string;
};

function normaliseOrigin(value: string | undefined) {
  if (!value) return null;
  const candidate = value.includes("://") ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "localhost")) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function resolveAppOrigin(environment: AppOriginEnvironment = process.env as AppOriginEnvironment) {
  const isPreview = environment.VERCEL_ENV === "preview";
  const candidates = isPreview
    ? [
        environment.VERCEL_URL,
        environment.APP_URL,
        environment.NEXT_PUBLIC_APP_URL,
        environment.VERCEL_PROJECT_PRODUCTION_URL,
      ]
    : [
        environment.APP_URL,
        environment.NEXT_PUBLIC_APP_URL,
        environment.VERCEL_PROJECT_PRODUCTION_URL,
        environment.VERCEL_URL,
      ];

  for (const candidate of candidates) {
    const origin = normaliseOrigin(candidate);
    if (origin) return origin;
  }

  if (process.env.NODE_ENV !== "production") return "http://localhost:3000";
  throw new Error("Missing trusted application origin configuration.");
}
