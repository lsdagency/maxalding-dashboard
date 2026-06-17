import bcrypt from "bcryptjs";
import { eq, asc } from "drizzle-orm";
import { db, dbAvailable, schema } from "./db";

export interface ClientRecord {
  id: number;
  name: string;
  metaAdAccountId: string | null;
}

export const KPI_FIELDS = [
  "costTarget", "reachTarget", "thumbStopRateTarget", "holdRateTarget",
  "frequencyTarget", "cpmTarget", "linkClicksTarget", "ctrTarget",
  "leadsTarget", "costPerLeadTarget", "leadRateTarget",
] as const;
export type KpiField = (typeof KPI_FIELDS)[number];
const KPI_INT_FIELDS: KpiField[] = ["reachTarget", "linkClicksTarget", "leadsTarget"];

export type KpiTargets = Record<KpiField, number | null>;

// ---------- in-memory fallback (local dev without a DB) ----------
const mem = {
  users: [] as { id: number; email: string; name: string; passwordHash: string }[],
  clients: [] as ClientRecord[],
  kpis: {} as Record<number, KpiTargets>,
  seq: 1,
};

function adminSeed() {
  const email = (process.env.ADMIN_EMAIL || "admin@maxalding.local").toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "maxalding-demo";
  return {
    email,
    name: process.env.ADMIN_NAME || "Admin",
    passwordHash: bcrypt.hashSync(password, 10),
  };
}

let bootPromise: Promise<void> | null = null;
function ensureBootstrap() {
  if (!bootPromise) bootPromise = doBootstrap();
  return bootPromise;
}

async function doBootstrap() {
  if (dbAvailable && db) {
    const u = await db.select({ id: schema.users.id }).from(schema.users).limit(1);
    if (u.length === 0) await db.insert(schema.users).values(adminSeed());
    return;
  }
  if (mem.users.length === 0) mem.users.push({ id: mem.seq++, ...adminSeed() });
}

// ---------- auth ----------
export async function verifyLogin(
  email: string,
  password: string,
): Promise<{ email: string; name: string } | null> {
  await ensureBootstrap();
  const e = email.trim().toLowerCase();

  if (dbAvailable && db) {
    const rows = await db.select().from(schema.users).where(eq(schema.users.email, e)).limit(1);
    const row = rows[0];
    if (!row || !bcrypt.compareSync(password, row.passwordHash)) return null;
    return { email: row.email, name: row.name };
  }

  const row = mem.users.find((u) => u.email === e);
  if (!row || !bcrypt.compareSync(password, row.passwordHash)) return null;
  return { email: row.email, name: row.name };
}

// ---------- clients ----------
export async function listClients(): Promise<ClientRecord[]> {
  await ensureBootstrap();
  if (dbAvailable && db) {
    const rows = await db.select().from(schema.clients).orderBy(asc(schema.clients.name));
    return rows.map((r) => ({ id: r.id, name: r.name, metaAdAccountId: r.metaAdAccountId }));
  }
  return [...mem.clients].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getClient(id: number): Promise<ClientRecord | null> {
  await ensureBootstrap();
  if (dbAvailable && db) {
    const rows = await db.select().from(schema.clients).where(eq(schema.clients.id, id)).limit(1);
    const r = rows[0];
    return r ? { id: r.id, name: r.name, metaAdAccountId: r.metaAdAccountId } : null;
  }
  return mem.clients.find((c) => c.id === id) ?? null;
}

export async function createClient(name: string, metaAdAccountId: string | null): Promise<number> {
  await ensureBootstrap();
  if (dbAvailable && db) {
    const rows = await db.insert(schema.clients).values({ name, metaAdAccountId }).returning({ id: schema.clients.id });
    return rows[0].id;
  }
  const id = mem.seq++;
  mem.clients.push({ id, name, metaAdAccountId });
  return id;
}

export async function updateClient(id: number, data: { name?: string; metaAdAccountId?: string | null }): Promise<void> {
  await ensureBootstrap();
  if (dbAvailable && db) {
    await db.update(schema.clients).set({ ...data, updatedAt: new Date() }).where(eq(schema.clients.id, id));
    return;
  }
  const c = mem.clients.find((x) => x.id === id);
  if (c) Object.assign(c, data);
}

export async function deleteClient(id: number): Promise<void> {
  await ensureBootstrap();
  if (dbAvailable && db) {
    await db.delete(schema.kpiTargets).where(eq(schema.kpiTargets.clientId, id));
    await db.delete(schema.clients).where(eq(schema.clients.id, id));
    return;
  }
  mem.clients = mem.clients.filter((c) => c.id !== id);
  delete mem.kpis[id];
}

// ---------- KPI targets ----------
function rowToKpi(row: any): KpiTargets {
  const out = {} as KpiTargets;
  for (const f of KPI_FIELDS) {
    const v = row[f];
    out[f] = v === null || v === undefined ? null : Number(v);
  }
  return out;
}

export async function getKpi(clientId: number): Promise<KpiTargets | null> {
  await ensureBootstrap();
  if (dbAvailable && db) {
    const rows = await db.select().from(schema.kpiTargets).where(eq(schema.kpiTargets.clientId, clientId)).limit(1);
    return rows[0] ? rowToKpi(rows[0]) : null;
  }
  return mem.kpis[clientId] ?? null;
}

export async function upsertKpi(clientId: number, targets: Partial<KpiTargets>): Promise<void> {
  await ensureBootstrap();

  // Build a DB-shaped value object (numeric columns take strings, int columns take numbers).
  const values: Record<string, unknown> = { clientId, updatedAt: new Date() };
  for (const f of KPI_FIELDS) {
    const v = targets[f];
    if (v === undefined) continue;
    if (v === null) { values[f] = null; continue; }
    values[f] = KPI_INT_FIELDS.includes(f) ? Math.round(v) : String(v);
  }

  if (dbAvailable && db) {
    const { clientId: _c, ...setNoClient } = values;
    await db.insert(schema.kpiTargets).values(values as any)
      .onConflictDoUpdate({ target: schema.kpiTargets.clientId, set: setNoClient });
    return;
  }

  const existing = mem.kpis[clientId] ?? ({} as KpiTargets);
  const merged = { ...existing } as KpiTargets;
  for (const f of KPI_FIELDS) {
    if (targets[f] !== undefined) merged[f] = targets[f] ?? null;
    else if (merged[f] === undefined) merged[f] = null;
  }
  mem.kpis[clientId] = merged;
}
