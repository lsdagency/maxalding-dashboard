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
import { Plus, Edit, Trash2, Send, Eye, Mail } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function EmailConfig() {
  const { data: configs, isLoading: configsLoading, refetch } = trpc.emailConfig.getAll.useQuery();
  const { data: clients } = trpc.clients.listActive.useQuery();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [editingConfig, setEditingConfig] = useState<any>(null);

  const [formData, setFormData] = useState({
    clientId: "",
    recipientEmail: "",
    recipientName: "",
  });

  const createMutation = trpc.emailConfig.create.useMutation({
    onSuccess: () => {
      toast.success("Email config created");
      setDialogOpen(false);
      resetForm();
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.emailConfig.update.useMutation({
    onSuccess: () => {
      toast.success("Email config updated");
      setDialogOpen(false);
      resetForm();
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.emailConfig.delete.useMutation({
    onSuccess: () => {
      toast.success("Email config removed");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const previewMutation = trpc.email.preview.useMutation({
    onSuccess: (data) => {
      setPreviewHtml(data.html);
      setPreviewOpen(true);
    },
    onError: (e) => toast.error(e.message),
  });

  const sendMutation = trpc.email.send.useMutation({
    onSuccess: () => {
      toast.success("Email sent successfully!");
    },
    onError: (e) => toast.error(e.message),
  });

  const sendAllMutation = trpc.email.sendAll.useMutation({
    onSuccess: (results) => {
      const successCount = results.filter(r => r.success).length;
      toast.success(`Sent ${successCount}/${results.length} emails`);
    },
    onError: (e) => toast.error(e.message),
  });

  function resetForm() {
    setFormData({ clientId: "", recipientEmail: "", recipientName: "" });
    setEditingConfig(null);
  }

  function handleEdit(config: any) {
    setEditingConfig(config);
    setFormData({
      clientId: String(config.clientId),
      recipientEmail: config.recipientEmail || "",
      recipientName: config.recipientName || "",
    });
    setDialogOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editingConfig) {
      updateMutation.mutate({
        id: editingConfig.id,
        recipientEmail: formData.recipientEmail,
        recipientName: formData.recipientName,
      });
    } else {
      createMutation.mutate({
        clientId: parseInt(formData.clientId, 10),
        recipientEmail: formData.recipientEmail,
        recipientName: formData.recipientName,
      });
    }
  }

  function handlePreview(config: any) {
    previewMutation.mutate({ clientId: config.clientId });
  }

  function handleSend(config: any) {
    sendMutation.mutate({
      clientId: config.clientId,
      recipientEmail: config.recipientEmail,
    });
  }

  if (configsLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Email Configuration</h1>
        <div className="space-y-4">
          {[1, 2].map(i => (
            <Card key={i} className="animate-pulse bg-card border-border">
              <CardContent className="p-6"><div className="h-16 bg-muted rounded" /></CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Email Configuration</h1>
          <p className="text-sm text-muted-foreground mt-1">Configure automated weekly performance reports</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={() => sendAllMutation.mutate()}
            disabled={sendAllMutation.isPending || !configs?.length}
            variant="outline"
            className="border-border text-foreground hover:bg-accent"
          >
            <Send className="h-4 w-4 mr-2" />
            Send All Now
          </Button>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="bg-white text-black hover:bg-white/90">
                <Plus className="h-4 w-4 mr-2" />
                Add Config
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border text-foreground">
              <DialogHeader>
                <DialogTitle>{editingConfig ? "Edit Email Config" : "New Email Config"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                {!editingConfig && (
                  <div className="space-y-2">
                    <Label className="text-foreground">Client *</Label>
                    <Select value={formData.clientId} onValueChange={(v) => setFormData(p => ({ ...p, clientId: v }))}>
                      <SelectTrigger className="bg-background border-border text-foreground">
                        <SelectValue placeholder="Select a client" />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        {clients?.map(c => (
                          <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-foreground">Recipient Name</Label>
                    <Input
                      value={formData.recipientName}
                      onChange={(e) => setFormData(p => ({ ...p, recipientName: e.target.value }))}
                      placeholder="Client name"
                      className="bg-background border-border text-foreground"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-foreground">Recipient Email *</Label>
                    <Input
                      value={formData.recipientEmail}
                      onChange={(e) => setFormData(p => ({ ...p, recipientEmail: e.target.value }))}
                      placeholder="email@example.com"
                      type="email"
                      required
                      className="bg-background border-border text-foreground"
                    />
                  </div>
                </div>
                <div className="rounded-md bg-muted/40 border border-border px-3 py-2.5">
                  <p className="text-xs text-muted-foreground">A short performance summary is automatically generated by AI and included above the metrics table in each email.</p>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }} className="border-border">
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-white text-black hover:bg-white/90">
                    {editingConfig ? "Update" : "Create"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Info Card */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div>
              <p className="text-sm text-foreground font-medium">Automated Weekly Reports</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Reports are automatically sent every Friday at 3:00 PM containing the prior 7 days of performance data.
                You can also manually send reports at any time using the "Send All Now" button.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Config List */}
      {(!configs || configs.length === 0) ? (
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Mail className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground">No email configs</h3>
            <p className="text-sm text-muted-foreground mt-1">Add a configuration to start sending automated reports.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {configs.map(config => {
            const clientName = clients?.find(c => c.id === config.clientId)?.name || `Client #${config.clientId}`;
            return (
              <Card key={config.id} className="bg-card border-border">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">{clientName}</p>
                      <p className="text-xs text-muted-foreground">
                        To: {config.recipientName ? `${config.recipientName} <${config.recipientEmail}>` : config.recipientEmail}
                      </p>
                      <p className="text-xs text-muted-foreground">AI-generated performance summary included</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => handlePreview(config)}
                        title="Preview email"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => handleSend(config)}
                        title="Send now"
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => handleEdit(config)}
                        title="Edit"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteMutation.mutate({ id: config.id })}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Email Preview</DialogTitle>
          </DialogHeader>
          <div className="border border-border rounded-lg overflow-hidden">
            <iframe
              srcDoc={previewHtml}
              className="w-full h-[500px] bg-black"
              title="Email Preview"
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
