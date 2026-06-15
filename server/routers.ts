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
  getKpiTargetsForClient,
  upsertKpiTargets,
} from "./db";
import { fetchMetaAdsMetrics, calculateWoWChange } from "./metaAds";
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

  // Metrics — fetched live from Meta on demand, never persisted
  metrics: router({
    // Live metrics for one client over the default range (last complete Mon–Sun)
    getForClient: adminProcedure
      .input(z.object({ clientId: z.number() }))
      .query(async ({ input }) => {
        const client = await getClientById(input.clientId);
        if (!client) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });
        if (!client.metaAdAccountId) return null;

        const accessToken = ENV.metaAccessToken;
        if (!accessToken) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Meta access token not configured" });

        const { thisStart, thisEnd } = defaultRange();
        return buildComparison(client.metaAdAccountId, accessToken, thisStart, thisEnd);
      }),

    // Live metrics for all active clients over the default range
    getAllClientsMetrics: adminProcedure.query(async () => {
      const activeClients = await getActiveClients();
      const accessToken = ENV.metaAccessToken;
      const { thisStart, thisEnd } = defaultRange();

      const results = await Promise.all(activeClients.map(async (client) => {
        if (!client.metaAdAccountId || !accessToken) return { ...client, metrics: null };
        try {
          const metrics = await buildComparison(client.metaAdAccountId, accessToken, thisStart, thisEnd);
          return { ...client, metrics };
        } catch {
          return { ...client, metrics: null };
        }
      }));

      return results;
    }),

    // Live metrics for one client over a chosen range
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

        const { thisStart, thisEnd } = rangeFromInput(input.dateStart, input.dateEnd);
        const comparison = await buildComparison(client.metaAdAccountId, accessToken, thisStart, thisEnd);
        return { success: true as const, ...comparison };
      }),

    // Live metrics for all active clients over a chosen range
    fetchAllFromMeta: adminProcedure
      .input(z.object({ dateStart: z.string().optional(), dateEnd: z.string().optional() }).optional())
      .mutation(async ({ input }) => {
        const activeClients = await getActiveClients();
        const accessToken = ENV.metaAccessToken;
        if (!accessToken) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Meta access token not configured" });

        const { thisStart, thisEnd } = rangeFromInput(input?.dateStart, input?.dateEnd);

        const results = await Promise.all(activeClients.map(async (client) => {
          if (!client.metaAdAccountId) {
            return { clientId: client.id, clientName: client.name, success: false as const, error: "No Meta Ad Account ID" };
          }
          try {
            const comparison = await buildComparison(client.metaAdAccountId, accessToken, thisStart, thisEnd);
            return { clientId: client.id, clientName: client.name, success: true as const, ...comparison };
          } catch (error: any) {
            return { clientId: client.id, clientName: client.name, success: false as const, error: error.message };
          }
        }));

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
});

export type AppRouter = typeof appRouter;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

/** Default reporting window: the last complete Monday–Sunday week. */
function defaultRange(): { thisStart: string; thisEnd: string } {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon...
  const daysToLastSunday = dayOfWeek === 0 ? 7 : dayOfWeek;
  const lastSunday = new Date(now.getTime() - daysToLastSunday * 86400000);
  const lastMonday = new Date(lastSunday.getTime() - 6 * 86400000);
  return { thisStart: formatDate(lastMonday), thisEnd: formatDate(lastSunday) };
}

function rangeFromInput(dateStart?: string, dateEnd?: string): { thisStart: string; thisEnd: string } {
  if (dateStart && dateEnd) return { thisStart: dateStart, thisEnd: dateEnd };
  return defaultRange();
}

/**
 * Fetch this-period and previous-period metrics live from Meta and compute WoW change.
 * The previous period is the same length, immediately before the selected window.
 */
async function buildComparison(
  adAccountId: string,
  accessToken: string,
  thisStart: string,
  thisEnd: string,
): Promise<MetricsComparison & { periodStart: string; periodEnd: string }> {
  const periodDays = Math.round((new Date(thisEnd).getTime() - new Date(thisStart).getTime()) / 86400000);
  const prevEndDate = new Date(new Date(thisStart).getTime() - 86400000);
  const prevEnd = formatDate(prevEndDate);
  const prevStart = formatDate(new Date(prevEndDate.getTime() - periodDays * 86400000));

  const [thisWeek, lastWeek] = await Promise.all([
    fetchMetaAdsMetrics(adAccountId, accessToken, thisStart, thisEnd),
    fetchMetaAdsMetrics(adAccountId, accessToken, prevStart, prevEnd),
  ]);

  const wowChange: Record<keyof MetricsData, number | null> = {} as any;
  for (const key of Object.keys(thisWeek) as Array<keyof MetricsData>) {
    wowChange[key] = calculateWoWChange(thisWeek[key], lastWeek[key]);
  }

  return { thisWeek, lastWeek, wowChange, periodStart: thisStart, periodEnd: thisEnd };
}
