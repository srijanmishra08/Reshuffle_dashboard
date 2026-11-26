import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireBilling } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { readJson, toContext } from "@/server/lib/route";
import { listNodeCommissions, recordCommissionPayment } from "@/server/services/sales-nodes";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** Referral commission for one sales node: due, paid and owed per accepted deal. Admins and managers. */
export async function GET(_request: NextRequest, { params }: Params) {
  const guard = await requireBilling();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  return respond(await listNodeCommissions(getDb(), toContext(guard.user), id));
}

/** Records a commission paid on one accepted deal and books it as an expense. Admins and managers. */
export async function POST(request: NextRequest, { params }: Params) {
  const guard = await requireBilling();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  return respond(await recordCommissionPayment(getDb(), toContext(guard.user), id, await readJson(request)), 201);
}
