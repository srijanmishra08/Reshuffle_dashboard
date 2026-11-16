CREATE TABLE "project_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text DEFAULT 'default' NOT NULL,
	"project_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'TODO' NOT NULL,
	"priority" text DEFAULT 'NONE' NOT NULL,
	"due_date" text,
	"budget_paise" integer DEFAULT 0 NOT NULL,
	"assignee_id" text,
	"position" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_project_id_delivery_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."delivery_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_assignee_id_freelancers_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."freelancers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_project_tasks_project" ON "project_tasks" USING btree ("project_id","status","position");--> statement-breakpoint
CREATE INDEX "idx_project_tasks_assignee" ON "project_tasks" USING btree ("assignee_id");