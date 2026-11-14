import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireBilling } from "@/server/authz";
import { getDb, schema } from "@/server/db/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The PDF that was originally sent to the client, kept in a private Supabase Storage bucket.
 * `attachments.blob_key` is "<bucket>/<object path>". Only billing roles may read it.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const guard = await requireBilling();
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  const { attachments } = schema;
  const rows = await getDb()
    .select()
    .from(attachments)
    .where(and(eq(attachments.entityType, "INVOICE"), eq(attachments.entityId, id), eq(attachments.orgId, guard.user.orgId)))
    .limit(1);
  const file = rows[0];
  if (!file) return NextResponse.json({ error: "No original PDF stored for this invoice" }, { status: 404 });

  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!base || !key) {
    return NextResponse.json({ error: "Storage is not configured (SUPABASE_URL, SUPABASE_SECRET_KEY)" }, { status: 501 });
  }

  const upstream = await fetch(`${base}/storage/v1/object/${file.blobKey}`, {
    headers: { Authorization: `Bearer ${key}`, apikey: key },
    cache: "no-store",
  });
  if (!upstream.ok) return NextResponse.json({ error: "Original PDF could not be fetched" }, { status: 502 });

  return new NextResponse(await upstream.arrayBuffer(), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${file.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
