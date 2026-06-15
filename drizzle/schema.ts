import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Clients table - gym and fitness coach clients managed by Max Alding
 */
export const clients = mysqlTable("clients", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  metaAdAccountId: varchar("metaAdAccountId", { length: 128 }),
  contactEmail: varchar("contactEmail", { length: 320 }),
  contactName: varchar("contactName", { length: 255 }),
  notes: text("notes"),
  isActive: int("isActive").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Client = typeof clients.$inferSelect;
export type InsertClient = typeof clients.$inferInsert;

/**
 * KPI targets - per-client target values for each metric
 */
export const kpiTargets = mysqlTable("kpi_targets", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId").notNull(),
  costTarget: decimal("costTarget", { precision: 10, scale: 2 }),
  reachTarget: int("reachTarget"),
  thumbStopRateTarget: decimal("thumbStopRateTarget", { precision: 5, scale: 2 }),
  holdRateTarget: decimal("holdRateTarget", { precision: 5, scale: 2 }),
  frequencyTarget: decimal("frequencyTarget", { precision: 5, scale: 2 }),
  cpmTarget: decimal("cpmTarget", { precision: 10, scale: 2 }),
  linkClicksTarget: int("linkClicksTarget"),
  ctrTarget: decimal("ctrTarget", { precision: 5, scale: 2 }),
  leadsTarget: int("leadsTarget"),
  costPerLeadTarget: decimal("costPerLeadTarget", { precision: 10, scale: 2 }),
  leadRateTarget: decimal("leadRateTarget", { precision: 5, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type KpiTarget = typeof kpiTargets.$inferSelect;
export type InsertKpiTarget = typeof kpiTargets.$inferInsert;
