import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRealAdmin } from "@/server/authz";
import { PREVIEW_COOKIE, PREVIEW_HOURS, previewRoles } from "@/server/preview";
import { homeFor } from "@/server/roles";
import { readJson } from "@/server/lib/route";

export const dynamic = "force-dynamic";

const startSchema = z.object({ as: z.enum(previewRoles) });

// Admin only, judged on the real account. Start previewing a portal with the demo data.
export async function POST(request: NextRequest) {
  const guard = await requireRealAdmin();
  if (!guard.ok) return guard.response;
  const parsed = startSchema.safeParse(await readJson(request));
  if (!parsed.success) return NextResponse.json({ error: "Choose client, freelancer or agency" }, { status: 400 });
  (await cookies()).set(PREVIEW_COOKIE, parsed.data.as, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PREVIEW_HOURS * 3600,
  });
  return NextResponse.json({ data: { as: parsed.data.as, home: homeFor(parsed.data.as) } });
}

// Stop previewing and go back to the team dashboard.
export async function DELETE() {
  const guard = await requireRealAdmin();
  if (!guard.ok) return guard.response;
  (await cookies()).delete(PREVIEW_COOKIE);
  return NextResponse.json({ data: { ended: true } });
}
