import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { respond } from "@/server/lib/result";
import { toContext } from "@/server/lib/route";
import { requireStaff } from "@/server/authz";
import { createShareLink, revokeShareLinks } from "@/server/services/scope-sharing";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** Create a public link (the token is only returned here). */
export async function POST(_request: NextRequest, context: RouteContext) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const { id } = await context.params;
  return respond(await createShareLink(getDb(), toContext(guard.user), id), 201);
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const { id } = await context.params;
  return respond(await revokeShareLinks(getDb(), toContext(guard.user), id));
}
