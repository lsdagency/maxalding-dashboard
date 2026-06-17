import axios from "axios";
import {
  MetricsData,
  MetricsComparison,
  formatDate,
} from "./metrics";

const META_GRAPH_API_BASE = "https://graph.facebook.com/v21.0";

/**
 * Conversion action types that count as a "Result", in priority order.
 * For a single client account (usually one objective) we take the highest-priority
 * type present so the figure matches Meta Ads Manager's "Results" column regardless
 * of whether the client runs lead forms, applications, purchases, messaging, etc.
 *
 * NOTE: validate this ordering against live accounts — custom conversions surface
 * as `offsite_conversion.custom.<id>` and may need adding.
 */
const RESULT_ACTION_PRIORITY = [
  "offsite_conversion.fb_pixel_lead",
  "onsite_conversion.lead_grouped",
  "lead",
  "submit_application",
  "offsite_conversion.fb_pixel_complete_registration",
  "complete_registration",
  "offsite_conversion.fb_pixel_purchase",
  "onsite_web_purchase",
  "onsite_conversion.purchase",
  "purchase",
  "onsite_conversion.messaging_conversation_started_7d",
  "schedule",
  "contact",
  "subscribe",
  "start_trial",
];

interface MetaInsightsResponse {
  data: Array<{
    spend?: string;
    reach?: string;
    impressions?: string;
    frequency?: string;
    cpm?: string;
    inline_link_clicks?: string;
    inline_link_click_ctr?: string;
    actions?: Array<{ action_type: string; value: string }>;
    video_thruplay_watched_actions?: Array<{ action_type: string; value: string }>;
    cost_per_action_type?: Array<{ action_type: string; value: string }>;
  }>;
}

