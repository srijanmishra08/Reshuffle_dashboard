import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import { schema, type Db } from "@/server/db/client";
import { importNotion, parseCsv, parseRupees, toRecords } from "@/server/import/notion";

// Obviously fake data only. This repo is public.
const products = `Name,Description
Dairy,
Brand New Vertical,Test vertical
`;

const clients = `Name,Company,Process status,Phone,Email,Role,Onboarded,Approved,Product,Lead source
Test Person One,Example Co One,In progress,+910000000001,one@example.test,ClientTeam,Yes,No,Dairy,Referral
Example Co Two,,Lead,,,,,,,
,,,,,,,,,
Test Person Three,Example Co Three,Weird Status,,,,,,Nonexistent,
`;

const meetings = `Name,Date,Client,Notes
Kickoff,"November 12, 2026 3:00 PM",Example Co One,"Line one
line two"
Bad Date Meeting,not a date,Example Co One,
Orphan,"November 13, 2026 10:00 AM",Unknown Co,
`;

const leads = `Lead Name,Business,Product type,Referred by,Status,Quotation status,Current block,Reason for not converting,Amount
Test Lead One,Example Co One,Dairy,Test Referrer,Proposal sent,Sent,Waiting on budget,,"₹1,20,000"
Test Lead Four,Example Lead Co Four,,,Client,Accepted,,,45000.50
Test Lead Five,Example Lead Co Five,Nonexistent,,Mystery,Odd,,Too expensive,lots
,,,,,,,,
`;

describe("parseRupees", () => {
  it("reads rupee text into paise and rejects anything else", () => {
    expect(parseRupees("₹1,20,000")).toBe(12000000);
    expect(parseRupees("Rs. 45000.50")).toBe(4500050);
    expect(parseRupees("5000/-")).toBe(500000);
    expect(parseRupees("lots")).toBeNull();
    expect(parseRupees("-100")).toBeNull();
    expect(parseRupees("99999999999")).toBeNull();
  });
});

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, embedded newlines and BOM", () => {
    const rows = parseCsv('﻿a,b\n"x, y","he said ""hi"""\n"multi\nline",z\n');
    expect(rows).toEqual([
      ["a", "b"],
      ["x, y", 'he said "hi"'],
      ["multi\nline", "z"],
    ]);
  });

  it("normalises headers", () => {
    expect(toRecords("Process Status,E-mail\nLead,a@b.test")[0]).toEqual({ processstatus: "Lead", email: "a@b.test" });
  });
});

