import { NextResponse } from "next/server";
import type { Result } from "@/server/lib/result";
import { respond } from "@/server/lib/result";
import type { RenderedPdf } from "@/server/documents/engine";

/** PDF bytes on success, the usual JSON error mapping otherwise. */
export function pdfResponse(result: Result<RenderedPdf>): NextResponse {
  if (!result.ok) return respond(result);
  return new NextResponse(new Uint8Array(result.data.buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${result.data.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
