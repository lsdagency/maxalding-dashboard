import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { getConnectionString } from "@netlify/database";
import {
  InsertUser, users,
  clients, InsertClient,
  kpiTargets, InsertKpiTarget,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;
let _schemaReady: Promise<void> | null = null;

// Resolution order (matches the PHYT dashboard):
//   explicit DATABASE_URL  →  NETLIFY_DATABASE_URL env var  →  Netlify DB's
//   runtime resolver (auto-provisions Neon on Netlify; throws off-platform).
// All three are Neon Postgres on the same driver.
function connectionString(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.NETLIFY_DATABASE_URL) return process.env.NETLIFY_DATABASE_URL;
  try {
    const cs = getConnectionString();
    if (typeof cs === "string" && cs.length > 0) return cs;
  } catch {
    // Not running on Netlify — no database configured.
  }
  return undefined;
}

/**
 * Create the schema if it doesn't exist yet. Idempotent (IF NOT EXISTS), runs
 * once per cold start, and never throws — so a fresh database self-initialises
 * on first use without any manual migration step.
 */
async function ensureSchema(sql: any): Promise<void> {
  try {
    await sql`DO $$ BEGIN CREATE TYPE "role" AS ENUM ('user','admin'); EXCEPTION WHEN duplicate_object THEN null; END $$;`;
    await sql`CREATE TABLE IF NOT EXISTS "clients" (
      "id" serial PRIMARY KEY NOT NULL,
      "name" varchar(255) NOT NULL,
      "metaAdAccountId" varchar(128),
      "contactEmail" varchar(320),
      "contactName" varchar(255),
      "notes" text,
      "isActive" integer DEFAULT 1 NOT NULL,
      "createdAt" timestamp DEFAULT now() NOT NULL,
      "updatedAt" timestamp DEFAULT now() NOT NULL
    );`;
    await sql`CREATE TABLE IF NOT EXISTS "kpi_targets" (
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
    );`;
    await sql`CREATE TABLE IF NOT EXISTS "users" (
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
    );`;
  } catch (error) {
    console.warn("[Database] ensureSchema skipped/failed (tables may already exist):", error);
  }
}

export async function getDb() {
  if (!_db) {
    const url = connectionString();
    if (url) {
      try {
        const sql = neon(url);
        _db = drizzle(sql);
        _schemaReady = ensureSchema(sql);
      } catch (error) {
        console.warn("[Database] Failed to connect:", error);
        _db = null;
      }
    }
  }
  if (_schemaReady) await _schemaReady;
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

    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
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
  const result = await db.insert(clients).values(data).returning({ id: clients.id });
  return result[0].id;
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
