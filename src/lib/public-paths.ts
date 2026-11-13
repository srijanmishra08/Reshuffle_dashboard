const PUBLIC_PREFIXES = ["/login", "/api/auth", "/api/health", "/api/cron", "/p", "/api/p"];

/** True when `pathname` equals a public prefix or sits beneath it (matched on path boundaries). */
export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
