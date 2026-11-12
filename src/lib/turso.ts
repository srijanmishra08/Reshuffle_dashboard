import { createClient, type Client } from "@libsql/client";

declare global {
  var tursoClient: Client | undefined;
}

/**
 * Shared libSQL client. Schema is owned by Drizzle migrations (`npm run db:migrate`),
 * not created at runtime.
 *
 * TURSO_DATABASE_URL may be a `libsql://` URL (needs TURSO_AUTH_TOKEN) or a local
 * `file:` URL for development and tests (no token).
 */
export function getTursoClient(): Client {
  if (global.tursoClient) {
    return global.tursoClient;
  }

  const url = process.env.TURSO_DATABASE_URL;

  if (!url) {
    throw new Error("Missing required environment variable: TURSO_DATABASE_URL");
  }

  const authToken = process.env.TURSO_AUTH_TOKEN || undefined;

  if (!url.startsWith("file:") && !authToken) {
    throw new Error("Missing required environment variable: TURSO_AUTH_TOKEN");
  }

  const client = createClient({ url, authToken });

  if (process.env.NODE_ENV !== "production") {
    global.tursoClient = client;
  }

  return client;
}
