// Node 18 doesn't expose Web Crypto as a global — jose v6 requires it
import { webcrypto } from "crypto";
if (!globalThis.crypto) (globalThis as any).crypto = webcrypto;

import express, { type Express } from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";

/**
 * Build the Express app with all API routes mounted.
 * Shared by the local dev server (server/_core/index.ts) and the
 * Netlify Function wrapper (netlify/functions/server.ts).
 * Static asset serving is intentionally NOT included here — locally that's
 * handled by Vite/serveStatic, and on Netlify by the CDN.
 */
export function createApp(): Express {
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

  registerOAuthRoutes(app);

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  return app;
}
