import { getDb } from "@/server/db/client";
import { requireStaff } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { toContext } from "@/server/lib/route";
import { listStaff } from "@/server/services/staff";

export const dynamic = "force-dynamic";

/** The team members a lead can be assigned to, and which of them is the signed-in user. */
export async function GET() {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const staff = await listStaff(getDb(), toContext(guard.user));
  if (!staff.ok) return respond(staff);
  return respond({ ok: true as const, data: { currentUserId: guard.user.id, staff: staff.data } });
}
