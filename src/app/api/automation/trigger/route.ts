import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { triggerAutomations } from "@/server/services/automation";

const triggerSchema = z.object({
  event: z.string().min(2),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = triggerSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await triggerAutomations(parsed.data.event, parsed.data.payload);
  return NextResponse.json({ data: result }, { status: 202 });
}
