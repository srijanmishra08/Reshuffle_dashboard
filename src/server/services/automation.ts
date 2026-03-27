import { automationQueue } from "@/lib/queue";
import { ensureTursoSchema, getTursoClient } from "@/lib/turso";
import { logActivity } from "@/server/services/activity";

export async function triggerAutomations(event: string, payload: Record<string, unknown>) {
  await ensureTursoSchema();
  const client = getTursoClient();
  const result = await client.execute({
    sql: `
      SELECT id
      FROM automation_rules
      WHERE enabled = 1 AND trigger = ?
      ORDER BY created_at DESC
    `,
    args: [event],
  });

  const rules = result.rows.map((row) => ({ id: String((row as Record<string, unknown>).id ?? "") }));

  const jobs = await Promise.all(
    rules.map((rule) =>
      automationQueue.add("run-rule", {
        ruleId: rule.id,
        payload,
      })
    )
  );

  await logActivity({
    action: `automation.triggered.${event}`,
    module: "automation",
    entityType: "automation_rule",
    entityId: rules[0]?.id ?? "none",
    metadata: { matchedRules: rules.length },
  });

  return {
    matchedRules: rules.length,
    queuedJobs: jobs.length,
  };
}
