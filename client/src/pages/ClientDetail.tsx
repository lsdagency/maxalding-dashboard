import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, TrendingUp, TrendingDown, Minus, Target, Save, Download } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";
import { useState, useEffect, useMemo } from "react";
import { DateRangePicker, type DateRangeValue } from "@/components/DateRangePicker";
import { downloadClientReport } from "@/components/ClientReportPdf";

const METRIC_KEYS = [
  "cost", "reach", "thumbStopRate", "holdRate", "frequency",
  "cpm", "linkClicks", "ctr", "leads", "costPerLead", "leadRate"
] as const;

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

const KPI_FIELD_MAP: Record<string, string> = {
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

function formatValue(value: number | null, format: string): string {
  if (value === null || value === undefined) return "—";
  switch (format) {
    case "currency": return `$${value.toFixed(2)}`;
    case "percentage": return `${value.toFixed(2)}%`;
    case "decimal": return value.toFixed(2);
    case "number": return value.toLocaleString();
    default: return String(value);
  }
}

export default function ClientDetail() {
  const params = useParams<{ id: string }>();
  const clientId = parseInt(params.id || "0", 10);
  const [, setLocation] = useLocation();
  const [showKpiForm, setShowKpiForm] = useState(false);

  const { data: client, isLoading: clientLoading } = trpc.clients.getById.useQuery({ id: clientId });
  const { data: metrics, isLoading: metricsLoading, refetch } = trpc.metrics.getForClient.useQuery({ clientId });
  const { data: kpiTargets, refetch: refetchKpi } = trpc.kpiTargets.getForClient.useQuery({ clientId });

  const [kpiForm, setKpiForm] = useState<Record<string, string>>({});

  // Initialize KPI form when data loads
  useEffect(() => {
    if (kpiTargets) {
      const formValues: Record<string, string> = {};
      for (const key of METRIC_KEYS) {
        const fieldName = KPI_FIELD_MAP[key];
        const val = (kpiTargets as any)?.[fieldName];
        formValues[key] = val != null ? String(val) : "";
      }
      setKpiForm(formValues);
    }
  }, [kpiTargets]);

  const kpiMutation = trpc.kpiTargets.upsert.useMutation({
    onSuccess: () => {
      toast.success("KPI targets saved");
      refetchKpi();
      setShowKpiForm(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const [liveMetrics, setLiveMetrics] = useState<any>(null);
  const [dateLabel, setDateLabel] = useState("Mon – Sun (last week)");

  const fetchMutation = trpc.metrics.fetchFromMeta.useMutation({
    onSuccess: (data) => {
      toast.success("Metrics refreshed from Meta");
      setLiveMetrics(data);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleDateRange = (range: DateRangeValue) => {
    setDateLabel(range.label);
    fetchMutation.mutate({ clientId, dateStart: range.dateStart, dateEnd: range.dateEnd });
  };

  // Use live data from mutation result if available, else fall back to the live default-range query
  const displayMetrics = liveMetrics ?? metrics;

  const [pdfLoading, setPdfLoading] = useState(false);

  const handleDownloadPdf = async () => {
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
  };

  const handleSaveKpi = () => {
    const payload: any = { clientId };
    for (const key of METRIC_KEYS) {
      const fieldName = KPI_FIELD_MAP[key] as string;
      const val = kpiForm[key];
      payload[fieldName] = val ? parseFloat(val) : null;
    }
    kpiMutation.mutate(payload);
  };

  // Memoize KPI values map for display
  const kpiValues = useMemo(() => {
    if (!kpiTargets) return null;
    const map: Record<string, number | null> = {};
    for (const key of METRIC_KEYS) {
      const fieldName = KPI_FIELD_MAP[key];
      const val = (kpiTargets as any)?.[fieldName];
      map[key] = val != null ? parseFloat(val) : null;
    }
    return map;
  }, [kpiTargets]);

  if (clientLoading || metricsLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-64 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => setLocation("/clients")} className="text-muted-foreground">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Clients
        </Button>
        <p className="text-foreground">Client not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{client.name}</h1>
            {displayMetrics && (
              <p className="text-sm text-muted-foreground mt-0.5">{dateLabel}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setShowKpiForm(!showKpiForm)}
            variant="outline"
            className="border-border text-foreground hover:bg-accent"
          >
            <Target className="h-4 w-4 mr-2" />
            KPI Targets
          </Button>
          <Button
            onClick={handleDownloadPdf}
            disabled={pdfLoading || !displayMetrics}
            variant="outline"
            className="border-border text-foreground hover:bg-accent"
          >
            <Download className="h-4 w-4 mr-2" />
            {pdfLoading ? "Generating..." : "Export PDF"}
          </Button>
          <DateRangePicker onApply={handleDateRange} loading={fetchMutation.isPending} />
        </div>
      </div>

      {/* KPI Targets Form */}
      {showKpiForm && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
              <Target className="h-4 w-4" />
              Set KPI Targets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {METRIC_KEYS.map(key => (
                <div key={key} className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{METRIC_LABELS[key]}</Label>
                  <Input
                    type="number"
                    step="any"
                    value={kpiForm[key] || ""}
                    onChange={(e) => setKpiForm(prev => ({ ...prev, [key]: e.target.value }))}
                    placeholder={METRIC_FORMATS[key] === "percentage" ? "e.g., 15.0" : METRIC_FORMATS[key] === "currency" ? "e.g., 50.00" : "e.g., 100"}
                    className="bg-background border-border text-foreground h-9 text-sm"
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-4">
              <Button onClick={handleSaveKpi} className="bg-white text-black hover:bg-white/90">
                <Save className="h-4 w-4 mr-2" />
                Save Targets
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Metric Cards - Key KPIs */}
      {displayMetrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {(["cost", "leads", "costPerLead", "ctr"] as const).map(key => (
            <Card key={key} className="bg-card border-border">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">{METRIC_LABELS[key]}</p>
                <p className="text-xl font-bold text-foreground mt-1">
                  {formatValue(displayMetrics.thisWeek[key] as number | null, METRIC_FORMATS[key])}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <WoWBadge value={displayMetrics.wowChange[key] as number | null} />
                  <span className="text-xs text-muted-foreground">
                    vs {formatValue(displayMetrics.lastWeek[key] as number | null, METRIC_FORMATS[key])}
                  </span>
                </div>
                {kpiValues && kpiValues[key] !== null && (
                  <div className="flex items-center gap-1 mt-1">
                    <Target className="h-3 w-3 text-blue-400" />
                    <span className="text-xs text-blue-400">
                      Target: {formatValue(kpiValues[key], METRIC_FORMATS[key])}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Full Metrics Table */}
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
                    <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Metric</th>
                    <th className="text-center py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">This Week</th>
                    <th className="text-center py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Prev Period</th>
                    <th className="text-center py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">WoW Change</th>
                    <th className="text-center py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">KPI Target</th>
                    <th className="text-center py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">vs Target</th>
                  </tr>
                </thead>
                <tbody>
                  {METRIC_KEYS.map(key => {
                    const targetVal = kpiValues?.[key] ?? null;
                    const actualVal = displayMetrics.thisWeek[key] as number | null;
                    let vsTarget: number | null = null;
                    if (targetVal !== null && actualVal !== null && targetVal !== 0) {
                      vsTarget = ((actualVal - targetVal) / targetVal) * 100;
                    }

                    return (
                      <tr key={key} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                        <td className="py-3 px-4 font-medium text-foreground">{METRIC_LABELS[key]}</td>
                        <td className="py-3 px-4 text-center text-foreground font-semibold">
                          {formatValue(displayMetrics.thisWeek[key] as number | null, METRIC_FORMATS[key])}
                        </td>
                        <td className="py-3 px-4 text-center text-muted-foreground">
                          {formatValue(displayMetrics.lastWeek[key] as number | null, METRIC_FORMATS[key])}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <WoWBadge value={displayMetrics.wowChange[key] as number | null} />
                        </td>
                        <td className="py-3 px-4 text-center text-blue-400">
                          {targetVal !== null ? formatValue(targetVal, METRIC_FORMATS[key]) : "—"}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {vsTarget !== null ? <KpiBadge value={vsTarget} metricKey={key} /> : <span className="text-xs text-muted-foreground">—</span>}
                        </td>
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
            <p className="text-sm text-muted-foreground mt-1">
              Pick a date range, or check this client has a Meta Ad Account ID set.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Client Info */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-foreground">Client Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Meta Ad Account ID</p>
            <p className="text-foreground font-mono mt-0.5">{client.metaAdAccountId || "Not configured"}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function WoWBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-muted-foreground">—</span>;

  const isPositive = value > 0;
  const isNegative = value < 0;

  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded ${
      isPositive ? "text-green-400 bg-green-400/10" : isNegative ? "text-red-400 bg-red-400/10" : "text-muted-foreground bg-muted"
    }`}>
      {isPositive ? <TrendingUp className="h-3 w-3" /> : isNegative ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
      {isPositive ? "+" : ""}{value.toFixed(1)}%
    </span>
  );
}

/**
 * KPI Badge - shows whether metric is above/below target
 * For cost-type metrics (cost, cpm, costPerLead), BELOW target is good (green)
 * For performance metrics (reach, ctr, leads, etc.), ABOVE target is good (green)
 */
function KpiBadge({ value, metricKey }: { value: number; metricKey: string }) {
  // For cost metrics, being below target is good
  const costMetrics = ["cost", "cpm", "costPerLead", "frequency"];
  const isCostMetric = costMetrics.includes(metricKey);

  const isGood = isCostMetric ? value < 0 : value > 0;
  const isBad = isCostMetric ? value > 0 : value < 0;

  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded ${
      isGood ? "text-green-400 bg-green-400/10" : isBad ? "text-red-400 bg-red-400/10" : "text-muted-foreground bg-muted"
    }`}>
      {isGood ? <TrendingUp className="h-3 w-3" /> : isBad ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
      {value > 0 ? "+" : ""}{value.toFixed(1)}%
    </span>
  );
}
