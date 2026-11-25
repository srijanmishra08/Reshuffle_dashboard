/**
 * Private file storage in the Supabase project (the same storage the original invoice PDFs and the
 * signature image live in). Only server code uses it, with the secret key; nothing here is public.
 */
export type Storage = {
  put(bucket: string, path: string, body: Buffer, contentType: string): Promise<void>;
  get(bucket: string, path: string): Promise<Buffer | null>;
  remove(bucket: string, path: string): Promise<void>;
};

function config() {
  const base = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!base || !key) throw new Error("File storage is not configured (SUPABASE_URL, SUPABASE_SECRET_KEY)");
  return { base, headers: { Authorization: `Bearer ${key}`, apikey: key } };
}

export const supabaseStorage: Storage = {
  async put(bucket, path, body, contentType) {
    const { base, headers } = config();
    const res = await fetch(`${base}/storage/v1/object/${bucket}/${path}`, {
      method: "POST",
      headers: { ...headers, "content-type": contentType, "x-upsert": "true" },
      body: new Uint8Array(body),
    });
    if (!res.ok) throw new Error(`Storage refused the file (${res.status})`);
  },
  async get(bucket, path) {
    const { base, headers } = config();
    const res = await fetch(`${base}/storage/v1/object/${bucket}/${path}`, { headers, cache: "no-store" });
    if (res.status === 404 || res.status === 400) return null;
    if (!res.ok) throw new Error(`Storage could not read the file (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  },
  async remove(bucket, path) {
    const { base, headers } = config();
    const res = await fetch(`${base}/storage/v1/object/${bucket}/${path}`, { method: "DELETE", headers });
    if (!res.ok && res.status !== 404) throw new Error(`Storage could not delete the file (${res.status})`);
  },
};

/** What the nightly backup needs from storage: a private bucket it can create, write to, list and prune. */
export type BackupStore = {
  ensureBucket(bucket: string): Promise<void>;
  put(bucket: string, path: string, body: Buffer, contentType: string): Promise<void>;
  list(bucket: string, prefix: string): Promise<string[]>;
  remove(bucket: string, path: string): Promise<void>;
};

export const supabaseBackupStore: BackupStore = {
  put: supabaseStorage.put,
  remove: supabaseStorage.remove,
  async ensureBucket(bucket) {
    const { base, headers } = config();
    const res = await fetch(`${base}/storage/v1/bucket`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ id: bucket, name: bucket, public: false }),
    });
    // 409 (or 400 "already exists") means the bucket is already there.
    if (!res.ok && res.status !== 409 && res.status !== 400) throw new Error(`Storage could not create the bucket (${res.status})`);
  },
  async list(bucket, prefix) {
    const { base, headers } = config();
    const res = await fetch(`${base}/storage/v1/object/list/${bucket}`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ prefix, limit: 1000, offset: 0 }),
    });
    if (!res.ok) throw new Error(`Storage could not list the bucket (${res.status})`);
    const rows = (await res.json()) as { name: string }[];
    return rows.map((r) => r.name);
  },
};
