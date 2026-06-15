export interface MetricsData {
  cost: number | null;
  reach: number | null;
  thumbStopRate: number | null;
  holdRate: number | null;
  frequency: number | null;
  cpm: number | null;
  linkClicks: number | null;
  ctr: number | null;
  leads: number | null;
  costPerLead: number | null;
  leadRate: number | null;
}

export interface MetricsComparison {
  thisWeek: MetricsData;
  lastWeek: MetricsData;
  wowChange: Record<keyof MetricsData, number | null>;
}

export interface ClientWithMetrics {
  id: number;
  name: string;
  metaAdAccountId: string | null;
  contactEmail: string | null;
  contactName: string | null;
  isActive: number;
  metrics: MetricsComparison | null;
}

export const METRIC_LABELS: Record<keyof MetricsData, string> = {
  cost: "Amount Spent",
  reach: "Reach",
  thumbStopRate: "Thumb Stop Rate",
  holdRate: "Hold Rate",
  frequency: "Frequency",
  cpm: "CPM",
  linkClicks: "Link Clicks",
  ctr: "CTR",
  leads: "Results",
  costPerLead: "Cost Per Result",
  leadRate: "Result Rate",
};

export const METRIC_FORMATS: Record<keyof MetricsData, "currency" | "percentage" | "number" | "decimal"> = {
  cost: "currency",
  reach: "number",
  thumbStopRate: "percentage",
  holdRate: "percentage",
  frequency: "decimal",
  cpm: "currency",
  linkClicks: "number",
  ctr: "percentage",
  leads: "number",
  costPerLead: "currency",
  leadRate: "percentage",
};
