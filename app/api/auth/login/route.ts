import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCredentials, createSession } from "@/lib/auth";

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const session = await verifyCredentials(parsed.data.email, parsed.data.password);
  if (!session) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  await createSession(session);
  return NextResponse.json({ ok: true });
}
