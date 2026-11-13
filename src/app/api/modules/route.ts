import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { respond } from "@/server/lib/result";
import { readJson, toContext } from "@/server/lib/route";
import { requireBilling, requireStaff } from "@/server/authz";
import { createModule, listModules } from "@/server/services/scopes";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const activeOnly = request.nextUrl.searchParams.get("active") === "true";
  return respond(await listModules(getDb(), toContext(guard.user), { activeOnly }));
}

export async function POST(request: NextRequest) {
  const guard = await requireBilling();
  if (!guard.ok) return guard.response;
  return respond(await createModule(getDb(), toContext(guard.user), await readJson(request)), 201);
}
