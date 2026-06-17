import { integer, serial, numeric, pgEnum, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["user", "admin"]);

/**
 * Core user table backing auth flow.
 */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Clients table - gym and fitness coach clients managed by Max Alding
 */
export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  metaAdAccountId: varchar("metaAdAccountId", { length: 128 }),
  contactEmail: varchar("contactEmail", { length: 320 }),
  contactName: varchar("contactName", { length: 255 }),
  notes: text("notes"),
  isActive: integer("isActive").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
});

export type Client = typeof clients.$inferSelect;
export type InsertClient = typeof clients.$inferInsert;

/**
 * KPI targets - per-client target values for each metric
 */
export const kpiTargets = pgTable("kpi_targets", {
  id: serial("id").primaryKey(),
  clientId: integer("clientId").notNull(),
  costTarget: numeric("costTarget", { precision: 10, scale: 2 }),
  reachTarget: integer("reachTarget"),
  thumbStopRateTarget: numeric("thumbStopRateTarget", { precision: 5, scale: 2 }),
  holdRateTarget: numeric("holdRateTarget", { precision: 5, scale: 2 }),
  frequencyTarget: numeric("frequencyTarget", { precision: 5, scale: 2 }),
  cpmTarget: numeric("cpmTarget", { precision: 10, scale: 2 }),
  linkClicksTarget: integer("linkClicksTarget"),
  ctrTarget: numeric("ctrTarget", { precision: 5, scale: 2 }),
  leadsTarget: integer("leadsTarget"),
  costPerLeadTarget: numeric("costPerLeadTarget", { precision: 10, scale: 2 }),
  leadRateTarget: numeric("leadRateTarget", { precision: 5, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date()),
});

export type KpiTarget = typeof kpiTargets.$inferSelect;
export type InsertKpiTarget = typeof kpiTargets.$inferInsert;
