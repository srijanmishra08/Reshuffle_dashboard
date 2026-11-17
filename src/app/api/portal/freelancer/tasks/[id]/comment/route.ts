import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireRole } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { readJson } from "@/server/lib/route";
import { addPortalComment } from "@/server/services/portal";

export const dynamic = "force-dynamic";

// freelancer only. The service checks the task is one this sign-in may see.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(["FREELANCER"]);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  return respond(await addPortalComment(getDb(), guard.user, id, await readJson(request)), 201);
}
