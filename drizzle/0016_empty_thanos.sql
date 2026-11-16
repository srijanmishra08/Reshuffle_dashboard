CREATE TABLE "event_registrations" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT 'default' NOT NULL,
	"event_id" text NOT NULL,
	"name" text NOT NULL,
	"contact" text,
	"paid" boolean DEFAULT false NOT NULL,
	"attended" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_registrations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "event_team" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT 'default' NOT NULL,
	"event_id" text NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_team" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT 'default' NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'WORKSHOP' NOT NULL,
	"status" text DEFAULT 'PLANNED' NOT NULL,
	"date" text,
	"venue" text,
	"capacity" integer,
	"ticket_price_paise" integer DEFAULT 0 NOT NULL,
	"partner" text,
	"sheet_url" text,
	"doc_url" text,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_team" ADD CONSTRAINT "event_team_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_event_regs_event" ON "event_registrations" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_event_team_event" ON "event_team" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_events_org_status" ON "events" USING btree ("org_id","status");