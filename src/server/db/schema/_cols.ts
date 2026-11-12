import { timestamp } from "drizzle-orm/pg-core";

/** timestamptz as a JS Date. JSON-serialises to ISO 8601 in API responses. */
export const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
