import { and, asc, eq } from "drizzle-orm";
import { newId } from "@/lib/ids";
import type { PipelineItem } from "@/lib/pipeline-types";
import { getDb, schema, type Db } from "@/server/db/client";
import type { PipelineModule } from "@/server/models/pipeline";

const { pipelineItems } = schema;

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
  return `${module}-${newId()}`;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function parseMetadata(raw: Record<string, unknown> | null): Record<string, unknown> {
  return raw && typeof raw === "object" ? raw : {};
}

function readItemMetadata(metadata: Record<string, unknown> | undefined) {
  return {
    assignee: readString(metadata?.assignee),
    phone: readString(metadata?.phone),
    email: readString(metadata?.email),
  };
}

function serialiseMetadata(metadata: Record<string, unknown>): Record<string, unknown> | null {
  return Object.keys(metadata).length > 0 ? metadata : null;
}

/** Boards start empty. Demo cards are no longer seeded on read. */
export async function listPipelineItems(module: PipelineModule, db: Db = getDb()): Promise<PipelineItem[]> {
  const rows = await db
    .select({
      entityId: pipelineItems.entityId,
      title: pipelineItems.title,
      subtitle: pipelineItems.subtitle,
      stage: pipelineItems.stage,
      metadata: pipelineItems.metadata,
    })
    .from(pipelineItems)
    .where(eq(pipelineItems.module, module))
    .orderBy(asc(pipelineItems.createdAt));

  return rows.flatMap((row) => {
    if (!row.entityId || !row.title || !row.stage) {
      return [];
    }

    const contact = readItemMetadata(parseMetadata(row.metadata));
    return [
      {
        id: row.entityId,
        title: row.title,
        subtitle: readString(row.subtitle),
        stage: row.stage,
        ...contact,
      },
    ];
  });
}

export async function persistPipelineTransition(input: PersistTransitionInput, db: Db = getDb()) {
  const now = new Date();
  const metadata = input.metadata ?? null;

  await db
    .insert(pipelineItems)
    .values({
      id: newId(),
      module: input.module,
      entityType: input.entityType,
      entityId: input.entityId,
      title: input.title ?? input.entityId,
      subtitle: input.subtitle ?? null,
      stage: input.to,
      metadata,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [pipelineItems.module, pipelineItems.entityId],
      // Only overwrite title, subtitle and metadata when the caller supplied them.
      set: {
        stage: input.to,
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.subtitle !== undefined ? { subtitle: input.subtitle } : {}),
        ...(metadata !== null ? { metadata } : {}),
        updatedAt: now,
      },
    });
}

export async function createPipelineItem(
  module: PipelineModule,
  input: CreatePipelineItemInput,
  db: Db = getDb()
) {
  const entityId = input.entityId ?? generateEntityId(module);
  const fromMetadata = readItemMetadata(input.metadata);
  const assignee = input.assignee ?? fromMetadata.assignee;
  const phone = input.phone ?? fromMetadata.phone;
  const email = input.email ?? fromMetadata.email;
  const metadata: Record<string, unknown> = { ...(input.metadata ?? {}) };

  if (assignee) metadata.assignee = assignee;
  if (phone) metadata.phone = phone;
  if (email) metadata.email = email;

  const now = new Date();

  await db
    .insert(pipelineItems)
    .values({
      id: newId(),
      module,
      entityType: input.entityType,
      entityId,
      title: input.title,
      subtitle: input.subtitle ?? null,
      stage: input.stage,
      metadata: serialiseMetadata(metadata),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [pipelineItems.module, pipelineItems.entityId],
      set: {
        title: input.title,
        subtitle: input.subtitle ?? null,
        stage: input.stage,
        metadata: serialiseMetadata(metadata),
        updatedAt: now,
      },
    });

  return { id: entityId, title: input.title, subtitle: input.subtitle, stage: input.stage, assignee, phone, email };
}

export async function updatePipelineItem(
  module: PipelineModule,
  entityId: string,
  input: UpdatePipelineItemInput,
  db: Db = getDb()
) {
  const rows = await db
    .select()
    .from(pipelineItems)
    .where(and(eq(pipelineItems.module, module), eq(pipelineItems.entityId, entityId)))
    .limit(1);
  const existing = rows[0];

  if (!existing) {
    return null;
  }

  const title = input.title ?? readString(existing.title) ?? entityId;
  const subtitle = input.subtitle ?? readString(existing.subtitle);
  const stage = input.stage ?? readString(existing.stage) ?? "BACKLOG";

  const metadata: Record<string, unknown> = {
    ...parseMetadata(existing.metadata),
    ...(input.metadata ?? {}),
  };

  if (input.assignee !== undefined) metadata.assignee = input.assignee;
  if (input.phone !== undefined) metadata.phone = input.phone;
  if (input.email !== undefined) metadata.email = input.email;

  await db
    .update(pipelineItems)
    .set({
      title,
      subtitle: subtitle ?? null,
      stage,
      metadata: serialiseMetadata(metadata),
      updatedAt: new Date(),
    })
    .where(and(eq(pipelineItems.module, module), eq(pipelineItems.entityId, entityId)));

  return { id: entityId, title, subtitle, stage, ...readItemMetadata(metadata) };
}

export async function deletePipelineItem(module: PipelineModule, entityId: string, db: Db = getDb()) {
  const deleted = await db
    .delete(pipelineItems)
    .where(and(eq(pipelineItems.module, module), eq(pipelineItems.entityId, entityId)))
    .returning({ id: pipelineItems.id });

  return deleted.length > 0;
}

