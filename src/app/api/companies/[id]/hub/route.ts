import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireStaff } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { toContext } from "@/server/lib/route";
import { getClientHub } from "@/server/services/hub";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const role = guard.user.role;
  return respond(
    await getClientHub(getDb(), toContext(guard.user), id, { includeMoney: role === "ADMIN" || role === "MANAGER", includeAccess: role === "ADMIN" })
  );
}
