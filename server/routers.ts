import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  getAllClients,
  getActiveClients,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
  getLatestMetricsForClient,
  getSnapshotByPeriod,
  getMetricsForClient,
  createMetricsSnapshot,
  getEmailConfigsForClient,
  getAllEmailConfigs,
  createEmailConfig,
  updateEmailConfig,
  deleteEmailConfig,
  getEmailLogs,
  getEmailLogsForClient,
  createEmailLog,
  updateEmailLogStatus,
  getKpiTargetsForClient,
  upsertKpiTargets,
  upsertPerformanceSummary,
  getPerformanceSummary,
  getPerformanceSummariesForClient,
} from "./db";
import { fetchMetaAdsMetrics, calculateWoWChange } from "./metaAds";
import { generateWeeklyReportEmail, sendEmail } from "./emailService";
import { ENV } from "./_core/env";
import { MetricsData, MetricsComparison } from "../shared/metrics";

// Admin-only procedure
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // Client management
  clients: router({
    list: adminProcedure.query(async () => {
      return getAllClients();
    }),

    listActive: adminProcedure.query(async () => {
      return getActiveClients();
    }),

    getById: adminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const client = await getClientById(input.id);
        if (!client) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });
        return client;
      }),

    create: adminProcedure
      .input(z.object({
        name: z.string().min(1),
        metaAdAccountId: z.string().optional(),
        contactEmail: z.string().email().optional(),
        contactName: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const id = await createClient({
          name: input.name,
          metaAdAccountId: input.metaAdAccountId || null,
          contactEmail: input.contactEmail || null,
          contactName: input.contactName || null,
          notes: input.notes || null,
        });
        return { id };
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        metaAdAccountId: z.string().optional(),
        contactEmail: z.string().email().optional().or(z.literal("")),
        contactName: z.string().optional(),
        notes: z.string().optional(),
        isActive: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateClient(id, data);
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteClient(input.id);
        return { success: true };
      }),
  }),

  // Metrics
  metrics: router({
    getForClient: adminProcedure
      .input(z.object({ clientId: z.number() }))
      .query(async ({ input }) => {
        const snapshots = await getLatestMetricsForClient(input.clientId);
        if (snapshots.length === 0) return null;

        const thisWeek = snapshotToMetrics(snapshots[0]);
        const lastWeek = snapshots.length > 1 ? snapshotToMetrics(snapshots[1]) : createEmptyMetrics();

        const wowChange: Record<keyof MetricsData, number | null> = {} as any;
        for (const key of Object.keys(thisWeek) as Array<keyof MetricsData>) {
          wowChange[key] = calculateWoWChange(thisWeek[key], lastWeek[key]);
        }

        return {
          thisWeek,
          lastWeek,
          wowChange,
          periodStart: snapshots[0].periodStart,
          periodEnd: snapshots[0].periodEnd,
        };
      }),

    getAllClientsMetrics: adminProcedure.query(async () => {
      const activeClients = await getActiveClients();
      const results = [];

      for (const client of activeClients) {
        const snapshots = await getLatestMetricsForClient(client.id);
        let metrics: (MetricsComparison & { periodStart: any; periodEnd: any }) | null = null;

        if (snapshots.length > 0) {
          const thisWeek = snapshotToMetrics(snapshots[0]);
          const lastWeek = snapshots.length > 1 ? snapshotToMetrics(snapshots[1]) : createEmptyMetrics();
          const wowChange: Record<keyof MetricsData, number | null> = {} as any;
          for (const key of Object.keys(thisWeek) as Array<keyof MetricsData>) {
            wowChange[key] = calculateWoWChange(thisWeek[key], lastWeek[key]);
          }
          metrics = { thisWeek, lastWeek, wowChange, periodStart: snapshots[0].periodStart, periodEnd: snapshots[0].periodEnd };
        }

        results.push({ ...client, metrics });
      }

      return results;
    }),

    fetchFromMeta: adminProcedure
      .input(z.object({
        clientId: z.number(),
        dateStart: z.string().optional(),
        dateEnd: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const client = await getClientById(input.clientId);
        if (!client) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });
        if (!client.metaAdAccountId) throw new TRPCError({ code: "BAD_REQUEST", message: "Client has no Meta Ad Account ID configured" });

        const accessToken = ENV.metaAccessToken;
        if (!accessToken) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Meta access token not configured" });

        // This period: use provided dates or default to last 7 complete days (excluding today)
        const now = new Date();
        const yesterday = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
        const thisWeekEnd = input.dateEnd || formatDate(yesterday);
        const thisWeekStart = input.dateStart || formatDate(new Date(yesterday.getTime() - 6 * 24 * 60 * 60 * 1000));

        // Previous period: same length, immediately before this period
        const periodDays = Math.round((new Date(thisWeekEnd).getTime() - new Date(thisWeekStart).getTime()) / (24 * 60 * 60 * 1000));
        const lastWeekEndDate = new Date(new Date(thisWeekStart).getTime() - 1 * 24 * 60 * 60 * 1000);
        const lastWeekEnd = formatDate(lastWeekEndDate);
        const lastWeekStart = formatDate(new Date(lastWeekEndDate.getTime() - periodDays * 24 * 60 * 60 * 1000));

        // Fetch this week
        const thisWeekMetrics = await fetchMetaAdsMetrics(client.metaAdAccountId, accessToken, thisWeekStart, thisWeekEnd);

        // Fetch last week
        const lastWeekMetrics = await fetchMetaAdsMetrics(client.metaAdAccountId, accessToken, lastWeekStart, lastWeekEnd);

        // Store this week snapshot
        await createMetricsSnapshot({
          clientId: client.id,
          periodStart: thisWeekStart,
          periodEnd: thisWeekEnd,
          cost: thisWeekMetrics.cost?.toString() || null,
          reach: thisWeekMetrics.reach,
          thumbStopRate: thisWeekMetrics.thumbStopRate?.toString() || null,
          holdRate: thisWeekMetrics.holdRate?.toString() || null,
          frequency: thisWeekMetrics.frequency?.toString() || null,
          cpm: thisWeekMetrics.cpm?.toString() || null,
          linkClicks: thisWeekMetrics.linkClicks,
          ctr: thisWeekMetrics.ctr?.toString() || null,
          leads: thisWeekMetrics.leads,
          costPerLead: thisWeekMetrics.costPerLead?.toString() || null,
          leadRate: thisWeekMetrics.leadRate?.toString() || null,
        });

        // Store last week snapshot
        await createMetricsSnapshot({
          clientId: client.id,
          periodStart: lastWeekStart,
          periodEnd: lastWeekEnd,
          cost: lastWeekMetrics.cost?.toString() || null,
          reach: lastWeekMetrics.reach,
          thumbStopRate: lastWeekMetrics.thumbStopRate?.toString() || null,
          holdRate: lastWeekMetrics.holdRate?.toString() || null,
          frequency: lastWeekMetrics.frequency?.toString() || null,
          cpm: lastWeekMetrics.cpm?.toString() || null,
          linkClicks: lastWeekMetrics.linkClicks,
          ctr: lastWeekMetrics.ctr?.toString() || null,
          leads: lastWeekMetrics.leads,
          costPerLead: lastWeekMetrics.costPerLead?.toString() || null,
          leadRate: lastWeekMetrics.leadRate?.toString() || null,
        });

        const wowChange: Record<keyof MetricsData, number | null> = {} as any;
        for (const key of Object.keys(thisWeekMetrics) as Array<keyof MetricsData>) {
          wowChange[key] = calculateWoWChange((thisWeekMetrics as any)[key], (lastWeekMetrics as any)[key]);
        }

        return {
          success: true,
          thisWeek: thisWeekMetrics,
          lastWeek: lastWeekMetrics,
          wowChange,
          periodStart: thisWeekStart,
          periodEnd: thisWeekEnd,
          prevPeriodStart: lastWeekStart,
          prevPeriodEnd: lastWeekEnd,
        };
      }),

    fetchAllFromMeta: adminProcedure
      .input(z.object({ dateStart: z.string().optional(), dateEnd: z.string().optional() }).optional())
      .mutation(async ({ input }) => {
      const activeClients = await getActiveClients();
      const accessToken = ENV.metaAccessToken;
      if (!accessToken) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Meta access token not configured" });

      // This period: use provided dates or default to last 7 complete days (excluding today)
      const now = new Date();
      const yesterday = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
      const thisWeekEnd = input?.dateEnd || formatDate(yesterday);
      const thisWeekStart = input?.dateStart || formatDate(new Date(yesterday.getTime() - 6 * 24 * 60 * 60 * 1000));

      // Previous period: same length, immediately before this period
      const periodDays = Math.round((new Date(thisWeekEnd).getTime() - new Date(thisWeekStart).getTime()) / (24 * 60 * 60 * 1000));
      const lastWeekEndDate = new Date(new Date(thisWeekStart).getTime() - 1 * 24 * 60 * 60 * 1000);
      const lastWeekEnd = formatDate(lastWeekEndDate);
      const lastWeekStart = formatDate(new Date(lastWeekEndDate.getTime() - periodDays * 24 * 60 * 60 * 1000));

      const results = [];
      for (const client of activeClients) {
        if (!client.metaAdAccountId) {
          results.push({ clientId: client.id, clientName: client.name, success: false, error: "No Meta Ad Account ID" });
          continue;
        }
        try {
          // Fetch this week
          const thisWeekMetrics = await fetchMetaAdsMetrics(client.metaAdAccountId, accessToken, thisWeekStart, thisWeekEnd);
          await createMetricsSnapshot({
            clientId: client.id,
            periodStart: thisWeekStart,
            periodEnd: thisWeekEnd,
            cost: thisWeekMetrics.cost?.toString() || null,
            reach: thisWeekMetrics.reach,
            thumbStopRate: thisWeekMetrics.thumbStopRate?.toString() || null,
            holdRate: thisWeekMetrics.holdRate?.toString() || null,
            frequency: thisWeekMetrics.frequency?.toString() || null,
            cpm: thisWeekMetrics.cpm?.toString() || null,
            linkClicks: thisWeekMetrics.linkClicks,
            ctr: thisWeekMetrics.ctr?.toString() || null,
            leads: thisWeekMetrics.leads,
            costPerLead: thisWeekMetrics.costPerLead?.toString() || null,
            leadRate: thisWeekMetrics.leadRate?.toString() || null,
          });

          // Fetch last week
          const lastWeekMetrics = await fetchMetaAdsMetrics(client.metaAdAccountId, accessToken, lastWeekStart, lastWeekEnd);
          await createMetricsSnapshot({
            clientId: client.id,
            periodStart: lastWeekStart,
            periodEnd: lastWeekEnd,
            cost: lastWeekMetrics.cost?.toString() || null,
            reach: lastWeekMetrics.reach,
            thumbStopRate: lastWeekMetrics.thumbStopRate?.toString() || null,
            holdRate: lastWeekMetrics.holdRate?.toString() || null,
            frequency: lastWeekMetrics.frequency?.toString() || null,
            cpm: lastWeekMetrics.cpm?.toString() || null,
            linkClicks: lastWeekMetrics.linkClicks,
            ctr: lastWeekMetrics.ctr?.toString() || null,
            leads: lastWeekMetrics.leads,
            costPerLead: lastWeekMetrics.costPerLead?.toString() || null,
            leadRate: lastWeekMetrics.leadRate?.toString() || null,
          });

          const wowChange: Record<keyof MetricsData, number | null> = {} as any;
          for (const key of Object.keys(thisWeekMetrics) as Array<keyof MetricsData>) {
            wowChange[key] = calculateWoWChange((thisWeekMetrics as any)[key], (lastWeekMetrics as any)[key]);
          }
          results.push({
            clientId: client.id, clientName: client.name, success: true,
            thisWeek: thisWeekMetrics, lastWeek: lastWeekMetrics, wowChange,
            periodStart: thisWeekStart, periodEnd: thisWeekEnd,
          });
        } catch (error: any) {
          results.push({ clientId: client.id, clientName: client.name, success: false, error: error.message });
        }
      }

      return results;
    }),

    // Manual entry for metrics (when Meta API is not connected)
    manualEntry: adminProcedure
      .input(z.object({
        clientId: z.number(),
        periodStart: z.string(),
        periodEnd: z.string(),
        cost: z.number().nullable().optional(),
        reach: z.number().nullable().optional(),
        thumbStopRate: z.number().nullable().optional(),
        holdRate: z.number().nullable().optional(),
        frequency: z.number().nullable().optional(),
        cpm: z.number().nullable().optional(),
        linkClicks: z.number().nullable().optional(),
        ctr: z.number().nullable().optional(),
        leads: z.number().nullable().optional(),
        costPerLead: z.number().nullable().optional(),
        leadRate: z.number().nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        const { clientId, periodStart, periodEnd, ...metrics } = input;
        await createMetricsSnapshot({
          clientId,
          periodStart,
          periodEnd,
          cost: metrics.cost?.toString() || null,
          reach: metrics.reach ?? null,
          thumbStopRate: metrics.thumbStopRate?.toString() || null,
          holdRate: metrics.holdRate?.toString() || null,
          frequency: metrics.frequency?.toString() || null,
          cpm: metrics.cpm?.toString() || null,
          linkClicks: metrics.linkClicks ?? null,
          ctr: metrics.ctr?.toString() || null,
          leads: metrics.leads ?? null,
          costPerLead: metrics.costPerLead?.toString() || null,
          leadRate: metrics.leadRate?.toString() || null,
        });
        return { success: true };
      }),
  }),

  // Email configuration
  emailConfig: router({
    getForClient: adminProcedure
      .input(z.object({ clientId: z.number() }))
      .query(async ({ input }) => {
        return getEmailConfigsForClient(input.clientId);
      }),

    getAll: adminProcedure.query(async () => {
      return getAllEmailConfigs();
    }),

    create: adminProcedure
      .input(z.object({
        clientId: z.number(),
        recipientEmail: z.string().email(),
        recipientName: z.string().optional(),
        datePreset: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const id = await createEmailConfig({
          clientId: input.clientId,
          recipientEmail: input.recipientEmail,
          recipientName: input.recipientName || null,
          personalizedMessage: null,
          datePreset: input.datePreset || "past_7",
        });
        return { id };
      }),

    update: adminProcedure
      .input(z.object({
        id: z.number(),
        recipientEmail: z.string().email().optional(),
        recipientName: z.string().optional(),
        datePreset: z.string().optional(),
        isActive: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        await updateEmailConfig(id, data);
        return { success: true };
      }),

    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteEmailConfig(input.id);
        return { success: true };
      }),
  }),

  // Email sending
  email: router({
    logs: adminProcedure
      .input(z.object({ limit: z.number().optional() }).optional())
      .query(async ({ input }) => {
        return getEmailLogs(input?.limit || 50);
      }),

    logsForClient: adminProcedure
      .input(z.object({ clientId: z.number(), limit: z.number().optional() }))
      .query(async ({ input }) => {
        return getEmailLogsForClient(input.clientId, input.limit || 20);
      }),

    preview: adminProcedure
      .input(z.object({ clientId: z.number(), datePreset: z.string().optional() }))
      .mutation(async ({ input }) => {
        const client = await getClientById(input.clientId);
        if (!client) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });

        const { thisStart, thisEnd } = datesFromPreset(input.datePreset || "past_7");
        const periodDays = Math.round((new Date(thisEnd).getTime() - new Date(thisStart).getTime()) / 86400000);
        const prevEndDate = new Date(new Date(thisStart).getTime() - 86400000);
        const prevEnd = formatDate(prevEndDate);
        const prevStart = formatDate(new Date(prevEndDate.getTime() - periodDays * 86400000));

        const [thisSnap, prevSnap, summaryRow, kpiTargetsRow] = await Promise.all([
          getSnapshotByPeriod(input.clientId, thisStart, thisEnd),
          getSnapshotByPeriod(input.clientId, prevStart, prevEnd),
          getPerformanceSummary(input.clientId, thisStart, thisEnd),
          getKpiTargetsForClient(input.clientId),
        ]);
        if (!thisSnap) throw new TRPCError({ code: "BAD_REQUEST", message: `No data for ${thisStart} – ${thisEnd}. Fetch this period from the dashboard first.` });

        const thisWeek = snapshotToMetrics(thisSnap);
        const lastWeek = prevSnap ? snapshotToMetrics(prevSnap) : createEmptyMetrics();
        const wowChange: Record<keyof MetricsData, number | null> = {} as any;
        for (const key of Object.keys(thisWeek) as Array<keyof MetricsData>) {
          wowChange[key] = calculateWoWChange(thisWeek[key], lastWeek[key]);
        }

        const metricsComparison = { thisWeek, lastWeek, wowChange };
        const summary = summaryRow?.summary || null;
        const kpiTargets = kpiTargetsRow ? kpiTargetsRowToNumbers(kpiTargetsRow) : null;

        const html = generateWeeklyReportEmail(
          client.name,
          metricsComparison,
          summary,
          thisStart,
          thisEnd,
          kpiTargets
        );

        return { html };
      }),

    send: adminProcedure
      .input(z.object({
        clientId: z.number(),
        recipientEmail: z.string().email(),
        datePreset: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const client = await getClientById(input.clientId);
        if (!client) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });

        const { thisStart, thisEnd } = datesFromPreset(input.datePreset || "past_7");
        const periodDays = Math.round((new Date(thisEnd).getTime() - new Date(thisStart).getTime()) / 86400000);
        const prevEndDate = new Date(new Date(thisStart).getTime() - 86400000);
        const prevEnd = formatDate(prevEndDate);
        const prevStart = formatDate(new Date(prevEndDate.getTime() - periodDays * 86400000));

        const [thisSnap, prevSnap, summaryRow, kpiTargetsRow] = await Promise.all([
          getSnapshotByPeriod(input.clientId, thisStart, thisEnd),
          getSnapshotByPeriod(input.clientId, prevStart, prevEnd),
          getPerformanceSummary(input.clientId, thisStart, thisEnd),
          getKpiTargetsForClient(input.clientId),
        ]);
        if (!thisSnap) throw new TRPCError({ code: "BAD_REQUEST", message: `No data for ${thisStart} – ${thisEnd}. Fetch this period from the dashboard first.` });

        const thisWeek = snapshotToMetrics(thisSnap);
        const lastWeek = prevSnap ? snapshotToMetrics(prevSnap) : createEmptyMetrics();
        const wowChange: Record<keyof MetricsData, number | null> = {} as any;
        for (const key of Object.keys(thisWeek) as Array<keyof MetricsData>) {
          wowChange[key] = calculateWoWChange(thisWeek[key], lastWeek[key]);
        }

        const metricsComparison = { thisWeek, lastWeek, wowChange };
        const summary = summaryRow?.summary || null;
        const kpiTargets = kpiTargetsRow ? kpiTargetsRowToNumbers(kpiTargetsRow) : null;

        const html = generateWeeklyReportEmail(
          client.name,
          metricsComparison,
          summary,
          thisStart,
          thisEnd,
          kpiTargets
        );

        const subject = `${client.name} — Weekly Performance Report | ${thisStart} to ${thisEnd}`;

        const logId = await createEmailLog({
          clientId: input.clientId,
          recipientEmail: input.recipientEmail,
          subject,
          status: "pending",
        });

        // Send email
        const success = await sendEmail({ to: input.recipientEmail, subject, html });

        if (success) {
          await updateEmailLogStatus(logId, "sent");
        } else {
          await updateEmailLogStatus(logId, "failed", "Email delivery failed");
        }

        return { success, logId };
      }),

    sendAll: adminProcedure.mutation(async () => {
      const configs = await getAllEmailConfigs();
      const results = [];

      for (const config of configs) {
        const client = await getClientById(config.clientId);
        if (!client) continue;

        const { thisStart, thisEnd } = datesFromPreset(config.datePreset || "past_7");
        const periodDays = Math.round((new Date(thisEnd).getTime() - new Date(thisStart).getTime()) / 86400000);
        const prevEndDate = new Date(new Date(thisStart).getTime() - 86400000);
        const prevEnd = formatDate(prevEndDate);
        const prevStart = formatDate(new Date(prevEndDate.getTime() - periodDays * 86400000));

        const [thisSnap, prevSnap] = await Promise.all([
          getSnapshotByPeriod(config.clientId, thisStart, thisEnd),
          getSnapshotByPeriod(config.clientId, prevStart, prevEnd),
        ]);
        if (!thisSnap) {
          results.push({ clientId: config.clientId, clientName: client.name, success: false, error: `No data for ${thisStart} – ${thisEnd}` });
          continue;
        }

        const thisWeek = snapshotToMetrics(thisSnap);
        const lastWeek = prevSnap ? snapshotToMetrics(prevSnap) : createEmptyMetrics();
        const wowChange: Record<keyof MetricsData, number | null> = {} as any;
        for (const key of Object.keys(thisWeek) as Array<keyof MetricsData>) {
          wowChange[key] = calculateWoWChange(thisWeek[key], lastWeek[key]);
        }

        const metricsComparison = { thisWeek, lastWeek, wowChange };

        const [summaryRow, kpiTargetsRow] = await Promise.all([
          getPerformanceSummary(config.clientId, thisStart, thisEnd),
          getKpiTargetsForClient(config.clientId),
        ]);

        const summary = summaryRow?.summary || null;
        const kpiTargets = kpiTargetsRow ? kpiTargetsRowToNumbers(kpiTargetsRow) : null;

        const html = generateWeeklyReportEmail(
          client.name,
          metricsComparison,
          summary,
          thisStart,
          thisEnd,
          kpiTargets
        );

        const subject = `${client.name} — Weekly Performance Report | ${thisStart} to ${thisEnd}`;

        const logId = await createEmailLog({
          clientId: config.clientId,
          recipientEmail: config.recipientEmail,
          subject,
          status: "pending",
        });

        const success = await sendEmail({ to: config.recipientEmail, subject, html });

        if (success) {
          await updateEmailLogStatus(logId, "sent");
          results.push({ clientId: config.clientId, clientName: client.name, success: true });
        } else {
          await updateEmailLogStatus(logId, "failed", "Email delivery failed");
          results.push({ clientId: config.clientId, clientName: client.name, success: false, error: "Delivery failed" });
        }
      }

      return results;
    }),
  }),

  // KPI Targets
  kpiTargets: router({
    getForClient: adminProcedure
      .input(z.object({ clientId: z.number() }))
      .query(async ({ input }) => {
        return getKpiTargetsForClient(input.clientId) || null;
      }),

    upsert: adminProcedure
      .input(z.object({
        clientId: z.number(),
        costTarget: z.number().nullable().optional(),
        reachTarget: z.number().nullable().optional(),
        thumbStopRateTarget: z.number().nullable().optional(),
        holdRateTarget: z.number().nullable().optional(),
        frequencyTarget: z.number().nullable().optional(),
        cpmTarget: z.number().nullable().optional(),
        linkClicksTarget: z.number().nullable().optional(),
        ctrTarget: z.number().nullable().optional(),
        leadsTarget: z.number().nullable().optional(),
        costPerLeadTarget: z.number().nullable().optional(),
        leadRateTarget: z.number().nullable().optional(),
      }))
      .mutation(async ({ input }) => {
        const { clientId, ...targets } = input;
        await upsertKpiTargets(clientId, {
          costTarget: targets.costTarget?.toString() || null,
          reachTarget: targets.reachTarget ?? null,
          thumbStopRateTarget: targets.thumbStopRateTarget?.toString() || null,
          holdRateTarget: targets.holdRateTarget?.toString() || null,
          frequencyTarget: targets.frequencyTarget?.toString() || null,
          cpmTarget: targets.cpmTarget?.toString() || null,
          linkClicksTarget: targets.linkClicksTarget ?? null,
          ctrTarget: targets.ctrTarget?.toString() || null,
          leadsTarget: targets.leadsTarget ?? null,
          costPerLeadTarget: targets.costPerLeadTarget?.toString() || null,
          leadRateTarget: targets.leadRateTarget?.toString() || null,
        });
        return { success: true };
      }),
  }),
  // Performance summaries
  summary: router({
    save: adminProcedure
      .input(z.object({
        clientId: z.number(),
        periodStart: z.string(),
        periodEnd: z.string(),
        summary: z.string(),
      }))
      .mutation(async ({ input }) => {
        await upsertPerformanceSummary(input.clientId, input.periodStart, input.periodEnd, input.summary);
        return { success: true };
      }),

    getForClient: adminProcedure
      .input(z.object({ clientId: z.number() }))
      .query(async ({ input }) => {
        return getPerformanceSummariesForClient(input.clientId, 20);
      }),
  }),
});

