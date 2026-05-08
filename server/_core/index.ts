import "dotenv/config";
// Node 18 doesn't expose Web Crypto as a global — jose v6 requires it
import { webcrypto } from "crypto";
if (!globalThis.crypto) (globalThis as any).crypto = webcrypto;
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  registerOAuthRoutes(app);

  // Scheduled endpoint for automated weekly email reports
  app.post("/api/scheduled/send-weekly-reports", async (req, res) => {
    // Protect with a shared secret so only Railway cron can trigger it
    const secret = req.headers["x-cron-secret"];
    if (!secret || secret !== process.env.CRON_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const {
        getAllEmailConfigs, getClientById, getLatestMetricsForClient,
        createEmailLog, updateEmailLogStatus, getKpiTargetsForClient,
      } = await import("../db");
      const { generateWeeklyReportEmail, generatePerformanceSummary, sendEmail } = await import("../emailService");
      const { calculateWoWChange } = await import("../metaAds");

      const configs = await getAllEmailConfigs();
      const results = [];

      for (const config of configs) {
        const client = await getClientById(config.clientId);
        if (!client) continue;

        const snapshots = await getLatestMetricsForClient(config.clientId);
        if (snapshots.length === 0) {
          results.push({ clientId: config.clientId, success: false, error: "No metrics" });
          continue;
        }

        const toMetrics = (s: any) => ({
          cost: s.cost ? parseFloat(s.cost) : null,
          reach: s.reach,
          thumbStopRate: s.thumbStopRate ? parseFloat(s.thumbStopRate) : null,
          holdRate: s.holdRate ? parseFloat(s.holdRate) : null,
          frequency: s.frequency ? parseFloat(s.frequency) : null,
          cpm: s.cpm ? parseFloat(s.cpm) : null,
          linkClicks: s.linkClicks,
          ctr: s.ctr ? parseFloat(s.ctr) : null,
          leads: s.leads,
          costPerLead: s.costPerLead ? parseFloat(s.costPerLead) : null,
          leadRate: s.leadRate ? parseFloat(s.leadRate) : null,
        });

        const thisWeek = toMetrics(snapshots[0]);
        const lastWeek = snapshots.length > 1 ? toMetrics(snapshots[1]) : {
          cost: null, reach: null, thumbStopRate: null, holdRate: null, frequency: null,
          cpm: null, linkClicks: null, ctr: null, leads: null, costPerLead: null, leadRate: null,
        };

        const wowChange: any = {};
        for (const key of Object.keys(thisWeek)) {
          wowChange[key] = calculateWoWChange((thisWeek as any)[key], (lastWeek as any)[key]);
        }

        const metricsComparison = { thisWeek, lastWeek, wowChange };
        const periodStart = String(snapshots[0].periodStart);
        const periodEnd = String(snapshots[0].periodEnd);

        const [aiSummary, kpiTargetsRow] = await Promise.all([
          generatePerformanceSummary(client.name, metricsComparison, periodStart, periodEnd),
          getKpiTargetsForClient(config.clientId),
        ]);

        const kpiTargets = kpiTargetsRow ? {
          cost: kpiTargetsRow.costTarget != null ? parseFloat(kpiTargetsRow.costTarget) : null,
          reach: kpiTargetsRow.reachTarget ?? null,
          thumbStopRate: kpiTargetsRow.thumbStopRateTarget != null ? parseFloat(kpiTargetsRow.thumbStopRateTarget) : null,
          holdRate: kpiTargetsRow.holdRateTarget != null ? parseFloat(kpiTargetsRow.holdRateTarget) : null,
          frequency: kpiTargetsRow.frequencyTarget != null ? parseFloat(kpiTargetsRow.frequencyTarget) : null,
          cpm: kpiTargetsRow.cpmTarget != null ? parseFloat(kpiTargetsRow.cpmTarget) : null,
          linkClicks: kpiTargetsRow.linkClicksTarget ?? null,
          ctr: kpiTargetsRow.ctrTarget != null ? parseFloat(kpiTargetsRow.ctrTarget) : null,
          leads: kpiTargetsRow.leadsTarget ?? null,
          costPerLead: kpiTargetsRow.costPerLeadTarget != null ? parseFloat(kpiTargetsRow.costPerLeadTarget) : null,
          leadRate: kpiTargetsRow.leadRateTarget != null ? parseFloat(kpiTargetsRow.leadRateTarget) : null,
        } : null;

        const html = generateWeeklyReportEmail(
          client.name,
          metricsComparison,
          aiSummary || null,
          periodStart,
          periodEnd,
          kpiTargets
        );

        const subject = `${client.name} — Weekly Performance Report | ${periodStart} to ${periodEnd}`;

        const logId = await createEmailLog({
          clientId: config.clientId,
          recipientEmail: config.recipientEmail,
          subject,
          status: "pending",
        });

        const success = await sendEmail({ to: config.recipientEmail, subject, html });
        if (success) {
          await updateEmailLogStatus(logId, "sent");
          results.push({ clientId: config.clientId, success: true });
        } else {
          await updateEmailLogStatus(logId, "failed", "Delivery failed");
          results.push({ clientId: config.clientId, success: false, error: "Delivery failed" });
        }
      }

      res.json({ success: true, results });
    } catch (error: any) {
      console.error("[Scheduled] Weekly report error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
