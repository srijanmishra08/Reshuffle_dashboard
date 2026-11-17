import { afterAll, beforeAll, afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import { schema, type Db } from "@/server/db/client";
import { resolveAccessForEmail, resolveSessionUser } from "@/server/session-user";
import { createCompany } from "../companies";
import {
  addAgencyMember,
  createAgency,
  deleteAgency,
  grantAccess,
  listAccess,
  listAgencies,
  removeAgencyMember,
  revokeAccess,
  updateAgency,
} from "../access";

const ctx = { orgId: "default", userId: "admin-1" };
const admin = "admin@example.test";
let db: Db;
let cleanup: () => void;
let companyId: string;

function must<T>(r: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  companyId = must(await createCompany(db, ctx, { name: "Fake Traders" })).id;
  await db.insert(schema.legacyFreelancers).values([
    { id: "fl-1", freelancer: "Free One" },
    { id: "fl-2", freelancer: "Free Two" },
  ]);
});
afterAll(() => cleanup());
afterEach(() => {
  delete process.env.BOOTSTRAP_ADMIN_EMAILS;
});

describe("access", () => {
  it("links each outside role to the right record, and staff to none", async () => {
    expect((await grantAccess(db, ctx, admin, { email: "c@example.test", role: "CLIENT" })).ok).toBe(false);
    expect((await grantAccess(db, ctx, admin, { email: "c@example.test", role: "CLIENT", companyId: "nope" })).ok).toBe(false);
    expect((await grantAccess(db, ctx, admin, { email: "f@example.test", role: "FREELANCER", companyId })).ok).toBe(false);
    expect((await grantAccess(db, ctx, admin, { email: "m@example.test", role: "MEMBER", companyId })).ok).toBe(false);
    expect((await grantAccess(db, ctx, admin, { email: "not-an-email", role: "MEMBER" })).ok).toBe(false);
    expect((await grantAccess(db, ctx, admin, { email: "x@example.test", role: "SUPERUSER" })).ok).toBe(false);

    must(await grantAccess(db, ctx, admin, { email: "Client@Example.test", role: "CLIENT", companyId }));
    must(await grantAccess(db, ctx, admin, { email: "free@example.test", role: "FREELANCER", freelancerId: "fl-1" }));
    must(await grantAccess(db, ctx, admin, { email: "team@example.test", role: "MEMBER" }));

    expect(await resolveAccessForEmail(db, "client@example.test")).toEqual({ role: "CLIENT", links: { companyId, freelancerId: null, agencyId: null }, active: true });
    expect((await resolveAccessForEmail(db, "free@example.test"))?.links.freelancerId).toBe("fl-1");
    expect(await resolveAccessForEmail(db, "team@example.test")).toEqual({ role: "MEMBER", links: { companyId: null, freelancerId: null, agencyId: null }, active: true });
    expect(await resolveAccessForEmail(db, "nobody@example.test")).toBeNull();
  });

  it("changes a role by granting again, and the session picks up the new links", async () => {
    must(await grantAccess(db, ctx, admin, { email: "switch@example.test", role: "CLIENT", companyId }));
    must(await grantAccess(db, ctx, admin, { email: "switch@example.test", role: "MEMBER" }));
    const user = await resolveSessionUser(db, { id: "u1", email: "switch@example.test", name: "S", role: "CLIENT", orgId: "default", active: true });
    expect(user?.role).toBe("MEMBER");
    expect(user?.links.companyId).toBeNull();
  });

  it("will not let an admin change or remove their own access, or touch a server-set admin", async () => {
    expect((await grantAccess(db, ctx, admin, { email: "ADMIN@example.test", role: "MEMBER" })).ok).toBe(false);
    expect((await revokeAccess(db, ctx, admin, { email: admin })).ok).toBe(false);
    process.env.BOOTSTRAP_ADMIN_EMAILS = "boss@example.test";
    expect((await grantAccess(db, ctx, admin, { email: "boss@example.test", role: "MEMBER" })).ok).toBe(false);
    expect((await revokeAccess(db, ctx, admin, { email: "boss@example.test" })).ok).toBe(false);
  });

  it("ends access at once when an email is removed", async () => {
    must(await grantAccess(db, ctx, admin, { email: "gone@example.test", role: "CLIENT", companyId }));
    const raw = { id: "u2", email: "gone@example.test", name: "G", role: "CLIENT", orgId: "default", active: true };
    expect(await resolveSessionUser(db, raw)).not.toBeNull();
    must(await revokeAccess(db, ctx, admin, { email: "gone@example.test" }));
    expect(await resolveSessionUser(db, raw)).toBeNull();
    expect((await revokeAccess(db, ctx, admin, { email: "gone@example.test" })).ok).toBe(false);
  });

  it("lists who has access, what they are linked to and whether they have signed in", async () => {
    const now = new Date();
    await db.insert(schema.user).values({ id: "real-1", name: "Free", email: "free@example.test", role: "FREELANCER", createdAt: now, updatedAt: now });
    const rows = must(await listAccess(db, ctx));
    const free = rows.find((r) => r.email === "free@example.test")!;
    expect(free).toMatchObject({ role: "FREELANCER", linkedTo: "Free One", hasSignedIn: true });
    expect(rows.find((r) => r.email === "client@example.test")).toMatchObject({ linkedTo: "Fake Traders", hasSignedIn: false });
  });

  it("removes a client's sign-in if the company record is deleted", async () => {
    const temp = must(await createCompany(db, ctx, { name: "Temporary Co" })).id;
    must(await grantAccess(db, ctx, admin, { email: "temp@example.test", role: "CLIENT", companyId: temp }));
    await db.delete(schema.companies).where(eq(schema.companies.id, temp));
    expect(await resolveAccessForEmail(db, "temp@example.test")).toBeNull();
  });
});

