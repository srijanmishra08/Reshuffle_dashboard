import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireBilling } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { readJson, toContext } from "@/server/lib/route";
import { deleteDraftLetter, getLetter, updateLetter } from "@/server/services/letters";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const guard = await requireBilling();
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  return respond(await getLetter(getDb(), toContext(guard.user), id));
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const guard = await requireBilling();
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  return respond(await updateLetter(getDb(), toContext(guard.user), id, await readJson(request)));
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const guard = await requireBilling();
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  return respond(await deleteDraftLetter(getDb(), toContext(guard.user), id));
}
