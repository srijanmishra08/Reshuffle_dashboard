import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireStaff } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { readJson, toContext } from "@/server/lib/route";
import { removeRegistration, updateRegistration } from "@/server/services/events";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; regId: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const { id, regId } = await context.params;
  return respond(await updateRegistration(getDb(), toContext(guard.user), id, regId, await readJson(request)));
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const { id, regId } = await context.params;
  return respond(await removeRegistration(getDb(), toContext(guard.user), id, regId));
}
