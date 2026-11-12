import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireStaff } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { readJson } from "@/server/lib/route";
import { createSocialEntry, listSocialEntries } from "@/server/services/social";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireStaff();
  if (!guard.ok) {
    return guard.response;
  }

  return respond(await listSocialEntries(getDb()));
}

export async function POST(request: NextRequest) {
  const guard = await requireStaff();
  if (!guard.ok) {
    return guard.response;
  }

  return respond(await createSocialEntry(getDb(), guard.user.id, await readJson(request)), 201);
}