// Scheduled endpoint for automated weekly emails
export type AppRouter = typeof appRouter;

// Helper functions
function snapshotToMetrics(snapshot: any): MetricsData {
  return {
    cost: snapshot.cost ? parseFloat(snapshot.cost) : null,
    reach: snapshot.reach,
    thumbStopRate: snapshot.thumbStopRate ? parseFloat(snapshot.thumbStopRate) : null,
    holdRate: snapshot.holdRate ? parseFloat(snapshot.holdRate) : null,
    frequency: snapshot.frequency ? parseFloat(snapshot.frequency) : null,
    cpm: snapshot.cpm ? parseFloat(snapshot.cpm) : null,
    linkClicks: snapshot.linkClicks,
    ctr: snapshot.ctr ? parseFloat(snapshot.ctr) : null,
    leads: snapshot.leads,
    costPerLead: snapshot.costPerLead ? parseFloat(snapshot.costPerLead) : null,
    leadRate: snapshot.leadRate ? parseFloat(snapshot.leadRate) : null,
  };
}

function createEmptyMetrics(): MetricsData {
  return {
    cost: null,
    reach: null,
    thumbStopRate: null,
    holdRate: null,
    frequency: null,
    cpm: null,
    linkClicks: null,
    ctr: null,
    leads: null,
    costPerLead: null,
    leadRate: null,
  };
}

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

