import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

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
    return await db.activity.create({
      data: {
        actorId: input.actorId,
        action: input.action,
        module: input.module,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    });
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
    return await db.activity.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  } catch {
    return [];
  }
}
