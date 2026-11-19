import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireRole } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { readJson, toContext } from "@/server/lib/route";
import { sendInvite } from "@/server/services/outbound-mail";
import { ADMIN_ONLY } from "@/server/roles";

export const dynamic = "force-dynamic";

/** Email the sign-in details to someone who already has access. Admin only. */
export async function POST(request: NextRequest) {
  const guard = await requireRole(ADMIN_ONLY);
  if (!guard.ok) return guard.response;
  return respond(await sendInvite(getDb(), toContext(guard.user), await readJson(request)), 201);
}
