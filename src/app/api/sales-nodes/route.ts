import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireStaff } from "@/server/authz";
import { roleAllowed, MANAGERS } from "@/server/roles";
import { respond } from "@/server/lib/result";
import { readJson, toContext } from "@/server/lib/route";
import { createSalesNode, listSalesNodes } from "@/server/services/sales-nodes";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const activeOnly = request.nextUrl.searchParams.get("active") === "true";
  const includeMoney = roleAllowed(guard.user.role, MANAGERS);
  return respond(await listSalesNodes(getDb(), toContext(guard.user), { includeMoney }, { activeOnly }));
}

export async function POST(request: NextRequest) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const includeMoney = roleAllowed(guard.user.role, MANAGERS);
  return respond(await createSalesNode(getDb(), toContext(guard.user), { includeMoney }, await readJson(request)), 201);
}
