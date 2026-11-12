import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { schema } from "@/server/db/client";

/**
 * One-time import from a Notion "Markdown & CSV" export.
 * Idempotent: every row gets a stable `external_id` derived from its kind and name,
 * so re-running updates instead of duplicating. Never logs names or contact details.
 */

export type ImportKind = "clients" | "products" | "meetings";

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
  const report: ImportReport = { clients: emptyReport(), products: emptyReport(), meetings: emptyReport(), dryRun };
  const { verticals, companies, contacts, meetings } = schema;

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

  return report;
}
