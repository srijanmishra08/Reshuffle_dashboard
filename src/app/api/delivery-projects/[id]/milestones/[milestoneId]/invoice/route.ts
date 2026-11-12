import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireBilling } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { toContext } from "@/server/lib/route";
import { draftMilestoneInvoice } from "@/server/services/delivery";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string; milestoneId: string }> };

/** Creates a DRAFT invoice for the milestone. Issuing still goes through the invoices module. */
export async function POST(_request: NextRequest, { params }: Params) {
  const guard = await requireBilling();
  if (!guard.ok) return guard.response;
  const { id, milestoneId } = await params;
  return respond(await draftMilestoneInvoice(getDb(), toContext(guard.user), id, milestoneId), 201);
}
