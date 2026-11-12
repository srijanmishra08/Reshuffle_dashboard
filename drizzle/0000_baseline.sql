CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "allowed_emails" (
	"email" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT 'default' NOT NULL,
	"role" text DEFAULT 'MEMBER' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "allowed_emails" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "session" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'MEMBER' NOT NULL,
	"org_id" text DEFAULT 'default' NOT NULL,
	"freelancer_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "verification" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "activity_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"module" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "automation_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"trigger" text NOT NULL,
	"condition_json" jsonb,
	"action_json" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "automation_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "clients" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"company" text,
	"notes" text,
	"stage" text DEFAULT 'LEAD' NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "freelancers" (
	"id" text PRIMARY KEY NOT NULL,
	"freelancer" text NOT NULL,
	"skill" text,
	"availability" text,
	"project" text,
	"utilization" text,
	"payout" text,
	"performance" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "freelancers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "number_series" (
	"org_id" text DEFAULT 'default' NOT NULL,
	"doc_type" text NOT NULL,
	"fy" text NOT NULL,
	"prefix" text NOT NULL,
	"next_value" integer DEFAULT 1 NOT NULL,
	"padding" integer DEFAULT 3 NOT NULL,
	CONSTRAINT "number_series_org_id_doc_type_fy_pk" PRIMARY KEY("org_id","doc_type","fy")
);
--> statement-breakpoint
ALTER TABLE "number_series" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "org_settings" (
	"org_id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"legal_name" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"state_code" text DEFAULT '' NOT NULL,
	"gstin" text DEFAULT '' NOT NULL,
	"pan" text DEFAULT '' NOT NULL,
	"bank_details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"default_terms" text DEFAULT '' NOT NULL,
	"logo_blob_key" text,
	"signature_blob_key" text,
	"signatory_name" text DEFAULT '' NOT NULL,
	"signatory_title" text DEFAULT '' NOT NULL,
	"fy_start_month" integer DEFAULT 4 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "org_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pipeline_items" (
	"id" text PRIMARY KEY NOT NULL,
	"module" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"stage" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pipeline_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'TODO' NOT NULL,
	"deadline" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "social_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"script" text DEFAULT '' NOT NULL,
	"platform" text NOT NULL,
	"date" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "social_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"assigned_to" text,
	"title" text NOT NULL,
	"details" text,
	"status" text DEFAULT 'TODO' NOT NULL,
	"priority" text DEFAULT 'MEDIUM' NOT NULL,
	"due_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT 'default' NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"blob_key" text NOT NULL,
	"filename" text NOT NULL,
	"mime" text,
	"size" integer,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "companies" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT 'default' NOT NULL,
	"external_id" text,
	"name" text NOT NULL,
	"legal_name" text,
	"gstin" text,
	"state_code" text,
	"address" text,
	"vertical_id" text,
	"website" text,
	"lifecycle" text DEFAULT 'PROSPECT' NOT NULL,
	"owner_id" text,
	"source" text,
	"referrer" text,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT 'default' NOT NULL,
	"external_id" text,
	"company_id" text NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"phone" text,
	"email" text,
	"whatsapp" text,
	"whatsapp_role" text,
	"onboarded" boolean DEFAULT false NOT NULL,
	"approved" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "interactions" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT 'default' NOT NULL,
	"external_id" text,
	"company_id" text NOT NULL,
	"contact_id" text,
	"deal_id" text,
	"type" text NOT NULL,
	"summary" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"next_action" text,
	"next_action_at" timestamp with time zone,
	"next_action_done_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT 'default' NOT NULL,
	"external_id" text,
	"company_id" text,
	"deal_id" text,
	"project_id" text,
	"title" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"location" text,
	"attendees" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meetings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "verticals" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT 'default' NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "verticals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_vertical_id_verticals_id_fk" FOREIGN KEY ("vertical_id") REFERENCES "public"."verticals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_activity_module_created" ON "activity_logs" USING btree ("module","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_freelancers_name" ON "freelancers" USING btree ("freelancer");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_pipeline_items_module_entity" ON "pipeline_items" USING btree ("module","entity_id");--> statement-breakpoint
CREATE INDEX "idx_pipeline_items_module_stage" ON "pipeline_items" USING btree ("module","stage");--> statement-breakpoint
CREATE INDEX "idx_projects_client" ON "projects" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_social_entries_date" ON "social_entries" USING btree ("date");--> statement-breakpoint
CREATE INDEX "idx_tasks_project" ON "tasks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_attachments_entity" ON "attachments" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_companies_org_list" ON "companies" USING btree ("org_id","archived_at","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_companies_org_lifecycle" ON "companies" USING btree ("org_id","lifecycle");--> statement-breakpoint
CREATE INDEX "idx_companies_vertical" ON "companies" USING btree ("vertical_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_companies_org_external" ON "companies" USING btree ("org_id","external_id");--> statement-breakpoint
CREATE INDEX "idx_contacts_company" ON "contacts" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_contacts_org_external" ON "contacts" USING btree ("org_id","external_id");--> statement-breakpoint
CREATE INDEX "idx_interactions_company_at" ON "interactions" USING btree ("company_id","at");--> statement-breakpoint
CREATE INDEX "idx_interactions_contact" ON "interactions" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "idx_interactions_pending_org" ON "interactions" USING btree ("org_id","next_action_at") WHERE "interactions"."next_action_at" is not null and "interactions"."next_action_done_at" is null;--> statement-breakpoint
CREATE INDEX "idx_interactions_pending_company" ON "interactions" USING btree ("company_id","next_action_at") WHERE "interactions"."next_action_at" is not null and "interactions"."next_action_done_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_interactions_org_external" ON "interactions" USING btree ("org_id","external_id");--> statement-breakpoint
CREATE INDEX "idx_meetings_company_at" ON "meetings" USING btree ("company_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_meetings_org_external" ON "meetings" USING btree ("org_id","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_verticals_org_name" ON "verticals" USING btree ("org_id","name");