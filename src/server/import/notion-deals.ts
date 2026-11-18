import { and, eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { toPaise } from "@/server/lib/money";
import type { DealStage } from "@/server/models/deals";
import { toRecords, type KindReport, type RecordRow } from "@/server/import/notion";

/**
 * Notion part 2: Sales > Reference Client list -> companies + deals.
 * Idempotent on `external_id`. Never logs names or amounts.
 */

const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const cleanRelation = (value: string) => value.replace(/\s*\(https?:\/\/[^)]*\)/g, "").trim();

function pick(rec: RecordRow, aliases: string[]): string {
  for (const alias of aliases) if (rec[alias]) return rec[alias];
  return "";
}

/** Notion lead status -> deal stage. Edit here if the labels differ. */
export const leadStatusToStage: Record<string, DealStage> = {
  lead: "LEAD",
  followup: "CONTACTED",
  contacted: "CONTACTED",
  diagnosed: "DIAGNOSED",
  proposalsent: "PROPOSAL_SENT",
  negotiation: "NEGOTIATION",
  client: "WON",
  won: "WON",
  lost: "LOST",
  notconverted: "LOST",
};

const quotationMap: Record<string, "NONE" | "DRAFTED" | "SENT" | "ACCEPTED" | "REJECTED"> = {
  none: "NONE",
  notsent: "NONE",
  drafted: "DRAFTED",
  draft: "DRAFTED",
  sent: "SENT",
  accepted: "ACCEPTED",
  rejected: "REJECTED",
};

export async function importReferenceClients(
  db: Db,
  csv: string,
  options: { dryRun: boolean; orgId?: string }
): Promise<KindReport> {
  const orgId = options.orgId ?? "default";
  const report: KindReport = { created: 0, updated: 0, skipped: 0, warnings: [] };
  const { companies, deals, verticals } = schema;

  const verticalRows = await db.select().from(verticals).where(eq(verticals.orgId, orgId));
  const verticalByName = new Map(verticalRows.map((v) => [v.name.toLowerCase(), v.id]));

  for (const [index, rec] of toRecords(csv).entries()) {
    const row = index + 2;
    const leadName = pick(rec, ["leadname", "name", "lead", "title"]);
    const business = pick(rec, ["business", "company", "businessname"]) || leadName;
    if (!business) {
      report.skipped++;
      report.warnings.push(`reference clients row ${row}: no name`);
      continue;
    }

    const statusKey = norm(pick(rec, ["status", "leadstatus", "stage"]));
    const stage = leadStatusToStage[statusKey] ?? "LEAD";
    if (statusKey && !leadStatusToStage[statusKey]) {
      report.warnings.push(`reference clients row ${row}: unknown status "${statusKey}", used LEAD`);
    }

    const quoteKey = norm(pick(rec, ["quotationstatus", "quotation", "quote"]));
    const quotationStatus = quotationMap[quoteKey] ?? "NONE";

    let valuePaise = 0;
    const amount = pick(rec, ["amount", "value", "dealvalue"]).replace(/[₹,\s]/g, "");
    if (amount) {
      if (/^\d+(\.\d{1,2})?$/.test(amount)) valuePaise = Number(toPaise(amount));
      else report.warnings.push(`reference clients row ${row}: unreadable amount, set to 0`);
    }

    const verticalName = cleanRelation(pick(rec, ["producttype", "product", "vertical"]));
    const verticalId = verticalName ? verticalByName.get(verticalName.toLowerCase()) ?? null : null;
    if (verticalName && !verticalId) report.warnings.push(`reference clients row ${row}: vertical not found, left empty`);

    const externalId = `notion:reference-clients:${slug(business)}:${slug(leadName || business)}`;
    const companyExternalId = `notion:clients:${slug(business)}`;

    // Reuse the company from the clients import (or an existing one by name); create otherwise.
    let companyId: string | undefined;
    const byExternal = await db
      .select({ id: companies.id })
      .from(companies)
      .where(and(eq(companies.orgId, orgId), eq(companies.externalId, companyExternalId)))
      .limit(1);
    companyId = byExternal[0]?.id;
    if (!companyId) {
      const all = await db.select({ id: companies.id, name: companies.name }).from(companies).where(eq(companies.orgId, orgId));
      companyId = all.find((c) => c.name.toLowerCase() === business.toLowerCase())?.id;
    }

    const found = await db
      .select({ id: deals.id, stage: deals.stage })
      .from(deals)
      .where(and(eq(deals.orgId, orgId), eq(deals.externalId, externalId)))
      .limit(1);

    if (found[0]) report.updated++;
    else report.created++;
    if (options.dryRun) continue;

    const now = new Date();
    if (!companyId) {
      const inserted = await db
        .insert(companies)
        .values({ orgId, name: business, lifecycle: "PROSPECT", externalId: companyExternalId, createdAt: now, updatedAt: now })
        .returning({ id: companies.id });
      companyId = inserted[0].id;
    }

    const values = {
      title: leadName || business,
      stage,
      valuePaise,
      verticalId,
      source: pick(rec, ["leadsource", "source"]) || null,
      referrer: cleanRelation(pick(rec, ["referredby", "referrer"])) || null,
      quotationStatus,
      currentBlock: pick(rec, ["currentblock", "block"]) || null,
      lostReason: stage === "LOST" ? pick(rec, ["reasonfornotconverting", "reason", "lostreason"]) || null : null,
      closedAt: stage === "WON" || stage === "LOST" ? now : null,
    };

    if (found[0]) {
      await db.update(deals).set({ ...values, companyId, updatedAt: now }).where(eq(deals.id, found[0].id));
    } else {
      const inserted = await db
        .insert(deals)
        .values({ orgId, companyId, externalId, ...values, createdAt: now, updatedAt: now })
        .returning({ id: deals.id });
      await db.insert(schema.dealStageHistory).values({
        orgId,
        dealId: inserted[0].id,
        fromStage: null,
        toStage: stage,
        note: "Imported from Notion",
        changedBy: "import",
      });
    }
  }
  return report;
}
