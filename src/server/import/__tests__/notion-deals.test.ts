import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { schema, type Db } from "@/server/db/client";
import { importReferenceClients } from "@/server/import/notion-deals";

// Obviously fake data only. This repo is public.
const csv = `Lead name,Business,Product type,Referred by,Status,Quotation status,Current block,Reason for not converting,Amount
Test Lead One,Example Co One,Dairy,Friend A,Proposal sent,Sent,Waiting on budget,,"1,50,000"
Test Lead Two,Example Co Two,,,Not converted,Rejected,,Too expensive,
,,,Friend B,,,,,
Test Lead Four,Example Co Four,,,Strange,,,,abc
Test Lead Five,Example Co Five,Dairy,,Client,Accepted,,,0
`;

describe("importReferenceClients", () => {
  let db: Db;
  let cleanup: () => void;
  beforeAll(async () => {
    ({ db, cleanup } = await createTestDb());
  });
  afterAll(() => cleanup());

  it("dry run writes nothing", async () => {
    const r = await importReferenceClients(db, csv, { dryRun: true });
    expect(r.created).toBe(4);
    expect(r.skipped).toBe(1);
    expect(await db.select().from(schema.deals)).toHaveLength(0);
    expect(await db.select().from(schema.companies)).toHaveLength(0);
  });

  it("imports deals with stage, quotation, paise and lost reason", async () => {
    const r = await importReferenceClients(db, csv, { dryRun: false });
    expect(r.created).toBe(4);
    const rows = await db.select().from(schema.deals);
    const one = rows.find((d) => d.title === "Test Lead One")!;
    expect(one.stage).toBe("PROPOSAL_SENT");
    expect(one.quotationStatus).toBe("SENT");
    expect(one.valuePaise).toBe(15_000_000);
    expect(one.verticalId).not.toBeNull();
    const two = rows.find((d) => d.title === "Test Lead Two")!;
    expect(two.stage).toBe("LOST");
    expect(two.lostReason).toBe("Too expensive");
    expect(rows.find((d) => d.title === "Test Lead Five")!.stage).toBe("WON");
    expect(r.warnings.some((w) => w.includes("unknown status"))).toBe(true);
    expect(r.warnings.some((w) => w.includes("unreadable amount"))).toBe(true);
    expect(await db.select().from(schema.dealStageHistory)).toHaveLength(4);
  });

  it("is idempotent", async () => {
    const r = await importReferenceClients(db, csv, { dryRun: false });
    expect(r.created).toBe(0);
    expect(r.updated).toBe(4);
    expect(await db.select().from(schema.deals)).toHaveLength(4);
    expect(await db.select().from(schema.companies)).toHaveLength(4);
  });
});
