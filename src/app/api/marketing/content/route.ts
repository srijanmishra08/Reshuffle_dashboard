import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireStaff } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { readJson, toContext } from "@/server/lib/route";
import { createContent, listContent } from "@/server/services/marketing";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const query = Object.fromEntries(request.nextUrl.searchParams);
  return respond(await listContent(getDb(), toContext(guard.user), query));
}

export async function POST(request: NextRequest) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  return respond(await createContent(getDb(), toContext(guard.user), await readJson(request)), 201);
}
