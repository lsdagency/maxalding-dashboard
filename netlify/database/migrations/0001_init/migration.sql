CREATE TABLE IF NOT EXISTS "users" (
  "id" serial PRIMARY KEY NOT NULL,
  "email" varchar(255) NOT NULL UNIQUE,
  "password_hash" text NOT NULL,
  "name" varchar(120) NOT NULL DEFAULT '',
  "role" varchar(16) NOT NULL DEFAULT 'admin',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "clients" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" varchar(255) NOT NULL,
  "meta_ad_account_id" varchar(128),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "kpi_targets" (
  "id" serial PRIMARY KEY NOT NULL,
  "client_id" integer NOT NULL UNIQUE,
  "cost_target" numeric,
  "reach_target" integer,
  "thumb_stop_rate_target" numeric,
  "hold_rate_target" numeric,
  "frequency_target" numeric,
  "cpm_target" numeric,
  "link_clicks_target" integer,
  "ctr_target" numeric,
  "leads_target" integer,
  "cost_per_lead_target" numeric,
  "lead_rate_target" numeric,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
