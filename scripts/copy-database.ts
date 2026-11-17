/**
 * Moves the dashboard's data from one Supabase project to another, for example to a project in a nearer region.
 * The old database is only ever read. Nothing is printed except table names, row counts and redacted URLs.
 *
 *   npx tsx scripts/copy-database.ts --check            read both databases, change nothing
 *   npx tsx scripts/copy-database.ts --copy             build the schema, copy every table and file, then verify
 *   npx tsx scripts/copy-database.ts --verify           compare every table (count and contents) and every file
 *
 * Options: --from <env file> (default .env)   --to <env file> (default .env.mumbai)   --reset (allow replacing a
 * target that already holds users). Each env file needs DIRECT_URL, SUPABASE_URL and SUPABASE_SECRET_KEY.
 * For trying the tool on local databases only: --no-ssl and --skip-storage.
 */
import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import {
  chunk,
  compareFingerprints,
  orderTablesByForeignKeys,
  parseEnvFile,
  projectRefFromUrl,
  redactUrl,
  type ForeignKey,
  type TableFingerprint,
} from "../src/server/ops/copy-database";

type Sql = ReturnType<typeof postgres>;
type Side = { name: string; file: string; directUrl: string; storageUrl: string; storageKey: string; sql: Sql };

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

function load(name: string, file: string): Side {
  let env: Record<string, string>;
  try {
    env = parseEnvFile(readFileSync(file, "utf8"));
  } catch {
    throw new Error(`Could not read ${file}`);
  }
  const needed = flag("skip-storage") ? ["DIRECT_URL"] : ["DIRECT_URL", "SUPABASE_URL", "SUPABASE_SECRET_KEY"];
  const missing = needed.filter((k) => !env[k]);
  if (missing.length) throw new Error(`${file} is missing ${missing.join(", ")}`);
  return {
    name,
    file,
    directUrl: env.DIRECT_URL,
    storageUrl: (env.SUPABASE_URL ?? "").replace(/\/$/, ""),
    storageKey: env.SUPABASE_SECRET_KEY ?? "",
    sql: postgres(env.DIRECT_URL, { max: 1, ssl: flag("no-ssl") ? false : "require", prepare: false, connect_timeout: 30, onnotice: () => undefined }),
  };
}

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

async function listTables(sql: Sql): Promise<string[]> {
  const rows = await sql<{ table_name: string }[]>`
    select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`;
  return rows.map((r) => r.table_name);
}

async function foreignKeys(sql: Sql): Promise<ForeignKey[]> {
  return sql<ForeignKey[]>`
    select c.conrelid::regclass::text as "table", c.confrelid::regclass::text as "references"
    from pg_constraint c join pg_namespace n on n.oid = c.connamespace
    where c.contype = 'f' and n.nspname = 'public'`.then((rows) => rows.map((r) => ({ table: r.table.replace(/^"|"$/g, ""), references: r.references.replace(/^"|"$/g, "") })));
}

/** One line per column, so two schemas can be compared. */
async function columnSignature(sql: Sql): Promise<string[]> {
  const rows = await sql<{ s: string }[]>`
    select table_name || '.' || column_name || ':' || data_type || ':' || is_nullable as s
    from information_schema.columns where table_schema = 'public' order by 1`;
  return rows.map((r) => r.s);
}

async function fingerprint(sql: Sql, table: string): Promise<TableFingerprint> {
  const rows = await sql.unsafe<{ c: number; h: string }[]>(
    `select count(*)::int as c, md5(coalesce(string_agg(x, '|' order by x), '')) as h from (select to_jsonb(t)::text as x from ${quote(table)} t) s`
  );
  return { count: rows[0].c, hash: rows[0].h };
}

async function fingerprints(sql: Sql, tables: string[]) {
  const out: Record<string, TableFingerprint> = {};
  for (const t of tables) out[t] = await fingerprint(sql, t);
  return out;
}

