import { getDb } from "@/server/db/client";
import { requireStaff } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { toContext } from "@/server/lib/route";
import { mailStatus } from "@/server/services/mail-connection";

export const dynamic = "force-dynamic";

/** Whether Gmail is connected, so send buttons can say so instead of failing. */
export async function GET() {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  return respond(await mailStatus(getDb(), toContext(guard.user)));
}
