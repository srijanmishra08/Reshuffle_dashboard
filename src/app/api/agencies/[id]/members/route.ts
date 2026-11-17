import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireRole } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { readJson, toContext } from "@/server/lib/route";
import { addAgencyMember, removeAgencyMember } from "@/server/services/access";
import { ADMIN_ONLY } from "@/server/roles";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const guard = await requireRole(ADMIN_ONLY);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  return respond(await addAgencyMember(getDb(), toContext(guard.user), id, await readJson(request)), 201);
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const guard = await requireRole(ADMIN_ONLY);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  return respond(await removeAgencyMember(getDb(), toContext(guard.user), id, await readJson(request)));
}
