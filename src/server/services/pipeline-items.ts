import { db } from "@/lib/db";
import { pipelineSeedItems, type PipelineSeedItem } from "@/lib/pipeline-seeds";
import type { PipelineModule } from "@/server/models/pipeline";

type PipelineItemRow = {
  entityId: string;
  title: string;
  subtitle: string | null;
  stage: string;
};

type PipelineItemDelegate = {
  count(args: { where: { module: string } }): Promise<number>;
  createMany(args: {
    data: Array<{
      module: string;
      entityType: string;
      entityId: string;
      title: string;
      subtitle?: string;
      stage: string;
      metadata: null;
    }>;
  }): Promise<unknown>;
  findMany(args: {
    where: { module: string };
    orderBy: { createdAt: "asc" | "desc" };
  }): Promise<PipelineItemRow[]>;
  upsert(args: {
    where: {
      module_entityId: {
        module: string;
        entityId: string;
      };
    };
    create: {
      module: string;
      entityType: string;
      entityId: string;
      title: string;
      subtitle?: string;
      stage: string;
      metadata: Record<string, unknown> | null;
    };
    update: {
      stage: string;
      title?: string;
      subtitle?: string;
      metadata?: Record<string, unknown>;
    };
  }): Promise<unknown>;
  deleteMany(args: { where: { module: string; entityId: string } }): Promise<unknown>;
};

type PersistTransitionInput = {
  module: PipelineModule;
  entityType: string;
  entityId: string;
  to: string;
  title?: string;
  subtitle?: string;
  metadata?: Record<string, unknown>;
};

type CreatePipelineItemInput = {
  entityType: string;
  entityId?: string;
  title: string;
  subtitle?: string;
  stage: string;
  assignee?: string;
  metadata?: Record<string, unknown>;
};

type UpdatePipelineItemInput = {
  title?: string;
  subtitle?: string;
  stage?: string;
  assignee?: string;
  metadata?: Record<string, unknown>;
};

const memoryStore = new Map<PipelineModule, PipelineSeedItem[]>();

function seedToCreateData(module: PipelineModule, item: PipelineSeedItem) {
  return {
    module,
    entityType: "pipeline_entity",
    entityId: item.id,
    title: item.title,
    subtitle: item.subtitle,
    stage: item.stage,
    metadata: null,
  };
}

function getPipelineItemDelegate(): PipelineItemDelegate | null {
  const candidate = (db as unknown as Record<string, unknown>)["pipelineItem"];

  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  return candidate as PipelineItemDelegate;
}

function getMemoryItems(module: PipelineModule): PipelineSeedItem[] {
  const existing = memoryStore.get(module);

  if (existing) {
    return existing;
  }

  const seeded = [...pipelineSeedItems[module]];
  memoryStore.set(module, seeded);
  return seeded;
}

