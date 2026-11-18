import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { corsHeaders } from "@/server/lib/cors";
import { allowRequest } from "@/server/lib/rate-limit";
import { authenticateIngestKey, nextInvoiceNumber } from "@/server/services/ingest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Public by design, like the upload endpoint: the invoice software asks for the number to put on its next invoice. The bearer
// key is the credential, browsers are limited to INGEST_ALLOWED_ORIGINS, and requests are rate limited per address and key.
function reply(origin: string | null, body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: { ...corsHeaders(origin), "Cache-Control": "no-store" } });
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) });
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  const db = getDb();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  if (!(await allowRequest(db, `ingest-ip:${ip}`, { limit: 60, windowSeconds: 600 }))) {
    return reply(origin, { error: "Too many requests. Try again in a few minutes." }, 429);
  }
  const bearer = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1] ?? null;
  const key = await authenticateIngestKey(db, bearer);
  if (!key) return reply(origin, { error: "The dashboard key is missing or no longer valid." }, 401);
  if (!(await allowRequest(db, `ingest-key:${key.id}`, { limit: 200, windowSeconds: 3600 }))) {
    return reply(origin, { error: "Too many requests this hour." }, 429);
  }

  const params = request.nextUrl.searchParams;
  const result = await nextInvoiceNumber(db, key.orgId, { prefix: params.get("prefix") ?? undefined, year: params.get("year"), month: params.get("month") });
  if (!result.ok) return reply(origin, { error: result.error }, 400);
  return reply(origin, { data: result.data }, 200);
}
