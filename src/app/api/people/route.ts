import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireRole } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { readJson, toContext } from "@/server/lib/route";
import { createPerson, listPeople } from "@/server/services/people";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireRole(["ADMIN", "MANAGER"]);
  if (!guard.ok) return guard.response;
  return respond(await listPeople(getDb(), { ...toContext(guard.user), canSeeSensitive: false }));
}

export async function POST(request: NextRequest) {
  const guard = await requireRole(["ADMIN"]);
  if (!guard.ok) return guard.response;
  return respond(await createPerson(getDb(), { ...toContext(guard.user), canSeeSensitive: true }, await readJson(request)), 201);
}
