import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireStaff } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { readJson, toContext } from "@/server/lib/route";
import { setInteractionDeal, setNextActionDone } from "@/server/services/interactions";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; interactionId: string }> };

/**
 * Body: { done: boolean } marks the interaction's next action done or reopens it;
 * { dealId: string | null } ties it to one of the client's leads or unties it.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const guard = await requireStaff();
  if (!guard.ok) {
    return guard.response;
  }

  const { id, interactionId } = await context.params;
  const body = await readJson(request);
  const link = body && typeof body === "object" && "dealId" in body;
  const run = link ? setInteractionDeal : setNextActionDone;
  return respond(await run(getDb(), toContext(guard.user), id, interactionId, body));
}
