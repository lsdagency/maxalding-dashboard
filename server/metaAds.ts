import axios from "axios";
import { MetricsData } from "../shared/metrics";

const META_GRAPH_API_BASE = "https://graph.facebook.com/v21.0";

interface MetaInsightsResponse {
  data: Array<{
    spend?: string;
    reach?: string;
    impressions?: string;
    frequency?: string;
    cpm?: string;
    clicks?: string;
    ctr?: string;
    inline_link_clicks?: string;
    inline_link_click_ctr?: string;
    actions?: Array<{ action_type: string; value: string }>;
    video_thruplay_watched_actions?: Array<{ action_type: string; value: string }>;
    video_p25_watched_actions?: Array<{ action_type: string; value: string }>;
    cost_per_action_type?: Array<{ action_type: string; value: string }>;
    outbound_clicks?: Array<{ action_type: string; value: string }>;
    outbound_clicks_ctr?: Array<{ action_type: string; value: string }>;
  }>;
}

/**
 * Fetch Meta Ads insights for a given ad account over a date range.
 * Returns normalized MetricsData.
 */
export async function fetchMetaAdsMetrics(
  adAccountId: string,
  accessToken: string,
  dateStart: string,
  dateEnd: string
): Promise<MetricsData> {
  const fields = [
    "spend",
    "reach",
    "impressions",
    "frequency",
    "cpm",
    "clicks",
    "ctr",
    "inline_link_clicks",
    "inline_link_click_ctr",
    "actions",
    "cost_per_action_type",
    "outbound_clicks",
    "outbound_clicks_ctr",
    "video_thruplay_watched_actions",
    "video_p25_watched_actions",
  ].join(",");

  const url = `${META_GRAPH_API_BASE}/act_${adAccountId}/insights`;

  try {
    const response = await axios.get<MetaInsightsResponse>(url, {
      params: {
        access_token: accessToken,
        fields,
        time_range: JSON.stringify({
          since: dateStart,
          until: dateEnd,
        }),
        level: "account",
      },
    });

    const data = response.data.data?.[0];
    if (!data) {
      return createEmptyMetrics();
    }

    return parseMetaInsights(data);
  } catch (error: any) {
    console.error(`[MetaAds] Failed to fetch metrics for account ${adAccountId}:`, error?.response?.data || error.message);
    throw new Error(`Failed to fetch Meta Ads data: ${error?.response?.data?.error?.message || error.message}`);
  }
}

function parseMetaInsights(data: MetaInsightsResponse["data"][0]): MetricsData {
  const spend = parseFloat(data.spend || "0");
  const reach = parseInt(data.reach || "0", 10);
  const impressions = parseInt(data.impressions || "0", 10);
  const frequency = parseFloat(data.frequency || "0");
  const cpm = parseFloat(data.cpm || "0");

  // Link Clicks: Use inline_link_clicks (this is what Meta Ads Manager shows as "Link Clicks")
  const linkClicks = data.inline_link_clicks
    ? parseInt(data.inline_link_clicks, 10)
    : 0;

  // CTR: Use inline_link_click_ctr (Meta's "Link Click-Through Rate" = link clicks / impressions)
  const ctr = data.inline_link_click_ctr
    ? parseFloat(data.inline_link_click_ctr)
    : 0;

  // Leads (from actions)
  const leads = data.actions
    ? parseInt(data.actions.find(a => a.action_type === "lead")?.value || "0", 10)
    : 0;

  // Cost per lead
  const costPerLead = data.cost_per_action_type
    ? parseFloat(data.cost_per_action_type.find(a => a.action_type === "lead")?.value || "0")
    : leads > 0 ? spend / leads : 0;

  // Lead Rate = Leads / Link Clicks * 100
  const leadRate = linkClicks > 0 ? (leads / linkClicks) * 100 : 0;

  // Thumb Stop Rate = 3-second video plays / Impressions * 100
  // Meta reports 3-second video views in the actions array as "video_view"
  const threeSecondPlays = data.actions
    ? parseInt(data.actions.find(a => a.action_type === "video_view")?.value || "0", 10)
    : 0;
  const thumbStopRate = impressions > 0 ? (threeSecondPlays / impressions) * 100 : 0;

  // Hold Rate = ThruPlays / Impressions * 100
  const thruPlays = data.video_thruplay_watched_actions
    ? parseInt(data.video_thruplay_watched_actions.find(a => a.action_type === "video_view")?.value || "0", 10)
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
    leads,
    costPerLead: round2(costPerLead),
    leadRate: round2(leadRate),
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

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Calculate week-over-week percentage change
 */
export function calculateWoWChange(thisWeek: number | null, lastWeek: number | null): number | null {
  if (thisWeek === null || lastWeek === null || lastWeek === 0) return null;
  return round2(((thisWeek - lastWeek) / lastWeek) * 100);
}
