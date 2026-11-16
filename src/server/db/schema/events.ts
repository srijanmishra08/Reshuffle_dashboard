import { boolean, index, integer, pgTable, text } from "drizzle-orm/pg-core";
import { newId } from "@/lib/ids";
import { ts } from "./_cols";

export const eventTypeValues = ["SPRINT", "WORKSHOP", "IDEATHON", "BOOTCAMP", "MEETUP"] as const;
export const eventStatusValues = ["PLANNED", "CONFIRMED", "EXECUTED", "ARCHIVED"] as const;
export type EventStatus = (typeof eventStatusValues)[number];

/** Events. `date` is a calendar day (`YYYY-MM-DD`); money is integer paise. */
export const events = pgTable(
  "events",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    orgId: text("org_id").notNull().default("default"),
    name: text("name").notNull(),
    type: text("type").notNull().default("WORKSHOP"),
    status: text("status").notNull().default("PLANNED"),
    date: text("date"),
    venue: text("venue"),
    capacity: integer("capacity"),
    ticketPricePaise: integer("ticket_price_paise").notNull().default(0),
    partner: text("partner"),
    sheetUrl: text("sheet_url"),
    docUrl: text("doc_url"),
    notes: text("notes"),
    createdBy: text("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("idx_events_org_status").on(t.orgId, t.status)]
).enableRLS();

export const eventTeam = pgTable(
  "event_team",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    orgId: text("org_id").notNull().default("default"),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    role: text("role"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("idx_event_team_event").on(t.eventId)]
).enableRLS();

export const eventRegistrations = pgTable(
  "event_registrations",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    orgId: text("org_id").notNull().default("default"),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    contact: text("contact"),
    paid: boolean("paid").notNull().default(false),
    attended: boolean("attended").notNull().default(false),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("idx_event_regs_event").on(t.eventId)]
).enableRLS();
