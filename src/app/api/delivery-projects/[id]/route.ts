import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireBilling, requireStaff } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { readJson, toContext } from "@/server/lib/route";
import { getProject, updateProject } from "@/server/services/delivery";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  return respond(await getProject(getDb(), toContext(guard.user), id));
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const guard = await requireBilling();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  return respond(await updateProject(getDb(), toContext(guard.user), id, await readJson(request)));
}
