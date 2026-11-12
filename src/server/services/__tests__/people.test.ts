import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { createTestDb } from "@/test/db";
import type { Db } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { eq } from "drizzle-orm";
import { createPerson, getPerson, listPeople, updatePerson } from "../people";
import { decryptSecret, encryptSecret } from "@/server/lib/crypto";

const admin = { orgId: "default", userId: "a", canSeeSensitive: true };
const manager = { orgId: "default", userId: "m", canSeeSensitive: false };
let db: Db;
let cleanup: () => void;

function must<T>(r: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

beforeAll(async () => {
  process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  ({ db, cleanup } = await createTestDb());
});
afterAll(() => cleanup());

describe("crypto", () => {
  it("round-trips and rejects tampering", () => {
    const enc = encryptSecret("ABCDE1234F");
    expect(enc).not.toContain("ABCDE");
    expect(decryptSecret(enc)).toBe("ABCDE1234F");
    expect(() => decryptSecret(enc.slice(0, -2) + "xx")).toThrow();
  });
});

describe("people", () => {
  it("stores PAN and bank encrypted, shows them to admin only", async () => {
    const p = must(await createPerson(db, admin, { name: "Fake Person", role: "Designer", pan: "abcde1234f", bankAccount: "123456789012", bankIfsc: "TEST0001234" }));
    expect(p.pan).toBe("ABCDE1234F");

    const [row] = await db.select().from(schema.people).where(eq(schema.people.id, p.id));
    expect(row.panEnc).not.toContain("ABCDE");
    expect(row.bankAccountEnc).not.toContain("1234");

    const asManager = must(await getPerson(db, manager, p.id));
    expect(asManager).not.toHaveProperty("pan");
    expect(asManager).not.toHaveProperty("bankAccount");
    expect(asManager).not.toHaveProperty("panEnc");
    expect(asManager.panMasked).toBe("••••234F");

    const list = must(await listPeople(db, admin));
    expect(JSON.stringify(list)).not.toContain("ABCDE1234F");
  });

  it("blocks non-admins from changing secrets and validates formats", async () => {
    const p = must(await createPerson(db, admin, { name: "Another" }));
    expect((await updatePerson(db, manager, p.id, { pan: "ABCDE1234F" })).ok).toBe(false);
    expect((await updatePerson(db, admin, p.id, { pan: "bad" })).ok).toBe(false);
    expect(must(await updatePerson(db, manager, p.id, { role: "Lead" })).role).toBe("Lead");
  });
});
