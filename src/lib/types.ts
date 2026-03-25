export type UserRole = "ADMIN" | "MANAGER" | "FREELANCER";

export type DashboardKpi = {
  title: string;
  value: string;
  trend: string;
  tone: "good" | "warn" | "neutral";
};

export type FeedItem = {
  id: string;
  action: string;
  module: string;
  createdAt: string;
};
