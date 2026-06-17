import {
  pgTable,
  serial,
  varchar,
  text,
  integer,
  numeric,
  timestamp,
} from "drizzle-orm/pg-core";

/** Dashboard accounts. Single admin (the agency) seeded from env on first run. */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: varchar("name", { length: 120 }).notNull().default(""),
  role: varchar("role", { length: 16 }).notNull().default("admin"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Clients whose Meta Ads performance is tracked. Metrics themselves are live (never stored). */
export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  metaAdAccountId: varchar("meta_ad_account_id", { length: 128 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Per-client KPI targets for each metric. */
export const kpiTargets = pgTable("kpi_targets", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().unique(),
  costTarget: numeric("cost_target"),
  reachTarget: integer("reach_target"),
  thumbStopRateTarget: numeric("thumb_stop_rate_target"),
  holdRateTarget: numeric("hold_rate_target"),
  frequencyTarget: numeric("frequency_target"),
  cpmTarget: numeric("cpm_target"),
  linkClicksTarget: integer("link_clicks_target"),
  ctrTarget: numeric("ctr_target"),
  leadsTarget: integer("leads_target"),
  costPerLeadTarget: numeric("cost_per_lead_target"),
  leadRateTarget: numeric("lead_rate_target"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
