import { NextRequest, NextResponse } from "next/server";
import { processPipelineTransition } from "@/server/services/pipeline";
import { publishRealtime } from "@/server/services/realtime";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = await processPipelineTransition(body);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    publishRealtime(`pipeline:${result.data.module}`, {
      type: "pipeline_transition",
      payload: {
        entityId: result.data.entityId,
        from: result.data.from,
        to: result.data.to,
      },
    });

    return NextResponse.json({ data: result.data }, { status: 202 });
  } catch {
    return NextResponse.json({ error: "Could not process transition" }, { status: 500 });
  }
}
