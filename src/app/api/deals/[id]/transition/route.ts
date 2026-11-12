import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireStaff } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { readJson, toContext } from "@/server/lib/route";
import { transitionDeal } from "@/server/services/deals";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  return respond(await transitionDeal(getDb(), toContext(guard.user), id, await readJson(request)));
}
