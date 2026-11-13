import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { respond } from "@/server/lib/result";
import { readJson, toContext } from "@/server/lib/route";
import { requireBilling } from "@/server/authz";
import { updateModule } from "@/server/services/scopes";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const guard = await requireBilling();
  if (!guard.ok) return guard.response;
  const { id } = await context.params;
  return respond(await updateModule(getDb(), toContext(guard.user), id, await readJson(request)));
}
