import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/guard";
import { listClients, createClient } from "@/lib/repo";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  return NextResponse.json(await listClients());
}

const CreateBody = z.object({
  name: z.string().min(1),
  metaAdAccountId: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const parsed = CreateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const id = await createClient(parsed.data.name, parsed.data.metaAdAccountId || null);
  return NextResponse.json({ id });
}
