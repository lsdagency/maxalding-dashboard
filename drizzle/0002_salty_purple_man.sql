CREATE TABLE `kpi_targets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clientId` int NOT NULL,
	`costTarget` decimal(10,2),
	`reachTarget` int,
	`thumbStopRateTarget` decimal(5,2),
	`holdRateTarget` decimal(5,2),
	`frequencyTarget` decimal(5,2),
	`cpmTarget` decimal(10,2),
	`linkClicksTarget` int,
	`ctrTarget` decimal(5,2),
	`leadsTarget` int,
	`costPerLeadTarget` decimal(10,2),
	`leadRateTarget` decimal(5,2),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `kpi_targets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `metrics_snapshots` MODIFY COLUMN `periodStart` varchar(10) NOT NULL;--> statement-breakpoint
ALTER TABLE `metrics_snapshots` MODIFY COLUMN `periodEnd` varchar(10) NOT NULL;