CREATE TYPE "public"."role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"metaAdAccountId" varchar(128),
	"contactEmail" varchar(320),
	"contactName" varchar(255),
	"notes" text,
	"isActive" integer DEFAULT 1 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kpi_targets" (
	"id" serial PRIMARY KEY NOT NULL,
	"clientId" integer NOT NULL,
	"costTarget" numeric(10, 2),
	"reachTarget" integer,
	"thumbStopRateTarget" numeric(5, 2),
	"holdRateTarget" numeric(5, 2),
	"frequencyTarget" numeric(5, 2),
	"cpmTarget" numeric(10, 2),
	"linkClicksTarget" integer,
	"ctrTarget" numeric(5, 2),
	"leadsTarget" integer,
	"costPerLeadTarget" numeric(10, 2),
	"leadRateTarget" numeric(5, 2),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
