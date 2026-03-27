import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ensureTursoSchema, getTursoClient } from "@/lib/turso";
import { logActivity } from "@/server/services/activity";

const platformSchema = z.enum(["Instagram", "LinkedIn", "YouTube", "X", "Facebook"]);
const socialStatusSchema = z.enum(["IDEA", "DRAFT", "SCHEDULED", "POSTED"]);

const createEntrySchema = z.object({
  title: z.string().min(1),
  script: z.string().optional().default(""),
  platform: platformSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: socialStatusSchema,
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

function mapRowToSocial(row: Record<string, unknown>): SocialApiItem | null {
  try {
    return {
      id: z.string().parse(row.id),
      title: z.string().parse(row.title),
      script: z.string().parse(row.script ?? ""),
      platform: platformSchema.parse(row.platform),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(row.date),
      status: socialStatusSchema.parse(row.status),
    };
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    await ensureTursoSchema();
    const client = getTursoClient();

    const result = await client.execute(
      "SELECT id, title, script, platform, date, status FROM social_entries ORDER BY date ASC, created_at ASC"
    );

    const data = result.rows
      .map((row) => mapRowToSocial(row as unknown as Record<string, unknown>))
      .filter((row): row is SocialApiItem => row !== null);

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load social entries from Turso",
      },
      { status: 503 }
    );
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = createEntrySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await ensureTursoSchema();
    const client = getTursoClient();
    const id = crypto.randomUUID();

    await client.execute({
      sql: "INSERT INTO social_entries (id, title, script, platform, date, status) VALUES (?, ?, ?, ?, ?, ?)",
      args: [
        id,
        parsed.data.title,
        parsed.data.script,
        parsed.data.platform,
        parsed.data.date,
        parsed.data.status,
      ],
    });

    await logActivity({
      action: "social.entry.created",
      module: "social",
      entityType: "content",
      entityId: id,
      metadata: {
        title: parsed.data.title,
        platform: parsed.data.platform,
        date: parsed.data.date,
        status: parsed.data.status,
      },
    });

    return NextResponse.json(
      {
        data: {
          id,
          title: parsed.data.title,
          script: parsed.data.script,
          platform: parsed.data.platform,
          date: parsed.data.date,
          status: parsed.data.status,
        } satisfies SocialApiItem,
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to create social entry in Turso",
      },
      { status: 503 }
    );
  }
}
