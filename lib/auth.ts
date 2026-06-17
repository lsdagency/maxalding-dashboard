import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/constants";
import { verifyLogin } from "@/lib/repo";

export type Role = "admin";

export interface Session {
  email: string;
  role: Role;
  name: string;
}

export { SESSION_COOKIE };
const THIRTY_DAYS = 60 * 60 * 24 * 30;

function secret() {
  return new TextEncoder().encode(
    process.env.JWT_SECRET || "maxalding-dev-secret-change-me",
  );
}

/** True when no admin password is set — running on demo credentials. */
export function isDemoMode() {
  return !process.env.ADMIN_PASSWORD;
}

export function demoCredentials() {
  return { email: process.env.ADMIN_EMAIL || "admin@maxalding.local", password: "maxalding-demo" };
}

export async function verifyCredentials(
  email: string,
  password: string,
): Promise<Session | null> {
  const user = await verifyLogin(email, password);
  if (!user) return null;
  return { email: user.email, role: "admin", name: user.name };
}

export async function createSession(session: Session) {
  const token = await new SignJWT({ role: session.role, name: session.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.email)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: THIRTY_DAYS,
  });
}

export async function clearSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      email: String(payload.sub),
      role: (payload.role as Role) ?? "admin",
      name: String(payload.name),
    };
  } catch {
    return null;
  }
}
