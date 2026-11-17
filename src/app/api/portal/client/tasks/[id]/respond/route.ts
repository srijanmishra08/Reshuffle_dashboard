import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireRole } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { readJson } from "@/server/lib/route";
import { respondToTask } from "@/server/services/portal";

export const dynamic = "force-dynamic";

// Clients only. The service checks the task belongs to a project of the client's own company.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(["CLIENT"]);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  return respond(await respondToTask(getDb(), guard.user, id, await readJson(request)));
}
