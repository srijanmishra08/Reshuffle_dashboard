import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireRole } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { toContext } from "@/server/lib/route";
import { deleteCommissionPayment } from "@/server/services/sales-nodes";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** Removes a commission payment recorded by mistake, with its ledger entry. Admins only. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const guard = await requireRole(["ADMIN"]);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  return respond(await deleteCommissionPayment(getDb(), toContext(guard.user), id));
}
