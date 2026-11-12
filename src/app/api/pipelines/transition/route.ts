import { NextRequest, NextResponse } from "next/server";
import { processPipelineTransition } from "@/server/services/pipeline";
import { requireStaff } from "@/server/authz";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  const guard = await requireStaff();
  if (!guard.ok) {
    return guard.response;
  }

  try {
    const body = await request.json();
    const result = await processPipelineTransition(body);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }


    return NextResponse.json({ data: result.data }, { status: 202 });
  } catch {
    return NextResponse.json({ error: "Could not process transition" }, { status: 500 });
  }
}
