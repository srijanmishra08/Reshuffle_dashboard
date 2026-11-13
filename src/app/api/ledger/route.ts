import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireBilling } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { readJson, toContext } from "@/server/lib/route";
import { createEntry, listEntries } from "@/server/services/finance";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await requireBilling();
  if (!guard.ok) return guard.response;
  return respond(await listEntries(getDb(), toContext(guard.user), Object.fromEntries(request.nextUrl.searchParams)));
}

export async function POST(request: NextRequest) {
  const guard = await requireBilling();
  if (!guard.ok) return guard.response;
  return respond(await createEntry(getDb(), toContext(guard.user), await readJson(request)), 201);
}
