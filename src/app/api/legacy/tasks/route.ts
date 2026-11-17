import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireStaff } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { readJson, toContext } from "@/server/lib/route";
import { importLegacyTask } from "@/server/services/legacy";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  return respond(await importLegacyTask(getDb(), toContext(guard.user), await readJson(request)), 201);
}
