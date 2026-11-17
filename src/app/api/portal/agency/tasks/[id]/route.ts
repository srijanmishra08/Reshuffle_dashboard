import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireRole } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { readJson } from "@/server/lib/route";
import { updatePortalTask } from "@/server/services/portal";

export const dynamic = "force-dynamic";

// Partner agencies only, and only for tasks held by their own freelancers.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(["AGENCY"]);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  return respond(await updatePortalTask(getDb(), guard.user, id, await readJson(request)));
}
