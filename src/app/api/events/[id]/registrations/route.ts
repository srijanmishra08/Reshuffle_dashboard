import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireStaff } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { readJson, toContext } from "@/server/lib/route";
import { addRegistration, addRegistrations } from "@/server/services/events";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** Body `{ rows: [...] }` imports several registrations (CSV); anything else adds one. */
export async function POST(request: NextRequest, context: RouteContext) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const { id } = await context.params;
  const body = await readJson(request);
  const bulk = typeof body === "object" && body !== null && "rows" in body;
  const ctx = toContext(guard.user);
  return respond(
    bulk ? await addRegistrations(getDb(), ctx, id, body) : await addRegistration(getDb(), ctx, id, body),
    201
  );
}
