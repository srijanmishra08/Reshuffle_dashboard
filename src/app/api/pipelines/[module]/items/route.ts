import { NextRequest, NextResponse } from "next/server";
import {
  createPipelineItemSchema,
  hasStage,
  pipelineModuleSchema,
} from "@/server/models/pipeline";
import { getPipelineModel } from "@/server/services/pipeline";
import { createPipelineItem, listPipelineItems } from "@/server/services/pipeline-items";

type RouteContext = {
  params: Promise<{ module: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
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

  const items = await listPipelineItems(parsed.data);
  return NextResponse.json({ data: items });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { module } = await context.params;
  const parsedModule = pipelineModuleSchema.safeParse(module);

  if (!parsedModule.success) {
    return NextResponse.json(
      {
        error: "Invalid module",
        allowedModules: pipelineModuleSchema.options,
      },
      { status: 400 }
    );
  }

  const body = await request.json();
  const parsedBody = createPipelineItemSchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json({ error: parsedBody.error.flatten() }, { status: 400 });
  }

  const moduleValue = parsedModule.data;
  const model = getPipelineModel(moduleValue);
  const targetStage = parsedBody.data.stage ?? model.defaultStage;

  if (!hasStage(moduleValue, targetStage)) {
    return NextResponse.json(
      {
        error: `Unknown stage '${targetStage}' for module '${moduleValue}'`,
      },
      { status: 400 }
    );
  }

  const item = await createPipelineItem(moduleValue, {
    entityType: model.entityType,
    entityId: parsedBody.data.entityId,
    title: parsedBody.data.title,
    subtitle: parsedBody.data.subtitle,
    stage: targetStage,
    assignee: parsedBody.data.assignee,
    metadata: parsedBody.data.metadata,
  });

  return NextResponse.json({ data: item }, { status: 201 });
}
