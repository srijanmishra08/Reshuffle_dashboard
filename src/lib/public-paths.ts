const PUBLIC_PREFIXES = ["/login", "/privacy", "/api/auth", "/api/health", "/api/cron", "/p", "/api/p", "/api/ingest"];

/** True when `pathname` equals a public prefix or sits beneath it (matched on path boundaries). */
export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
