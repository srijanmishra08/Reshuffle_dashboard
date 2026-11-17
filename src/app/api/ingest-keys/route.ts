import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireRole } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { readJson, toContext } from "@/server/lib/route";
import { ADMIN_ONLY } from "@/server/roles";
import { createIngestKey, listIngestKeys } from "@/server/services/ingest";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireRole(ADMIN_ONLY);
  if (!guard.ok) return guard.response;
  return respond(await listIngestKeys(getDb(), toContext(guard.user)));
}

// The new key is in this response and nowhere else: only its hash is stored.
export async function POST(request: NextRequest) {
  const guard = await requireRole(ADMIN_ONLY);
  if (!guard.ok) return guard.response;
  return respond(await createIngestKey(getDb(), toContext(guard.user), await readJson(request)), 201);
}
