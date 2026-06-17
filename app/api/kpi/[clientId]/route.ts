import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/guard";
import { getKpi, upsertKpi, KPI_FIELDS, type KpiTargets } from "@/lib/repo";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const { clientId } = await params;
  return NextResponse.json(await getKpi(Number(clientId)));
}

export async function PUT(req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const { clientId } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  // Only accept known KPI fields; coerce to number | null.
  const targets: Partial<KpiTargets> = {};
  for (const f of KPI_FIELDS) {
    if (!(f in body)) continue;
    const v = body[f];
    targets[f] = v === null || v === "" || v === undefined ? null : Number(v);
  }

  await upsertKpi(Number(clientId), targets);
  return NextResponse.json({ ok: true });
}
