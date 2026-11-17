import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireRole } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { readJson, toContext } from "@/server/lib/route";
import { grantAccess, listAccess, revokeAccess } from "@/server/services/access";
import { ADMIN_ONLY } from "@/server/roles";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireRole(ADMIN_ONLY);
  if (!guard.ok) return guard.response;
  return respond(await listAccess(getDb(), toContext(guard.user)));
}

export async function POST(request: NextRequest) {
  const guard = await requireRole(ADMIN_ONLY);
  if (!guard.ok) return guard.response;
  return respond(await grantAccess(getDb(), toContext(guard.user), guard.user.email, await readJson(request)), 201);
}

export async function DELETE(request: NextRequest) {
  const guard = await requireRole(ADMIN_ONLY);
  if (!guard.ok) return guard.response;
  return respond(await revokeAccess(getDb(), toContext(guard.user), guard.user.email, await readJson(request)));
}
