import { router, publicProcedure, z } from "@/server/trpc";
import { db } from "@/lib/db";

export const crmRouter = router({
  listClients: publicProcedure.query(async () => {
    return db.client.findMany({
      orderBy: { updatedAt: "desc" },
      take: 50,
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
      return db.client.create({
        data: {
          name: input.name,
          company: input.company,
        },
      });
    }),
});
