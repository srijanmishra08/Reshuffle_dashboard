import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireStaff } from "@/server/authz";
import { roleAllowed, MANAGERS } from "@/server/roles";
import { respond } from "@/server/lib/result";
import { readJson, toContext } from "@/server/lib/route";
import { updateSalesNode } from "@/server/services/sales-nodes";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const includeMoney = roleAllowed(guard.user.role, MANAGERS);
  return respond(await updateSalesNode(getDb(), toContext(guard.user), { includeMoney }, id, await readJson(request)));
}
