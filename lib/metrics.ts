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
  periodStart: string;
  periodEnd: string;
}

export const METRIC_KEYS: (keyof MetricsData)[] = [
  "cost", "reach", "thumbStopRate", "holdRate", "frequency",
  "cpm", "linkClicks", "ctr", "leads", "costPerLead", "leadRate",
];

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

/** KPI target field name for each metric key. */
export const KPI_FIELD_MAP: Record<keyof MetricsData, string> = {
  cost: "costTarget",
  reach: "reachTarget",
  thumbStopRate: "thumbStopRateTarget",
  holdRate: "holdRateTarget",
  frequency: "frequencyTarget",
  cpm: "cpmTarget",
  linkClicks: "linkClicksTarget",
  ctr: "ctrTarget",
  leads: "leadsTarget",
  costPerLead: "costPerLeadTarget",
  leadRate: "leadRateTarget",
};

export function formatValue(value: number | null, format: string): string {
  if (value === null || value === undefined) return "—";
  switch (format) {
    case "currency": return `$${value.toFixed(2)}`;
    case "percentage": return `${value.toFixed(2)}%`;
    case "decimal": return value.toFixed(2);
    case "number": return value.toLocaleString();
    default: return String(value);
  }
}

export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

/** Default reporting window: the last complete Monday–Sunday week. */
export function defaultRange(): { thisStart: string; thisEnd: string } {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon...
  const daysToLastSunday = dayOfWeek === 0 ? 7 : dayOfWeek;
  const lastSunday = new Date(now.getTime() - daysToLastSunday * 86400000);
  const lastMonday = new Date(lastSunday.getTime() - 6 * 86400000);
  return { thisStart: formatDate(lastMonday), thisEnd: formatDate(lastSunday) };
}

export function rangeFromInput(dateStart?: string | null, dateEnd?: string | null): { thisStart: string; thisEnd: string } {
  if (dateStart && dateEnd) return { thisStart: dateStart, thisEnd: dateEnd };
  return defaultRange();
}
