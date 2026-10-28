CREATE TABLE `patrac_creator_games` (
	`code` text PRIMARY KEY NOT NULL,
	`creator_id` text NOT NULL,
	`linked_at` integer NOT NULL,
	FOREIGN KEY (`code`) REFERENCES `patrac_expeditions`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `patrac_creator_games_by_creator` ON `patrac_creator_games` (`creator_id`);