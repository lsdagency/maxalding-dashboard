"use client";

import useSWR from "swr";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus, Users } from "lucide-react";
import { DateRangePicker, type DateRangeValue } from "@/components/DateRangePicker";
import { formatValue, METRIC_LABELS, METRIC_FORMATS, type MetricsData } from "@/lib/metrics";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface ClientWithMetrics {
  id: number;
  name: string;
  metaAdAccountId: string | null;
  metrics: {
    thisWeek: MetricsData;
    wowChange: Record<keyof MetricsData, number | null>;
  } | null;
}

export default function DashboardClient() {
  const router = useRouter();
  const [range, setRange] = useState<DateRangeValue | null>(null);
  const [label, setLabel] = useState("Mon – Sun (last week)");

  const qs = range ? `?start=${range.dateStart}&end=${range.dateEnd}` : "";
  const { data, isLoading } = useSWR<{ clients: ClientWithMetrics[] }>(`/api/metrics${qs}`, fetcher);

  const clients = data?.clients ?? [];

  function onApply(r: DateRangeValue) {
    setLabel(r.label);
    setRange(r);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Performance Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {label} — {clients.length} client{clients.length !== 1 ? "s" : ""}
          </p>
        </div>
        <DateRangePicker onApply={onApply} loading={isLoading} />
      </div>

      {clients.length > 0 && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Clients" value={String(clients.length)} />
          <StatCard
            label="Total Spend"
            value={`$${clients.reduce((s, c) => s + (c.metrics?.thisWeek.cost || 0), 0).toFixed(2)}`}
          />
          <StatCard
            label="Total Results"
            value={String(clients.reduce((s, c) => s + (c.metrics?.thisWeek.leads || 0), 0))}
          />
          <StatCard
            label="Avg Cost / Result"
            value={(() => {
              const vals = clients
                .map((c) => c.metrics?.thisWeek.costPerLead)
                .filter((v): v is number => typeof v === "number" && v > 0);
              return vals.length ? `$${(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)}` : "—";
            })()}
          />
        </div>
      )}

      {isLoading && clients.length === 0 ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {[1, 2].map((i) => (
            <Card key={i} className="animate-pulse bg-card border-border">
              <CardContent className="p-6"><div className="h-24 rounded bg-muted" /></CardContent>
            </Card>
          ))}
        </div>
      ) : clients.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Users className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="text-lg font-medium text-foreground">No clients yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">Add your first client to start tracking performance.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {clients.map((client) => (
            <Card
              key={client.id}
              className="cursor-pointer bg-card border-border transition-colors hover:border-foreground/20"
              onClick={() => router.push(`/clients/${client.id}`)}
            >
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-semibold text-foreground">{client.name}</CardTitle>
              </CardHeader>
              <CardContent>
                {client.metrics ? (
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                    {(["cost", "leads", "costPerLead", "ctr", "thumbStopRate", "holdRate", "cpm", "frequency"] as const).map((key) => (
                      <div key={key} className="space-y-1">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{METRIC_LABELS[key]}</p>
                        <p className="text-sm font-semibold text-foreground">
                          {formatValue(client.metrics!.thisWeek[key], METRIC_FORMATS[key])}
                        </p>
                        <WoW value={client.metrics!.wowChange[key]} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No metrics — check this client has a Meta Ad Account ID set.</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}

function WoW({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-muted-foreground">—</span>;
  const pos = value > 0;
  const neg = value < 0;
  return (
    <span className={`flex items-center gap-0.5 text-xs font-medium ${pos ? "text-green-400" : neg ? "text-red-400" : "text-muted-foreground"}`}>
      {pos ? <TrendingUp className="h-3 w-3" /> : neg ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
      {pos ? "+" : ""}{value.toFixed(1)}%
    </span>
  );
}
