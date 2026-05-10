import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus, Users } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useState } from "react";
import { DateRangePicker, type DateRangeValue } from "@/components/DateRangePicker";

const METRIC_LABELS: Record<string, string> = {
  cost: "Amount Spent",
  reach: "Reach",
  thumbStopRate: "Thumb Stop Rate",
  holdRate: "Hold Rate",
  frequency: "Frequency",
  cpm: "CPM",
  linkClicks: "Link Clicks",
  ctr: "CTR",
  leads: "Leads",
  costPerLead: "Cost Per Lead",
  leadRate: "Lead Rate",
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

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { data: clientsData, isLoading, refetch } = trpc.metrics.getAllClientsMetrics.useQuery();
  // Live metrics override keyed by clientId — populated from mutation result, bypasses DB re-query
  const [liveMetricsMap, setLiveMetricsMap] = useState<Record<number, any>>({});
  const [activeDateLabel, setActiveDateLabel] = useState("Past 7 days");

  const fetchAllMutation = trpc.metrics.fetchAllFromMeta.useMutation({
    onSuccess: (results) => {
      const successCount = results.filter(r => r.success).length;
      toast.success(`Refreshed ${successCount}/${results.length} clients`);
      const newMap: Record<number, any> = {};
      for (const r of results) {
        if (r.success && "thisWeek" in r) {
          newMap[r.clientId] = { thisWeek: r.thisWeek, lastWeek: r.lastWeek, wowChange: r.wowChange };
        }
      }
      setLiveMetricsMap(newMap);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleDateRange = (range: DateRangeValue) => {
    setActiveDateLabel(range.label);
    fetchAllMutation.mutate({ dateStart: range.dateStart, dateEnd: range.dateEnd });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">Loading performance data...</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse bg-card border-border">
              <CardHeader className="pb-3">
                <div className="h-5 w-32 bg-muted rounded" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="h-4 w-full bg-muted rounded" />
                  <div className="h-4 w-3/4 bg-muted rounded" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const activeClients = (clientsData || []).map(c => ({
    ...c,
    metrics: liveMetricsMap[c.id] ?? c.metrics,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Performance Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {activeDateLabel} — {activeClients.length} active client{activeClients.length !== 1 ? "s" : ""}
          </p>
        </div>
        <DateRangePicker onApply={handleDateRange} loading={fetchAllMutation.isPending} />
      </div>

      {/* Summary Stats */}
      {activeClients.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Active Clients</p>
              <p className="text-2xl font-bold text-foreground mt-1">{activeClients.length}</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Spend</p>
              <p className="text-2xl font-bold text-foreground mt-1">
                ${activeClients.reduce((sum, c) => sum + (c.metrics?.thisWeek?.cost || 0), 0).toFixed(2)}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Leads</p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {activeClients.reduce((sum, c) => sum + (c.metrics?.thisWeek?.leads || 0), 0)}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Avg CPL</p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {(() => {
                  const cpls = activeClients
                    .map(c => c.metrics?.thisWeek?.costPerLead)
                    .filter((v): v is number => v !== null && v !== undefined && v > 0);
                  return cpls.length > 0 ? `$${(cpls.reduce((a, b) => a + b, 0) / cpls.length).toFixed(2)}` : "—";
                })()}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Client Cards */}
      {activeClients.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground">No clients yet</h3>
            <p className="text-sm text-muted-foreground mt-1">Add your first client to start tracking performance.</p>
            <Button
              onClick={() => setLocation("/clients")}
              className="mt-4 bg-white text-black hover:bg-white/90"
            >
              Add Client
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {activeClients.map(client => (
            <Card
              key={client.id}
              className="bg-card border-border hover:border-foreground/20 transition-colors cursor-pointer"
              onClick={() => setLocation(`/clients/${client.id}`)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-semibold text-foreground">{client.name}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {client.metrics ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                    {(["cost", "leads", "costPerLead", "ctr", "thumbStopRate", "holdRate", "cpm", "frequency"] as const).map(key => (
                      <div key={key} className="space-y-1">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{METRIC_LABELS[key]}</p>
                        <p className="text-sm font-semibold text-foreground">
                          {formatValue(client.metrics!.thisWeek[key] as number | null, METRIC_FORMATS[key])}
                        </p>
                        <WoWIndicator value={client.metrics!.wowChange[key] as number | null} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No metrics data available. Refresh to pull from Meta.</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function WoWIndicator({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-muted-foreground">—</span>;

  const isPositive = value > 0;
  const isNegative = value < 0;

  return (
    <span className={`text-xs font-medium flex items-center gap-0.5 ${
      isPositive ? "text-green-400" : isNegative ? "text-red-400" : "text-muted-foreground"
    }`}>
      {isPositive ? <TrendingUp className="h-3 w-3" /> : isNegative ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
      {isPositive ? "+" : ""}{value.toFixed(1)}%
    </span>
  );
}
