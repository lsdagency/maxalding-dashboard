import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/guard";
import { listClients } from "@/lib/repo";
import { buildComparison } from "@/lib/meta";
import { rangeFromInput } from "@/lib/metrics";

export const dynamic = "force-dynamic";

/** Live metrics for all clients over the requested range (default: last Mon–Sun). */
export async function GET(req: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const token = process.env.META_ACCESS_TOKEN;
  const { searchParams } = new URL(req.url);
  const { thisStart, thisEnd } = rangeFromInput(searchParams.get("start"), searchParams.get("end"));

  const clients = await listClients();
  const results = await Promise.all(
    clients.map(async (c) => {
      if (!c.metaAdAccountId || !token) return { ...c, metrics: null };
      try {
        const metrics = await buildComparison(c.metaAdAccountId, token, thisStart, thisEnd);
        return { ...c, metrics };
      } catch {
        return { ...c, metrics: null };
      }
    }),
  );

  return NextResponse.json({ clients: results, range: { start: thisStart, end: thisEnd } });
}
