import { NextRequest } from "next/server";
import { getDb } from "@/server/db/client";
import { requireStaff } from "@/server/authz";
import { respond } from "@/server/lib/result";
import { toContext } from "@/server/lib/route";
import { globalSearch } from "@/server/services/search";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await requireStaff();
  if (!guard.ok) return guard.response;
  const includeBilling = guard.user.role === "ADMIN" || guard.user.role === "MANAGER";
  return respond(await globalSearch(getDb(), toContext(guard.user), request.nextUrl.searchParams.get("q"), { includeBilling }));
}
