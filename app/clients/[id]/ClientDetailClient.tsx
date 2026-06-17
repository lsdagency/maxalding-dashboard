"use client";

import useSWR, { mutate } from "swr";
import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, TrendingUp, TrendingDown, Minus, Target, Save, Download } from "lucide-react";
import { DateRangePicker, type DateRangeValue } from "@/components/DateRangePicker";
import { downloadClientReport } from "@/components/ClientReportPdf";
import {
  METRIC_KEYS, METRIC_LABELS, METRIC_FORMATS, KPI_FIELD_MAP, formatValue, type MetricsData, type MetricsComparison,
} from "@/lib/metrics";

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const COST_METRICS = ["cost", "cpm", "costPerLead", "frequency"];

export default function ClientDetailClient({ clientId }: { clientId: number }) {
  const router = useRouter();
  const [range, setRange] = useState<DateRangeValue | null>(null);
  const [dateLabel, setDateLabel] = useState("Mon – Sun (last week)");
  const [showKpiForm, setShowKpiForm] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const qs = range ? `?start=${range.dateStart}&end=${range.dateEnd}` : "";
  const { data, isLoading } = useSWR<{ client: { id: number; name: string; metaAdAccountId: string | null }; metrics: MetricsComparison | null }>(
    `/api/metrics/${clientId}${qs}`,
    fetcher,
  );
  const { data: kpi } = useSWR<Record<string, number | null> | null>(`/api/kpi/${clientId}`, fetcher);

  const client = data?.client;
  const displayMetrics = data?.metrics ?? null;

  // metric-key → target value map (for table + PDF)
  const kpiValues = useMemo(() => {
    if (!kpi) return null;
    const map: Record<string, number | null> = {};
    for (const key of METRIC_KEYS) {
      const v = kpi[KPI_FIELD_MAP[key]];
      map[key] = v == null ? null : Number(v);
    }
    return map;
  }, [kpi]);

  const [kpiForm, setKpiForm] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!kpi) return;
    const f: Record<string, string> = {};
    for (const key of METRIC_KEYS) {
      const v = kpi[KPI_FIELD_MAP[key]];
      f[key] = v == null ? "" : String(v);
    }
    setKpiForm(f);
  }, [kpi]);

  function onApply(r: DateRangeValue) {
    setDateLabel(r.label);
    setRange(r);
  }

  async function handleSaveKpi() {
    const body: Record<string, number | null> = {};
    for (const key of METRIC_KEYS) {
      const v = kpiForm[key];
      body[KPI_FIELD_MAP[key]] = v ? parseFloat(v) : null;
    }
    const res = await fetch(`/api/kpi/${clientId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      mutate(`/api/kpi/${clientId}`);
      setShowKpiForm(false);
    }
  }

  async function handleDownloadPdf() {
    if (!displayMetrics || !client) return;
    setPdfLoading(true);
    try {
      await downloadClientReport({
        clientName: client.name,
        dateLabel,
        metrics: displayMetrics,
        kpiValues: kpiValues ?? null,
      });
    } finally {
      setPdfLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard")} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{client?.name ?? "Client"}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{dateLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setShowKpiForm((s) => !s)} variant="outline" className="border-border text-foreground hover:bg-accent">
            <Target className="mr-2 h-4 w-4" /> KPI Targets
          </Button>
          <Button onClick={handleDownloadPdf} disabled={pdfLoading || !displayMetrics} variant="outline" className="border-border text-foreground hover:bg-accent">
            <Download className="mr-2 h-4 w-4" /> {pdfLoading ? "Generating…" : "Export PDF"}
          </Button>
          <DateRangePicker onApply={onApply} loading={isLoading} />
        </div>
      </div>

      {showKpiForm && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Target className="h-4 w-4" /> Set KPI Targets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {METRIC_KEYS.map((key) => (
                <div key={key} className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{METRIC_LABELS[key]}</Label>
                  <Input
                    type="number"
                    step="any"
                    value={kpiForm[key] || ""}
                    onChange={(e) => setKpiForm((p) => ({ ...p, [key]: e.target.value }))}
                    className="h-9 bg-background border-border text-sm text-foreground"
                  />
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <Button onClick={handleSaveKpi} className="bg-white text-black hover:bg-white/90">
                <Save className="mr-2 h-4 w-4" /> Save Targets
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {displayMetrics && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {(["cost", "leads", "costPerLead", "ctr"] as const).map((key) => (
            <Card key={key} className="bg-card border-border">
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{METRIC_LABELS[key]}</p>
                <p className="mt-1 text-xl font-bold text-foreground">{formatValue(displayMetrics.thisWeek[key], METRIC_FORMATS[key])}</p>
                <div className="mt-1 flex items-center gap-2">
                  <WoWBadge value={displayMetrics.wowChange[key]} />
                  <span className="text-xs text-muted-foreground">vs {formatValue(displayMetrics.lastWeek[key], METRIC_FORMATS[key])}</span>
                </div>
                {kpiValues && kpiValues[key] !== null && (
                  <div className="mt-1 flex items-center gap-1">
                    <Target className="h-3 w-3 text-blue-400" />
                    <span className="text-xs text-blue-400">Target: {formatValue(kpiValues[key], METRIC_FORMATS[key])}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {displayMetrics ? (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-foreground">Full Performance Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Metric</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">This Period</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">Prev Period</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">Change</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">KPI Target</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">vs Target</th>
                  </tr>
                </thead>
                <tbody>
                  {METRIC_KEYS.map((key) => {
                    const targetVal = kpiValues?.[key] ?? null;
                    const actualVal = displayMetrics.thisWeek[key];
                    let vsTarget: number | null = null;
                    if (targetVal !== null && actualVal !== null && targetVal !== 0) {
                      vsTarget = ((actualVal - targetVal) / Math.abs(targetVal)) * 100;
                    }
                    return (
                      <tr key={key} className="border-b border-border/50 transition-colors hover:bg-accent/30">
                        <td className="px-4 py-3 font-medium text-foreground">{METRIC_LABELS[key]}</td>
                        <td className="px-4 py-3 text-center font-semibold text-foreground">{formatValue(actualVal, METRIC_FORMATS[key])}</td>
                        <td className="px-4 py-3 text-center text-muted-foreground">{formatValue(displayMetrics.lastWeek[key], METRIC_FORMATS[key])}</td>
                        <td className="px-4 py-3 text-center"><WoWBadge value={displayMetrics.wowChange[key]} /></td>
                        <td className="px-4 py-3 text-center text-blue-400">{targetVal !== null ? formatValue(targetVal, METRIC_FORMATS[key]) : "—"}</td>
                        <td className="px-4 py-3 text-center">{vsTarget !== null ? <KpiBadge value={vsTarget} metricKey={key} /> : <span className="text-xs text-muted-foreground">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <h3 className="text-lg font-medium text-foreground">No metrics data</h3>
            <p className="mt-1 text-sm text-muted-foreground">Pick a date range, or check this client has a Meta Ad Account ID set.</p>
          </CardContent>
        </Card>
      )}

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-foreground">Client Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Meta Ad Account ID</p>
            <p className="mt-0.5 font-mono text-foreground">{client?.metaAdAccountId || "Not configured"}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function WoWBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-muted-foreground">—</span>;
  const pos = value > 0, neg = value < 0;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-semibold ${pos ? "bg-green-400/10 text-green-400" : neg ? "bg-red-400/10 text-red-400" : "bg-muted text-muted-foreground"}`}>
      {pos ? <TrendingUp className="h-3 w-3" /> : neg ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
      {pos ? "+" : ""}{value.toFixed(1)}%
    </span>
  );
}

function KpiBadge({ value, metricKey }: { value: number; metricKey: string }) {
  const isCost = COST_METRICS.includes(metricKey);
  const good = isCost ? value < 0 : value > 0;
  const bad = isCost ? value > 0 : value < 0;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-semibold ${good ? "bg-green-400/10 text-green-400" : bad ? "bg-red-400/10 text-red-400" : "bg-muted text-muted-foreground"}`}>
      {good ? <TrendingUp className="h-3 w-3" /> : bad ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
      {value > 0 ? "+" : ""}{value.toFixed(1)}%
    </span>
  );
}
