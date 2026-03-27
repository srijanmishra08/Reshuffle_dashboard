import { router, publicProcedure, z } from "@/server/trpc";
import { ensureTursoSchema, getTursoClient } from "@/lib/turso";

export const crmRouter = router({
  listClients: publicProcedure.query(async () => {
    await ensureTursoSchema();
    const client = getTursoClient();

    const result = await client.execute(`
      SELECT id, name, company, notes, stage, status, created_at, updated_at
      FROM clients
      ORDER BY updated_at DESC
      LIMIT 50
    `);

    return result.rows.map((row) => {
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
      };
    });
  }),

  addClient: publicProcedure
    .input(
      z.object({
        name: z.string().min(2),
        company: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      await ensureTursoSchema();
      const client = getTursoClient();
      const id = crypto.randomUUID();

      await client.execute({
        sql: `
          INSERT INTO clients (id, name, company, stage, status)
          VALUES (?, ?, ?, 'LEAD', 'ACTIVE')
        `,
        args: [id, input.name, input.company ?? null],
      });

      return {
        id,
        name: input.name,
        company: input.company ?? null,
        notes: null,
        stage: "LEAD",
        status: "ACTIVE",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }),
});
