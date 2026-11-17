import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { toPaise } from "@/server/lib/money";
import type { DealStage } from "@/server/models/deals";
import { quotationStatusValues } from "@/server/models/deals";

/**
 * One-time import from a Notion "Markdown & CSV" export.
 * Idempotent: every row gets a stable `external_id` derived from its kind and name,
 * so re-running updates instead of duplicating. Never logs names or contact details.
 */

export type ImportKind = "clients" | "products" | "meetings" | "reference-clients";

export const importKinds: ImportKind[] = ["clients", "products", "meetings", "reference-clients"];

export type KindReport = {
  created: number;
  updated: number;
  skipped: number;
  warnings: string[];
};

export type ImportReport = Record<ImportKind, KindReport> & { dryRun: boolean };

/** Notion "Process status" -> company lifecycle. Edit here if the Notion labels differ. */
export const processStatusToLifecycle: Record<string, schema.CompanyLifecycle> = {
  lead: "PROSPECT",
  proposalsent: "PROSPECT",
  negotiation: "PROSPECT",
  inprogress: "ACTIVE",
  completed: "MAINTENANCE",
  maintenance: "MAINTENANCE",
  closed: "CLOSED",
};

/** Notion Sales "Reference Client" status -> deal stage. Edit here if the Notion labels differ. */
export const leadStatusToStage: Record<string, DealStage> = {
  lead: "LEAD",
  new: "LEAD",
  followup: "CONTACTED",
  contacted: "CONTACTED",
  proposalsent: "PROPOSAL_SENT",
  negotiation: "NEGOTIATION",
  client: "WON",
  converted: "WON",
  won: "WON",
  notconverted: "LOST",
  lost: "LOST",
  dropped: "LOST",
};

type QuotationStatus = (typeof quotationStatusValues)[number];

/** Notion "Quotation status" -> deal quotation status. */
export const quotationToStatus: Record<string, QuotationStatus> = {
  none: "NONE",
  notsent: "NONE",
  notstarted: "NONE",
  pending: "DRAFTED",
  draft: "DRAFTED",
  drafted: "DRAFTED",
  inprogress: "DRAFTED",
  sent: "SENT",
  shared: "SENT",
  accepted: "ACCEPTED",
  approved: "ACCEPTED",
  rejected: "REJECTED",
  declined: "REJECTED",
};

/** Deal values are int4 paise in the database. */
const MAX_INT4 = 2_147_483_647;

