import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireBilling } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { readJson, toContext } from "@/server/lib/route";
import { markPayoutPaid } from "@/server/services/team";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const guard = await requireBilling();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  return respond(await markPayoutPaid(getDb(), toContext(guard.user), id, await readJson(request)));
}
