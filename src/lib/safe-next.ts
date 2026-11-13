/** Only same-site absolute paths are valid post-login redirects. Anything else falls back to "/". */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return "/";
  }
  // Control characters (tab/newline) are stripped by URL parsers, which can turn "/\t/host" into "//host".
  if (/[\u0000-\u001f]/.test(next)) {
    return "/";
  }
  return next;
}
