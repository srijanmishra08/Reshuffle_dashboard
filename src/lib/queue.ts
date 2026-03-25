import { Queue } from "bullmq";

const connection = {
  url: process.env.REDIS_URL,
};

export const automationQueue = new Queue("automation-jobs", {
  connection,
});

export type AutomationJob = {
  ruleId: string;
  payload: Record<string, unknown>;
};
