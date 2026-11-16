import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireStaff } from "@/server/authz";
import { renderScopePdf } from "@/server/documents/engine";
import { toContext } from "@/server/lib/route";
import { pdfResponse } from "@/server/lib/pdf-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  return pdfResponse(await renderScopePdf(getDb(), toContext(guard.user), id));
}
