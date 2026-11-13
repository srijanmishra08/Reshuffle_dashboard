import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { requireBilling } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { toContext } from "@/server/lib/route";
import { gstB2bCsv, gstSummary } from "@/server/services/finance-reports";

export const dynamic = "force-dynamic";

/** GET /api/finance/gst?fy=2026[&month=2026-06][&format=csv]. CSV is the B2B list for the CA. */
export async function GET(request: NextRequest) {
  const guard = await requireBilling();
  if (!guard.ok) return guard.response;
  const { format, ...query } = Object.fromEntries(request.nextUrl.searchParams);
  const result = await gstSummary(getDb(), toContext(guard.user), query);
  if (format !== "csv" || !result.ok) return respond(result);

  const name = `gst-b2b-${result.data.month ?? `fy${result.data.fy}`}.csv`;
  return new NextResponse(gstB2bCsv(result.data.b2b), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
