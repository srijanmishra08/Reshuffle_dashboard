import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireStaff } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { readJson, toContext } from "@/server/lib/route";
import { setMeetingDeal } from "@/server/services/interactions";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; meetingId: string }> };

/** Body: { dealId: string | null } ties the meeting to one of the client's leads or unties it. */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const guard = await requireStaff();
  if (!guard.ok) {
    return guard.response;
  }

  const { id, meetingId } = await context.params;
  return respond(await setMeetingDeal(getDb(), toContext(guard.user), id, meetingId, await readJson(request)));
}
