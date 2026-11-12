import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireBilling } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { readJson, toContext } from "@/server/lib/route";
import { createCategory, listCategories } from "@/server/services/finance";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireBilling();
  if (!guard.ok) return guard.response;
  return respond(await listCategories(getDb(), toContext(guard.user)));
}

export async function POST(request: NextRequest) {
  const guard = await requireBilling();
  if (!guard.ok) return guard.response;
  return respond(await createCategory(getDb(), toContext(guard.user), await readJson(request)), 201);
}