/** "₹1,20,000", "Rs. 45000.50", "INR 1200" -> paise. Returns null when the text is not a plain rupee amount. */
export function parseRupees(value: string): number | null {
  const text = value.replace(/₹|rs\.?|inr|\/-|\s/gi, "");
  if (!text) return null;
  try {
    const amount = toPaise(text);
    return amount >= 0 && amount <= MAX_INT4 ? amount : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// CSV parsing (RFC 4180: quotes, escaped quotes, newlines inside quotes, BOM)
// ---------------------------------------------------------------------------

export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }

  row.push(field);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

const normaliseHeader = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

export type RecordRow = Record<string, string>;

export function toRecords(csv: string): RecordRow[] {
  const [header, ...rows] = parseCsv(csv);
  if (!header) return [];
  const keys = header.map(normaliseHeader);

  return rows.map((cells) => {
    const record: RecordRow = {};
    keys.forEach((key, index) => {
      if (key && record[key] === undefined) record[key] = (cells[index] ?? "").trim();
    });
    return record;
  });
}

function pick(record: RecordRow, aliases: string[]): string {
  for (const alias of aliases) {
    const value = record[alias];
    if (value) return value;
  }
  return "";
}

function toBool(value: string): boolean {
  return ["yes", "true", "checked", "1", "✓", "✅"].includes(value.trim().toLowerCase());
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Notion exports suffix names with relation ids like "Name (https://www.notion.so/...)". */
function cleanRelation(value: string): string {
  return value.replace(/\s*\(https?:\/\/[^)]*\)/g, "").trim();
}

const emptyReport = (): KindReport => ({ created: 0, updated: 0, skipped: 0, warnings: [] });

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export type ImportInput = Partial<Record<ImportKind, string>>;

export async function importNotion(
  db: Db,
  input: ImportInput,
  options: { dryRun: boolean; orgId?: string }
): Promise<ImportReport> {
  const orgId = options.orgId ?? "default";
  const dryRun = options.dryRun;
  const report: ImportReport = {
    clients: emptyReport(),
    products: emptyReport(),
    meetings: emptyReport(),
    "reference-clients": emptyReport(),
    dryRun,
  };
  const { verticals, companies, contacts, meetings, deals, dealStageHistory } = schema;

  // --- products -> verticals ------------------------------------------------
  const verticalByName = new Map<string, string>();
  const existingVerticals = await db.select().from(verticals).where(eq(verticals.orgId, orgId));
  existingVerticals.forEach((row) => verticalByName.set(row.name.toLowerCase(), row.id));

  if (input.products) {
    for (const [index, rec] of toRecords(input.products).entries()) {
      const name = pick(rec, ["name", "product", "vertical", "title"]);
      if (!name) {
        report.products.skipped++;
        report.products.warnings.push(`products row ${index + 2}: no name`);
        continue;
      }

      if (verticalByName.has(name.toLowerCase())) {
        report.products.updated++;
        continue;
      }

      report.products.created++;
      const id = `planned:${slug(name)}`;
      if (!dryRun) {
        const now = new Date();
        const inserted = await db
          .insert(verticals)
          .values({ orgId, name, description: pick(rec, ["description", "notes"]), externalId: `notion:products:${slug(name)}`, createdAt: now, updatedAt: now })
          .returning({ id: verticals.id });
        verticalByName.set(name.toLowerCase(), inserted[0].id);
      } else {
        verticalByName.set(name.toLowerCase(), id);
      }
    }
  }

  // --- clients -> companies + contacts -------------------------------------
  const companyByName = new Map<string, string>();
  const existingCompanies = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(and(eq(companies.orgId, orgId), isNull(companies.archivedAt)));
  existingCompanies.forEach((row) => companyByName.set(row.name.toLowerCase(), row.id));

  if (input.clients) {
    for (const [index, rec] of toRecords(input.clients).entries()) {
      const personName = pick(rec, ["name", "client", "clientname", "title"]);
      const companyName = pick(rec, ["company", "business", "companyname", "organisation", "organization"]) || personName;

      if (!companyName) {
        report.clients.skipped++;
        report.clients.warnings.push(`clients row ${index + 2}: no name`);
        continue;
      }

      const statusKey = normaliseHeader(pick(rec, ["processstatus", "status", "stage"]));
      const lifecycle = processStatusToLifecycle[statusKey] ?? "PROSPECT";
      if (statusKey && !processStatusToLifecycle[statusKey]) {
        report.clients.warnings.push(`clients row ${index + 2}: unknown status "${statusKey}", used PROSPECT`);
      }

      const verticalName = cleanRelation(pick(rec, ["product", "products", "vertical", "producttype"]));
      const verticalId = verticalName ? verticalByName.get(verticalName.toLowerCase()) : undefined;
      if (verticalName && !verticalId) {
        report.clients.warnings.push(`clients row ${index + 2}: vertical not found, left empty`);
      }

      const externalId = `notion:clients:${slug(companyName)}`;
      const values = {
        name: companyName,
        lifecycle,
        verticalId: verticalId && !verticalId.startsWith("planned:") ? verticalId : null,
        source: pick(rec, ["leadsource", "source"]) || null,
        referrer: cleanRelation(pick(rec, ["referredby", "referrer"])) || null,
        notes: pick(rec, ["notes", "currentblock", "comments"]) || null,
      };

      const found = await db
        .select({ id: companies.id })
        .from(companies)
        .where(and(eq(companies.orgId, orgId), eq(companies.externalId, externalId)))
        .limit(1);

      let companyId = found[0]?.id;
      if (companyId) {
        report.clients.updated++;
        if (!dryRun) {
          await db.update(companies).set({ ...values, updatedAt: new Date() }).where(eq(companies.id, companyId));
        }
      } else {
        report.clients.created++;
        if (!dryRun) {
          const now = new Date();
          const inserted = await db
            .insert(companies)
            .values({ orgId, externalId, ...values, createdAt: now, updatedAt: now })
            .returning({ id: companies.id });
          companyId = inserted[0].id;
        }
      }

      companyByName.set(companyName.toLowerCase(), companyId ?? `planned:${slug(companyName)}`);

      // One contact per row when the row carries person details.
      const phone = pick(rec, ["phone", "phonenumber", "mobile"]);
      const email = pick(rec, ["email", "emailid"]);
      const waRole = normaliseHeader(pick(rec, ["whatsapprole", "role"]));
      const hasContact = Boolean(personName && (phone || email || waRole));

      if (hasContact && companyId) {
        const contactExternalId = `${externalId}:contact:${slug(personName)}`;
        const contactValues = {
          name: personName,
          phone: phone || null,
          email: email || null,
          whatsapp: phone || null,
          whatsappRole: waRole === "client" ? "CLIENT" : waRole === "clientteam" ? "CLIENT_TEAM" : null,
          onboarded: toBool(pick(rec, ["onboarded"])),
          approved: toBool(pick(rec, ["approved"])),
        };
        const existingContact = await db
          .select({ id: contacts.id })
          .from(contacts)
          .where(and(eq(contacts.orgId, orgId), eq(contacts.externalId, contactExternalId)))
          .limit(1);

        if (!dryRun) {
          if (existingContact[0]) {
            await db.update(contacts).set({ ...contactValues, updatedAt: new Date() }).where(eq(contacts.id, existingContact[0].id));
          } else {
            const now = new Date();
            await db.insert(contacts).values({ orgId, companyId, externalId: contactExternalId, ...contactValues, createdAt: now, updatedAt: now });
          }
        }
      }
    }
  }

  // --- meetings ---------------------------------------------------------------
  if (input.meetings) {
    for (const [index, rec] of toRecords(input.meetings).entries()) {
      const title = pick(rec, ["name", "title", "meeting"]);
      const when = pick(rec, ["date", "when", "at", "meetingdate"]);
      const parsedTime = Date.parse(when);

      if (!title || Number.isNaN(parsedTime)) {
        report.meetings.skipped++;
        report.meetings.warnings.push(`meetings row ${index + 2}: missing title or unreadable date`);
        continue;
      }

      const at = new Date(parsedTime);
      const companyName = cleanRelation(pick(rec, ["client", "company", "clients", "account"]));
      const companyId = companyName ? companyByName.get(companyName.toLowerCase()) : undefined;
      if (companyName && !companyId) {
        report.meetings.warnings.push(`meetings row ${index + 2}: client not found, meeting left unlinked`);
      }

      const externalId = `notion:meetings:${slug(title)}:${at.toISOString().slice(0, 10)}`;
      const attendees = pick(rec, ["attendees", "people", "participants"])
        .split(",")
        .map((value) => cleanRelation(value))
        .filter(Boolean);
      const values = {
        title,
        at,
        companyId: companyId && !companyId.startsWith("planned:") ? companyId : null,
        location: pick(rec, ["location", "link", "place"]) || null,
        attendees,
        notes: pick(rec, ["notes", "summary"]) || null,
      };

      const found = await db
        .select({ id: meetings.id })
        .from(meetings)
        .where(and(eq(meetings.orgId, orgId), eq(meetings.externalId, externalId)))
        .limit(1);

      if (found[0]) {
        report.meetings.updated++;
        if (!dryRun) {
          await db.update(meetings).set({ ...values, updatedAt: new Date() }).where(eq(meetings.id, found[0].id));
        }
      } else {
        report.meetings.created++;
        if (!dryRun) {
          const now = new Date();
          await db.insert(meetings).values({ orgId, externalId, ...values, createdAt: now, updatedAt: now });
        }
      }
    }
  }

  // --- reference clients (sales leads) -> deals, plus a company when none exists ----
  if (input["reference-clients"]) {
    const leads = report["reference-clients"];
    const isReal = (id: string | undefined): id is string => Boolean(id) && !id!.startsWith("planned:");

    for (const [index, rec] of toRecords(input["reference-clients"]).entries()) {
      const row = `reference-clients row ${index + 2}`;
      const leadName = pick(rec, ["leadname", "name", "lead", "title"]);
      const companyName = pick(rec, ["business", "businessname", "company", "companyname"]) || leadName;

      if (!companyName) {
        leads.skipped++;
        leads.warnings.push(`${row}: no name`);
        continue;
      }

      const statusKey = normaliseHeader(pick(rec, ["status", "leadstatus", "stage"]));
      const stage = leadStatusToStage[statusKey] ?? "LEAD";
      if (statusKey && !leadStatusToStage[statusKey]) {
        leads.warnings.push(`${row}: unknown status "${statusKey}", used LEAD`);
      }

      const quotationKey = normaliseHeader(pick(rec, ["quotationstatus", "quotation", "quote", "quotestatus"]));
      const quotationStatus = quotationToStatus[quotationKey] ?? "NONE";
      if (quotationKey && !quotationToStatus[quotationKey]) {
        leads.warnings.push(`${row}: unknown quotation status "${quotationKey}", used NONE`);
      }

      const amountText = pick(rec, ["amount", "value", "dealvalue", "quotationamount", "budget"]);
      const amount = amountText ? parseRupees(amountText) : 0;
      if (amount === null) {
        leads.warnings.push(`${row}: unreadable amount, used 0`);
      }

      const verticalName = cleanRelation(pick(rec, ["producttype", "product", "products", "vertical"]));
      const verticalId = verticalName ? verticalByName.get(verticalName.toLowerCase()) : undefined;
      if (verticalName && !verticalId) {
        leads.warnings.push(`${row}: vertical not found, left empty`);
      }

      const referrer = cleanRelation(pick(rec, ["referredby", "referrer", "reference"])) || null;
      const reason = pick(rec, ["reasonfornotconverting", "reason", "lostreason"]) || null;
      if (reason && stage !== "LOST") {
        leads.warnings.push(`${row}: has a reason for not converting but status is not lost; check the stage by hand`);
      }

      // Company: reuse one with the same name (from the clients import or typed in), otherwise create a prospect.
      let companyId = companyByName.get(companyName.toLowerCase());
      if (!companyId) {
        companyId = `planned:${slug(companyName)}`;
        if (!dryRun) {
          const now = new Date();
          const inserted = await db
            .insert(companies)
            .values({
              orgId,
              externalId: `notion:reference-clients:${slug(companyName)}`,
              name: companyName,
              lifecycle: stage === "WON" ? "ACTIVE" : "PROSPECT",
              verticalId: isReal(verticalId) ? verticalId : null,
              source: referrer ? "Referral" : null,
              referrer,
              createdAt: now,
              updatedAt: now,
            })
            .returning({ id: companies.id });
          companyId = inserted[0].id;
        }
        companyByName.set(companyName.toLowerCase(), companyId);
      }

      const externalId = `notion:reference-clients:${slug(companyName)}`;
      // Fields Notion owns. Stage is set once at creation: after that the dashboard owns it (and its history).
      const values = {
        title: verticalName ? `${companyName}: ${verticalName}` : companyName,
        valuePaise: amount ?? 0,
        verticalId: isReal(verticalId) ? verticalId : null,
        source: referrer ? "Referral" : null,
        referrer,
        quotationStatus,
        currentBlock: pick(rec, ["currentblock", "block", "blocker"]) || null,
        lostReason: reason,
      };

      const found = isReal(companyId)
        ? await db
            .select({ id: deals.id })
            .from(deals)
            .where(and(eq(deals.orgId, orgId), eq(deals.externalId, externalId)))
            .limit(1)
        : [];

      if (found[0]) {
        leads.updated++;
        if (!dryRun) {
          await db.update(deals).set({ ...values, updatedAt: new Date() }).where(eq(deals.id, found[0].id));
        }
      } else {
        leads.created++;
        if (!dryRun && isReal(companyId)) {
          const realCompanyId = companyId;
          const now = new Date();
          await db.transaction(async (tx) => {
            const inserted = await tx
              .insert(deals)
              .values({
                orgId,
                externalId,
                companyId: realCompanyId,
                stage,
                closedAt: stage === "WON" || stage === "LOST" ? now : null,
                ...values,
                createdAt: now,
                updatedAt: now,
              })
              .returning({ id: deals.id });
            await tx.insert(dealStageHistory).values({
              orgId,
              dealId: inserted[0].id,
              fromStage: null,
              toStage: stage,
              note: "Imported from Notion",
              changedBy: null,
              at: now,
            });
          });
        }
      }
    }
  }

  return report;
}
