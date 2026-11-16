import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireBilling } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { readJson, toContext } from "@/server/lib/route";
import { getFinancePlan, saveFinancePlan } from "@/server/services/team";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ key: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const guard = await requireBilling();
  if (!guard.ok) return guard.response;
  const { key } = await params;
  return respond(await getFinancePlan(getDb(), toContext(guard.user), key));
}

export async function PUT(request: NextRequest, { params }: Params) {
  const guard = await requireBilling();
  if (!guard.ok) return guard.response;
  const { key } = await params;
  return respond(await saveFinancePlan(getDb(), toContext(guard.user), key, await readJson(request)));
}
