import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireBilling } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { readJson, toContext } from "@/server/lib/route";
import { recordUploadedInvoice } from "@/server/services/ingest";

export const dynamic = "force-dynamic";

// Admins and managers: records an uploaded invoice PDF as an invoice in the dashboard.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireBilling();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  return respond(await recordUploadedInvoice(getDb(), toContext(guard.user), id, await readJson(request).catch(() => ({}))), 201);
}
