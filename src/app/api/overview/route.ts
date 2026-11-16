import { getDb } from "@/server/db/client";
import { requireStaff } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { toContext } from "@/server/lib/route";
import { getOverview } from "@/server/services/overview";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  return respond(await getOverview(getDb(), toContext(guard.user)));
}