export interface MetaAdAccount {
  id: string; // numeric account id (no act_ prefix) — matches what we store
  name: string;
  status: number | null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function pickResult(
  actions?: Array<{ action_type: string; value: string }>,
): { results: number; actionType: string | null } {
  if (!actions || actions.length === 0) return { results: 0, actionType: null };
  for (const type of RESULT_ACTION_PRIORITY) {
    const found = actions.find((a) => a.action_type === type);
    if (found && parseFloat(found.value) > 0) {
      return { results: parseInt(found.value, 10), actionType: type };
    }
  }
  return { results: 0, actionType: null };
}

function createEmptyMetrics(): MetricsData {
  return {
    cost: null, reach: null, thumbStopRate: null, holdRate: null, frequency: null,
    cpm: null, linkClicks: null, ctr: null, leads: null, costPerLead: null, leadRate: null,
  };
}

function parseMetaInsights(data: MetaInsightsResponse["data"][0]): MetricsData {
  const spend = parseFloat(data.spend || "0");
  const reach = parseInt(data.reach || "0", 10);
  const impressions = parseInt(data.impressions || "0", 10);
  const frequency = parseFloat(data.frequency || "0");
  const cpm = parseFloat(data.cpm || "0");

  const linkClicks = data.inline_link_clicks ? parseInt(data.inline_link_clicks, 10) : 0;
  const ctr = data.inline_link_click_ctr ? parseFloat(data.inline_link_click_ctr) : 0;

  // Results: the account's conversion outcome, whatever the objective is.
  const { results, actionType: resultActionType } = pickResult(data.actions);
  const costPerResultFromApi = resultActionType && data.cost_per_action_type
    ? parseFloat(data.cost_per_action_type.find((a) => a.action_type === resultActionType)?.value || "0")
    : 0;
  const costPerLead = costPerResultFromApi > 0 ? costPerResultFromApi : results > 0 ? spend / results : 0;
  const leadRate = linkClicks > 0 ? (results / linkClicks) * 100 : 0;

  // Thumb Stop Rate = 3-second video plays / impressions
  const threeSecondPlays = data.actions
    ? parseInt(data.actions.find((a) => a.action_type === "video_view")?.value || "0", 10)
    : 0;
  const thumbStopRate = impressions > 0 ? (threeSecondPlays / impressions) * 100 : 0;

  // Hold Rate = ThruPlays / impressions
  const thruPlays = data.video_thruplay_watched_actions
    ? parseInt(data.video_thruplay_watched_actions.find((a) => a.action_type === "video_view")?.value || "0", 10)
    : 0;
  const holdRate = impressions > 0 ? (thruPlays / impressions) * 100 : 0;

  return {
    cost: round2(spend),
    reach,
    thumbStopRate: round2(thumbStopRate),
    holdRate: round2(holdRate),
    frequency: round2(frequency),
    cpm: round2(cpm),
    linkClicks,
    ctr: round2(ctr),
    leads: results,
    costPerLead: round2(costPerLead),
    leadRate: round2(leadRate),
  };
}

export async function fetchMetaAdsMetrics(
  adAccountId: string,
  accessToken: string,
  dateStart: string,
  dateEnd: string,
): Promise<MetricsData> {
  const fields = [
    "spend", "reach", "impressions", "frequency", "cpm",
    "inline_link_clicks", "inline_link_click_ctr",
    "actions", "cost_per_action_type", "video_thruplay_watched_actions",
  ].join(",");

  const url = `${META_GRAPH_API_BASE}/act_${adAccountId}/insights`;
  try {
    const response = await axios.get<MetaInsightsResponse>(url, {
      params: {
        access_token: accessToken,
        fields,
        time_range: JSON.stringify({ since: dateStart, until: dateEnd }),
        level: "account",
      },
    });
    const data = response.data.data?.[0];
    if (!data) return createEmptyMetrics();
    return parseMetaInsights(data);
  } catch (error: any) {
    console.error(`[MetaAds] Failed to fetch metrics for ${adAccountId}:`, error?.response?.data || error.message);
    throw new Error(`Failed to fetch Meta Ads data: ${error?.response?.data?.error?.message || error.message}`);
  }
}

/** List all ad accounts the access token can see (across the connected Business Manager). */
export async function fetchAdAccounts(accessToken: string): Promise<MetaAdAccount[]> {
  const accounts: MetaAdAccount[] = [];
  let url: string | null =
    `${META_GRAPH_API_BASE}/me/adaccounts?fields=account_id,name,account_status&limit=200&access_token=${encodeURIComponent(accessToken)}`;
  try {
    let pages = 0;
    while (url && pages < 10) {
      const response: { data: { data?: any[]; paging?: { next?: string } } } = await axios.get(url);
      for (const acc of response.data.data ?? []) {
        accounts.push({ id: acc.account_id, name: acc.name || `Account ${acc.account_id}`, status: acc.account_status ?? null });
      }
      url = response.data.paging?.next ?? null;
      pages++;
    }
  } catch (error: any) {
    console.error("[MetaAds] Failed to list ad accounts:", error?.response?.data || error.message);
    throw new Error(`Failed to list Meta ad accounts: ${error?.response?.data?.error?.message || error.message}`);
  }
  return accounts.sort((a, b) => a.name.localeCompare(b.name));
}

export function calculateWoWChange(thisWeek: number | null, lastWeek: number | null): number | null {
  if (thisWeek === null || lastWeek === null || lastWeek === 0) return null;
  return round2(((thisWeek - lastWeek) / lastWeek) * 100);
}

/**
 * Fetch this-period and previous-period metrics live from Meta and compute WoW change.
 * The previous period is the same length, immediately before the selected window.
 */
export async function buildComparison(
  adAccountId: string,
  accessToken: string,
  thisStart: string,
  thisEnd: string,
): Promise<MetricsComparison> {
  const periodDays = Math.round((new Date(thisEnd).getTime() - new Date(thisStart).getTime()) / 86400000);
  const prevEndDate = new Date(new Date(thisStart).getTime() - 86400000);
  const prevEnd = formatDate(prevEndDate);
  const prevStart = formatDate(new Date(prevEndDate.getTime() - periodDays * 86400000));

  const [thisWeek, lastWeek] = await Promise.all([
    fetchMetaAdsMetrics(adAccountId, accessToken, thisStart, thisEnd),
    fetchMetaAdsMetrics(adAccountId, accessToken, prevStart, prevEnd),
  ]);

  const wowChange = {} as Record<keyof MetricsData, number | null>;
  for (const key of Object.keys(thisWeek) as Array<keyof MetricsData>) {
    wowChange[key] = calculateWoWChange(thisWeek[key], lastWeek[key]);
  }

  return { thisWeek, lastWeek, wowChange, periodStart: thisStart, periodEnd: thisEnd };
}
