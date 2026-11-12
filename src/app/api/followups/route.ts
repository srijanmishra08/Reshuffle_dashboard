import { getDb } from "@/server/db/client";
import { requireStaff } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { toContext } from "@/server/lib/route";
import { listDueFollowUps } from "@/server/services/interactions";

export const dynamic = "force-dynamic";

/** Pending next actions due within the next 24 hours, including overdue ones. */
export async function GET() {
  const guard = await requireStaff();
  if (!guard.ok) {
    return guard.response;
  }

  return respond(await listDueFollowUps(getDb(), toContext(guard.user)));
}
