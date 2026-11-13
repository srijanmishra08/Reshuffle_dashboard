import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { respond } from "@/server/lib/result";
import { readJson, toContext } from "@/server/lib/route";
import { requireStaff } from "@/server/authz";
import { deleteDraftScope, getScope, updateScope } from "@/server/services/scopes";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const { id } = await context.params;
  return respond(await getScope(getDb(), toContext(guard.user), id));
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const { id } = await context.params;
  return respond(await updateScope(getDb(), toContext(guard.user), id, await readJson(request)));
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const { id } = await context.params;
  return respond(await deleteDraftScope(getDb(), toContext(guard.user), id));
}
