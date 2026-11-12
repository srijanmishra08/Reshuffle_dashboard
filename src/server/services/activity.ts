import { desc } from "drizzle-orm";
import { newId } from "@/lib/ids";
import { getDb, schema, type Db } from "@/server/db/client";

type LogActivityInput = {
  actorId?: string;
  action: string;
  module: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
};

/** Audit trail. A logging failure never breaks the request. */
export async function logActivity(input: LogActivityInput, db?: Db) {
  const id = newId();
  const createdAt = new Date();

  try {
    await (db ?? getDb()).insert(schema.activityLogs).values({
      id,
      actorId: input.actorId ?? null,
      action: input.action,
      module: input.module,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata ?? null,
      createdAt,
    });

    return {
      id,
      actorId: input.actorId ?? null,
      action: input.action,
      module: input.module,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata ?? null,
      createdAt,
    };
  } catch (error) {
    console.warn("Activity logging skipped", {
      reason: error instanceof Error ? error.message : "Unknown error",
      action: input.action,
      module: input.module,
      entityType: input.entityType,
      entityId: input.entityId,
    });

    return null;
  }
}

export async function getRecentActivity(limit = 20, db?: Db) {
  try {
    const rows = await (db ?? getDb())
      .select()
      .from(schema.activityLogs)
      .orderBy(desc(schema.activityLogs.createdAt))
      .limit(limit);

    return rows.map((row) => {
      return {
        id: row.id,
        actorId: row.actorId,
        action: row.action,
        module: row.module,
        entityType: row.entityType,
        entityId: row.entityId,
        metadata: row.metadata ?? null,
        createdAt: row.createdAt,
      };
    });
  } catch {
    return [];
  }
}
