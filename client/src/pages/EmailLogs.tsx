import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, XCircle, Clock, Mail } from "lucide-react";

export default function EmailLogs() {
  const { data: logs, isLoading } = trpc.email.logs.useQuery({});

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Email Logs</h1>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse bg-card border-border">
              <CardContent className="p-4"><div className="h-12 bg-muted rounded" /></CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Email Logs</h1>
        <p className="text-sm text-muted-foreground mt-1">History of sent performance reports</p>
      </div>

      {(!logs || logs.length === 0) ? (
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Mail className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground">No emails sent yet</h3>
            <p className="text-sm text-muted-foreground mt-1">Email history will appear here once reports are sent.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-card border-border">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recipient</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Subject</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sent At</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                      <td className="py-3 px-4">
                        {log.status === "sent" ? (
                          <span className="inline-flex items-center gap-1 text-green-400">
                            <CheckCircle className="h-4 w-4" />
                            <span className="text-xs font-medium">Sent</span>
                          </span>
                        ) : log.status === "failed" ? (
                          <span className="inline-flex items-center gap-1 text-red-400">
                            <XCircle className="h-4 w-4" />
                            <span className="text-xs font-medium">Failed</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-yellow-400">
                            <Clock className="h-4 w-4" />
                            <span className="text-xs font-medium">Pending</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-foreground">{log.recipientEmail}</td>
                      <td className="py-3 px-4 text-muted-foreground truncate max-w-xs">{log.subject || "—"}</td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {log.sentAt ? new Date(log.sentAt).toLocaleString() : log.createdAt ? new Date(log.createdAt).toLocaleString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
