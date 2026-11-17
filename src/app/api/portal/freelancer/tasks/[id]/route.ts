import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireRole } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { readJson } from "@/server/lib/route";
import { updatePortalTask } from "@/server/services/portal";

export const dynamic = "force-dynamic";

// Freelancers only, and only for tasks assigned to them. The service decides which statuses are open.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(["FREELANCER"]);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  return respond(await updatePortalTask(getDb(), guard.user, id, await readJson(request)));
}
