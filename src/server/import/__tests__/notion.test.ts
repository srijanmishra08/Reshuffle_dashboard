import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import { schema, type Db } from "@/server/db/client";
import { importNotion, parseCsv, toRecords } from "@/server/import/notion";

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
});
