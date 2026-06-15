import axios from "axios";
import { MetricsData } from "../shared/metrics";

const META_GRAPH_API_BASE = "https://graph.facebook.com/v21.0";

/**
 * Conversion action types that count as a "Result", in priority order.
 * For a single client account (usually one objective), we take the highest-priority
 * type present so the figure matches Meta Ads Manager's "Results" column regardless
 * of whether the client runs lead forms, applications, purchases, messaging, etc.
 *
 * NOTE: validate this ordering against live accounts when the Meta token is connected
 * — custom conversions surface as `offsite_conversion.custom.<id>` and may need adding.
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

/**
 * Choose the most relevant conversion result from an insights `actions` array.
 * Returns the count and which action_type it came from (so cost-per-result can match).
 */
function pickResult(
  actions?: Array<{ action_type: string; value: string }>,
): { results: number; actionType: string | null } {
  if (!actions || actions.length === 0) return { results: 0, actionType: null };
  for (const type of RESULT_ACTION_PRIORITY) {
    const found = actions.find(a => a.action_type === type);
    if (found && parseFloat(found.value) > 0) {
      return { results: parseInt(found.value, 10), actionType: type };
    }
  }
  return { results: 0, actionType: null };
}

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

  // Results: the account's conversion outcome, whatever the objective is
  // (lead forms, submit applications, purchases, etc.) — not just lead-form "lead".
  // We pick the highest-priority conversion action present in the response so the
  // dashboard shows the same "Results" figure Meta Ads Manager does, per client.
  const { results, actionType: resultActionType } = pickResult(data.actions);

  // Cost per result: use Meta's own cost_per_action_type for the chosen action if
  // available, otherwise derive it from spend.
  const costPerResultFromApi = resultActionType && data.cost_per_action_type
    ? parseFloat(data.cost_per_action_type.find(a => a.action_type === resultActionType)?.value || "0")
    : 0;
  const costPerLead = costPerResultFromApi > 0
    ? costPerResultFromApi
    : results > 0 ? spend / results : 0;

  // Result Rate = Results / Link Clicks * 100
  const leadRate = linkClicks > 0 ? (results / linkClicks) * 100 : 0;
  const leads = results;

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
