CREATE TABLE "mail_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT 'default' NOT NULL,
	"email" text NOT NULL,
	"refresh_token_enc" text NOT NULL,
	"scope" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"connected_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mail_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "outbound_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT 'default' NOT NULL,
	"kind" text NOT NULL,
	"to_email" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"company_id" text,
	"contact_id" text,
	"deal_id" text,
	"idempotency_key" text NOT NULL,
	"status" text DEFAULT 'QUEUED' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"gmail_message_id" text,
	"gmail_thread_id" text,
	"last_error" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "outbound_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_mail_connections_org" ON "mail_connections" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_outbound_messages_org_key" ON "outbound_messages" USING btree ("org_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "idx_outbound_messages_due" ON "outbound_messages" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "idx_outbound_messages_org_created" ON "outbound_messages" USING btree ("org_id","created_at");