import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ensureTursoSchema, getTursoClient } from "@/lib/turso";
import { logActivity } from "@/server/services/activity";

const createClientSchema = z.object({
  name: z.string().min(2),
  company: z.string().optional(),
  notes: z.string().optional(),
});

export async function GET() {
  try {
    await ensureTursoSchema();
    const client = getTursoClient();

    const rows = await client.execute(`
      SELECT id, name, company, notes, stage, status, created_at, updated_at
      FROM clients
      ORDER BY updated_at DESC
    `);

    const data = rows.rows.map((row) => {
      const item = row as Record<string, unknown>;

      return {
        id: String(item.id ?? ""),
        name: String(item.name ?? ""),
        company: item.company ? String(item.company) : null,
        notes: item.notes ? String(item.notes) : null,
        stage: String(item.stage ?? "LEAD"),
        status: String(item.status ?? "ACTIVE"),
        createdAt: String(item.created_at ?? new Date().toISOString()),
        updatedAt: String(item.updated_at ?? new Date().toISOString()),
        projects: [],
        deals: [],
      };
    });

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to fetch clients" },
      { status: 503 }
    );
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = createClientSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let createdClient: {
    id: string;
    name: string;
    company: string | null;
    notes: string | null;
    stage: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  };

  try {
    await ensureTursoSchema();
    const client = getTursoClient();
    const clientId = crypto.randomUUID();

    await client.execute({
      sql: `
        INSERT INTO clients (id, name, company, notes, stage, status)
        VALUES (?, ?, ?, ?, 'LEAD', 'ACTIVE')
      `,
      args: [clientId, parsed.data.name, parsed.data.company ?? null, parsed.data.notes ?? null],
    });

    createdClient = {
      id: clientId,
      name: parsed.data.name,
      company: parsed.data.company ?? null,
      notes: parsed.data.notes ?? null,
      stage: "LEAD",
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create client" },
      { status: 503 }
    );
  }

  await logActivity({
    action: "client.created",
    module: "crm",
    entityType: "client",
    entityId: createdClient.id,
    metadata: { name: createdClient.name },
  });

  return NextResponse.json({ data: createdClient }, { status: 201 });
}
