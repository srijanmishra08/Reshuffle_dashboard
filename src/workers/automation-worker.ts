import { Worker } from "bullmq";

const worker = new Worker(
  "automation-jobs",
  async (job) => {
    const { ruleId, payload } = job.data as {
      ruleId: string;
      payload: Record<string, unknown>;
    };

    console.log("Processing automation rule", { ruleId, payload });

    return {
      ok: true,
      processedAt: new Date().toISOString(),
    };
  },
  {
    connection: {
      url: process.env.REDIS_URL,
    },
  }
);

worker.on("completed", (job) => {
  console.log(`Automation job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`Automation job ${job?.id ?? "unknown"} failed`, err);
});
