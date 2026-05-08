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

  const user = await db.getUserByEmail(email);
  if (!user) throw new Error("User not found");

  return user;
}

export const sdk = { authenticateRequest, createSessionToken };
