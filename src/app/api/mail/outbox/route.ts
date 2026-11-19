import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireRole } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { toContext } from "@/server/lib/route";
import { listOutbox } from "@/server/services/outbound-mail";
import { ADMIN_ONLY } from "@/server/roles";

export const dynamic = "force-dynamic";

/** Recent sent, failed and dead-lettered mail. Admin only. */
export async function GET(request: NextRequest) {
  const guard = await requireRole(ADMIN_ONLY);
  if (!guard.ok) return guard.response;
  return respond(await listOutbox(getDb(), toContext(guard.user), Object.fromEntries(request.nextUrl.searchParams)));
}
