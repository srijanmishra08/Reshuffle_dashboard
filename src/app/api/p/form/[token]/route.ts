import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { respond } from "@/server/lib/result";
import { readJson } from "@/server/lib/route";
import { submitResponse } from "@/server/services/questionnaires";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ token: string }> };

// Public: the unguessable token is the credential. Rate limited per IP and per form in the service.
export async function POST(request: NextRequest, context: RouteContext) {
  const { token } = await context.params;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  return respond(await submitResponse(getDb(), token, await readJson(request), { ip }), 201);
}
