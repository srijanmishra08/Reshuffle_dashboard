import { NextRequest, NextResponse } from "next/server";
import { pipelineModuleSchema } from "@/server/models/pipeline";
import { getPipelineModel } from "@/server/services/pipeline";
import { requireStaff } from "@/server/authz";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = {
  params: Promise<{ module: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const guard = await requireStaff();
  if (!guard.ok) {
    return guard.response;
  }

  const { module } = await context.params;
  const parsed = pipelineModuleSchema.safeParse(module);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid module",
        allowedModules: pipelineModuleSchema.options,
      },
      { status: 400 }
    );
  }

  const model = getPipelineModel(parsed.data);
  return NextResponse.json({ data: model });
}
