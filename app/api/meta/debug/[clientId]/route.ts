import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/guard";
import { getClient } from "@/lib/repo";
import { fetchRawInsights } from "@/lib/meta";
import { rangeFromInput } from "@/lib/metrics";

export const dynamic = "force-dynamic";

/** Diagnostic: raw Meta action types for a client/range (to map "Results" correctly). */
export async function GET(req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const { clientId } = await params;
  const client = await getClient(Number(clientId));
  if (!client?.metaAdAccountId) return NextResponse.json({ error: "No ad account" }, { status: 404 });

  const token = process.env.META_ACCESS_TOKEN;
  if (!token) return NextResponse.json({ error: "No token" }, { status: 412 });

  const { searchParams } = new URL(req.url);
  const { thisStart, thisEnd } = rangeFromInput(searchParams.get("start"), searchParams.get("end"));

  try {
    const raw = await fetchRawInsights(client.metaAdAccountId, token, thisStart, thisEnd);
    return NextResponse.json({ client: client.name, range: { start: thisStart, end: thisEnd }, raw });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
