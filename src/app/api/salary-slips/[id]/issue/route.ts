import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireRole } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { readJson, toContext } from "@/server/lib/route";
import { issueSalarySlip } from "@/server/services/salary-slips";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const guard = await requireRole(["ADMIN"]);
  if (!guard.ok) return guard.response;
  const { id } = await context.params;
  return respond(await issueSalarySlip(getDb(), toContext(guard.user), id, await readJson(request)));
}
