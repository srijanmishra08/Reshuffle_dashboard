import { NextRequest, NextResponse } from "next/server";
import {
  hasStage,
  pipelineModuleSchema,
  updatePipelineItemSchema,
} from "@/server/models/pipeline";
import { deletePipelineItem, updatePipelineItem } from "@/server/services/pipeline-items";

type RouteContext = {
  params: Promise<{ module: string; entityId: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { module, entityId } = await context.params;
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
  const parsedBody = updatePipelineItemSchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json({ error: parsedBody.error.flatten() }, { status: 400 });
  }

  const moduleValue = parsedModule.data;

  if (parsedBody.data.stage && !hasStage(moduleValue, parsedBody.data.stage)) {
    return NextResponse.json(
      {
        error: `Unknown stage '${parsedBody.data.stage}' for module '${moduleValue}'`,
      },
      { status: 400 }
    );
  }

  const updated = await updatePipelineItem(moduleValue, entityId, parsedBody.data);

  if (!updated) {
    return NextResponse.json({ error: "Pipeline item not found" }, { status: 404 });
  }

  return NextResponse.json({ data: updated });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { module, entityId } = await context.params;
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

  const removed = await deletePipelineItem(parsedModule.data, entityId);

  if (!removed) {
    return NextResponse.json({ error: "Pipeline item not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
