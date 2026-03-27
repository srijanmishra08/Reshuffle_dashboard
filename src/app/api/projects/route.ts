import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ensureTursoSchema, getTursoClient } from "@/lib/turso";
import { logActivity } from "@/server/services/activity";

const createProjectSchema = z.object({
  clientId: z.string().min(1),
  name: z.string().min(2),
  description: z.string().optional(),
  deadline: z.string().datetime().optional(),
});

export async function GET() {
  try {
    await ensureTursoSchema();
    const client = getTursoClient();

    const rows = await client.execute(`
      SELECT p.id, p.client_id, p.name, p.description, p.status, p.deadline, p.created_at, p.updated_at,
             c.id AS c_id, c.name AS c_name, c.company AS c_company, c.notes AS c_notes, c.stage AS c_stage, c.status AS c_status
      FROM projects p
      LEFT JOIN clients c ON c.id = p.client_id
      ORDER BY p.updated_at DESC
    `);

    const data = rows.rows.map((row) => {
      const item = row as Record<string, unknown>;

      return {
        id: String(item.id ?? ""),
        clientId: String(item.client_id ?? ""),
        name: String(item.name ?? ""),
        description: item.description ? String(item.description) : null,
        status: String(item.status ?? "TODO"),
        deadline: item.deadline ? String(item.deadline) : null,
        createdAt: String(item.created_at ?? new Date().toISOString()),
        updatedAt: String(item.updated_at ?? new Date().toISOString()),
        client: item.c_id
          ? {
              id: String(item.c_id),
              name: String(item.c_name ?? ""),
              company: item.c_company ? String(item.c_company) : null,
              notes: item.c_notes ? String(item.c_notes) : null,
              stage: String(item.c_stage ?? "LEAD"),
              status: String(item.c_status ?? "ACTIVE"),
            }
          : null,
        tasks: [],
        assignments: [],
      };
    });

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to fetch projects" },
      { status: 503 }
    );
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = createProjectSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let project: {
    id: string;
    clientId: string;
    name: string;
    description: string | null;
    status: string;
    deadline: string | null;
    createdAt: string;
    updatedAt: string;
  };

  try {
    await ensureTursoSchema();
    const client = getTursoClient();
    const projectId = crypto.randomUUID();

    await client.execute({
      sql: `
        INSERT INTO projects (id, client_id, name, description, status, deadline)
        VALUES (?, ?, ?, ?, 'TODO', ?)
      `,
      args: [
        projectId,
        parsed.data.clientId,
        parsed.data.name,
        parsed.data.description ?? null,
        parsed.data.deadline ?? null,
      ],
    });

    project = {
      id: projectId,
      clientId: parsed.data.clientId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      status: "TODO",
      deadline: parsed.data.deadline ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create project" },
      { status: 503 }
    );
  }

  await logActivity({
    action: "project.created",
    module: "projects",
    entityType: "project",
    entityId: project.id,
    metadata: { name: project.name },
  });

  return NextResponse.json({ data: project }, { status: 201 });
}
