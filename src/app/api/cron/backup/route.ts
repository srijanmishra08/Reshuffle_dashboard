import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { supabaseBackupStore } from "@/server/lib/storage";
import { runBackup } from "@/server/services/backup";

export const dynamic = "force-dynamic";

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // Fail closed when the secret is not configured.
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Manual trigger for the same backup the daily cron takes: saves a compressed copy of every table to the private `db-backups` bucket and keeps 30 days. */
export async function GET(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ data: await runBackup(getDb(), supabaseBackupStore) });
  } catch (error) {
    console.error("Backup failed", error);
    return NextResponse.json({ error: "Backup failed" }, { status: 500 });
  }
}
