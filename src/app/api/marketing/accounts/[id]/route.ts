import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireStaff } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { readJson, toContext } from "@/server/lib/route";
import { getAccount, updateAccount } from "@/server/services/marketing";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const { id } = await context.params;
  return respond(await getAccount(getDb(), toContext(guard.user), id));
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const { id } = await context.params;
  return respond(await updateAccount(getDb(), toContext(guard.user), id, await readJson(request)));
}
