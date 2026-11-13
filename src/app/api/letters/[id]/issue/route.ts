import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireBilling } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { readJson, toContext } from "@/server/lib/route";
import { issueLetter } from "@/server/services/letters";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const guard = await requireBilling();
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  return respond(await issueLetter(getDb(), toContext(guard.user), id, await readJson(request)));
}
