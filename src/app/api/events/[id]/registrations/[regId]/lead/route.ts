import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireStaff } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { toContext } from "@/server/lib/route";
import { makeLeadFromRegistration } from "@/server/services/events";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; regId: string }> };

/** Turn this event signup into a lead on the Sales board. */
export async function POST(_request: NextRequest, context: RouteContext) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const { id, regId } = await context.params;
  return respond(await makeLeadFromRegistration(getDb(), toContext(guard.user), id, regId), 201);
}
