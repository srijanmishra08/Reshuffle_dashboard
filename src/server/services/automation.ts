import { automationQueue } from "@/lib/queue";
import { db } from "@/lib/db";
import { logActivity } from "@/server/services/activity";

export async function triggerAutomations(event: string, payload: Record<string, unknown>) {
  const rules = await db.automationRule.findMany({
    where: {
      enabled: true,
      trigger: event,
    },
  });

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
