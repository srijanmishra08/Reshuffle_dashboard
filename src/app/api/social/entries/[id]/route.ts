import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { requireStaff } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { readJson } from "@/server/lib/route";
import { deleteSocialEntry, updateSocialEntry } from "@/server/services/social";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const guard = await requireStaff();
  if (!guard.ok) {
    return guard.response;
  }

  const { id } = await context.params;
  return respond(await updateSocialEntry(getDb(), guard.user.id, id, await readJson(request)));
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const guard = await requireStaff();
  if (!guard.ok) {
    return guard.response;
  }

  const { id } = await context.params;
  const result = await deleteSocialEntry(getDb(), guard.user.id, id);
  return result.ok ? NextResponse.json({ ok: true }) : respond(result);
}
