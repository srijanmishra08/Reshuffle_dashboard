import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireBilling } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { readJson, toContext } from "@/server/lib/route";
import { updateMilestone } from "@/server/services/delivery";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string; milestoneId: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const guard = await requireBilling();
  if (!guard.ok) return guard.response;
  const { id, milestoneId } = await params;
  return respond(await updateMilestone(getDb(), toContext(guard.user), id, milestoneId, await readJson(request)));
}
