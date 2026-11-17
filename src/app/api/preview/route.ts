import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb, schema } from "@/server/db/client";
import { requireRealAdmin } from "@/server/authz";
import { formatPreviewChoice, PREVIEW_COOKIE, PREVIEW_HOURS, previewRoles, type PreviewRole } from "@/server/preview";
import { homeFor } from "@/server/roles";
import { readJson } from "@/server/lib/route";

export const dynamic = "force-dynamic";

const startSchema = z.object({ as: z.enum(previewRoles), recordId: z.string().trim().min(1).max(100).optional() });

/** The client, freelancer or agency must exist, so a preview cannot point at nothing. */
async function recordExists(role: PreviewRole, id: string, orgId: string) {
  const db = getDb();
  if (role === "CLIENT") return (await db.select({ id: schema.companies.id }).from(schema.companies).where(and(eq(schema.companies.id, id), eq(schema.companies.orgId, orgId))).limit(1)).length > 0;
  if (role === "AGENCY") return (await db.select({ id: schema.agencies.id }).from(schema.agencies).where(and(eq(schema.agencies.id, id), eq(schema.agencies.orgId, orgId))).limit(1)).length > 0;
  return (await db.select({ id: schema.legacyFreelancers.id }).from(schema.legacyFreelancers).where(eq(schema.legacyFreelancers.id, id)).limit(1)).length > 0;
}

// Admin only, judged on the real account. Start previewing a portal: with the demo data, or, when a record id
// is given, as that real client, freelancer or agency (read-only).
export async function POST(request: NextRequest) {
  const guard = await requireRealAdmin();
  if (!guard.ok) return guard.response;
  const parsed = startSchema.safeParse(await readJson(request));
  if (!parsed.success) return NextResponse.json({ error: "Choose client, freelancer or agency" }, { status: 400 });
  const { as, recordId } = parsed.data;
  if (recordId && !(await recordExists(as, recordId, guard.user.orgId))) return NextResponse.json({ error: "That record was not found" }, { status: 404 });
  (await cookies()).set(PREVIEW_COOKIE, formatPreviewChoice({ role: as, recordId: recordId ?? null }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PREVIEW_HOURS * 3600,
  });
  return NextResponse.json({ data: { as, home: homeFor(as) } });
}

// Stop previewing and go back to the team dashboard.
export async function DELETE() {
  const guard = await requireRealAdmin();
  if (!guard.ok) return guard.response;
  (await cookies()).delete(PREVIEW_COOKIE);
  return NextResponse.json({ data: { ended: true } });
}
