CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" bigint NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rate_limits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scope_acceptances" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT 'default' NOT NULL,
	"scope_id" text NOT NULL,
	"share_id" text NOT NULL,
	"typed_name" text NOT NULL,
	"ip" text,
	"user_agent" text,
	"accepted_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scope_acceptances" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "scope_shares" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT 'default' NOT NULL,
	"scope_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scope_shares" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scope_acceptances" ADD CONSTRAINT "scope_acceptances_scope_id_scopes_id_fk" FOREIGN KEY ("scope_id") REFERENCES "public"."scopes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scope_acceptances" ADD CONSTRAINT "scope_acceptances_share_id_scope_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."scope_shares"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scope_shares" ADD CONSTRAINT "scope_shares_scope_id_scopes_id_fk" FOREIGN KEY ("scope_id") REFERENCES "public"."scopes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_scope_acceptances_scope" ON "scope_acceptances" USING btree ("scope_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_scope_shares_hash" ON "scope_shares" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_scope_shares_scope" ON "scope_shares" USING btree ("scope_id");