import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireStaff } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { toContext } from "@/server/lib/route";
import { listProjects } from "@/server/services/delivery";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  return respond(await listProjects(getDb(), toContext(guard.user), Object.fromEntries(request.nextUrl.searchParams)));
}
