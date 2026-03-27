import { db } from "@/lib/db";
import { pipelineSeedItems, type PipelineSeedItem } from "@/lib/pipeline-seeds";
import type { PipelineModule } from "@/server/models/pipeline";

type PipelineItemRow = {
  entityId: string;
  title: string;
  subtitle: string | null;
  stage: string;
  metadata: unknown;
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
      metadata: Record<string, unknown> | null;
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
  phone?: string;
  email?: string;
  metadata?: Record<string, unknown>;
};

type UpdatePipelineItemInput = {
  title?: string;
  subtitle?: string;
  stage?: string;
  assignee?: string;
  phone?: string;
  email?: string;
  metadata?: Record<string, unknown>;
};

const memoryStore = new Map<PipelineModule, PipelineSeedItem[]>();

function seedToCreateData(module: PipelineModule, item: PipelineSeedItem) {
  const metadata: Record<string, unknown> = {};

  if (item.assignee) {
    metadata.assignee = item.assignee;
  }

  if (item.phone) {
    metadata.phone = item.phone;
  }

  if (item.email) {
    metadata.email = item.email;
  }

  return {
    module,
    entityType: "pipeline_entity",
    entityId: item.id,
    title: item.title,
    subtitle: item.subtitle,
    stage: item.stage,
    metadata: Object.keys(metadata).length > 0 ? metadata : null,
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

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readItemMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object") {
    return {
      assignee: undefined,
      phone: undefined,
      email: undefined,
    };
  }

  const payload = metadata as Record<string, unknown>;

  return {
    assignee: readString(payload.assignee),
    phone: readString(payload.phone),
    email: readString(payload.email),
  };
}

function mapRowToItem(row: PipelineItemRow): PipelineSeedItem {
  const contact = readItemMetadata(row.metadata);

  return {
    id: row.entityId,
    title: row.title,
    subtitle: row.subtitle ?? undefined,
    stage: row.stage,
    assignee: contact.assignee,
    phone: contact.phone,
    email: contact.email,
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
    existing.phone = item.phone;
    existing.email = item.email;
    return existing;
  }

  const nextItem: PipelineSeedItem = {
    id: item.id,
    title: item.title,
    stage: item.stage,
    subtitle: item.subtitle,
    assignee: item.assignee,
    phone: item.phone,
    email: item.email,
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
      const contact = readItemMetadata(input.metadata);
      existing.stage = input.to;
      existing.title = input.title ?? existing.title;
      existing.subtitle = input.subtitle ?? existing.subtitle;
      if (contact.assignee !== undefined) {
        existing.assignee = contact.assignee;
      }
      if (contact.phone !== undefined) {
        existing.phone = contact.phone;
      }
      if (contact.email !== undefined) {
        existing.email = contact.email;
      }
    } else {
      const contact = readItemMetadata(input.metadata);
      memoryItems.push({
        id: input.entityId,
        title: input.title ?? input.entityId,
        subtitle: input.subtitle,
        stage: input.to,
        assignee: contact.assignee,
        phone: contact.phone,
        email: contact.email,
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
    const contact = readItemMetadata(input.metadata);
    upsertMemoryItem(input.module, {
      id: input.entityId,
      title: input.title ?? input.entityId,
      subtitle: input.subtitle,
      stage: input.to,
      assignee: contact.assignee,
      phone: contact.phone,
      email: contact.email,
    });
  }
}

export async function createPipelineItem(module: PipelineModule, input: CreatePipelineItemInput) {
  const pipelineItemDelegate = getPipelineItemDelegate();
  const entityId = input.entityId ?? generateEntityId(module);
  const metadataContact = readItemMetadata(input.metadata);
  const nextAssignee = input.assignee ?? metadataContact.assignee;
  const nextPhone = input.phone ?? metadataContact.phone;
  const nextEmail = input.email ?? metadataContact.email;
  const nextMetadata: Record<string, unknown> = {
    ...(input.metadata ?? {}),
  };

  if (nextAssignee) {
    nextMetadata.assignee = nextAssignee;
  }

  if (nextPhone) {
    nextMetadata.phone = nextPhone;
  }

  if (nextEmail) {
    nextMetadata.email = nextEmail;
  }

  if (!pipelineItemDelegate) {
    const memoryItems = getMemoryItems(module);
    const item: PipelineSeedItem = {
      id: entityId,
      title: input.title,
      subtitle: input.subtitle,
      stage: input.stage,
      assignee: nextAssignee,
      phone: nextPhone,
      email: nextEmail,
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
        metadata: Object.keys(nextMetadata).length > 0 ? nextMetadata : null,
      },
      update: {
        title: input.title,
        subtitle: input.subtitle,
        stage: input.stage,
        metadata: nextMetadata,
      },
    });

    return {
      id: entityId,
      title: input.title,
      subtitle: input.subtitle,
      stage: input.stage,
      assignee: nextAssignee,
      phone: nextPhone,
      email: nextEmail,
    };
  } catch {
    const item = upsertMemoryItem(module, {
      id: entityId,
      title: input.title,
      subtitle: input.subtitle,
      stage: input.stage,
      assignee: nextAssignee,
      phone: nextPhone,
      email: nextEmail,
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

    if (input.phone !== undefined) {
      existing.phone = input.phone;
    }

    if (input.email !== undefined) {
      existing.email = input.email;
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

    const incomingMetadata = readItemMetadata(input.metadata);
    const existingMetadata = readItemMetadata(existing.metadata);
    const next = {
      title: input.title ?? existing.title,
      subtitle: input.subtitle ?? (existing.subtitle ?? undefined),
      stage: input.stage ?? existing.stage,
      assignee: input.assignee ?? incomingMetadata.assignee ?? existingMetadata.assignee,
      phone: input.phone ?? incomingMetadata.phone ?? existingMetadata.phone,
      email: input.email ?? incomingMetadata.email ?? existingMetadata.email,
    };

    const nextMetadata: Record<string, unknown> = {
      ...(input.metadata ?? {}),
    };

    if (next.assignee) {
      nextMetadata.assignee = next.assignee;
    }

    if (next.phone) {
      nextMetadata.phone = next.phone;
    }

    if (next.email) {
      nextMetadata.email = next.email;
    }

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
        metadata: Object.keys(nextMetadata).length > 0 ? nextMetadata : null,
      },
      update: {
        title: next.title,
        subtitle: next.subtitle,
        stage: next.stage,
        metadata: nextMetadata,
      },
    });

    return {
      id: entityId,
      title: next.title,
      subtitle: next.subtitle,
      stage: next.stage,
      assignee: next.assignee,
      phone: next.phone,
      email: next.email,
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

    if (input.phone !== undefined) {
      existing.phone = input.phone;
    }

    if (input.email !== undefined) {
      existing.email = input.email;
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
