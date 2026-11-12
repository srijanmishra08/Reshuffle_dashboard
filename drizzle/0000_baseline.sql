CREATE TABLE IF NOT EXISTS `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `allowed_emails` (
	`email` text PRIMARY KEY NOT NULL,
	`org_id` text DEFAULT 'default' NOT NULL,
	`role` text DEFAULT 'MEMBER' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`role` text DEFAULT 'MEMBER' NOT NULL,
	`org_id` text DEFAULT 'default' NOT NULL,
	`freelancer_id` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `activity_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`module` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`metadata` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_activity_module_created` ON `activity_logs` (`module`,`created_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `automation_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`trigger` text NOT NULL,
	`condition_json` text,
	`action_json` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `clients` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`company` text,
	`notes` text,
	`stage` text DEFAULT 'LEAD' NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `freelancers` (
	`id` text PRIMARY KEY NOT NULL,
	`freelancer` text NOT NULL,
	`skill` text,
	`availability` text,
	`project` text,
	`utilization` text,
	`payout` text,
	`performance` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_freelancers_name` ON `freelancers` (`freelancer`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `number_series` (
	`org_id` text DEFAULT 'default' NOT NULL,
	`doc_type` text NOT NULL,
	`fy` text NOT NULL,
	`prefix` text NOT NULL,
	`next_value` integer DEFAULT 1 NOT NULL,
	`padding` integer DEFAULT 3 NOT NULL,
	PRIMARY KEY(`org_id`, `doc_type`, `fy`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `org_settings` (
	`org_id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`legal_name` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`state_code` text DEFAULT '' NOT NULL,
	`gstin` text DEFAULT '' NOT NULL,
	`pan` text DEFAULT '' NOT NULL,
	`bank_details` text DEFAULT '{}' NOT NULL,
	`default_terms` text DEFAULT '' NOT NULL,
	`logo_blob_key` text,
	`signature_blob_key` text,
	`signatory_name` text DEFAULT '' NOT NULL,
	`signatory_title` text DEFAULT '' NOT NULL,
	`fy_start_month` integer DEFAULT 4 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `pipeline_items` (
	`id` text PRIMARY KEY NOT NULL,
	`module` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`title` text NOT NULL,
	`subtitle` text,
	`stage` text NOT NULL,
	`metadata` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_pipeline_items_module_entity` ON `pipeline_items` (`module`,`entity_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_pipeline_items_module_stage` ON `pipeline_items` (`module`,`stage`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'TODO' NOT NULL,
	`deadline` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_projects_client` ON `projects` (`client_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `social_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`script` text DEFAULT '' NOT NULL,
	`platform` text NOT NULL,
	`date` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_social_entries_date` ON `social_entries` (`date`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`assigned_to` text,
	`title` text NOT NULL,
	`details` text,
	`status` text DEFAULT 'TODO' NOT NULL,
	`priority` text DEFAULT 'MEDIUM' NOT NULL,
	`due_date` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_tasks_project` ON `tasks` (`project_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text DEFAULT 'default' NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`blob_key` text NOT NULL,
	`filename` text NOT NULL,
	`mime` text,
	`size` integer,
	`created_by` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_attachments_entity` ON `attachments` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `companies` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text DEFAULT 'default' NOT NULL,
	`external_id` text,
	`name` text NOT NULL,
	`legal_name` text,
	`gstin` text,
	`state_code` text,
	`address` text,
	`vertical_id` text,
	`website` text,
	`lifecycle` text DEFAULT 'PROSPECT' NOT NULL,
	`owner_id` text,
	`source` text,
	`referrer` text,
	`notes` text,
	`archived_at` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`vertical_id`) REFERENCES `verticals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_companies_org_lifecycle` ON `companies` (`org_id`,`lifecycle`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_companies_vertical` ON `companies` (`vertical_id`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_companies_org_external` ON `companies` (`org_id`,`external_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text DEFAULT 'default' NOT NULL,
	`external_id` text,
	`company_id` text NOT NULL,
	`name` text NOT NULL,
	`role` text,
	`phone` text,
	`email` text,
	`whatsapp` text,
	`whatsapp_role` text,
	`onboarded` integer DEFAULT false NOT NULL,
	`approved` integer DEFAULT false NOT NULL,
	`archived_at` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_contacts_company` ON `contacts` (`company_id`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_contacts_org_external` ON `contacts` (`org_id`,`external_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `interactions` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text DEFAULT 'default' NOT NULL,
	`external_id` text,
	`company_id` text NOT NULL,
	`contact_id` text,
	`deal_id` text,
	`type` text NOT NULL,
	`summary` text NOT NULL,
	`at` text NOT NULL,
	`next_action` text,
	`next_action_at` text,
	`next_action_done_at` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_interactions_company_at` ON `interactions` (`company_id`,`at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_interactions_next_action` ON `interactions` (`org_id`,`next_action_at`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_interactions_org_external` ON `interactions` (`org_id`,`external_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `meetings` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text DEFAULT 'default' NOT NULL,
	`external_id` text,
	`company_id` text,
	`deal_id` text,
	`project_id` text,
	`title` text NOT NULL,
	`at` text NOT NULL,
	`location` text,
	`attendees` text DEFAULT '[]' NOT NULL,
	`notes` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_meetings_company_at` ON `meetings` (`company_id`,`at`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_meetings_org_external` ON `meetings` (`org_id`,`external_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `verticals` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text DEFAULT 'default' NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`external_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_verticals_org_name` ON `verticals` (`org_id`,`name`);