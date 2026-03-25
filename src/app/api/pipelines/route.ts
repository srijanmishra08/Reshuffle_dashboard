import { NextResponse } from "next/server";
import { listPipelineModels } from "@/server/services/pipeline";

export async function GET() {
  const pipelines = listPipelineModels();
  return NextResponse.json({ data: pipelines });
}
