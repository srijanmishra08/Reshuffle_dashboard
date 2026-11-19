import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireStaff } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { readJson, toContext } from "@/server/lib/route";
import { sendMail } from "@/server/services/outbound-mail";

export const dynamic = "force-dynamic";

/** Send a follow-up, an outreach email or a scope link. Repeating the same `idempotencyKey` never sends twice. */
export async function POST(request: NextRequest) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  return respond(await sendMail(getDb(), toContext(guard.user), await readJson(request)), 201);
}
