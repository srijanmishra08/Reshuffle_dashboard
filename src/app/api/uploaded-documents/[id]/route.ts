import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireRole } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { toContext } from "@/server/lib/route";
import { ADMIN_ONLY } from "@/server/roles";
import { deleteUploadedDocument } from "@/server/services/ingest";

export const dynamic = "force-dynamic";

// Admin only: removes a PDF that was uploaded by mistake.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(ADMIN_ONLY);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  return respond(await deleteUploadedDocument(getDb(), toContext(guard.user), id));
}
