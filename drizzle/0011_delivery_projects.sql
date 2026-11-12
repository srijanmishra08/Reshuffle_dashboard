CREATE TABLE `delivery_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text DEFAULT 'default' NOT NULL,
	`company_id` text NOT NULL,
	`deal_id` text,
	`scope_id` text,
	`name` text NOT NULL,
	`status` text DEFAULT 'PLANNED' NOT NULL,
	`budget_paise` integer DEFAULT 0 NOT NULL,
	`start_date` text,
	`due_date` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`scope_id`) REFERENCES `scopes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_delivery_projects_org_status` ON `delivery_projects` (`org_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_delivery_projects_company` ON `delivery_projects` (`company_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_delivery_projects_deal` ON `delivery_projects` (`org_id`,`deal_id`);--> statement-breakpoint
CREATE TABLE `project_milestones` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`label` text NOT NULL,
	`percent` integer DEFAULT 0 NOT NULL,
	`amount_paise` integer DEFAULT 0 NOT NULL,
	`due_date` text,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`invoice_id` text,
	`completed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `delivery_projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_project_milestones_project` ON `project_milestones` (`project_id`,`position`);