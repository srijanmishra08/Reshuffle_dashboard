import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireRole } from "@/server/authz";
import { renderInvoicePdf } from "@/server/documents/engine";
import { fail } from "@/server/lib/result";
import { pdfResponse } from "@/server/lib/pdf-response";
import { clientOwnsInvoice } from "@/server/services/portal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(["CLIENT"]);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const db = getDb();
  if (!(await clientOwnsInvoice(db, guard.user, id))) return pdfResponse(fail("NOT_FOUND", "Invoice not found"));
  return pdfResponse(await renderInvoicePdf(db, { orgId: guard.user.orgId, userId: guard.user.id }, id));
}
