import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireStaff } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { toContext } from "@/server/lib/route";
import { removeTeamMember } from "@/server/services/events";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; memberId: string }> };

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const { id, memberId } = await context.params;
  return respond(await removeTeamMember(getDb(), toContext(guard.user), id, memberId));
}
