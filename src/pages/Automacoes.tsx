import { useState, useEffect } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Loader2, Trash2, Edit, Zap, ShieldCheck, Brain, MessageSquare, Users, HeartPulse, Clock, Play, CheckCircle2, XCircle } from "lucide-react";

// ─── Business Rules (existing) ─────────────────────────────────────────────

interface BusinessRule {
  id: string;
  name: string;
  description: string | null;
  field: string;
  operator: string;
  value: string;
  action_type: string;
  action_config: any;
  priority: number;
  is_active: boolean;
  created_at: string;
}

const FIELDS = [
  { value: "message_text", label: "Texto da mensagem" },
  { value: "channel", label: "Canal" },
  { value: "contact_name", label: "Nome do contacto" },
  { value: "department", label: "Departamento" },
  { value: "attendance_mode", label: "Modo de atendimento" },
];

const OPERATORS = [
  { value: "equals", label: "Igual a" },
  { value: "not_equals", label: "Diferente de" },
  { value: "contains", label: "Contém" },
  { value: "not_contains", label: "Não contém" },
  { value: "starts_with", label: "Começa com" },
  { value: "ends_with", label: "Termina com" },
  { value: "exists", label: "Existe" },
  { value: "not_exists", label: "Não existe" },
];

const ACTIONS = [
  { value: "auto_reply", label: "Resposta automática" },
  { value: "change_agent", label: "Mudar agente" },
  { value: "transfer_human", label: "Transferir para humano" },
  { value: "set_priority", label: "Definir prioridade" },
];

const defaultRule: Partial<BusinessRule> = {
  name: "", description: "", field: "message_text", operator: "contains",
  value: "", action_type: "auto_reply", action_config: {}, priority: 0, is_active: true,
};

// ─── AI Automations ─────────────────────────────────────────────────────────

interface AutomationSetting {
  automation_type: string;
  is_enabled: boolean;
  config: any;
}

interface AutomationRun {
  id: string;
  automation_type: string;
  entity_id: string | null;
  entity_type: string | null;
  status: string;
  result: any;
  error_message: string | null;
  created_at: string;
}

const AUTOMATION_META: Record<string, { label: string; description: string; icon: React.ReactNode; configFields: { key: string; label: string; type: string; default: number }[] }> = {
  summary: {
    label: "Resumo Automático",
    description: "Gera resumos de conversas ativas com IA e notifica a equipa",
    icon: <MessageSquare className="h-5 w-5" />,
    configFields: [
      { key: "min_messages", label: "Mín. mensagens", type: "number", default: 10 },
      { key: "cooldown_hours", label: "Cooldown (horas)", type: "number", default: 4 },
    ],
  },
  classify: {
    label: "Classificação de Leads",
    description: "Classifica leads novos automaticamente com score, área e viabilidade",
    icon: <Brain className="h-5 w-5" />,
    configFields: [
      { key: "max_age_hours", label: "Leads até (horas)", type: "number", default: 24 },
    ],
  },
  followup: {
    label: "Follow-up Inatividade",
    description: "Detecta leads inativos e sugere próxima ação via IA",
    icon: <Clock className="h-5 w-5" />,
    configFields: [
      { key: "inactive_days", label: "Dias p/ alerta", type: "number", default: 7 },
      { key: "critical_days", label: "Dias p/ crítico", type: "number", default: 30 },
    ],
  },
  sentiment: {
    label: "Análise de Sentimento",
    description: "Analisa sentimento do cliente e alerta em caso de frustração",
    icon: <HeartPulse className="h-5 w-5" />,
    configFields: [
      { key: "message_count", label: "Nº mensagens", type: "number", default: 5 },
    ],
  },
};

