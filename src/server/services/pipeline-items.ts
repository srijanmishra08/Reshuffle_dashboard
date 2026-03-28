import { ensureTursoSchema, getTursoClient } from "@/lib/turso";
import { pipelineSeedItems, type PipelineSeedItem } from "@/lib/pipeline-seeds";
import type { PipelineModule } from "@/server/models/pipeline";

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

function toPipelineItem(row: Record<string, unknown>): PipelineSeedItem | null {
  const metadataRaw = row.metadata;
  let metadata: Record<string, unknown> | undefined;

  if (typeof metadataRaw === "string" && metadataRaw.length > 0) {
    try {
      metadata = JSON.parse(metadataRaw) as Record<string, unknown>;
    } catch {
      metadata = undefined;
    }
  }

  const contact = readItemMetadata(metadata);

  const id = readString(row.entity_id);
  const title = readString(row.title);
  const stage = readString(row.stage);

  if (!id || !title || !stage) {
    return null;
  }

  return {
    id,
    title,
    subtitle: readString(row.subtitle),
    stage,
    assignee: contact.assignee,
    phone: contact.phone,
    email: contact.email,
  };
}

async function listPipelineItemsFromTurso(module: PipelineModule): Promise<PipelineSeedItem[]> {
  await ensureTursoSchema();
  const client = getTursoClient();

  const countResult = await client.execute({
    sql: "SELECT COUNT(*) AS count FROM pipeline_items WHERE module = ?",
    args: [module],
  });

  const countRow = countResult.rows[0] as Record<string, unknown> | undefined;
  const count = Number(countRow?.count ?? 0);

  if (count === 0) {
    const seeds = pipelineSeedItems[module];

    for (const item of seeds) {
      const metadata: Record<string, unknown> = {};

      if (item.assignee) metadata.assignee = item.assignee;
      if (item.phone) metadata.phone = item.phone;
      if (item.email) metadata.email = item.email;

      await client.execute({
        sql: `
          INSERT INTO pipeline_items (id, module, entity_type, entity_id, title, subtitle, stage, metadata)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          crypto.randomUUID(),
          module,
          "pipeline_entity",
          item.id,
          item.title,
          item.subtitle ?? null,
          item.stage,
          Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null,
        ],
      });
    }
  }

  const result = await client.execute({
    sql: `
      SELECT entity_id, title, subtitle, stage, metadata
      FROM pipeline_items
      WHERE module = ?
      ORDER BY created_at ASC
    `,
    args: [module],
  });

  return result.rows
    .map((row) => toPipelineItem(row as Record<string, unknown>))
    .filter((row): row is PipelineSeedItem => row !== null);
}

export async function listPipelineItems(module: PipelineModule) {
  return await listPipelineItemsFromTurso(module);
}

export async function persistPipelineTransition(input: PersistTransitionInput) {
  await ensureTursoSchema();
  const client = getTursoClient();

  await client.execute({
    sql: `
      INSERT INTO pipeline_items (id, module, entity_type, entity_id, title, subtitle, stage, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(module, entity_id)
      DO UPDATE SET
        stage = excluded.stage,
        title = COALESCE(excluded.title, pipeline_items.title),
        subtitle = COALESCE(excluded.subtitle, pipeline_items.subtitle),
        metadata = COALESCE(excluded.metadata, pipeline_items.metadata),
        updated_at = CURRENT_TIMESTAMP
    `,
    args: [
      crypto.randomUUID(),
      input.module,
      input.entityType,
      input.entityId,
      input.title ?? input.entityId,
      input.subtitle ?? null,
      input.to,
      input.metadata ? JSON.stringify(input.metadata) : null,
    ],
  });
}

export async function createPipelineItem(module: PipelineModule, input: CreatePipelineItemInput) {
  const entityId = input.entityId ?? generateEntityId(module);
  const metadataContact = readItemMetadata(input.metadata);
  const nextAssignee = input.assignee ?? metadataContact.assignee;
  const nextPhone = input.phone ?? metadataContact.phone;
  const nextEmail = input.email ?? metadataContact.email;
  const nextMetadata: Record<string, unknown> = {
    ...(input.metadata ?? {}),
  };

  if (nextAssignee) nextMetadata.assignee = nextAssignee;
  if (nextPhone) nextMetadata.phone = nextPhone;
  if (nextEmail) nextMetadata.email = nextEmail;

  await ensureTursoSchema();
  const client = getTursoClient();

  await client.execute({
    sql: `
      INSERT INTO pipeline_items (id, module, entity_type, entity_id, title, subtitle, stage, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(module, entity_id)
      DO UPDATE SET
        title = excluded.title,
        subtitle = excluded.subtitle,
        stage = excluded.stage,
        metadata = excluded.metadata,
        updated_at = CURRENT_TIMESTAMP
    `,
    args: [
      crypto.randomUUID(),
      module,
      input.entityType,
      entityId,
      input.title,
      input.subtitle ?? null,
      input.stage,
      Object.keys(nextMetadata).length > 0 ? JSON.stringify(nextMetadata) : null,
    ],
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
}

export async function updatePipelineItem(
  module: PipelineModule,
  entityId: string,
  input: UpdatePipelineItemInput
) {
  await ensureTursoSchema();
  const client = getTursoClient();

  const currentResult = await client.execute({
    sql: `
      SELECT title, subtitle, stage, metadata
      FROM pipeline_items
      WHERE module = ? AND entity_id = ?
      LIMIT 1
    `,
    args: [module, entityId],
  });

  const existing = currentResult.rows[0] as Record<string, unknown> | undefined;

  if (!existing) {
    return null;
  }

  const existingMetadataRaw = readString(existing.metadata);
  let existingMetadata: Record<string, unknown> = {};

  if (existingMetadataRaw) {
    try {
      existingMetadata = JSON.parse(existingMetadataRaw) as Record<string, unknown>;
    } catch {
      existingMetadata = {};
    }
  }

  const nextTitle = input.title ?? readString(existing.title) ?? entityId;
  const nextSubtitle = input.subtitle ?? readString(existing.subtitle);
  const nextStage = input.stage ?? readString(existing.stage) ?? "BACKLOG";

  const mergedMetadata: Record<string, unknown> = {
    ...existingMetadata,
    ...(input.metadata ?? {}),
  };

  if (input.assignee !== undefined) mergedMetadata.assignee = input.assignee;
  if (input.phone !== undefined) mergedMetadata.phone = input.phone;
  if (input.email !== undefined) mergedMetadata.email = input.email;

  await client.execute({
    sql: `
      UPDATE pipeline_items
      SET title = ?, subtitle = ?, stage = ?, metadata = ?, updated_at = CURRENT_TIMESTAMP
      WHERE module = ? AND entity_id = ?
    `,
    args: [
      nextTitle,
      nextSubtitle ?? null,
      nextStage,
      Object.keys(mergedMetadata).length > 0 ? JSON.stringify(mergedMetadata) : null,
      module,
      entityId,
    ],
  });

  const contact = readItemMetadata(mergedMetadata);

  return {
    id: entityId,
    title: nextTitle,
    subtitle: nextSubtitle,
    stage: nextStage,
    assignee: contact.assignee,
    phone: contact.phone,
    email: contact.email,
  };
}

export async function deletePipelineItem(module: PipelineModule, entityId: string) {
  await ensureTursoSchema();
  const client = getTursoClient();

  const result = await client.execute({
    sql: "DELETE FROM pipeline_items WHERE module = ? AND entity_id = ?",
    args: [module, entityId],
  });

  return Number(result.rowsAffected ?? 0) > 0;
}
