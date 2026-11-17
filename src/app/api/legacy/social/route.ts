import { getDb } from "@/server/db/client";
import { requireStaff } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { toContext } from "@/server/lib/route";
import { importLegacySocial } from "@/server/services/legacy";

export const dynamic = "force-dynamic";

export async function POST() {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  return respond(await importLegacySocial(getDb(), toContext(guard.user)), 201);
}
