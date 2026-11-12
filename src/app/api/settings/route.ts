import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/server/authz";
import { logActivity } from "@/server/services/activity";
import { getOrgSettings, orgSettingsInputSchema, saveOrgSettings } from "@/server/services/settings";
import { ADMIN_ONLY } from "@/server/roles";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireRole(ADMIN_ONLY);
  if (!guard.ok) {
    return guard.response;
  }

  return NextResponse.json({ data: await getOrgSettings(guard.user.orgId) });
}

export async function PUT(request: NextRequest) {
  const guard = await requireRole(ADMIN_ONLY);
  if (!guard.ok) {
    return guard.response;
  }

  const parsed = orgSettingsInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = await saveOrgSettings(parsed.data, guard.user.orgId);

  await logActivity({
    actorId: guard.user.id,
    action: "settings.updated",
    module: "settings",
    entityType: "org_settings",
    entityId: guard.user.orgId,
  });

  return NextResponse.json({ data });
}
