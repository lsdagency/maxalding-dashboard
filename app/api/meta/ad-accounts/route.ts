import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/guard";
import { fetchAdAccounts } from "@/lib/meta";

export const dynamic = "force-dynamic";

/** List ad accounts from the connected Business Manager (for the client form dropdown). */
export async function GET() {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const token = process.env.META_ACCESS_TOKEN;
  if (!token) return NextResponse.json({ error: "Meta access token not configured" }, { status: 412 });

  try {
    return NextResponse.json(await fetchAdAccounts(token));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
