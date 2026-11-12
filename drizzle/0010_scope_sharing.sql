CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `scope_acceptances` (
	`id` text PRIMARY KEY NOT NULL,
	`scope_id` text NOT NULL,
	`share_id` text NOT NULL,
	`typed_name` text NOT NULL,
	`ip` text,
	`user_agent` text,
	`accepted_at` text NOT NULL,
	FOREIGN KEY (`scope_id`) REFERENCES `scopes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`share_id`) REFERENCES `scope_shares`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_scope_acceptances_scope` ON `scope_acceptances` (`scope_id`);--> statement-breakpoint
CREATE TABLE `scope_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text DEFAULT 'default' NOT NULL,
	`scope_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`created_by` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`scope_id`) REFERENCES `scopes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_scope_shares_hash` ON `scope_shares` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_scope_shares_scope` ON `scope_shares` (`scope_id`);