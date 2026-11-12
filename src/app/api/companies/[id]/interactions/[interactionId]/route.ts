import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireStaff } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { readJson, toContext } from "@/server/lib/route";
import { setNextActionDone } from "@/server/services/interactions";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; interactionId: string }> };

/** Body: { done: boolean } marks the interaction's next action done or reopens it. */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const guard = await requireStaff();
  if (!guard.ok) {
    return guard.response;
  }

  const { id, interactionId } = await context.params;
  return respond(
    await setNextActionDone(getDb(), toContext(guard.user), id, interactionId, await readJson(request))
  );
}
