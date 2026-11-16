import { getDb } from "@/server/db/client";
import { requireStaff } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { toContext } from "@/server/lib/route";
import { listNotices } from "@/server/services/search";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const includeBilling = guard.user.role === "ADMIN" || guard.user.role === "MANAGER";
  return respond(await listNotices(getDb(), toContext(guard.user), { includeBilling }));
}
