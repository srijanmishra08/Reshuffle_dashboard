import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { schema } from "@/server/db/client";

export const docTypeValues = [
  "INVOICE",
  "CREDIT_NOTE",
  "WORK_ORDER",
  "SCOPE",
  "OFFER_LETTER",
  "SALARY_SLIP",
  "AGREEMENT",
  "NDA",
  "LETTER",
] as const;
export type DocType = (typeof docTypeValues)[number];

export const defaultPrefixes: Record<DocType, string> = {
  INVOICE: "RS",
  CREDIT_NOTE: "RS-CN",
  WORK_ORDER: "WO",
  SCOPE: "SC",
  OFFER_LETTER: "OL",
  SALARY_SLIP: "SS",
  AGREEMENT: "AG",
  NDA: "NDA",
  LETTER: "LT",
};

/** A drizzle transaction handle. Numbers must be allocated inside the issuing transaction. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** GST rule 46: the invoice number is at most 16 characters. */
export const MAX_DOC_NUMBER_LENGTH = 16;

/** Calendar parts in India time, so 1 April 00:30 IST is already the new FY. */
function istParts(date: Date): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "numeric",
  }).formatToParts(date);

  return {
    year: Number(parts.find((p) => p.type === "year")?.value),
    month: Number(parts.find((p) => p.type === "month")?.value),
  };
}

/** Financial year label, e.g. 2026-04-01 -> "2026-27", 2026-03-31 -> "2025-26". */
export function financialYear(date: Date, fyStartMonth = 4): string {
  const { year, month } = istParts(date);
  const startYear = month >= fyStartMonth ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/** "2026-27" -> "26-27" for compact document numbers. */
export function shortFy(fy: string): string {
  return `${fy.slice(2, 4)}-${fy.slice(5)}`;
}

export function formatDocNumber(prefix: string, fy: string, value: number, padding = 3): string {
  return `${prefix}/${shortFy(fy)}/${String(value).padStart(padding, "0")}`;
}

/**
 * Allocate the next gap-free number for a doc type and financial year.
 * Takes a transaction (not the bare db) so the number is only ever allocated in
 * the same transaction that issues the document; a failure rolls it back.
 * Drafts must never call this. At a financial-year rollover the new series
 * inherits the prefix and padding of the most recent earlier series.
 */
export async function nextNumber(
  tx: Tx,
  input: { orgId?: string; docType: DocType; date: Date; fyStartMonth?: number }
): Promise<{ number: string; fy: string; sequence: number }> {
  const orgId = input.orgId ?? "default";
  const fy = financialYear(input.date, input.fyStartMonth);

  const [previous] = await tx
    .select({ prefix: schema.numberSeries.prefix, padding: schema.numberSeries.padding })
    .from(schema.numberSeries)
    .where(and(eq(schema.numberSeries.orgId, orgId), eq(schema.numberSeries.docType, input.docType)))
    .orderBy(desc(schema.numberSeries.fy))
    .limit(1);

  await tx
    .insert(schema.numberSeries)
    .values({
      orgId,
      docType: input.docType,
      fy,
      prefix: previous?.prefix ?? defaultPrefixes[input.docType],
      nextValue: 1,
      padding: previous?.padding ?? 3,
    })
    .onConflictDoNothing();

  const rows = await tx
    .update(schema.numberSeries)
    .set({ nextValue: sql`${schema.numberSeries.nextValue} + 1` })
    .where(
      and(
        eq(schema.numberSeries.orgId, orgId),
        eq(schema.numberSeries.docType, input.docType),
        eq(schema.numberSeries.fy, fy)
      )
    )
    .returning({
      nextValue: schema.numberSeries.nextValue,
      prefix: schema.numberSeries.prefix,
      padding: schema.numberSeries.padding,
    });

  const row = rows[0];
  if (!row) {
    throw new Error("Could not allocate document number");
  }

  const sequence = row.nextValue - 1;
  const number = formatDocNumber(row.prefix, fy, sequence, row.padding);

  if (number.length > MAX_DOC_NUMBER_LENGTH) {
    throw new Error(`Document number ${number} exceeds ${MAX_DOC_NUMBER_LENGTH} characters`);
  }

  return { number, fy, sequence };
}