export const DATE_PRESETS = ["past_7", "mon_sun", "past_14", "past_30"] as const;
export type DatePreset = typeof DATE_PRESETS[number];

export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  past_7: "Past 7 days",
  mon_sun: "Mon – Sun (last week)",
  past_14: "Past 14 days",
  past_30: "Past 30 days",
};

/** Returns { thisStart, thisEnd } for the selected period. */
function datesFromPreset(preset: string): { thisStart: string; thisEnd: string } {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 86400000);

  if (preset === "mon_sun") {
    // Last complete Mon-Sun week
    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon...
    const daysToLastSunday = dayOfWeek === 0 ? 7 : dayOfWeek;
    const lastSunday = new Date(now.getTime() - daysToLastSunday * 86400000);
    const lastMonday = new Date(lastSunday.getTime() - 6 * 86400000);
    return { thisStart: formatDate(lastMonday), thisEnd: formatDate(lastSunday) };
  }

  const days = preset === "past_14" ? 13 : preset === "past_30" ? 29 : 6;
  return {
    thisStart: formatDate(new Date(yesterday.getTime() - days * 86400000)),
    thisEnd: formatDate(yesterday),
  };
}

function kpiTargetsRowToNumbers(row: any): Partial<Record<keyof MetricsData, number | null>> {
  return {
    cost: row.costTarget != null ? parseFloat(row.costTarget) : null,
    reach: row.reachTarget ?? null,
    thumbStopRate: row.thumbStopRateTarget != null ? parseFloat(row.thumbStopRateTarget) : null,
    holdRate: row.holdRateTarget != null ? parseFloat(row.holdRateTarget) : null,
    frequency: row.frequencyTarget != null ? parseFloat(row.frequencyTarget) : null,
    cpm: row.cpmTarget != null ? parseFloat(row.cpmTarget) : null,
    linkClicks: row.linkClicksTarget ?? null,
    ctr: row.ctrTarget != null ? parseFloat(row.ctrTarget) : null,
    leads: row.leadsTarget ?? null,
    costPerLead: row.costPerLeadTarget != null ? parseFloat(row.costPerLeadTarget) : null,
    leadRate: row.leadRateTarget != null ? parseFloat(row.leadRateTarget) : null,
  };
}
