import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireRole } from "@/server/authz";
import { renderScopePdf } from "@/server/documents/engine";
import { fail } from "@/server/lib/result";
import { pdfResponse } from "@/server/lib/pdf-response";
import { clientOwnsScope } from "@/server/services/portal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(["CLIENT"]);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const db = getDb();
  if (!(await clientOwnsScope(db, guard.user, id))) return pdfResponse(fail("NOT_FOUND", "Scope not found"));
  return pdfResponse(await renderScopePdf(db, { orgId: guard.user.orgId, userId: guard.user.id }, id));
}
