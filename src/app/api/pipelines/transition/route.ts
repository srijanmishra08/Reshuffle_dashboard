import { NextRequest, NextResponse } from "next/server";
import { processPipelineTransition } from "@/server/services/pipeline";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const result = await processPipelineTransition(body);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ data: result.data }, { status: 202 });
}
