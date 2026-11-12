import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireStaff } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { readJson, toContext } from "@/server/lib/route";
import { archiveContact, updateContact } from "@/server/services/contacts";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; contactId: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const guard = await requireStaff();
  if (!guard.ok) {
    return guard.response;
  }

  const { id, contactId } = await context.params;
  return respond(await updateContact(getDb(), toContext(guard.user), id, contactId, await readJson(request)));
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const guard = await requireStaff();
  if (!guard.ok) {
    return guard.response;
  }

  const { id, contactId } = await context.params;
  return respond(await archiveContact(getDb(), toContext(guard.user), id, contactId));
}
