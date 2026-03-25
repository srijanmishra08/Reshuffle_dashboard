import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { logActivity } from "@/server/services/activity";

const createProjectSchema = z.object({
  clientId: z.string().min(1),
  name: z.string().min(2),
  description: z.string().optional(),
  deadline: z.string().datetime().optional(),
});

export async function GET() {
  const projects = await db.project.findMany({
    include: {
      client: true,
      tasks: true,
      assignments: {
        include: {
          freelancer: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ data: projects });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = createProjectSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const project = await db.project.create({
    data: {
      clientId: parsed.data.clientId,
      name: parsed.data.name,
      description: parsed.data.description,
      deadline: parsed.data.deadline ? new Date(parsed.data.deadline) : undefined,
    },
  });

  await logActivity({
    action: "project.created",
    module: "projects",
    entityType: "project",
    entityId: project.id,
    metadata: { name: project.name },
  });

  return NextResponse.json({ data: project }, { status: 201 });
}
