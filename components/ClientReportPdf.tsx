"use client";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer";

// ─── Types ──────────────────────────────────────────────────────────────────

interface MetricsData {
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

interface MetricsComparison {
  thisWeek: MetricsData;
  lastWeek: MetricsData;
  wowChange: Record<keyof MetricsData, number | null>;
  periodStart: string;
  periodEnd: string;
}

export interface ReportPdfProps {
  clientName: string;
  dateLabel: string;
  metrics: MetricsComparison;
  kpiValues: Record<string, number | null> | null;
}

// ─── Colours & constants ─────────────────────────────────────────────────────

const C = {
  black: "#0a0a0a",
  surface: "#141414",
  border: "#2a2a2a",
  white: "#ffffff",
  muted: "#888888",
  green: "#4ade80",
  red: "#f87171",
  blue: "#60a5fa",
  accent: "#e5e5e5",
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    backgroundColor: C.black,
    paddingHorizontal: 36,
    paddingVertical: 32,
    fontFamily: "Helvetica",
    color: C.white,
  },
  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  clientName: { fontSize: 20, fontFamily: "Helvetica-Bold", color: C.white },
  headerMeta: { fontSize: 8, color: C.muted, textAlign: "right" },
  headerPeriod: { fontSize: 10, color: C.accent, textAlign: "right", marginTop: 2 },
  // KPI cards row
  kpiRow: { flexDirection: "row", gap: 8, marginBottom: 18 },
  kpiCard: {
    flex: 1,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 4,
    padding: 10,
  },
  kpiLabel: { fontSize: 7, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5 },
  kpiValue: { fontSize: 16, fontFamily: "Helvetica-Bold", color: C.white, marginTop: 3 },
  kpiChange: { fontSize: 8, marginTop: 3 },
  // Table
  tableCard: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 4,
    marginBottom: 14,
    overflow: "hidden",
  },
  tableTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tableHeader: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tableRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: "#1e1e1e",
  },
  tableRowAlt: {
    backgroundColor: "#111111",
  },
  colMetric: { width: "26%", fontSize: 8, color: C.white },
  colValue: { width: "14%", fontSize: 8, textAlign: "right", color: C.white, fontFamily: "Helvetica-Bold" },
  colPrev: { width: "14%", fontSize: 8, textAlign: "right", color: C.muted },
  colChange: { width: "15%", fontSize: 8, textAlign: "right" },
  colTarget: { width: "16%", fontSize: 8, textAlign: "right", color: C.blue },
  colVsTarget: { width: "15%", fontSize: 8, textAlign: "right" },
  colHeader: { fontSize: 7, color: C.muted, fontFamily: "Helvetica-Bold", textTransform: "uppercase" },
  // Summary
  summaryCard: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 4,
    padding: 12,
  },
  summaryTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  summaryText: { fontSize: 9, color: C.accent, lineHeight: 1.6 },
  summaryBullet: { fontSize: 9, color: C.accent, lineHeight: 1.6, marginLeft: 8 },
  // Footer
  footer: {
    position: "absolute",
    bottom: 20,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: { fontSize: 7, color: C.muted },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

const METRIC_LABELS: Record<string, string> = {
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

const METRIC_FORMATS: Record<string, string> = {
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

const METRIC_KEYS = [
  "cost", "reach", "thumbStopRate", "holdRate", "frequency",
  "cpm", "linkClicks", "ctr", "leads", "costPerLead", "leadRate",
] as const;

const COST_METRICS = ["cost", "cpm", "costPerLead", "frequency"];

function fmt(value: number | null, format: string): string {
  if (value === null || value === undefined) return "—";
  switch (format) {
    case "currency": return `$${value.toFixed(2)}`;
    case "percentage": return `${value.toFixed(2)}%`;
    case "decimal": return value.toFixed(2);
    case "number": return value.toLocaleString();
    default: return String(value);
  }
}

function fmtChange(value: number | null): string {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function changeColor(value: number | null, metricKey: string): string {
  if (value === null || value === 0) return C.muted;
  const isCost = COST_METRICS.includes(metricKey);
  const isGood = isCost ? value < 0 : value > 0;
  return isGood ? C.green : C.red;
}

// ─── PDF Document ─────────────────────────────────────────────────────────────

function ReportDocument({ clientName, dateLabel, metrics, kpiValues }: ReportPdfProps) {
  const { thisWeek, lastWeek, wowChange, periodStart, periodEnd } = metrics;

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* Header */}
        <View style={s.header}>
          <Text style={s.clientName}>{clientName}</Text>
          <View>
            <Text style={s.headerPeriod}>{periodStart} – {periodEnd}</Text>
            <Text style={s.headerMeta}>{dateLabel} · Performance Report</Text>
          </View>
        </View>

        {/* KPI Cards */}
        <View style={s.kpiRow}>
          {(["cost", "leads", "costPerLead", "ctr"] as const).map((key) => {
            const change = wowChange[key];
            const color = changeColor(change, key);
            return (
              <View key={key} style={s.kpiCard}>
                <Text style={s.kpiLabel}>{METRIC_LABELS[key]}</Text>
                <Text style={s.kpiValue}>{fmt(thisWeek[key], METRIC_FORMATS[key])}</Text>
                <Text style={[s.kpiChange, { color }]}>{fmtChange(change)} vs prev period</Text>
              </View>
            );
          })}
        </View>

        {/* Full Metrics Table */}
        <View style={s.tableCard}>
          <Text style={s.tableTitle}>Full Performance Breakdown</Text>
          <View style={s.tableHeader}>
            <Text style={[s.colMetric, s.colHeader]}>Metric</Text>
            <Text style={[s.colValue, s.colHeader]}>This Period</Text>
            <Text style={[s.colPrev, s.colHeader]}>Prev Period</Text>
            <Text style={[s.colChange, s.colHeader]}>Change</Text>
            <Text style={[s.colTarget, s.colHeader]}>KPI Target</Text>
            <Text style={[s.colVsTarget, s.colHeader]}>vs Target</Text>
          </View>
          {METRIC_KEYS.map((key, i) => {
            const targetVal = kpiValues?.[key] ?? null;
            const actualVal = thisWeek[key];
            let vsTarget: number | null = null;
            if (targetVal !== null && actualVal !== null && targetVal !== 0) {
              vsTarget = ((actualVal - targetVal) / Math.abs(targetVal)) * 100;
            }
            const changeVal = wowChange[key];
            return (
              <View key={key} style={[s.tableRow, i % 2 !== 0 ? s.tableRowAlt : {}]}>
                <Text style={s.colMetric}>{METRIC_LABELS[key]}</Text>
                <Text style={s.colValue}>{fmt(actualVal, METRIC_FORMATS[key])}</Text>
                <Text style={s.colPrev}>{fmt(lastWeek[key], METRIC_FORMATS[key])}</Text>
                <Text style={[s.colChange, { color: changeColor(changeVal, key) }]}>
                  {fmtChange(changeVal)}
                </Text>
                <Text style={s.colTarget}>
                  {targetVal !== null ? fmt(targetVal, METRIC_FORMATS[key]) : "—"}
                </Text>
                <Text style={[s.colVsTarget, { color: vsTarget !== null ? changeColor(vsTarget, key) : C.muted }]}>
                  {vsTarget !== null ? fmtChange(vsTarget) : "—"}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>Confidential – {clientName}</Text>
          <Text style={s.footerText}>{new Date().toLocaleDateString("en-AU")}</Text>
        </View>

      </Page>
    </Document>
  );
}

// ─── Download helper ──────────────────────────────────────────────────────────

export async function downloadClientReport(props: ReportPdfProps) {
  const blob = await pdf(<ReportDocument {...props} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${props.clientName.replace(/\s+/g, "_")}_Performance_Report_${props.metrics.periodStart}_to_${props.metrics.periodEnd}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}