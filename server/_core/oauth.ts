import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { ENV } from "./env";
import { getSessionCookieOptions } from "./cookies";
import { createSessionToken } from "./sdk";

export function registerOAuthRoutes(app: Express) {
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const { email, password } = req.body ?? {};

    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }

    if (
      email.trim().toLowerCase() !== ENV.adminEmail.trim().toLowerCase() ||
      password !== ENV.adminPassword
    ) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    try {
      const token = await createSessionToken(email.trim().toLowerCase());
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.json({ success: true });

      // Best-effort DB upsert — don't let it block or fail the login
      db.upsertUser({
        openId: email.trim().toLowerCase(),
        name: "Admin",
        email: email.trim().toLowerCase(),
        loginMethod: "password",
        role: "admin",
        lastSignedIn: new Date(),
      }).catch((err) => console.warn("[Auth] upsertUser failed (non-fatal):", err));
    } catch (error) {
      console.error("[Auth] Login failed", error);
      res.status(500).json({ error: "Login failed" });
    }
  });
}
