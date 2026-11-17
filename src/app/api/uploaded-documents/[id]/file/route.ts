import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { requireBilling } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { toContext } from "@/server/lib/route";
import { getUploadedDocumentFile } from "@/server/services/ingest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireBilling();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const result = await getUploadedDocumentFile(getDb(), toContext(guard.user), id);
  if (!result.ok) return respond(result);
  return new NextResponse(new Uint8Array(result.data.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${result.data.filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
