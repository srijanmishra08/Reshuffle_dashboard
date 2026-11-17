/**
 * Which websites may call the ingest endpoint from a browser. The default is the invoice software. Add more,
 * comma separated, in INGEST_ALLOWED_ORIGINS (for example a custom domain). This only controls browsers; every
 * request still needs a valid key.
 */
const DEFAULT_ORIGINS = ["https://invoice-eight-neon.vercel.app"];

export function allowedOrigins(env: string | undefined = process.env.INGEST_ALLOWED_ORIGINS): string[] {
  const extra = (env ?? "").split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean);
  return extra.length > 0 ? extra : DEFAULT_ORIGINS;
}

/** CORS headers for an allowed origin, or none for any other origin. */
export function corsHeaders(origin: string | null, allowed: string[] = allowedOrigins()): Record<string, string> {
  if (!origin || !allowed.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
