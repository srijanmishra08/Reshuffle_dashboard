import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { supabaseBackupStore } from "@/server/lib/storage";
import { runBackup } from "@/server/services/backup";
import { markOverdue } from "@/server/services/invoices";

export const dynamic = "force-dynamic";

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // Fail closed when the secret is not configured.

  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Marks overdue invoices and saves the nightly backup. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const overdueMarked = await markOverdue(db);
  // Vercel Hobby allows two cron jobs, so the nightly backup rides on this one. A backup failure is logged
  // and reported but never undoes the overdue marking.
  let backup: unknown;
  try {
    backup = await runBackup(db, supabaseBackupStore);
  } catch (error) {
    console.error("Backup failed", error);
    backup = { error: "Backup failed" };
  }
  return NextResponse.json({ data: { overdueMarked, backup } });
}
