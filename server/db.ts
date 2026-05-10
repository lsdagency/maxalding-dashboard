import { eq, and, desc, gte, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users,
  clients, InsertClient,
  metricsSnapshots, InsertMetricsSnapshot,
  emailConfigs, InsertEmailConfig,
  emailLogs, InsertEmailLog,
  kpiTargets, InsertKpiTarget,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ==================== USER QUERIES ====================

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ==================== CLIENT QUERIES ====================

export async function getAllClients() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(clients).orderBy(clients.name);
}

export async function getActiveClients() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(clients).where(eq(clients.isActive, 1)).orderBy(clients.name);
}

export async function getClientById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createClient(data: Omit<InsertClient, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(clients).values(data);
  return result[0].insertId;
}

export async function updateClient(id: number, data: Partial<InsertClient>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(clients).set(data).where(eq(clients.id, id));
}

export async function deleteClient(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(clients).set({ isActive: 0 }).where(eq(clients.id, id));
}

// ==================== METRICS QUERIES ====================

export async function getMetricsForClient(clientId: number, periodStart?: string, periodEnd?: string) {
  const db = await getDb();
  if (!db) return [];

  let query = db.select().from(metricsSnapshots).where(eq(metricsSnapshots.clientId, clientId));

  return db.select().from(metricsSnapshots)
    .where(eq(metricsSnapshots.clientId, clientId))
    .orderBy(desc(metricsSnapshots.periodEnd));
}

export async function getLatestMetricsForClient(clientId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(metricsSnapshots)
    .where(eq(metricsSnapshots.clientId, clientId))
    .orderBy(desc(metricsSnapshots.periodEnd))
    .limit(2);
}

export async function getSnapshotByPeriod(clientId: number, periodStart: string, periodEnd: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(metricsSnapshots)
    .where(and(
      eq(metricsSnapshots.clientId, clientId),
      eq(metricsSnapshots.periodStart, periodStart),
      eq(metricsSnapshots.periodEnd, periodEnd),
    ))
    .limit(1);
  return rows[0] ?? null;
}

export async function createMetricsSnapshot(data: Omit<InsertMetricsSnapshot, "id" | "createdAt">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { clientId, periodStart, periodEnd, ...metrics } = data;
  await db.insert(metricsSnapshots).values(data).onDuplicateKeyUpdate({ set: metrics });
  const existing = await db.select({ id: metricsSnapshots.id })
    .from(metricsSnapshots)
    .where(and(eq(metricsSnapshots.clientId, clientId), eq(metricsSnapshots.periodStart, periodStart), eq(metricsSnapshots.periodEnd, periodEnd)))
    .limit(1);
  return existing[0]?.id ?? 0;
}

// ==================== KPI TARGETS QUERIES ====================

export async function getKpiTargetsForClient(clientId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(kpiTargets).where(eq(kpiTargets.clientId, clientId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function upsertKpiTargets(clientId: number, data: Partial<Omit<InsertKpiTarget, "id" | "clientId" | "createdAt" | "updatedAt">>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const existing = await getKpiTargetsForClient(clientId);
  if (existing) {
    await db.update(kpiTargets).set(data).where(eq(kpiTargets.clientId, clientId));
  } else {
    await db.insert(kpiTargets).values({ clientId, ...data });
  }
}

// ==================== EMAIL CONFIG QUERIES ====================

export async function getEmailConfigsForClient(clientId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(emailConfigs).where(eq(emailConfigs.clientId, clientId));
}

export async function getAllEmailConfigs() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(emailConfigs).where(eq(emailConfigs.isActive, 1));
}

export async function createEmailConfig(data: Omit<InsertEmailConfig, "id" | "createdAt" | "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(emailConfigs).values(data);
  return result[0].insertId;
}

export async function updateEmailConfig(id: number, data: Partial<InsertEmailConfig>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(emailConfigs).set(data).where(eq(emailConfigs.id, id));
}

export async function deleteEmailConfig(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(emailConfigs).set({ isActive: 0 }).where(eq(emailConfigs.id, id));
}

// ==================== EMAIL LOG QUERIES ====================

export async function getEmailLogs(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(emailLogs).orderBy(desc(emailLogs.createdAt)).limit(limit);
}

export async function getEmailLogsForClient(clientId: number, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(emailLogs)
    .where(eq(emailLogs.clientId, clientId))
    .orderBy(desc(emailLogs.createdAt))
    .limit(limit);
}

export async function createEmailLog(data: Omit<InsertEmailLog, "id" | "createdAt">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(emailLogs).values(data);
  return result[0].insertId;
}

export async function updateEmailLogStatus(id: number, status: "sent" | "failed", errorMessage?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(emailLogs).set({
    status,
    errorMessage: errorMessage || null,
    sentAt: status === "sent" ? new Date() : undefined,
  }).where(eq(emailLogs.id, id));
}