describe("agencies", () => {
  it("creates, renames and refuses a duplicate name", async () => {
    const a = must(await createAgency(db, ctx, { name: "Fake Agency", contactEmail: "hello@example.test" }));
    expect((await createAgency(db, ctx, { name: "Fake Agency" })).ok).toBe(false);
    expect((await createAgency(db, ctx, { name: "" })).ok).toBe(false);
    const b = must(await createAgency(db, ctx, { name: "Second Agency" }));
    expect((await updateAgency(db, ctx, b.id, { name: "Fake Agency" })).ok).toBe(false);
    expect(must(await updateAgency(db, ctx, b.id, { name: "Second Agency", notes: "n" })).notes).toBe("n");
    expect((await updateAgency(db, { orgId: "other", userId: "x" }, a.id, { name: "Hijack" })).ok).toBe(false);
  });

  it("puts a freelancer in one agency at most", async () => {
    const [a, b] = must(await listAgencies(db, ctx));
    must(await addAgencyMember(db, ctx, a.id, { freelancerId: "fl-1" }));
    must(await addAgencyMember(db, ctx, a.id, { freelancerId: "fl-1" }));
    expect((await addAgencyMember(db, ctx, b.id, { freelancerId: "fl-1" })).ok).toBe(false);
    expect((await addAgencyMember(db, ctx, a.id, { freelancerId: "nobody" })).ok).toBe(false);
    expect(must(await listAgencies(db, ctx)).find((x) => x.id === a.id)?.members).toEqual([{ freelancerId: "fl-1", name: "Free One" }]);
    must(await removeAgencyMember(db, ctx, a.id, { freelancerId: "fl-1" }));
    expect((await removeAgencyMember(db, ctx, a.id, { freelancerId: "fl-1" })).ok).toBe(false);
    must(await addAgencyMember(db, ctx, b.id, { freelancerId: "fl-1" }));
  });

  it("deleting an agency frees its freelancers and ends its sign-ins", async () => {
    const agency = must(await createAgency(db, ctx, { name: "Short Lived" }));
    must(await addAgencyMember(db, ctx, agency.id, { freelancerId: "fl-2" }));
    must(await grantAccess(db, ctx, admin, { email: "agency@example.test", role: "AGENCY", agencyId: agency.id }));
    expect((await resolveAccessForEmail(db, "agency@example.test"))?.links.agencyId).toBe(agency.id);
    must(await deleteAgency(db, ctx, agency.id));
    expect(await resolveAccessForEmail(db, "agency@example.test")).toBeNull();
    const other = must(await createAgency(db, ctx, { name: "Next Agency" }));
    must(await addAgencyMember(db, ctx, other.id, { freelancerId: "fl-2" }));
    expect((await deleteAgency(db, ctx, "missing")).ok).toBe(false);
  });
});

describe("deactivated accounts", () => {
  it("are refused straight away, even if a cached session still says active", async () => {
    must(await grantAccess(db, ctx, admin, { email: "off@example.test", role: "MEMBER" }));
    const now = new Date();
    await db.insert(schema.user).values({ id: "off-1", name: "Off", email: "off@example.test", role: "MEMBER", active: true, createdAt: now, updatedAt: now });
    const cachedSession = { id: "off-1", email: "off@example.test", name: "Off", role: "MEMBER", orgId: "default", active: true };
    expect(await resolveSessionUser(db, cachedSession)).not.toBeNull();
    await db.update(schema.user).set({ active: false }).where(eq(schema.user.id, "off-1"));
    expect(await resolveSessionUser(db, cachedSession)).toBeNull();
  });
});