function AIAutomationsPanel() {
  const [settings, setSettings] = useState<AutomationSetting[]>([]);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const [settingsRes, runsRes] = await Promise.all([
      supabase.from("automation_settings").select("*"),
      supabase.from("automation_runs").select("*").order("created_at", { ascending: false }).limit(50),
    ]);

    if (settingsRes.data) setSettings(settingsRes.data as unknown as AutomationSetting[]);
    if (runsRes.data) setRuns(runsRes.data as unknown as AutomationRun[]);
    setLoading(false);
  };

  const toggleAutomation = async (type: string, enabled: boolean) => {
    await supabase.from("automation_settings").update({ is_enabled: enabled } as any).eq("automation_type", type);
    setSettings(prev => prev.map(s => s.automation_type === type ? { ...s, is_enabled: enabled } : s));
    toast.success(`${AUTOMATION_META[type]?.label} ${enabled ? "ativada" : "desativada"}`);
  };

  const updateConfig = async (type: string, key: string, value: number) => {
    const setting = settings.find(s => s.automation_type === type);
    const newConfig = { ...(setting?.config || {}), [key]: value };
    await supabase.from("automation_settings").update({ config: newConfig } as any).eq("automation_type", type);
    setSettings(prev => prev.map(s => s.automation_type === type ? { ...s, config: newConfig } : s));
  };

  const runNow = async (type: string) => {
    setRunning(type);
    try {
      const { data, error } = await supabase.functions.invoke("ai-internal-automations", {
        body: { actions: [type] },
      });
      if (error) throw new Error(error.message);
      const result = data?.results?.[type];
      toast.success(`${AUTOMATION_META[type]?.label}: ${result?.processed || 0} processado(s)`);
      loadData();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRunning(null);
    }
  };

  const getRunStats = (type: string) => {
    const typeRuns = runs.filter(r => r.automation_type === type);
    const last = typeRuns[0];
    const successCount = typeRuns.filter(r => r.status === "success").length;
    const errorCount = typeRuns.filter(r => r.status === "error").length;
    return { last, successCount, errorCount, total: typeRuns.length };
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        {Object.entries(AUTOMATION_META).map(([type, meta]) => {
          const setting = settings.find(s => s.automation_type === type);
          const stats = getRunStats(type);
          const isEnabled = setting?.is_enabled ?? true;

          return (
            <Card key={type} className={!isEnabled ? "opacity-60" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <span className="text-primary">{meta.icon}</span>
                    {meta.label}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => runNow(type)}
                      disabled={running === type || !isEnabled}
                    >
                      {running === type ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                    </Button>
                    <Switch checked={isEnabled} onCheckedChange={(v) => toggleAutomation(type, v)} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{meta.description}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Stats */}
                <div className="flex gap-3 text-xs">
                  <span className="flex items-center gap-1 text-green-600">
                    <CheckCircle2 className="h-3 w-3" /> {stats.successCount}
                  </span>
                  <span className="flex items-center gap-1 text-destructive">
                    <XCircle className="h-3 w-3" /> {stats.errorCount}
                  </span>
                  {stats.last && (
                    <span className="text-muted-foreground ml-auto">
                      Última: {new Date(stats.last.created_at).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>

                {/* Config fields */}
                <div className="grid grid-cols-2 gap-2">
                  {meta.configFields.map((field) => (
                    <div key={field.key}>
                      <Label className="text-[10px] text-muted-foreground">{field.label}</Label>
                      <Input
                        type="number"
                        className="h-7 text-xs"
                        value={setting?.config?.[field.key] ?? field.default}
                        onChange={(e) => updateConfig(type, field.key, parseInt(e.target.value) || field.default)}
                        disabled={!isEnabled}
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recent runs */}
      {runs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Execuções Recentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {runs.slice(0, 20).map((run) => (
                <div key={run.id} className="flex items-center gap-2 text-xs py-1 border-b border-border/50 last:border-0">
                  <Badge variant={run.status === "success" ? "default" : run.status === "error" ? "destructive" : "secondary"} className="text-[10px] px-1.5">
                    {run.status}
                  </Badge>
                  <span className="font-medium">{AUTOMATION_META[run.automation_type]?.label || run.automation_type}</span>
                  {run.entity_type && <span className="text-muted-foreground">({run.entity_type})</span>}
                  <span className="text-muted-foreground ml-auto">
                    {new Date(run.created_at).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {run.error_message && (
                    <span className="text-destructive truncate max-w-[200px]" title={run.error_message}>
                      {run.error_message}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function AutomacoesPage() {
  const [rules, setRules] = useState<BusinessRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<BusinessRule>>(defaultRule);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadRules(); }, []);

  const loadRules = async () => {
    setLoading(true);
    const { data } = await supabase.from("business_rules").select("*").order("priority", { ascending: false });
    if (data) setRules(data as unknown as BusinessRule[]);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!editing.name?.trim()) { toast.error("Nome é obrigatório"); return; }
    if (!editing.value?.trim() && !["exists", "not_exists"].includes(editing.operator || "")) {
      toast.error("Valor é obrigatório"); return;
    }
    setSaving(true);
    try {
      if (editing.id) {
        const { error } = await supabase.from("business_rules").update(editing as any).eq("id", editing.id);
        if (error) throw error;
        toast.success("Regra atualizada");
      } else {
        const { error } = await supabase.from("business_rules").insert(editing as any);
        if (error) throw error;
        toast.success("Regra criada");
      }
      setDialogOpen(false);
      loadRules();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("business_rules").delete().eq("id", deleteId);
    if (error) toast.error(error.message);
    else { toast.success("Regra eliminada"); loadRules(); }
    setDeleteId(null);
  };

  const toggleActive = async (rule: BusinessRule) => {
    await supabase.from("business_rules").update({ is_active: !rule.is_active } as any).eq("id", rule.id);
    loadRules();
  };

  return (
    <div>
      <PageHeader title="Automações & IA" description="Regras de negócio determinísticas e automações inteligentes com IA" />

      <Tabs defaultValue="ia" className="space-y-4">
        <TabsList>
          <TabsTrigger value="ia" className="flex items-center gap-1">
            <Brain className="h-4 w-4" /> Automações IA
          </TabsTrigger>
          <TabsTrigger value="rules" className="flex items-center gap-1">
            <ShieldCheck className="h-4 w-4" /> Regras de Negócio
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ia">
          <AIAutomationsPanel />
        </TabsContent>

        <TabsContent value="rules">
          <div className="flex justify-end mb-4">
            <Button onClick={() => { setEditing({ ...defaultRule }); setDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" /> Nova Regra
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : rules.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <ShieldCheck className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Nenhuma regra de negócio configurada</p>
                <p className="text-xs text-muted-foreground mt-1">Regras são avaliadas antes da IA para decisões determinísticas</p>
                <Button className="mt-4" onClick={() => { setEditing({ ...defaultRule }); setDialogOpen(true); }}>
                  <Plus className="h-4 w-4 mr-2" /> Criar Primeira Regra
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {rules.map((rule) => (
                <Card key={rule.id} className={!rule.is_active ? "opacity-60" : ""}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Zap className="h-4 w-4 text-primary" />
                        {rule.name}
                      </CardTitle>
                      <Switch checked={rule.is_active} onCheckedChange={() => toggleActive(rule)} />
                    </div>
                  </CardHeader>
                  <CardContent>
                    {rule.description && <p className="text-xs text-muted-foreground mb-2">{rule.description}</p>}
                    <div className="space-y-1 text-xs">
                      <p><span className="text-muted-foreground">Se</span> <Badge variant="outline" className="text-[10px]">{FIELDS.find(f => f.value === rule.field)?.label || rule.field}</Badge> <Badge variant="secondary" className="text-[10px]">{OPERATORS.find(o => o.value === rule.operator)?.label || rule.operator}</Badge> <span className="font-mono">{rule.value}</span></p>
                      <p><span className="text-muted-foreground">Então</span> <Badge className="text-[10px]">{ACTIONS.find(a => a.value === rule.action_type)?.label || rule.action_type}</Badge></p>
                      <p className="text-muted-foreground">Prioridade: {rule.priority}</p>
                    </div>
                    <div className="flex gap-1 mt-3">
                      <Button size="sm" variant="ghost" onClick={() => { setEditing({ ...rule }); setDialogOpen(true); }}>
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleteId(rule.id)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Form Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing.id ? "Editar Regra" : "Nova Regra"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome *</Label>
              <Input value={editing.name || ""} onChange={(e) => setEditing(prev => ({ ...prev, name: e.target.value }))} placeholder="Ex: Urgência em cobrança" />
            </div>
            <div>
              <Label>Descrição</Label>
              <Input value={editing.description || ""} onChange={(e) => setEditing(prev => ({ ...prev, description: e.target.value }))} placeholder="Breve descrição" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Campo</Label>
                <Select value={editing.field || "message_text"} onValueChange={(v) => setEditing(prev => ({ ...prev, field: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{FIELDS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Operador</Label>
                <Select value={editing.operator || "contains"} onValueChange={(v) => setEditing(prev => ({ ...prev, operator: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{OPERATORS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Valor</Label>
                <Input value={editing.value || ""} onChange={(e) => setEditing(prev => ({ ...prev, value: e.target.value }))} placeholder="Ex: urgente" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Acção</Label>
                <Select value={editing.action_type || "auto_reply"} onValueChange={(v) => setEditing(prev => ({ ...prev, action_type: v, action_config: {} }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ACTIONS.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Prioridade</Label>
                <Input type="number" value={editing.priority || 0} onChange={(e) => setEditing(prev => ({ ...prev, priority: parseInt(e.target.value) || 0 }))} />
              </div>
            </div>
            {editing.action_type === "auto_reply" && (
              <div>
                <Label>Texto da resposta</Label>
                <Input value={(editing.action_config as any)?.reply_text || ""} onChange={(e) => setEditing(prev => ({ ...prev, action_config: { ...((prev.action_config as any) || {}), reply_text: e.target.value } }))} placeholder="Mensagem automática..." />
              </div>
            )}
            {editing.action_type === "transfer_human" && (
              <div>
                <Label>Mensagem de transferência</Label>
                <Input value={(editing.action_config as any)?.transfer_message || ""} onChange={(e) => setEditing(prev => ({ ...prev, action_config: { ...((prev.action_config as any) || {}), transfer_message: e.target.value } }))} placeholder="Vou transferir para um humano..." />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editing.id ? "Guardar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar regra?</AlertDialogTitle>
            <AlertDialogDescription>Esta acção não pode ser revertida.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
