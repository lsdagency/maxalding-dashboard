"use client";

import useSWR, { mutate } from "swr";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Edit, Trash2, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { slugify } from "@/lib/utils";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface ClientRecord {
  id: number;
  name: string;
  metaAdAccountId: string | null;
}
interface AdAccount {
  id: string;
  name: string;
}

export default function ClientsClient() {
  const router = useRouter();
  const { data: clients } = useSWR<ClientRecord[]>("/api/clients", fetcher);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ClientRecord | null>(null);
  const [form, setForm] = useState({ name: "", metaAdAccountId: "" });
  const [saving, setSaving] = useState(false);

  const {
    data: adAccounts,
    error: adAccountsError,
    isValidating: accountsValidating,
    mutate: refreshAccounts,
  } = useSWR<AdAccount[]>(dialogOpen ? "/api/meta/ad-accounts" : null, fetcher, {
    revalidateOnMount: true,
    revalidateIfStale: true,
    dedupingInterval: 0,
  });
  const accountsLoading = dialogOpen && !adAccounts && !adAccountsError;
  // The endpoint returns an array on success, or {error} on failure.
  const adAccountList = Array.isArray(adAccounts) ? adAccounts : [];
  const accountsFailed = Boolean(adAccountsError) || (adAccounts && !Array.isArray(adAccounts));

  function resetForm() {
    setForm({ name: "", metaAdAccountId: "" });
    setEditing(null);
  }

  function handleEdit(c: ClientRecord) {
    setEditing(c);
    setForm({ name: c.name, metaAdAccountId: c.metaAdAccountId || "" });
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = JSON.stringify({ name: form.name, metaAdAccountId: form.metaAdAccountId || null });
      const res = editing
        ? await fetch(`/api/clients/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body })
        : await fetch("/api/clients", { method: "POST", headers: { "Content-Type": "application/json" }, body });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Save failed");
      toast.success(editing ? "Client updated" : "Client created");
      setDialogOpen(false);
      resetForm();
      mutate("/api/clients");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      const res = await fetch(`/api/clients/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Client removed");
      mutate("/api/clients");
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Clients</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage the clients you report on</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="bg-white text-black hover:bg-white/90">
              <Plus className="mr-2 h-4 w-4" /> Add Client
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border text-foreground">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Client" : "Add New Client"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-foreground">Client Name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g., UBX Baulkham Hills"
                  required
                  className="bg-background border-border text-foreground"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-foreground">Meta Ad Account</Label>
                  <button
                    type="button"
                    onClick={() => refreshAccounts()}
                    disabled={accountsValidating}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                    title="Refresh ad accounts from Meta"
                  >
                    <RefreshCw className={`h-3 w-3 ${accountsValidating ? "animate-spin" : ""}`} />
                    Refresh
                  </button>
                </div>
                {accountsFailed ? (
                  <>
                    <Input
                      value={form.metaAdAccountId}
                      onChange={(e) => setForm((p) => ({ ...p, metaAdAccountId: e.target.value }))}
                      placeholder="e.g., 123456789"
                      className="bg-background border-border text-foreground"
                    />
                    <p className="text-xs text-destructive">Couldn&apos;t load ad accounts — enter the ID manually.</p>
                  </>
                ) : (
                  <Select value={form.metaAdAccountId} onValueChange={(v) => setForm((p) => ({ ...p, metaAdAccountId: v }))}>
                    <SelectTrigger className="bg-background border-border text-foreground">
                      <SelectValue placeholder={accountsLoading ? "Loading ad accounts…" : "Select an ad account"} />
                    </SelectTrigger>
                    <SelectContent className="max-h-72 bg-card border-border">
                      {adAccountList.map((acc) => (
                        <SelectItem key={acc.id} value={acc.id}>{acc.name} ({acc.id})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }} className="border-border">
                  Cancel
                </Button>
                <Button type="submit" disabled={saving} className="bg-white text-black hover:bg-white/90">
                  {editing ? "Update" : "Create"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {!clients ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : clients.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <h3 className="text-lg font-medium text-foreground">No clients yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">Click &quot;Add Client&quot; to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {clients.map((client) => (
            <Card key={client.id} className="bg-card border-border">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold text-foreground">{client.name}</CardTitle>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => router.push(`/clients/${slugify(client.name)}`)}>
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => handleEdit(client)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(client.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {client.metaAdAccountId ? (
                  <p className="text-sm text-muted-foreground">
                    <span className="text-xs uppercase tracking-wider">Ad Account:</span>{" "}
                    <span className="font-mono text-xs text-foreground">{client.metaAdAccountId}</span>
                  </p>
                ) : (
                  <p className="text-xs italic text-muted-foreground">No Meta Ad Account ID set</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
