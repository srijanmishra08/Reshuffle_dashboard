import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { agingQuerySchema, gstQuerySchema } from "@/lib/schemas/finance";
import { fail, ok } from "@/server/lib/result";
import type { ServiceContext } from "@/server/services/companies";
import { todayIst } from "@/server/services/invoices";

const { invoices, companies } = schema;

export const AGING_BUCKETS = ["NOT_DUE", "0-30", "31-60", "61-90", "90+"] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function bucketFor(daysPastDue: number): AgingBucket {
  if (daysPastDue < 0) return "NOT_DUE";
  if (daysPastDue <= 30) return "0-30";
  if (daysPastDue <= 60) return "31-60";
  if (daysPastDue <= 90) return "61-90";
  return "90+";
}

/**
 * Open invoices (issued or partly paid) grouped by how many days past the due date they are on
 * `asOf`. Invoices not yet due sit in NOT_DUE; due today counts as 0 days past due.
 */
export async function receivablesAging(db: Db, ctx: ServiceContext, rawQuery: unknown = {}) {
  const parsed = agingQuerySchema.safeParse(rawQuery);
  if (!parsed.success) return fail("VALIDATION", "Invalid date", parsed.error.flatten());
  const asOf = parsed.data.asOf ?? todayIst();

  const rows = await db
    .select({
      id: invoices.id,
      number: invoices.number,
      companyId: invoices.companyId,
      companyName: companies.name,
      dueDate: invoices.dueDate,
      issueDate: invoices.issueDate,
      totalPaise: invoices.totalPaise,
      paidPaise: invoices.paidPaise,
    })
    .from(invoices)
    .innerJoin(companies, eq(companies.id, invoices.companyId))
    .where(and(eq(invoices.orgId, ctx.orgId), inArray(invoices.status, ["ISSUED", "PARTIALLY_PAID"])))
    .orderBy(asc(invoices.dueDate));

  const buckets = Object.fromEntries(
    AGING_BUCKETS.map((b) => [b, { bucket: b, count: 0, outstandingPaise: 0 }])
  ) as Record<AgingBucket, { bucket: AgingBucket; count: number; outstandingPaise: number }>;

  const items = rows.map((r) => {
    const outstandingPaise = r.totalPaise - r.paidPaise;
    const basis = r.dueDate ?? r.issueDate ?? asOf;
    const daysPastDue = daysBetween(basis, asOf);
    const bucket = bucketFor(daysPastDue);
    buckets[bucket].count += 1;
    buckets[bucket].outstandingPaise += outstandingPaise;
    return { ...r, outstandingPaise, daysPastDue, bucket };
  });

  return ok({
    asOf,
    buckets: AGING_BUCKETS.map((b) => buckets[b]),
    totalOutstandingPaise: items.reduce((s, i) => s + i.outstandingPaise, 0),
    invoices: items,
  });
}

export type GstRow = {
  invoiceId: string;
  number: string;
  issueDate: string;
  companyName: string;
  gstin: string | null;
  placeOfSupply: string;
  rateBps: number;
  taxableValuePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  roundOffPaise: number;
  invoiceValuePaise: number;
};

/**
 * Output tax for issued, partly paid and paid invoices in a financial year (or one month of it),
 * by issue date. Cancelled invoices are left out: they were reversed by a credit note.
 * `b2b` lists invoices to GST-registered customers; the rest are B2C.
 */
