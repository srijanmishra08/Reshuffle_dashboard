import { cookies } from "next/headers";
import { getDb } from "@/server/db/client";
import { requireRealAdmin } from "@/server/authz";
import { PREVIEW_COOKIE } from "@/server/preview";
import { respond } from "@/server/lib/result";
import { demoStatus, removeDemo, seedDemo } from "@/server/services/demo";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireRealAdmin();
  if (!guard.ok) return guard.response;
  return respond(await demoStatus(getDb()));
}

export async function POST() {
  const guard = await requireRealAdmin();
  if (!guard.ok) return guard.response;
  return respond(await seedDemo(getDb(), guard.user.id), 201);
}

export async function DELETE() {
  const guard = await requireRealAdmin();
  if (!guard.ok) return guard.response;
  const result = await removeDemo(getDb(), guard.user.id);
  // With the demo data gone there is nothing to preview.
  (await cookies()).delete(PREVIEW_COOKIE);
  return respond(result);
}
