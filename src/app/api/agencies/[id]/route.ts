import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireRole } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { readJson, toContext } from "@/server/lib/route";
import { deleteAgency, updateAgency } from "@/server/services/access";
import { ADMIN_ONLY } from "@/server/roles";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const guard = await requireRole(ADMIN_ONLY);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  return respond(await updateAgency(getDb(), toContext(guard.user), id, await readJson(request)));
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const guard = await requireRole(ADMIN_ONLY);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  return respond(await deleteAgency(getDb(), toContext(guard.user), id));
}