export async function gstSummary(db: Db, ctx: ServiceContext, rawQuery: unknown) {
  const parsed = gstQuerySchema.safeParse(rawQuery);
  if (!parsed.success) return fail("VALIDATION", "Invalid period", parsed.error.flatten());
  const { fy, month } = parsed.data;
  const fyFrom = `${fy}-04-01`;
  const fyTo = `${fy + 1}-03-31`;
  if (month && (month < fyFrom.slice(0, 7) || month > fyTo.slice(0, 7))) {
    return fail("VALIDATION", "Month is outside that financial year");
  }
  const from = month ? `${month}-01` : fyFrom;
  const to = month ? `${month}-31` : fyTo; // text compare: any day of the month is <= "-31"

  const rows = await db
    .select({
      invoiceId: invoices.id,
      number: invoices.number,
      issueDate: invoices.issueDate,
      companyName: companies.name,
      gstin: companies.gstin,
      placeOfSupply: invoices.placeOfSupply,
      rateBps: invoices.rateBps,
      taxableValuePaise: invoices.subtotalPaise,
      cgstPaise: invoices.cgstPaise,
      sgstPaise: invoices.sgstPaise,
      igstPaise: invoices.igstPaise,
      roundOffPaise: invoices.roundOffPaise,
      invoiceValuePaise: invoices.totalPaise,
    })
    .from(invoices)
    .innerJoin(companies, eq(companies.id, invoices.companyId))
    .where(
      and(
        eq(invoices.orgId, ctx.orgId),
        inArray(invoices.status, ["ISSUED", "PARTIALLY_PAID", "PAID"]),
        gte(invoices.issueDate, from),
        lte(invoices.issueDate, to)
      )
    )
    .orderBy(asc(invoices.issueDate), asc(invoices.number));

  const list: GstRow[] = rows.flatMap((r) =>
    r.number && r.issueDate ? [{ ...r, number: r.number, issueDate: r.issueDate }] : []
  );

  const byMonth = new Map<string, { month: string; invoiceCount: number; taxableValuePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; invoiceValuePaise: number }>();
  for (const r of list) {
    const key = r.issueDate.slice(0, 7);
    const m = byMonth.get(key) ?? { month: key, invoiceCount: 0, taxableValuePaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, invoiceValuePaise: 0 };
    m.invoiceCount += 1;
    m.taxableValuePaise += r.taxableValuePaise;
    m.cgstPaise += r.cgstPaise;
    m.sgstPaise += r.sgstPaise;
    m.igstPaise += r.igstPaise;
    m.invoiceValuePaise += r.invoiceValuePaise;
    byMonth.set(key, m);
  }

  const months = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
  const sum = (k: "taxableValuePaise" | "cgstPaise" | "sgstPaise" | "igstPaise") =>
    months.reduce((s, m) => s + m[k], 0);

  return ok({
    fy,
    month: month ?? null,
    months,
    totals: {
      taxableValuePaise: sum("taxableValuePaise"),
      cgstPaise: sum("cgstPaise"),
      sgstPaise: sum("sgstPaise"),
      igstPaise: sum("igstPaise"),
    },
    b2b: list.filter((r) => r.gstin && r.gstin.trim() !== ""),
    b2c: list.filter((r) => !r.gstin || r.gstin.trim() === ""),
  });
}

/** Integer paise as a plain rupee string with two decimals, no float maths. */
export function paiseToRupeeString(paise: number): string {
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Neutralise spreadsheet formulas and quote when needed. */
export function csvCell(value: string | number | null | undefined): string {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const GST_CSV_HEADER = [
  "GSTIN/UIN of Recipient",
  "Receiver Name",
  "Invoice Number",
  "Invoice date",
  "Invoice Value",
  "Place Of Supply",
  "Rate",
  "Taxable Value",
  "Integrated Tax",
  "Central Tax",
  "State/UT Tax",
] as const;

/** GSTR-1 style B2B rows for the CA. Rows only; the header is the first line. */
export function gstB2bCsv(rows: GstRow[]): string {
  const lines = rows.map((r) =>
    [
      r.gstin ?? "",
      r.companyName,
      r.number,
      r.issueDate,
      paiseToRupeeString(r.invoiceValuePaise),
      r.placeOfSupply,
      paiseToRupeeString(r.rateBps).replace(/\.00$/, ""), // 1800 bps -> "18"
      paiseToRupeeString(r.taxableValuePaise),
      paiseToRupeeString(r.igstPaise),
      paiseToRupeeString(r.cgstPaise),
      paiseToRupeeString(r.sgstPaise),
    ]
      .map(csvCell)
      .join(",")
  );
  return [GST_CSV_HEADER.join(","), ...lines].join("\r\n") + "\r\n";
}
