CREATE TABLE `patrac_expeditions` (
	`code` text PRIMARY KEY NOT NULL,
	`owner_hash` text NOT NULL,
	`payload` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `patrac_teams` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`token_hash` text NOT NULL,
	`name_key` text NOT NULL,
	`payload` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`code`) REFERENCES `patrac_expeditions`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `patrac_team_token` ON `patrac_teams` (`code`,`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `patrac_team_name` ON `patrac_teams` (`code`,`name_key`);--> statement-breakpoint
CREATE INDEX `patrac_game_teams` ON `patrac_teams` (`code`);