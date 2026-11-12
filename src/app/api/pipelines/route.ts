import { NextResponse } from "next/server";
import { listPipelineModels } from "@/server/services/pipeline";
import { requireStaff } from "@/server/authz";

export async function GET() {
  const guard = await requireStaff();
  if (!guard.ok) {
    return guard.response;
  }

  const pipelines = listPipelineModels();
  return NextResponse.json({ data: pipelines });
}
