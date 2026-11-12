CREATE TABLE `salary_slips` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text DEFAULT 'default' NOT NULL,
	`person_id` text NOT NULL,
	`pay_period` text NOT NULL,
	`pay_date` text,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`earnings_json` text DEFAULT '[]' NOT NULL,
	`deductions_json` text DEFAULT '[]' NOT NULL,
	`gross_paise` integer DEFAULT 0 NOT NULL,
	`deductions_paise` integer DEFAULT 0 NOT NULL,
	`net_paise` integer DEFAULT 0 NOT NULL,
	`number` text,
	`fy` text,
	`issue_key` text,
	`snapshot_json` text,
	`issued_at` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_salary_slips_person` ON `salary_slips` (`person_id`,`pay_period`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_salary_slips_org_number` ON `salary_slips` (`org_id`,`number`);