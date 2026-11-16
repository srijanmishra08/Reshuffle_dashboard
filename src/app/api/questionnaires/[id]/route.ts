import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireStaff } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { readJson, toContext } from "@/server/lib/route";
import { deleteQuestionnaire, getQuestionnaire, updateQuestionnaire } from "@/server/services/questionnaires";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const { id } = await context.params;
  return respond(await getQuestionnaire(getDb(), toContext(guard.user), id));
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const { id } = await context.params;
  return respond(await updateQuestionnaire(getDb(), toContext(guard.user), id, await readJson(request)));
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const { id } = await context.params;
  return respond(await deleteQuestionnaire(getDb(), toContext(guard.user), id));
}
