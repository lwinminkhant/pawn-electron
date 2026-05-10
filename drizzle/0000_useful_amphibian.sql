CREATE TABLE `cash_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` integer DEFAULT (unixepoch()),
	`type` text NOT NULL,
	`amount` integer NOT NULL,
	`discount` integer DEFAULT 0,
	`description` text,
	`pawn_fk` integer NOT NULL,
	`employee_fk` integer,
	FOREIGN KEY (`pawn_fk`) REFERENCES `pawns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`employee_fk`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`address` text NOT NULL,
	`phone` text,
	`description` text
);
--> statement-breakpoint
CREATE TABLE `employees` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`user_name` text NOT NULL,
	`password` text NOT NULL,
	`level` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employees_user_name_unique` ON `employees` (`user_name`);--> statement-breakpoint
CREATE TABLE `items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`status` text NOT NULL,
	`description` text,
	`type` text NOT NULL,
	`gross_weight` real,
	`net_weight` real,
	`jewellery_type` text,
	`daily_serial` integer,
	`store_index` text,
	`number` integer,
	`item_other_type` text
);
--> statement-breakpoint
CREATE TABLE `pawns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`interest_rate` real,
	`max_available_amount` integer,
	`description` text,
	`customer_fk` integer NOT NULL,
	`item_fk` integer,
	FOREIGN KEY (`customer_fk`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`item_fk`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `voucher_log_losts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reason` text,
	`date` integer,
	`voucher_log_fk` integer NOT NULL,
	FOREIGN KEY (`voucher_log_fk`) REFERENCES `voucher_logs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `voucher_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`status` text NOT NULL,
	`print_count` integer NOT NULL,
	`print_date` integer,
	`note` text,
	`pawn_fk` integer NOT NULL,
	FOREIGN KEY (`pawn_fk`) REFERENCES `pawns`(`id`) ON UPDATE no action ON DELETE cascade
);
