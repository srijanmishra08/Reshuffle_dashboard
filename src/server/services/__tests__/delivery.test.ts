import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { schema, type Db } from "@/server/db/client";
import { createCompany } from "../companies";
import { createDeal, transitionDeal } from "../deals";
import { createScope, sendScope } from "../scopes";
import { acceptScope, createShareLink } from "../scope-sharing";
import { getInvoice, issueInvoice } from "../invoices";
import {
  convertDealToProject,
  draftMilestoneInvoice,
  getProject,
  listProjects,
  updateMilestone,
  updateProject,
} from "../delivery";

const ctx = { orgId: "default", userId: "user-1" };
let db: Db;
let cleanup: () => void;
let companyId: string;

function must<T>(r: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

async function wonDealWithAcceptedScope(title: string, accept = true) {
  const dealId = must(await createDeal(db, ctx, { companyId, title })).id;
  for (const to of ["CONTACTED", "DIAGNOSED", "PROPOSAL_SENT", "NEGOTIATION"]) {
    must(await transitionDeal(db, ctx, dealId, { to }));
  }
  const scope = must(
    await createScope(db, ctx, {
      dealId,
      title: `${title} scope`,
      paymentSchedule: [
        { label: "Advance", percent: 50 },
        { label: "Mid", percent: 30 },
        { label: "Delivery", percent: 20 },
      ],
      items: [{ phase: "Phase 1", title: "Module", days: 5, pricePaise: 8_333_333 }],
    })
  );
  must(await sendScope(db, ctx, scope.id, { idempotencyKey: `send-${title}-key` }));
  if (accept) {
    const link = must(await createShareLink(db, ctx, scope.id));
    must(await acceptScope(db, link.token, { typedName: "Asha Rao" }, { ip: "1.2.3.4", userAgent: null }));
  }
  must(await transitionDeal(db, ctx, dealId, { to: "WON" }));
  return dealId;
}

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  await db.insert(schema.orgSettings).values({
    orgId: "default",
    legalName: "Test Studio",
    address: "1 Example Road",
    stateCode: "22",
    gstin: "22AAAAA0000A1Z5",
  });
  companyId = must(await createCompany(db, ctx, { name: "Fake Dairy Co", stateCode: "22" })).id;
});
afterAll(() => cleanup());

describe("convertDealToProject", () => {
  it("refuses a deal that is not won, or has no accepted scope", async () => {
    const open = must(await createDeal(db, ctx, { companyId, title: "Open deal" })).id;
    const r1 = await convertDealToProject(db, ctx, open);
    expect(r1.ok).toBe(false);

    const unaccepted = await wonDealWithAcceptedScope("NoAccept", false);
    const r2 = await convertDealToProject(db, ctx, unaccepted);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toMatch(/accepted scope/);
  });

  it("creates a project with milestones that sum to the scope total, and is idempotent", async () => {
    const dealId = await wonDealWithAcceptedScope("Dairy");
    const project = must(await convertDealToProject(db, ctx, dealId));
    expect(project.budgetPaise).toBe(8_333_333);
    expect(project.milestones.map((m) => m.label)).toEqual(["Advance", "Mid", "Delivery"]);
    expect(project.milestones.reduce((s, m) => s + m.amountPaise, 0)).toBe(8_333_333);

    const again = must(await convertDealToProject(db, ctx, dealId));
    expect(again.id).toBe(project.id);
    expect(must(await listProjects(db, ctx)).filter((p) => p.name === "Dairy")).toHaveLength(1);
  });

  it("the database refuses a second project for the same deal", async () => {
    // Parallel interactive transactions throw SQLITE_BUSY on a SQLite file (see handoff), so the
    // race guard is checked at the unique index that the service relies on.
    const dealId = await wonDealWithAcceptedScope("Race");
    const project = must(await convertDealToProject(db, ctx, dealId));
    await expect(
      db.insert(schema.deliveryProjects).values({ orgId: "default", companyId, dealId, name: "dup" })
    ).rejects.toThrow();
    expect(must(await listProjects(db, ctx)).filter((p) => p.id === project.id)).toHaveLength(1);
  });
});

describe("milestones and billing", () => {
  it("drafts one invoice per milestone and reports invoiced/paid from issued invoices", async () => {
    const dealId = await wonDealWithAcceptedScope("Billing");
    const project = must(await convertDealToProject(db, ctx, dealId));
    const advance = project.milestones[0];

    const drafted = must(await draftMilestoneInvoice(db, ctx, project.id, advance.id));
    const invoice = must(await getInvoice(db, ctx, drafted.invoiceId));
    expect(invoice.status).toBe("DRAFT");
    expect(invoice.projectId).toBe(project.id);
    expect(invoice.subtotalPaise).toBe(advance.amountPaise);

    const second = await draftMilestoneInvoice(db, ctx, project.id, advance.id);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe("CONFLICT");

    // Drafts are not counted as invoiced.
    expect(must(await getProject(db, ctx, project.id)).invoicedPaise).toBe(0);

    must(await issueInvoice(db, ctx, drafted.invoiceId, { idempotencyKey: "issue-billing-1" }));
    const after = must(await getProject(db, ctx, project.id));
    expect(after.invoicedPaise).toBe(invoice.totalPaise);
    expect(after.paidPaise).toBe(0);
    expect(after.milestones[0].status).toBe("INVOICED");
    expect(after.milestones[0].invoiceId).toBe(drafted.invoiceId);
  });

  it("marks milestones done and blocks changes after invoicing", async () => {
    const dealId = await wonDealWithAcceptedScope("Status");
    const project = must(await convertDealToProject(db, ctx, dealId));
    const [first, second] = project.milestones;

    const done = must(await updateMilestone(db, ctx, project.id, second.id, { status: "DONE" }));
    expect(done.milestones[1].status).toBe("DONE");
    expect(done.milestones[1].completedAt).not.toBeNull();
    expect((await updateMilestone(db, ctx, project.id, second.id, { status: "INVOICED" })).ok).toBe(false);

    must(await draftMilestoneInvoice(db, ctx, project.id, first.id));
    expect((await updateMilestone(db, ctx, project.id, first.id, { status: "PENDING" })).ok).toBe(false);
  });

  it("does not reach a milestone through another project", async () => {
    const a = must(await convertDealToProject(db, ctx, await wonDealWithAcceptedScope("ProjA")));
    const b = must(await convertDealToProject(db, ctx, await wonDealWithAcceptedScope("ProjB")));
    const res = await draftMilestoneInvoice(db, ctx, b.id, a.milestones[0].id);
    expect(res.ok).toBe(false);
  });
});

describe("updateProject", () => {
  it("validates status and dates", async () => {
    const project = must(await convertDealToProject(db, ctx, await wonDealWithAcceptedScope("Upd")));
    expect(must(await updateProject(db, ctx, project.id, { status: "ACTIVE", dueDate: "2027-03-31" })).status).toBe("ACTIVE");
    expect((await updateProject(db, ctx, project.id, { status: "NOPE" })).ok).toBe(false);
    expect((await updateProject(db, ctx, project.id, { dueDate: "31/03/2027" })).ok).toBe(false);
    expect((await updateProject(db, { ...ctx, orgId: "other" }, project.id, { name: "x" })).ok).toBe(false);
  });
});
