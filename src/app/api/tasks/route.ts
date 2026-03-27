import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ensureTursoSchema, getTursoClient } from "@/lib/turso";
import { logActivity } from "@/server/services/activity";

const prioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

const createTaskSchema = z.object({
  projectId: z.string().min(1),
  assignedTo: z.string().optional(),
  title: z.string().min(2),
  details: z.string().optional(),
  dueDate: z.string().datetime().optional(),
  priority: prioritySchema.optional(),
});

export async function GET() {
  try {
    await ensureTursoSchema();
    const client = getTursoClient();

    const rows = await client.execute(`
      SELECT t.id, t.project_id, t.assigned_to, t.title, t.details, t.status, t.priority, t.due_date, t.created_at, t.updated_at,
             p.id AS p_id, p.name AS p_name
      FROM tasks t
      LEFT JOIN projects p ON p.id = t.project_id
      ORDER BY t.updated_at DESC
    `);

    const data = rows.rows.map((row) => {
      const item = row as Record<string, unknown>;

      return {
        id: String(item.id ?? ""),
        projectId: String(item.project_id ?? ""),
        assignedTo: item.assigned_to ? String(item.assigned_to) : null,
        title: String(item.title ?? ""),
        details: item.details ? String(item.details) : null,
        status: String(item.status ?? "TODO"),
        priority: String(item.priority ?? "MEDIUM"),
        dueDate: item.due_date ? String(item.due_date) : null,
        createdAt: String(item.created_at ?? new Date().toISOString()),
        updatedAt: String(item.updated_at ?? new Date().toISOString()),
        assignee: null,
        project: item.p_id
          ? {
              id: String(item.p_id),
              name: String(item.p_name ?? ""),
            }
          : null,
      };
    });

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to fetch tasks" },
      { status: 503 }
    );
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = createTaskSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let task: {
    id: string;
    projectId: string;
    assignedTo: string | null;
    title: string;
    details: string | null;
    status: string;
    priority: string;
    dueDate: string | null;
    createdAt: string;
    updatedAt: string;
  };

  try {
    await ensureTursoSchema();
    const client = getTursoClient();
    const taskId = crypto.randomUUID();

    await client.execute({
      sql: `
        INSERT INTO tasks (id, project_id, assigned_to, title, details, status, priority, due_date)
        VALUES (?, ?, ?, ?, ?, 'TODO', ?, ?)
      `,
      args: [
        taskId,
        parsed.data.projectId,
        parsed.data.assignedTo ?? null,
        parsed.data.title,
        parsed.data.details ?? null,
        parsed.data.priority ?? "MEDIUM",
        parsed.data.dueDate ?? null,
      ],
    });

    task = {
      id: taskId,
      projectId: parsed.data.projectId,
      assignedTo: parsed.data.assignedTo ?? null,
      title: parsed.data.title,
      details: parsed.data.details ?? null,
      status: "TODO",
      priority: parsed.data.priority ?? "MEDIUM",
      dueDate: parsed.data.dueDate ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create task" },
      { status: 503 }
    );
  }

  await logActivity({
    action: "task.created",
    module: "projects",
    entityType: "task",
    entityId: task.id,
    metadata: { title: task.title },
  });

  return NextResponse.json({ data: task }, { status: 201 });
}
