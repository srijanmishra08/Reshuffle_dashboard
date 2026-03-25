import { router } from "@/server/trpc";
import { crmRouter } from "@/server/routers/crm";

export const appRouter = router({
  crm: crmRouter,
});

export type AppRouter = typeof appRouter;
