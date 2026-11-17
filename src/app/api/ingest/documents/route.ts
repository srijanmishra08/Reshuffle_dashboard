import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { corsHeaders } from "@/server/lib/cors";
import { allowRequest } from "@/server/lib/rate-limit";
import { authenticateIngestKey, ingestDocument, MAX_PDF_BYTES } from "@/server/services/ingest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Public by design: the invoice software calls this from the browser. The bearer key is the credential, it can only
// upload, and browsers are limited to the websites in INGEST_ALLOWED_ORIGINS. Rate limited per address and per key.
function reply(origin: string | null, body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: corsHeaders(origin) });
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const db = getDb();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  // Counted before the key is checked, so guessing keys is slow.
  if (!(await allowRequest(db, `ingest-ip:${ip}`, { limit: 60, windowSeconds: 600 }))) {
    return reply(origin, { error: "Too many requests. Try again in a few minutes." }, 429);
  }
  const bearer = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1] ?? null;
  const key = await authenticateIngestKey(db, bearer);
  if (!key) return reply(origin, { error: "The dashboard key is missing or no longer valid." }, 401);
  if (!(await allowRequest(db, `ingest-key:${key.id}`, { limit: 200, windowSeconds: 3600 }))) {
    return reply(origin, { error: "Too many uploads this hour." }, 429);
  }

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_PDF_BYTES + 64 * 1024) return reply(origin, { error: "The file is larger than 8 MB." }, 413);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return reply(origin, { error: "Send the PDF as a form upload." }, 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) return reply(origin, { error: "No PDF was sent." }, 400);
  const text = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value : "";
  };
  const result = await ingestDocument(
    db,
    key,
    { docType: text("docType"), number: text("number"), partyName: text("partyName"), amountText: text("amountText"), dateText: text("dateText"), filename: text("filename") || file.name },
    Buffer.from(await file.arrayBuffer())
  );
  if (!result.ok) return reply(origin, { error: result.error }, result.code === "VALIDATION" ? 400 : 500);
  return reply(origin, { data: result.data }, result.data.duplicate ? 200 : 201);
}
