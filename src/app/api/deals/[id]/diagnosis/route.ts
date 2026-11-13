import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireStaff } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { readJson, toContext } from "@/server/lib/route";
import { saveDiagnosis } from "@/server/services/deals";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Params) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const { id } = await params;
  return respond(await saveDiagnosis(getDb(), toContext(guard.user), id, await readJson(request)));
}
