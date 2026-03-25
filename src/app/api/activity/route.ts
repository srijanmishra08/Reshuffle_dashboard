import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRecentActivity } from "@/server/services/activity";

const querySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
});

export async function GET(request: NextRequest) {
  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(params);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const activity = await getRecentActivity(parsed.data.limit);
  return NextResponse.json({ data: activity });
}
