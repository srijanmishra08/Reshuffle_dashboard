import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireStaff } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { readJson, toContext } from "@/server/lib/route";
import { createAccount, listAccounts } from "@/server/services/marketing";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const includeArchived = request.nextUrl.searchParams.get("includeArchived") === "1";
  return respond(await listAccounts(getDb(), toContext(guard.user), { includeArchived }));
}

export async function POST(request: NextRequest) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  return respond(await createAccount(getDb(), toContext(guard.user), await readJson(request)), 201);
}
