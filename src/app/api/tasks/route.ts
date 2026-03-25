import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Priority } from "@prisma/client";
import { db } from "@/lib/db";
import { logActivity } from "@/server/services/activity";

const createTaskSchema = z.object({
  projectId: z.string().min(1),
  assignedTo: z.string().optional(),
  title: z.string().min(2),
  details: z.string().optional(),
  dueDate: z.string().datetime().optional(),
  priority: z.nativeEnum(Priority).optional(),
});

export async function GET() {
  const tasks = await db.task.findMany({
    include: {
      assignee: true,
      project: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ data: tasks });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = createTaskSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const task = await db.task.create({
    data: {
      projectId: parsed.data.projectId,
      assignedTo: parsed.data.assignedTo,
      title: parsed.data.title,
      details: parsed.data.details,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
      priority: parsed.data.priority,
    },
  });

  await logActivity({
    action: "task.created",
    module: "projects",
    entityType: "task",
    entityId: task.id,
    metadata: { title: task.title },
  });

  return NextResponse.json({ data: task }, { status: 201 });
}
