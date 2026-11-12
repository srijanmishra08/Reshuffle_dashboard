import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireBilling } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { readJson, toContext } from "@/server/lib/route";
import { createLetter, listLetters } from "@/server/services/letters";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await requireBilling();
  if (!guard.ok) return guard.response;

  const query = Object.fromEntries(request.nextUrl.searchParams);
  return respond(await listLetters(getDb(), toContext(guard.user), query));
}

export async function POST(request: NextRequest) {
  const guard = await requireBilling();
  if (!guard.ok) return guard.response;

  return respond(await createLetter(getDb(), toContext(guard.user), await readJson(request)), 201);
}
