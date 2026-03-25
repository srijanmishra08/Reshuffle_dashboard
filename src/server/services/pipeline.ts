import {
  canTransition,
  hasStage,
  pipelineModels,
  transitionInputSchema,
  type PipelineModule,
} from "@/server/models/pipeline";
import { logActivity } from "@/server/services/activity";
import { persistPipelineTransition } from "@/server/services/pipeline-items";

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function listPipelineModels() {
  return Object.values(pipelineModels);
}

export function getPipelineModel(module: PipelineModule) {
  return pipelineModels[module];
}

export async function processPipelineTransition(inputRaw: unknown) {
  const parsed = transitionInputSchema.safeParse(inputRaw);

  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.flatten(),
    } as const;
  }

  const input = parsed.data;

  if (!hasStage(input.module, input.from)) {
    return {
      ok: false,
      error: `Unknown source stage '${input.from}' for module '${input.module}'`,
    } as const;
  }

  if (!hasStage(input.module, input.to)) {
    return {
      ok: false,
      error: `Unknown target stage '${input.to}' for module '${input.module}'`,
    } as const;
  }

  if (!canTransition(input.module, input.from, input.to)) {
    return {
      ok: false,
      error: `Transition '${input.from}' -> '${input.to}' is not allowed for module '${input.module}'`,
    } as const;
  }

  await persistPipelineTransition({
    module: input.module,
    entityType: input.entityType,
    entityId: input.entityId,
    to: input.to,
    title: readString(input.metadata?.title),
    subtitle: readString(input.metadata?.subtitle),
    metadata: input.metadata,
  });

  await logActivity({
    actorId: input.actorId,
    action: `pipeline.transition.${input.from}.to.${input.to}`,
    module: input.module,
    entityType: input.entityType,
    entityId: input.entityId,
    metadata: {
      ...input.metadata,
      from: input.from,
      to: input.to,
    },
  });

  return {
    ok: true,
    data: {
      module: input.module,
      from: input.from,
      to: input.to,
      entityType: input.entityType,
      entityId: input.entityId,
    },
  } as const;
}
