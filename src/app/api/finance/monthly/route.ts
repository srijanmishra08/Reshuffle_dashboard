import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireBilling } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { toContext } from "@/server/lib/route";
import { monthlySummary } from "@/server/services/finance";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await requireBilling();
  if (!guard.ok) return guard.response;
  return respond(await monthlySummary(getDb(), toContext(guard.user), Object.fromEntries(request.nextUrl.searchParams)));
}
