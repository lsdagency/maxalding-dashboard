import { COOKIE_NAME } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import * as db from "../db";
import { ENV } from "./env";

const getSecret = () =>
  new TextEncoder().encode(ENV.cookieSecret || "please-set-jwt-secret-in-env");

export async function createSessionToken(email: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1y")
    .sign(getSecret());
}

export async function authenticateRequest(req: Request) {
  const cookies = parseCookieHeader(req.headers.cookie || "");
  const token = cookies[COOKIE_NAME];
  if (!token) throw new Error("No session");

  const { payload } = await jwtVerify(token, getSecret());
  const email = payload.email as string;
  if (!email) throw new Error("Invalid session");

  // Try DB first; fall back to synthetic admin user so auth works before tables exist
  const dbUser = await db.getUserByEmail(email).catch(() => null);
  if (dbUser) return dbUser;

  if (email.toLowerCase() === ENV.adminEmail.trim().toLowerCase()) {
    const now = new Date();
    return {
      id: 1,
      email,
      name: "Admin",
      role: "admin" as const,
      openId: email,
      loginMethod: "password",
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
    };
  }

  throw new Error("User not found");
}

export const sdk = { authenticateRequest, createSessionToken };
