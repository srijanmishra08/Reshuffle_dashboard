import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import { schema, type Db } from "@/server/db/client";
import { resolveRoleForEmail, resolveSessionUser } from "@/server/session-user";

let db: Db;
let cleanup: () => void;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(() => cleanup());
afterEach(async () => {
  delete process.env.BOOTSTRAP_ADMIN_EMAILS;
  await db.delete(schema.allowedEmails);
  await db.delete(schema.user);
});

async function addUser(id: string, email: string, role = "MEMBER", active = true) {
  const now = new Date();
  await db.insert(schema.user).values({ id, name: "Test", email, role, active, createdAt: now, updatedAt: now });
}

const raw = (id: string, email: string, role = "MEMBER", active: boolean | null = true) => ({
  id,
  email,
  name: "Test",
  role,
  orgId: "default",
  active,
});

describe("resolveRoleForEmail", () => {
  it("returns null for unknown email, role for allowlisted, ADMIN for bootstrap", async () => {
    expect(await resolveRoleForEmail(db, "nobody@example.test")).toBeNull();
    await db.insert(schema.allowedEmails).values({ email: "mgr@example.test", role: "MANAGER" });
    expect(await resolveRoleForEmail(db, " MGR@Example.test ")).toBe("MANAGER");
    process.env.BOOTSTRAP_ADMIN_EMAILS = "boss@example.test";
    expect(await resolveRoleForEmail(db, "Boss@example.test")).toBe("ADMIN");
  });
});

describe("resolveSessionUser", () => {
  it("treats a user removed from the allowlist as signed out", async () => {
    await addUser("u1", "gone@example.test");
    expect(await resolveSessionUser(db, raw("u1", "gone@example.test"))).toBeNull();
  });

  it("treats a deactivated user as signed out even if allowlisted", async () => {
    await db.insert(schema.allowedEmails).values({ email: "off@example.test", role: "MEMBER" });
    await addUser("u2", "off@example.test", "MEMBER", false);
    expect(await resolveSessionUser(db, raw("u2", "off@example.test", "MEMBER", false))).toBeNull();
  });

  it("returns the user when allowlisted with the same role", async () => {
    await db.insert(schema.allowedEmails).values({ email: "ok@example.test", role: "MEMBER" });
    await addUser("u3", "ok@example.test");
    const user = await resolveSessionUser(db, raw("u3", "ok@example.test"));
    expect(user).toMatchObject({ id: "u3", role: "MEMBER", orgId: "default" });
  });

  it("applies a role change from the allowlist and syncs the stored role (demotion and promotion)", async () => {
    await db.insert(schema.allowedEmails).values({ email: "dem@example.test", role: "FREELANCER" });
    await addUser("u4", "dem@example.test", "MANAGER");
    const user = await resolveSessionUser(db, raw("u4", "dem@example.test", "MANAGER"));
    expect(user?.role).toBe("FREELANCER");
    const [row] = await db.select().from(schema.user).where(eq(schema.user.id, "u4"));
    expect(row.role).toBe("FREELANCER");
  });

  it("keeps bootstrap admins signed in without an allowlist row", async () => {
    process.env.BOOTSTRAP_ADMIN_EMAILS = "root@example.test";
    await addUser("u5", "root@example.test");
    const user = await resolveSessionUser(db, raw("u5", "root@example.test", "MEMBER"));
    expect(user?.role).toBe("ADMIN");
  });
});
