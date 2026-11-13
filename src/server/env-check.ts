const REQUIRED_IN_PRODUCTION = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
] as const;

/** Names of required production variables that are unset or blank. */
export function missingProductionEnv(env: Record<string, string | undefined>): string[] {
  return REQUIRED_IN_PRODUCTION.filter((name) => !env[name]?.trim());
}

/** Throws (naming the variables, never their values) when production is missing required configuration. */
export function assertProductionEnv(env: Record<string, string | undefined> = process.env): void {
  if (env.NODE_ENV !== "production" || env.NEXT_PHASE === "phase-production-build") {
    return;
  }
  const missing = missingProductionEnv(env);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}
