/**
 * Pure helpers for scripts/copy-database.ts, which moves the dashboard's data from one Supabase project to
 * another (for example to a project in a nearer region). Kept here so they can be tested without a database.
 */

/** Reads KEY=value lines, with optional quotes, comments and blank lines. Does not expand variables. */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

/** A database URL with the password hidden, safe to print. */
export function redactUrl(url: string): string {
  return url.replace(/(:\/\/[^:/@]+):[^@]*@/, "$1:***@");
}

/** The Supabase project ref in a pooler or direct URL, or null. */
export function projectRefFromUrl(url: string): string | null {
  const pooler = /postgres\.([a-z0-9]{20})[:@]/.exec(url);
  if (pooler) return pooler[1];
  const direct = /db\.([a-z0-9]{20})\.supabase\.co/.exec(url);
  return direct ? direct[1] : null;
}

export type ForeignKey = { table: string; references: string };

/**
 * Orders tables so each one comes after the tables it points at, which lets rows be inserted without
 * breaking foreign keys. A table that points at itself is fine. A cycle between tables is an error.
 */
export function orderTablesByForeignKeys(tables: string[], foreignKeys: ForeignKey[]): string[] {
  const deps = new Map<string, Set<string>>(tables.map((t) => [t, new Set<string>()]));
  for (const fk of foreignKeys) {
    if (fk.table === fk.references) continue;
    if (deps.has(fk.table) && deps.has(fk.references)) deps.get(fk.table)!.add(fk.references);
  }
  const ordered: string[] = [];
  const remaining = new Set(tables);
  while (remaining.size > 0) {
    const ready = [...remaining].filter((t) => [...deps.get(t)!].every((d) => !remaining.has(d))).sort();
    if (ready.length === 0) throw new Error(`Tables depend on each other in a cycle: ${[...remaining].sort().join(", ")}`);
    for (const t of ready) {
      ordered.push(t);
      remaining.delete(t);
    }
  }
  return ordered;
}

/** Splits a list into chunks of at most `size`. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export type TableFingerprint = { count: number; hash: string };

/** Differences between two sets of table fingerprints, as readable lines. Empty means identical. */
export function compareFingerprints(source: Record<string, TableFingerprint>, target: Record<string, TableFingerprint>): string[] {
  const problems: string[] = [];
  for (const table of Object.keys(source).sort()) {
    const t = target[table];
    if (!t) problems.push(`${table}: missing in the new database`);
    else if (t.count !== source[table].count) problems.push(`${table}: ${source[table].count} rows in the old database, ${t.count} in the new one`);
    else if (t.hash !== source[table].hash) problems.push(`${table}: same row count but the contents differ`);
  }
  for (const table of Object.keys(target).sort()) if (!source[table]) problems.push(`${table}: only in the new database`);
  return problems;
}
