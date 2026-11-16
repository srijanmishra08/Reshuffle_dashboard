import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireBilling } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { toContext } from "@/server/lib/route";
import { getFreelancerTeamView } from "@/server/services/team";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** Assignments are visible to staff; payout figures are for admins and managers only. */
export async function GET(_request: NextRequest, { params }: Params) {
  const guard = await requireBilling();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  return respond(await getFreelancerTeamView(getDb(), toContext(guard.user), id));
}
