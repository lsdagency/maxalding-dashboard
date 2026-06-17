import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Edit, Trash2, ExternalLink } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function Clients() {
  const [, setLocation] = useLocation();
  const { data: clients, isLoading, refetch } = trpc.clients.list.useQuery();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<any>(null);

  // Pull the ad accounts from the connected Business Manager (only when the dialog is open)
  const { data: adAccounts, isLoading: accountsLoading, error: accountsError } =
    trpc.meta.listAdAccounts.useQuery(undefined, { enabled: dialogOpen });

  const [formData, setFormData] = useState({
    name: "",
    metaAdAccountId: "",
  });

  const createMutation = trpc.clients.create.useMutation({
    onSuccess: () => {
      toast.success("Client created successfully");
      setDialogOpen(false);
      resetForm();
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.clients.update.useMutation({
    onSuccess: () => {
      toast.success("Client updated successfully");
      setDialogOpen(false);
      resetForm();
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.clients.delete.useMutation({
    onSuccess: () => {
      toast.success("Client deactivated");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  function resetForm() {
    setFormData({ name: "", metaAdAccountId: "" });
    setEditingClient(null);
  }

  function handleEdit(client: any) {
    setEditingClient(client);
    setFormData({
      name: client.name || "",
      metaAdAccountId: client.metaAdAccountId || "",
    });
    setDialogOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editingClient) {
      updateMutation.mutate({ id: editingClient.id, ...formData });
    } else {
      createMutation.mutate(formData);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Clients</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse bg-card border-border">
              <CardContent className="p-6"><div className="h-20 bg-muted rounded" /></CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Clients</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage gym and fitness coach clients</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="bg-white text-black hover:bg-white/90">
              <Plus className="h-4 w-4 mr-2" />
              Add Client
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border text-foreground">
            <DialogHeader>
              <DialogTitle>{editingClient ? "Edit Client" : "Add New Client"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-foreground">Client Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g., UBX Baulkham Hills"
                  required
                  className="bg-background border-border text-foreground"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Meta Ad Account</Label>
                {accountsError ? (
                  <>
                    <Input
                      value={formData.metaAdAccountId}
                      onChange={(e) => setFormData(p => ({ ...p, metaAdAccountId: e.target.value }))}
                      placeholder="e.g., 123456789"
                      className="bg-background border-border text-foreground"
                    />
                    <p className="text-xs text-destructive">Couldn't load ad accounts — enter the ID manually. ({accountsError.message})</p>
                  </>
                ) : (
                  <Select value={formData.metaAdAccountId} onValueChange={(v) => setFormData(p => ({ ...p, metaAdAccountId: v }))}>
                    <SelectTrigger className="bg-background border-border text-foreground">
                      <SelectValue placeholder={accountsLoading ? "Loading ad accounts…" : "Select an ad account"} />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border max-h-72">
                      {adAccounts?.map(acc => (
                        <SelectItem key={acc.id} value={acc.id}>
                          {acc.name} ({acc.id})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }} className="border-border">
                  Cancel
                </Button>
                <Button type="submit" className="bg-white text-black hover:bg-white/90">
                  {editingClient ? "Update" : "Create"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Client List */}
      {(!clients || clients.length === 0) ? (
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <h3 className="text-lg font-medium text-foreground">No clients yet</h3>
            <p className="text-sm text-muted-foreground mt-1">Click "Add Client" to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {clients.map(client => (
            <Card key={client.id} className={`bg-card border-border ${client.isActive === 0 ? "opacity-50" : ""}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold text-foreground">{client.name}</CardTitle>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => setLocation(`/clients/${client.id}`)}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => handleEdit(client)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    {client.isActive === 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteMutation.mutate({ id: client.id })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 text-sm">
                  {client.metaAdAccountId ? (
                    <p className="text-muted-foreground">
                      <span className="text-xs uppercase tracking-wider">Ad Account:</span>{" "}
                      <span className="text-foreground font-mono text-xs">{client.metaAdAccountId}</span>
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-xs italic">No Meta Ad Account ID set</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
