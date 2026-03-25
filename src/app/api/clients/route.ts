import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { logActivity } from "@/server/services/activity";

const createClientSchema = z.object({
  name: z.string().min(2),
  company: z.string().optional(),
  notes: z.string().optional(),
});

export async function GET() {
  const clients = await db.client.findMany({
    include: {
      projects: true,
      deals: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ data: clients });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = createClientSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const client = await db.client.create({
    data: {
      name: parsed.data.name,
      company: parsed.data.company,
      notes: parsed.data.notes,
    },
  });

  await logActivity({
    action: "client.created",
    module: "crm",
    entityType: "client",
    entityId: client.id,
    metadata: { name: client.name },
  });

  return NextResponse.json({ data: client }, { status: 201 });
}
