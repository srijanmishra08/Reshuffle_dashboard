import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireRole } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { readJson, toContext } from "@/server/lib/route";
import { getPerson, updatePerson } from "@/server/services/people";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const guard = await requireRole(["ADMIN", "MANAGER"]);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const viewer = { ...toContext(guard.user), canSeeSensitive: guard.user.role === "ADMIN" };
  return respond(await getPerson(getDb(), viewer, id));
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const guard = await requireRole(["ADMIN"]);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  return respond(await updatePerson(getDb(), { ...toContext(guard.user), canSeeSensitive: true }, id, await readJson(request)));
}
