import { NextResponse } from "next/server";
import { getSession, type Session } from "@/lib/auth";

/**
 * For API routes that require a signed-in admin.
 * Returns the session, or a 401 response to return early.
 */
export async function requireAdmin(): Promise<
  { session: Session } | { response: NextResponse }
> {
  const session = await getSession();
  if (!session) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { session };
}
