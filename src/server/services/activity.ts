import { ensureTursoSchema, getTursoClient } from "@/lib/turso";

type LogActivityInput = {
  actorId?: string;
  action: string;
  module: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
};

export async function logActivity(input: LogActivityInput) {
  try {
    await ensureTursoSchema();
    const client = getTursoClient();
    const id = crypto.randomUUID();

    await client.execute({
      sql: `
        INSERT INTO activity_logs (id, actor_id, action, module, entity_type, entity_id, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        id,
        input.actorId ?? null,
        input.action,
        input.module,
        input.entityType,
        input.entityId,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ],
    });

    return {
      id,
      actorId: input.actorId ?? null,
      action: input.action,
      module: input.module,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata ?? null,
      createdAt: new Date().toISOString(),
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

export async function getRecentActivity(limit = 20) {
  try {
    await ensureTursoSchema();
    const client = getTursoClient();

    const result = await client.execute({
      sql: `
        SELECT id, actor_id, action, module, entity_type, entity_id, metadata, created_at
        FROM activity_logs
        ORDER BY created_at DESC
        LIMIT ?
      `,
      args: [limit],
    });

    return result.rows.map((row) => {
      const payload = row as Record<string, unknown>;
      const rawMetadata = payload.metadata;
      let metadata: Record<string, unknown> | null = null;

      if (typeof rawMetadata === "string" && rawMetadata.length > 0) {
        try {
          metadata = JSON.parse(rawMetadata) as Record<string, unknown>;
        } catch {
          metadata = null;
        }
      }

      return {
        id: String(payload.id ?? ""),
        actorId: payload.actor_id ? String(payload.actor_id) : null,
        action: String(payload.action ?? ""),
        module: String(payload.module ?? ""),
        entityType: String(payload.entity_type ?? ""),
        entityId: String(payload.entity_id ?? ""),
        metadata,
        createdAt: String(payload.created_at ?? new Date().toISOString()),
      };
    });
  } catch {
    return [];
  }
}
