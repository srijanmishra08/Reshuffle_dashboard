import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { createTestDb } from "@/test/db";
import { schema, type Db } from "@/server/db/client";
import { createPerson } from "../people";
import {
  createSalarySlip,
  deleteDraftSalarySlip,
  issueSalarySlip,
  listSalarySlips,
  updateSalarySlip,
} from "../salary-slips";
import { renderSalarySlipPdf } from "@/server/documents/engine";

const ctx = { orgId: "default", userId: "admin-1" };
let db: Db;
let cleanup: () => void;
let personId: string;

function must<T>(result: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

const earnings = [
  { label: "Basic", amountPaise: 3_000_000 },
  { label: "HRA", amountPaise: 1_200_000 },
];
const deductions = [{ label: "TDS", amountPaise: 200_000 }];

beforeAll(async () => {
  process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  ({ db, cleanup } = await createTestDb());
  await db.insert(schema.orgSettings).values({
    orgId: "default",
    legalName: "Test Studio",
    address: "1 Example Road",
    stateCode: "22",
    gstin: "22AAAAA0000A1Z5",
  });
  personId = must(
    await createPerson(db, { ...ctx, canSeeSensitive: true }, { name: "Fake Person", role: "Designer", pan: "ABCDE1234F", bankAccount: "123456789012", bankIfsc: "TEST0001234" })
  ).id;
});
afterAll(() => cleanup());

describe("salary slips", () => {
  it("validates input and refuses deductions above gross", async () => {
    expect((await createSalarySlip(db, ctx, { personId, payPeriod: "2026-13", earnings })).ok).toBe(false);
    expect((await createSalarySlip(db, ctx, { personId, payPeriod: "2026-06", earnings: [] })).ok).toBe(false);
    const tooMuch = await createSalarySlip(db, ctx, { personId, payPeriod: "2026-06", earnings, deductions: [{ label: "X", amountPaise: 9_999_999 }] });
    expect(tooMuch.ok).toBe(false);
    expect((await createSalarySlip(db, ctx, { personId: "nope", payPeriod: "2026-06", earnings })).ok).toBe(false);
  });

  it("computes gross, deductions and net in paise and blocks a second slip for the month", async () => {
    const slip = must(await createSalarySlip(db, ctx, { personId, payPeriod: "2026-06", earnings, deductions }));
    expect(slip.grossPaise).toBe(4_200_000);
    expect(slip.deductionsPaise).toBe(200_000);
    expect(slip.netPaise).toBe(4_000_000);
    const dup = await createSalarySlip(db, ctx, { personId, payPeriod: "2026-06", earnings });
    expect(dup.ok).toBe(false);

    const edited = must(await updateSalarySlip(db, ctx, slip.id, { deductions: [] }));
    expect(edited.netPaise).toBe(4_200_000);
  });

  it("issues once with a number and masked details, then freezes", async () => {
    const slip = must(await createSalarySlip(db, ctx, { personId, payPeriod: "2026-07", earnings, deductions }));
    const first = must(await issueSalarySlip(db, ctx, slip.id, { idempotencyKey: "slip-key-1", payDate: "2026-07-31" }));
    expect(first.number).toMatch(/^SS\/26-27\/\d{3}$/);
    expect(must(await issueSalarySlip(db, ctx, slip.id, { idempotencyKey: "slip-key-1" })).number).toBe(first.number);
    expect((await issueSalarySlip(db, ctx, slip.id, { idempotencyKey: "slip-key-2" })).ok).toBe(false);
    expect((await updateSalarySlip(db, ctx, slip.id, { deductions: [] })).ok).toBe(false);
    expect((await deleteDraftSalarySlip(db, ctx, slip.id)).ok).toBe(false);

    const rows = await db.select().from(schema.salarySlips);
    const snapshot = rows.find((r) => r.id === slip.id)!.snapshotJson!;
    expect(snapshot.employee.panMasked).toBe("XXXXXX234F");
    expect(JSON.stringify(snapshot)).not.toContain("ABCDE1234F");
    expect(JSON.stringify(snapshot)).not.toContain("123456789012");
  });

  it("lists with person names and renders a PDF", async () => {
    const list = must(await listSalarySlips(db, ctx, { personId }));
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list[0].personName).toBe("Fake Person");

    const issued = list.find((s) => s.status === "ISSUED")!;
    const pdf = must(await renderSalarySlipPdf(db, ctx, issued.id));
    expect(pdf.buffer.subarray(0, 4).toString()).toBe("%PDF");
    const draft = list.find((s) => s.status === "DRAFT")!;
    expect((await renderSalarySlipPdf(db, ctx, draft.id)).ok).toBe(false);
  });
});

describe("salary slip routes", () => {
  it("return 403 for a manager and 401 with no session", async () => {
    vi.resetModules();
    vi.doMock("@/server/auth", () => ({ getAuth: () => ({ api: { getSession: async () => null } }) }));
    vi.doMock("next/headers", () => ({ headers: async () => new Headers() }));
    // getSessionUser re-checks the allowlist in the database; that lookup has its own tests.
    vi.doMock("@/server/session-user", async (importOriginal) => {
      const original = await importOriginal<typeof import("@/server/session-user")>();
      return {
        ...original,
        resolveSessionUser: async (_db: unknown, raw: { id: string; email: string; name: string; role?: string; orgId?: string }) => ({
          id: raw.id,
          email: raw.email,
          name: raw.name,
          role: raw.role,
          orgId: raw.orgId ?? "default",
        }),
      };
    });
    vi.doMock("@/server/db/client", async (importOriginal) => {
      const original = await importOriginal<typeof import("@/server/db/client")>();
      return { ...original, getDb: () => db };
    });
    const anon = await import("@/app/api/salary-slips/route");
    expect((await anon.GET(new Request("http://x/api/salary-slips") as never)).status).toBe(401);

    vi.resetModules();
    vi.doMock("@/server/auth", () => ({
      getAuth: () => ({
        api: { getSession: async () => ({ user: { id: "m", email: "m@example.com", name: "M", role: "MANAGER", orgId: "default" } }) },
      }),
    }));
    const mgr = await import("@/app/api/salary-slips/route");
    expect((await mgr.GET(new Request("http://x/api/salary-slips") as never)).status).toBe(403);
    expect((await mgr.POST(new Request("http://x/api/salary-slips", { method: "POST", body: "{}" }) as never)).status).toBe(403);
  });
});
