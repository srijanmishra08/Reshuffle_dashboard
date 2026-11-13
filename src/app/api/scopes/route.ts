import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { respond } from "@/server/lib/result";
import { readJson, toContext } from "@/server/lib/route";
import { requireStaff } from "@/server/authz";
import { createScope } from "@/server/services/scopes";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  return respond(await createScope(getDb(), toContext(guard.user), await readJson(request)), 201);
}