function generateEntityId(module: PipelineModule) {
  return `${module}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function mapRowToItem(row: PipelineItemRow): PipelineSeedItem {
  return {
    id: row.entityId,
    title: row.title,
    subtitle: row.subtitle ?? undefined,
    stage: row.stage,
  };
}

function upsertMemoryItem(
  module: PipelineModule,
  item: Pick<PipelineSeedItem, "id" | "title" | "stage"> & Partial<PipelineSeedItem>
) {
  const memoryItems = getMemoryItems(module);
  const existing = memoryItems.find((entry) => entry.id === item.id);

  if (existing) {
    existing.title = item.title;
    existing.stage = item.stage;
    existing.subtitle = item.subtitle;
    existing.assignee = item.assignee;
    return existing;
  }

  const nextItem: PipelineSeedItem = {
    id: item.id,
    title: item.title,
    stage: item.stage,
    subtitle: item.subtitle,
    assignee: item.assignee,
  };

  memoryItems.push(nextItem);
  return nextItem;
}

export async function listPipelineItems(module: PipelineModule) {
  const fallback = getMemoryItems(module);
  const pipelineItemDelegate = getPipelineItemDelegate();

  if (!pipelineItemDelegate) {
    return fallback;
  }

  try {
    const count = await pipelineItemDelegate.count({ where: { module } });

    if (count === 0) {
      await pipelineItemDelegate.createMany({
        data: fallback.map((item) => seedToCreateData(module, item)),
      });
    }

    const rows = await pipelineItemDelegate.findMany({
      where: { module },
      orderBy: { createdAt: "asc" },
    });

    return rows.map((row) => mapRowToItem(row));
  } catch {
    return fallback;
  }
}

export async function persistPipelineTransition(input: PersistTransitionInput) {
  const pipelineItemDelegate = getPipelineItemDelegate();

  if (!pipelineItemDelegate) {
    const memoryItems = getMemoryItems(input.module);
    const existing = memoryItems.find((item) => item.id === input.entityId);

    if (existing) {
      existing.stage = input.to;
      existing.title = input.title ?? existing.title;
      existing.subtitle = input.subtitle ?? existing.subtitle;
    } else {
      memoryItems.push({
        id: input.entityId,
        title: input.title ?? input.entityId,
        subtitle: input.subtitle,
        stage: input.to,
      });
    }

    return;
  }

  try {
    await pipelineItemDelegate.upsert({
      where: {
        module_entityId: {
          module: input.module,
          entityId: input.entityId,
        },
      },
      create: {
        module: input.module,
        entityType: input.entityType,
        entityId: input.entityId,
        title: input.title ?? input.entityId,
        subtitle: input.subtitle,
        stage: input.to,
        metadata: input.metadata ?? null,
      },
      update: {
        stage: input.to,
        title: input.title ?? undefined,
        subtitle: input.subtitle,
        metadata: input.metadata,
      },
    });
  } catch {
    upsertMemoryItem(input.module, {
      id: input.entityId,
      title: input.title ?? input.entityId,
      subtitle: input.subtitle,
      stage: input.to,
    });
  }
}

export async function createPipelineItem(module: PipelineModule, input: CreatePipelineItemInput) {
  const pipelineItemDelegate = getPipelineItemDelegate();
  const entityId = input.entityId ?? generateEntityId(module);

  if (!pipelineItemDelegate) {
    const memoryItems = getMemoryItems(module);
    const item: PipelineSeedItem = {
      id: entityId,
      title: input.title,
      subtitle: input.subtitle,
      stage: input.stage,
      assignee: input.assignee,
    };
    memoryItems.push(item);
    return item;
  }

  try {
    await pipelineItemDelegate.upsert({
      where: {
        module_entityId: {
          module,
          entityId,
        },
      },
      create: {
        module,
        entityType: input.entityType,
        entityId,
        title: input.title,
        subtitle: input.subtitle,
        stage: input.stage,
        metadata: input.metadata ?? null,
      },
      update: {
        title: input.title,
        subtitle: input.subtitle,
        stage: input.stage,
        metadata: input.metadata,
      },
    });

    return {
      id: entityId,
      title: input.title,
      subtitle: input.subtitle,
      stage: input.stage,
    };
  } catch {
    const item = upsertMemoryItem(module, {
      id: entityId,
      title: input.title,
      subtitle: input.subtitle,
      stage: input.stage,
      assignee: input.assignee,
    });
    return item;
  }
}

export async function updatePipelineItem(
  module: PipelineModule,
  entityId: string,
  input: UpdatePipelineItemInput
) {
  const pipelineItemDelegate = getPipelineItemDelegate();

  if (!pipelineItemDelegate) {
    const memoryItems = getMemoryItems(module);
    const existing = memoryItems.find((item) => item.id === entityId);

    if (!existing) {
      return null;
    }

    if (input.title !== undefined) {
      existing.title = input.title;
    }

    if (input.subtitle !== undefined) {
      existing.subtitle = input.subtitle;
    }

    if (input.stage !== undefined) {
      existing.stage = input.stage;
    }

    if (input.assignee !== undefined) {
      existing.assignee = input.assignee;
    }

    return existing;
  }

  try {
    const rows = await pipelineItemDelegate.findMany({
      where: { module },
      orderBy: { createdAt: "asc" },
    });
    const existing = rows.find((row) => row.entityId === entityId);

    if (!existing) {
      return null;
    }

    const next = {
      title: input.title ?? existing.title,
      subtitle: input.subtitle ?? (existing.subtitle ?? undefined),
      stage: input.stage ?? existing.stage,
    };

    await pipelineItemDelegate.upsert({
      where: {
        module_entityId: {
          module,
          entityId,
        },
      },
      create: {
        module,
        entityType: "pipeline_entity",
        entityId,
        title: next.title,
        subtitle: next.subtitle,
        stage: next.stage,
        metadata: input.metadata ?? null,
      },
      update: {
        title: next.title,
        subtitle: next.subtitle,
        stage: next.stage,
        metadata: input.metadata,
      },
    });

    return {
      id: entityId,
      title: next.title,
      subtitle: next.subtitle,
      stage: next.stage,
    };
  } catch {
    const memoryItems = getMemoryItems(module);
    const existing = memoryItems.find((item) => item.id === entityId);

    if (!existing) {
      return null;
    }

    if (input.title !== undefined) {
      existing.title = input.title;
    }

    if (input.subtitle !== undefined) {
      existing.subtitle = input.subtitle;
    }

    if (input.stage !== undefined) {
      existing.stage = input.stage;
    }

    if (input.assignee !== undefined) {
      existing.assignee = input.assignee;
    }

    return existing;
  }
}

export async function deletePipelineItem(module: PipelineModule, entityId: string) {
  const pipelineItemDelegate = getPipelineItemDelegate();

  if (!pipelineItemDelegate) {
    const memoryItems = getMemoryItems(module);
    const index = memoryItems.findIndex((item) => item.id === entityId);

    if (index === -1) {
      return false;
    }

    memoryItems.splice(index, 1);
    return true;
  }

  try {
    const rows = await pipelineItemDelegate.findMany({
      where: { module },
      orderBy: { createdAt: "asc" },
    });

    if (!rows.some((row) => row.entityId === entityId)) {
      return false;
    }

    await pipelineItemDelegate.deleteMany({
      where: {
        module,
        entityId,
      },
    });

    return true;
  } catch {
    const memoryItems = getMemoryItems(module);
    const index = memoryItems.findIndex((item) => item.id === entityId);

    if (index === -1) {
      return false;
    }

    memoryItems.splice(index, 1);
    return true;
  }
}