async function describe(side: Side, tables: string[]) {
  const ref = projectRefFromUrl(side.directUrl);
  console.log(`${side.name}: ${redactUrl(side.directUrl)} (project ${ref ?? "unknown"})`);
  let total = 0;
  for (const t of tables) {
    const [{ c }] = await side.sql.unsafe<{ c: number }[]>(`select count(*)::int as c from ${quote(t)}`);
    total += c;
    if (c > 0) console.log(`  ${t}: ${c}`);
  }
  console.log(`  ${tables.length} tables, ${total} rows`);
}

/* --------------------------------- storage -------------------------------- */

type Obj = { bucket: string; path: string };
const headers = (s: Side) => ({ Authorization: `Bearer ${s.storageKey}`, apikey: s.storageKey });

async function storageBuckets(s: Side): Promise<{ id: string; public: boolean }[]> {
  const res = await fetch(`${s.storageUrl}/storage/v1/bucket`, { headers: headers(s) });
  if (!res.ok) throw new Error(`Could not list storage buckets on ${s.name} (${res.status})`);
  return (await res.json()) as { id: string; public: boolean }[];
}

async function listObjects(s: Side, bucket: string, prefix = ""): Promise<Obj[]> {
  const found: Obj[] = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${s.storageUrl}/storage/v1/object/list/${bucket}`, {
      method: "POST",
      headers: { ...headers(s), "content-type": "application/json" },
      body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: "name", order: "asc" } }),
    });
    if (!res.ok) throw new Error(`Could not list ${bucket}/${prefix} on ${s.name} (${res.status})`);
    const page = (await res.json()) as { name: string; id: string | null }[];
    for (const item of page) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) found.push(...(await listObjects(s, bucket, path)));
      else found.push({ bucket, path });
    }
    if (page.length < 1000) return found;
  }
}

async function download(s: Side, o: Obj): Promise<{ body: Buffer; type: string }> {
  const res = await fetch(`${s.storageUrl}/storage/v1/object/${o.bucket}/${o.path}`, { headers: headers(s) });
  if (!res.ok) throw new Error(`Could not read ${o.bucket}/${o.path} on ${s.name} (${res.status})`);
  return { body: Buffer.from(await res.arrayBuffer()), type: res.headers.get("content-type") ?? "application/octet-stream" };
}

async function copyStorage(from: Side, to: Side) {
  const buckets = await storageBuckets(from);
  const existing = new Set((await storageBuckets(to)).map((b) => b.id));
  let files = 0;
  for (const b of buckets) {
    if (!existing.has(b.id)) {
      const res = await fetch(`${to.storageUrl}/storage/v1/bucket`, {
        method: "POST",
        headers: { ...headers(to), "content-type": "application/json" },
        body: JSON.stringify({ id: b.id, name: b.id, public: b.public }),
      });
      if (!res.ok) throw new Error(`Could not create bucket ${b.id} on ${to.name} (${res.status})`);
    }
    for (const o of await listObjects(from, b.id)) {
      const { body, type } = await download(from, o);
      const up = await fetch(`${to.storageUrl}/storage/v1/object/${o.bucket}/${o.path}`, {
        method: "POST",
        headers: { ...headers(to), "content-type": type, "x-upsert": "true" },
        body: new Uint8Array(body),
      });
      if (!up.ok) throw new Error(`Could not write ${o.bucket}/${o.path} on ${to.name} (${up.status})`);
      files++;
    }
  }
  console.log(`Storage: ${buckets.length} bucket(s), ${files} file(s) copied.`);
}

async function verifyStorage(from: Side, to: Side): Promise<string[]> {
  const problems: string[] = [];
  for (const b of await storageBuckets(from)) {
    const targetObjects = new Set((await listObjects(to, b.id).catch(() => [])).map((o) => o.path));
    for (const o of await listObjects(from, b.id)) {
      if (!targetObjects.has(o.path)) {
        problems.push(`file ${o.bucket}/${o.path} is missing in the new project`);
        continue;
      }
      const [a, c] = await Promise.all([download(from, o), download(to, o)]);
      if (!a.body.equals(c.body)) problems.push(`file ${o.bucket}/${o.path} differs`);
    }
  }
  return problems;
}

/* ---------------------------------- steps --------------------------------- */

async function copyData(from: Side, to: Side, tables: string[]) {
  const order = orderTablesByForeignKeys(tables, await foreignKeys(from.sql));
  // Truncating in one statement lets Postgres handle the foreign keys between the target's own tables.
  await to.sql.unsafe(`truncate ${order.map(quote).join(", ")} restart identity cascade`);
  for (const t of order) {
    const rows = await from.sql.unsafe<{ j: Record<string, unknown> }[]>(`select to_jsonb(t) as j from ${quote(t)} t`);
    // Each batch goes over as one JSON value and Postgres converts it to the table's own column types.
    for (const batch of chunk(rows.map((r) => r.j), 500)) {
      await to.sql.unsafe(`insert into ${quote(t)} select * from jsonb_populate_recordset(null::${quote(t)}, $1::jsonb)`, [JSON.stringify(batch)]);
    }
    if (rows.length > 0) console.log(`  copied ${t}: ${rows.length}`);
  }
}

async function main() {
  const mode = flag("copy") ? "copy" : flag("verify") ? "verify" : flag("check") ? "check" : null;
  if (!mode) throw new Error("Choose one of --check, --copy or --verify. See the comment at the top of this file.");
  const from = load("old", option("from", ".env"));
  const to = load("new", option("to", ".env.mumbai"));
  try {
    // The copy empties the target first, so pointing both ends at one database would erase it.
    const sameRef = projectRefFromUrl(from.directUrl) && projectRefFromUrl(from.directUrl) === projectRefFromUrl(to.directUrl);
    if (sameRef || from.directUrl === to.directUrl) throw new Error("The old and new database are the same one. Check the --to file.");
    const sourceTables = await listTables(from.sql);
    if (sourceTables.length === 0) throw new Error("The old database has no tables. Check the --from file.");

    if (mode === "check") {
      await describe(from, sourceTables);
      const targetTables = await listTables(to.sql);
      console.log(`new: ${redactUrl(to.directUrl)} (project ${projectRefFromUrl(to.directUrl) ?? "unknown"}), ${targetTables.length} tables`);
      if (!flag("skip-storage")) {
        console.log(`Old storage buckets: ${(await storageBuckets(from)).map((b) => b.id).join(", ") || "none"}`);
        console.log(`New storage buckets: ${(await storageBuckets(to)).map((b) => b.id).join(", ") || "none"}`);
      }
      return;
    }

    if (mode === "copy") {
      let targetTables = await listTables(to.sql);
      const hasUsers = targetTables.includes("user") && (await to.sql.unsafe<{ c: number }[]>(`select count(*)::int as c from "user"`))[0].c > 0;
      if (hasUsers && !flag("reset")) throw new Error("The new database already holds users. Pass --reset only if you mean to replace its data.");
      console.log("Applying the schema to the new database...");
      await migrate(drizzle(to.sql), { migrationsFolder: "./drizzle" });
      targetTables = await listTables(to.sql);
      const sourceSig = await columnSignature(from.sql);
      const targetSig = await columnSignature(to.sql);
      const schemaProblems = [...sourceSig.filter((l) => !targetSig.includes(l)).map((l) => `old only: ${l}`), ...targetSig.filter((l) => !sourceSig.includes(l)).map((l) => `new only: ${l}`)];
      if (schemaProblems.length) throw new Error(`The two schemas differ, so the data cannot be copied safely:\n${schemaProblems.join("\n")}`);
      console.log("Copying data...");
      await copyData(from, to, sourceTables);
      if (!flag("skip-storage")) await copyStorage(from, to);
    }

    const [a, b] = [await fingerprints(from.sql, sourceTables), await fingerprints(to.sql, await listTables(to.sql))];
    const problems = [...compareFingerprints(a, b), ...(flag("skip-storage") ? [] : await verifyStorage(from, to))];
    if (problems.length) {
      console.error(`Verification FAILED:\n${problems.join("\n")}`);
      process.exitCode = 1;
    } else {
      const rows = Object.values(a).reduce((s, f) => s + f.count, 0);
      console.log(`Verified: ${sourceTables.length} tables and ${rows} rows are identical${flag("skip-storage") ? " (files not checked)" : ", and every file matches"}.`);
    }
  } finally {
    await Promise.all([from.sql.end({ timeout: 5 }), to.sql.end({ timeout: 5 })]);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
