import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { getMailProvider, listConnectedOrgs } from "@/server/services/mail-connection";
import { processQueue, sendFollowUpDigests } from "@/server/services/outbound-mail";

export const dynamic = "force-dynamic";

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // Fail closed when the secret is not configured.

  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Retries failed mail and sends each team member their follow-up digest. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const orgs = await listConnectedOrgs(db);
  const summary = [];
  for (const orgId of orgs) {
    const provider = await getMailProvider(db, orgId);
    if (!provider) continue;
    const retried = await processQueue(db, orgId, provider);
    const digests = await sendFollowUpDigests(db, orgId, provider);
    summary.push({ orgId, ...retried, ...digests });
  }
  return NextResponse.json({ data: { orgs: summary } });
}
