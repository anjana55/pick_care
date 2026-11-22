CREATE TABLE `agreement_acceptances` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`kind` enum('CLIENT_SERVICE','CAREGIVER_SERVICE') NOT NULL,
	`version` varchar(32) NOT NULL,
	`locale` varchar(8),
	`accepted_at` datetime NOT NULL,
	`ip_address` varchar(64),
	CONSTRAINT `agreement_acceptances_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `signup_identities` (
	`id` varchar(36) NOT NULL,
	`side` enum('client','caregiver') NOT NULL,
	`method` enum('WHATSAPP','EMAIL','GOOGLE','MICROSOFT','FACEBOOK') NOT NULL,
	`phone` varchar(32),
	`provider_account_id` varchar(255),
	`provider_email` varchar(255),
	`provider_name` varchar(255),
	`ticket_hash` varchar(64),
	`expires_at` datetime NOT NULL,
	`used_at` datetime,
	`code_hash` varchar(64),
	`code_challenge` varchar(64),
	`code_expires_at` datetime,
	`code_used_at` datetime,
	`user_id` varchar(36),
	`created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `signup_identities_id` PRIMARY KEY(`id`),
	CONSTRAINT `signup_identities_ticket_idx` UNIQUE(`ticket_hash`)
);
--> statement-breakpoint
ALTER TABLE `branding_settings` ADD `office_phone` varchar(32);--> statement-breakpoint
CREATE INDEX `agreement_acceptances_user_idx` ON `agreement_acceptances` (`user_id`);--> statement-breakpoint
CREATE INDEX `signup_identities_code_idx` ON `signup_identities` (`code_hash`);--> statement-breakpoint
CREATE INDEX `signup_identities_expires_idx` ON `signup_identities` (`expires_at`);