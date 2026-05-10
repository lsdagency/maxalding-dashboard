import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, date, char, uniqueIndex } from "drizzle-orm/mysql-core";

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
 * Metrics snapshots - stores weekly performance data per client
 */
export const metricsSnapshots = mysqlTable("metrics_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId").notNull(),
  periodStart: varchar("periodStart", { length: 10 }).notNull(),
  periodEnd: varchar("periodEnd", { length: 10 }).notNull(),
  cost: decimal("cost", { precision: 10, scale: 2 }),
  reach: int("reach"),
  thumbStopRate: decimal("thumbStopRate", { precision: 5, scale: 2 }),
  holdRate: decimal("holdRate", { precision: 5, scale: 2 }),
  frequency: decimal("frequency", { precision: 5, scale: 2 }),
  cpm: decimal("cpm", { precision: 10, scale: 2 }),
  linkClicks: int("linkClicks"),
  ctr: decimal("ctr", { precision: 5, scale: 2 }),
  leads: int("leads"),
  costPerLead: decimal("costPerLead", { precision: 10, scale: 2 }),
  leadRate: decimal("leadRate", { precision: 5, scale: 2 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => ({
  clientPeriodUnique: uniqueIndex("client_period_unique").on(t.clientId, t.periodStart, t.periodEnd),
}));

export type MetricsSnapshot = typeof metricsSnapshots.$inferSelect;
export type InsertMetricsSnapshot = typeof metricsSnapshots.$inferInsert;

/**
 * Email configurations - per-client email settings
 */
export const emailConfigs = mysqlTable("email_configs", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId").notNull(),
  recipientEmail: varchar("recipientEmail", { length: 320 }).notNull(),
  recipientName: varchar("recipientName", { length: 255 }),
  personalizedMessage: text("personalizedMessage"),
  datePreset: varchar("datePreset", { length: 32 }).default("past_7").notNull(),
  isActive: int("isActive").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type EmailConfig = typeof emailConfigs.$inferSelect;
export type InsertEmailConfig = typeof emailConfigs.$inferInsert;

/**
 * Email logs - tracks sent emails
 */
export const emailLogs = mysqlTable("email_logs", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId").notNull(),
  recipientEmail: varchar("recipientEmail", { length: 320 }).notNull(),
  subject: varchar("subject", { length: 500 }),
  status: mysqlEnum("status", ["sent", "failed", "pending"]).default("pending").notNull(),
  errorMessage: text("errorMessage"),
  sentAt: timestamp("sentAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type EmailLog = typeof emailLogs.$inferSelect;
export type InsertEmailLog = typeof emailLogs.$inferInsert;

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
