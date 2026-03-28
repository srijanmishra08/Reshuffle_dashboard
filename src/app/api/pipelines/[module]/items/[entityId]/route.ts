import { NextRequest, NextResponse } from "next/server";
import {
  hasStage,
  pipelineModuleSchema,
  updatePipelineItemSchema,
} from "@/server/models/pipeline";
import { deletePipelineItem, updatePipelineItem } from "@/server/services/pipeline-items";
import { publishRealtime } from "@/server/services/realtime";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

  try {
    const updated = await updatePipelineItem(moduleValue, entityId, parsedBody.data);

    if (!updated) {
      return NextResponse.json({ error: "Pipeline item not found" }, { status: 404 });
    }

    publishRealtime(`pipeline:${moduleValue}`, {
      type: "pipeline_item_updated",
      payload: { entityId, stage: updated.stage },
    });

    return NextResponse.json({ data: updated });
  } catch {
    return NextResponse.json({ error: "Could not update pipeline item" }, { status: 500 });
  }
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

  try {
    const removed = await deletePipelineItem(parsedModule.data, entityId);

    if (!removed) {
      return NextResponse.json({ error: "Pipeline item not found" }, { status: 404 });
    }

    publishRealtime(`pipeline:${parsedModule.data}`, {
      type: "pipeline_item_deleted",
      payload: { entityId },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not delete pipeline item" }, { status: 500 });
  }
}