describe("importNotion", () => {
  let db: Db;
  let cleanup: () => void;

  beforeAll(async () => {
    ({ db, cleanup } = await createTestDb());
  });
  afterAll(() => cleanup());

  it("dry run writes nothing but reports counts", async () => {
    const report = await importNotion(db, { products, clients, meetings }, { dryRun: true });
    expect(report.dryRun).toBe(true);
    expect(report.clients.created).toBe(3);
    expect(report.clients.skipped).toBe(0);
    expect(await db.select().from(schema.companies)).toHaveLength(0);
    expect(await db.select().from(schema.meetings)).toHaveLength(0);
  });

  it("imports companies, contacts with WhatsApp flags, verticals and meetings", async () => {
    const report = await importNotion(db, { products, clients, meetings }, { dryRun: false });

    expect(report.products).toMatchObject({ created: 1, updated: 1 });
    expect(report.clients.created).toBe(3);
    expect(report.meetings).toMatchObject({ created: 2, skipped: 1 });

    const [one] = await db.select().from(schema.companies).where(eq(schema.companies.name, "Example Co One"));
    expect(one.lifecycle).toBe("ACTIVE");
    expect(one.verticalId).toBe("vertical-dairy");
    expect(one.source).toBe("Referral");

    const [contact] = await db.select().from(schema.contacts).where(eq(schema.contacts.companyId, one.id));
    expect(contact.whatsappRole).toBe("CLIENT_TEAM");
    expect(contact.onboarded).toBe(true);
    expect(contact.approved).toBe(false);

    const [weird] = await db.select().from(schema.companies).where(eq(schema.companies.name, "Example Co Three"));
    expect(weird.lifecycle).toBe("PROSPECT");
    expect(weird.verticalId).toBeNull();
    expect(report.clients.warnings.join(" ")).toContain("unknown status");

    const kickoff = (await db.select().from(schema.meetings)).find((m) => m.title === "Kickoff");
    expect(kickoff?.companyId).toBe(one.id);
    expect(kickoff?.notes).toBe("Line one\nline two");
  });

  it("is idempotent", async () => {
    const report = await importNotion(db, { products, clients, meetings }, { dryRun: false });
    expect(report.clients).toMatchObject({ created: 0, updated: 3 });
    expect(report.meetings).toMatchObject({ created: 0, updated: 2 });
    expect(await db.select().from(schema.companies)).toHaveLength(3);
    expect(await db.select().from(schema.contacts)).toHaveLength(1);
  });

  it("dry run of reference clients writes no deals", async () => {
    const report = await importNotion(db, { "reference-clients": leads }, { dryRun: true });
    expect(report["reference-clients"]).toMatchObject({ created: 3, updated: 0, skipped: 0 });
    expect(await db.select().from(schema.deals)).toHaveLength(0);
    expect(await db.select().from(schema.companies)).toHaveLength(3);
  });

  it("imports reference clients as deals, reusing companies by name", async () => {
    const report = await importNotion(db, { "reference-clients": leads }, { dryRun: false });
    const r = report["reference-clients"];
    expect(r).toMatchObject({ created: 3, updated: 0, skipped: 0 });
    expect(r.warnings.join(" ")).toContain("unknown status");
    expect(r.warnings.join(" ")).toContain("unknown quotation status");
    expect(r.warnings.join(" ")).toContain("unreadable amount");
    expect(r.warnings.join(" ")).toContain("vertical not found");
    expect(r.warnings.join(" ")).toContain("reason for not converting");
    // Warnings carry row numbers only, never names.
    expect(r.warnings.join(" ")).not.toContain("Example");

    // Existing company is reused, two new prospects are created.
    expect(await db.select().from(schema.companies)).toHaveLength(5);
    const [one] = await db.select().from(schema.companies).where(eq(schema.companies.name, "Example Co One"));
    const [dealOne] = await db.select().from(schema.deals).where(eq(schema.deals.companyId, one.id));
    expect(dealOne).toMatchObject({
      stage: "PROPOSAL_SENT",
      quotationStatus: "SENT",
      valuePaise: 12000000,
      verticalId: "vertical-dairy",
      referrer: "Test Referrer",
      source: "Referral",
      currentBlock: "Waiting on budget",
      closedAt: null,
    });

    const [four] = await db.select().from(schema.companies).where(eq(schema.companies.name, "Example Lead Co Four"));
    expect(four.lifecycle).toBe("ACTIVE");
    const [dealFour] = await db.select().from(schema.deals).where(eq(schema.deals.companyId, four.id));
    expect(dealFour).toMatchObject({ stage: "WON", quotationStatus: "ACCEPTED", valuePaise: 4500050 });
    expect(dealFour.closedAt).toBeInstanceOf(Date);

    const [five] = await db.select().from(schema.companies).where(eq(schema.companies.name, "Example Lead Co Five"));
    const [dealFive] = await db.select().from(schema.deals).where(eq(schema.deals.companyId, five.id));
    expect(dealFive).toMatchObject({ stage: "LEAD", quotationStatus: "NONE", valuePaise: 0, lostReason: "Too expensive" });

    const history = await db.select().from(schema.dealStageHistory);
    expect(history).toHaveLength(3);
    expect(history.every((h) => h.fromStage === null && h.note === "Imported from Notion")).toBe(true);
  });

  it("re-import updates Notion fields but keeps a stage changed in the dashboard", async () => {
    const [one] = await db.select().from(schema.companies).where(eq(schema.companies.name, "Example Co One"));
    await db.update(schema.deals).set({ stage: "NEGOTIATION" }).where(eq(schema.deals.companyId, one.id));

    const changed = leads.replace("Waiting on budget", "Waiting on sign-off");
    const report = await importNotion(db, { "reference-clients": changed }, { dryRun: false });
    expect(report["reference-clients"]).toMatchObject({ created: 0, updated: 3 });

    expect(await db.select().from(schema.deals)).toHaveLength(3);
    expect(await db.select().from(schema.dealStageHistory)).toHaveLength(3);
    const [dealOne] = await db.select().from(schema.deals).where(eq(schema.deals.companyId, one.id));
    expect(dealOne.stage).toBe("NEGOTIATION");
    expect(dealOne.currentBlock).toBe("Waiting on sign-off");
  });
});
