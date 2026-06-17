import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/guard";
import { getClient } from "@/lib/repo";
import { buildComparison } from "@/lib/meta";
import { rangeFromInput } from "@/lib/metrics";

export const dynamic = "force-dynamic";

/** Live metrics for a single client over the requested range. */
export async function GET(req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const { clientId } = await params;
  const client = await getClient(Number(clientId));
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const token = process.env.META_ACCESS_TOKEN;
  const { searchParams } = new URL(req.url);
  const { thisStart, thisEnd } = rangeFromInput(searchParams.get("start"), searchParams.get("end"));

  if (!client.metaAdAccountId) return NextResponse.json({ client, metrics: null });
  if (!token) return NextResponse.json({ error: "Meta access token not configured" }, { status: 412 });

  try {
    const metrics = await buildComparison(client.metaAdAccountId, token, thisStart, thisEnd);
    return NextResponse.json({ client, metrics });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
