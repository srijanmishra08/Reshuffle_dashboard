CREATE TABLE `credit_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text DEFAULT 'default' NOT NULL,
	`invoice_id` text NOT NULL,
	`number` text NOT NULL,
	`fy` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`reason` text NOT NULL,
	`issued_at` text NOT NULL,
	`created_by` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_credit_notes_invoice` ON `credit_notes` (`invoice_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_credit_notes_org_number` ON `credit_notes` (`org_id`,`number`);--> statement-breakpoint
CREATE TABLE `invoice_items` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`description` text NOT NULL,
	`sac_code` text,
	`quantity` integer DEFAULT 1 NOT NULL,
	`rate_paise` integer DEFAULT 0 NOT NULL,
	`amount_paise` integer DEFAULT 0 NOT NULL,
	`taxable` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_invoice_items_invoice` ON `invoice_items` (`invoice_id`,`position`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text DEFAULT 'default' NOT NULL,
	`company_id` text NOT NULL,
	`deal_id` text,
	`project_id` text,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`number` text,
	`fy` text,
	`issue_date` text,
	`due_date` text,
	`place_of_supply` text DEFAULT '' NOT NULL,
	`tax_mode` text DEFAULT 'INTRA' NOT NULL,
	`rate_bps` integer DEFAULT 1800 NOT NULL,
	`subtotal_paise` integer DEFAULT 0 NOT NULL,
	`cgst_paise` integer DEFAULT 0 NOT NULL,
	`sgst_paise` integer DEFAULT 0 NOT NULL,
	`igst_paise` integer DEFAULT 0 NOT NULL,
	`round_off_paise` integer DEFAULT 0 NOT NULL,
	`total_paise` integer DEFAULT 0 NOT NULL,
	`paid_paise` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`terms` text,
	`issue_key` text,
	`snapshot_json` text,
	`issued_at` text,
	`overdue_at` text,
	`cancelled_at` text,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_invoices_org_status` ON `invoices` (`org_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_invoices_company` ON `invoices` (`company_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_invoices_org_number` ON `invoices` (`org_id`,`number`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text DEFAULT 'default' NOT NULL,
	`invoice_id` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`paid_at` text NOT NULL,
	`method` text DEFAULT 'BANK_TRANSFER' NOT NULL,
	`reference` text,
	`created_by` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_payments_invoice` ON `payments` (`invoice_id`);