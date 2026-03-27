import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ensureTursoSchema, getTursoClient } from "@/lib/turso";
import { logActivity } from "@/server/services/activity";

const platformSchema = z.enum(["Instagram", "LinkedIn", "YouTube", "X", "Facebook"]);
const socialStatusSchema = z.enum(["IDEA", "DRAFT", "SCHEDULED", "POSTED"]);

const updateEntrySchema = z.object({
  title: z.string().min(1).optional(),
  script: z.string().optional(),
  platform: platformSchema.optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: socialStatusSchema.optional(),
});

type SocialStatus = z.infer<typeof socialStatusSchema>;

type SocialApiItem = {
  id: string;
  title: string;
  script: string;
  platform: z.infer<typeof platformSchema>;
  date: string;
  status: SocialStatus;
};

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json();
  const parsed = updateEntrySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await ensureTursoSchema();
    const client = getTursoClient();

    const updates: string[] = [];
    const args: Array<string> = [];

    if (parsed.data.title !== undefined) {
      updates.push("title = ?");
      args.push(parsed.data.title);
    }

    if (parsed.data.script !== undefined) {
      updates.push("script = ?");
      args.push(parsed.data.script);
    }

    if (parsed.data.platform !== undefined) {
      updates.push("platform = ?");
      args.push(parsed.data.platform);
    }

    if (parsed.data.date !== undefined) {
      updates.push("date = ?");
      args.push(parsed.data.date);
    }

    if (parsed.data.status !== undefined) {
      updates.push("status = ?");
      args.push(parsed.data.status);
    }

    if (updates.length === 0) {
      const existing = await client.execute({
        sql: "SELECT id, title, script, platform, date, status FROM social_entries WHERE id = ? LIMIT 1",
        args: [id],
      });

      const row = existing.rows[0] as Record<string, unknown> | undefined;

      if (!row) {
        return NextResponse.json({ error: "Content entry not found" }, { status: 404 });
      }

      return NextResponse.json({
        data: {
          id: z.string().parse(row.id),
          title: z.string().parse(row.title),
          script: z.string().parse(row.script ?? ""),
          platform: platformSchema.parse(row.platform),
          date: z.string().parse(row.date),
          status: socialStatusSchema.parse(row.status),
        } satisfies SocialApiItem,
      });
    }

    updates.push("updated_at = CURRENT_TIMESTAMP");
    args.push(id);

    const updateResult = await client.execute({
      sql: `UPDATE social_entries SET ${updates.join(", ")} WHERE id = ?`,
      args,
    });

    if (Number(updateResult.rowsAffected ?? 0) === 0) {
      return NextResponse.json({ error: "Content entry not found" }, { status: 404 });
    }

    const updatedResult = await client.execute({
      sql: "SELECT id, title, script, platform, date, status FROM social_entries WHERE id = ? LIMIT 1",
      args: [id],
    });

    const updatedRow = updatedResult.rows[0] as Record<string, unknown> | undefined;

    if (!updatedRow) {
      return NextResponse.json({ error: "Content entry not found" }, { status: 404 });
    }

    await logActivity({
      action: "social.entry.updated",
      module: "social",
      entityType: "content",
      entityId: id,
      metadata: parsed.data,
    });

    return NextResponse.json({
      data: {
        id: z.string().parse(updatedRow.id),
        title: z.string().parse(updatedRow.title),
        script: z.string().parse(updatedRow.script ?? ""),
        platform: platformSchema.parse(updatedRow.platform),
        date: z.string().parse(updatedRow.date),
        status: socialStatusSchema.parse(updatedRow.status),
      } satisfies SocialApiItem,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to update social entry in Turso",
      },
      { status: 503 }
    );
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  try {
    await ensureTursoSchema();
    const client = getTursoClient();

    const result = await client.execute({
      sql: "DELETE FROM social_entries WHERE id = ?",
      args: [id],
    });

    if (Number(result.rowsAffected ?? 0) === 0) {
      return NextResponse.json({ error: "Content entry not found" }, { status: 404 });
    }

    await logActivity({
      action: "social.entry.deleted",
      module: "social",
      entityType: "content",
      entityId: id,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to delete social entry in Turso",
      },
      { status: 503 }
    );
  }
}
