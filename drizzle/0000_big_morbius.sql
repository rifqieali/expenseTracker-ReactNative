CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`icon` text DEFAULT '💸' NOT NULL,
	`kind` text DEFAULT 'expense' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_unique` ON `categories` (`name`);--> statement-breakpoint
CREATE TABLE `pockets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`icon` text DEFAULT '💰' NOT NULL,
	`color` text DEFAULT '#2F80ED' NOT NULL,
	`balance` real DEFAULT 0 NOT NULL,
	`budget_limit` real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pockets_name_unique` ON `pockets` (`name`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pocket_id` integer NOT NULL,
	`type` text NOT NULL,
	`amount` real NOT NULL,
	`category` text DEFAULT 'Lainnya' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`date` integer NOT NULL,
	FOREIGN KEY (`pocket_id`) REFERENCES `pockets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_tx_date` ON `transactions` (`date`);--> statement-breakpoint
CREATE INDEX `idx_tx_pocket` ON `transactions` (`pocket_id`);