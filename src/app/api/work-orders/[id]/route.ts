import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireBilling } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { readJson, toContext } from "@/server/lib/route";
import { deleteDraftWorkOrder, getWorkOrder, updateWorkOrder } from "@/server/services/work-orders";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const guard = await requireBilling();
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  return respond(await getWorkOrder(getDb(), toContext(guard.user), id));
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const guard = await requireBilling();
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  return respond(await updateWorkOrder(getDb(), toContext(guard.user), id, await readJson(request)));
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const guard = await requireBilling();
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  return respond(await deleteDraftWorkOrder(getDb(), toContext(guard.user), id));
}
