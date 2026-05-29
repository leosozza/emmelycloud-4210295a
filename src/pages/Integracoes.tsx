import { useEffect, useState, useCallback, lazy, Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import { OpenClawTab } from "@/components/integracoes/OpenClawTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plug,
  MessageCircle,
  CreditCard,
  Activity,
  Phone,
  Instagram,
  Mail,
  Radio,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  RefreshCw,
  Save,
  Eye,
  EyeOff,
  Bot,
  Plus,
  Trash2,
  Server,
  Power,
  PowerOff,
  Copy,
  Check,
  Link,
  ChevronDown,
  Loader2,
  QrCode,
  Wifi,
  LogOut,
  ExternalLink,
  HelpCircle,
  ChevronRight,
  Sparkles,
  Trophy,
  Zap,
  Scale,
  Gauge,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { calculateLateFees } from "@/lib/lateFeeCalc";

// ─── Types ───────────────────────────────────────────────────────────────────

interface IntegrationStatus {
  id: string;
  domain: string | null;
  connector_registered: boolean;
  connector_active: boolean;
  updated_at: string;
}

interface ChannelMapping {
  id: string;
  channel: string;
  line_name: string | null;
  is_active: boolean;
}

interface DebugLog {
  id: string;
  event_type: string;
  error: string | null;
  created_at: string;
  direction: string | null;
}

// ─── Status Badge ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: "active" | "inactive" | "pending" }) {
  const config = {
    active: { label: "Ativo", className: "bg-green-100 text-green-800 border-green-200" },
    inactive: { label: "Inativo", className: "bg-red-100 text-red-800 border-red-200" },
    pending: { label: "Pendente", className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  };
  const c = config[status];
  return <Badge variant="outline" className={c.className}>{c.label}</Badge>;
}

function StatusIcon({ status }: { status: "active" | "inactive" | "pending" }) {
  if (status === "active") return <CheckCircle2 className="h-5 w-5 text-green-500" />;
  if (status === "pending") return <Clock className="h-5 w-5 text-yellow-500" />;
  return <XCircle className="h-5 w-5 text-red-500" />;
}

// ─── CRM Tab ─────────────────────────────────────────────────────────────────

function CRMTab() {
  const [integration, setIntegration] = useState<IntegrationStatus | null>(null);
  const [channels, setChannels] = useState<ChannelMapping[]>([]);
  const [logs, setLogs] = useState<DebugLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message?: string; error?: string; details?: any } | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [intRes, chRes, logRes] = await Promise.all([
        supabase.from("bitrix24_integrations").select("id, domain, connector_registered, connector_active, updated_at").limit(1).single(),
        supabase.from("bitrix24_channel_mappings").select("id, channel, line_name, is_active"),
        supabase.from("bitrix24_debug_logs").select("id, event_type, error, created_at, direction").order("created_at", { ascending: false }).limit(10),
      ]);
      if (intRes.data) setIntegration(intRes.data);
      if (chRes.data) setChannels(chRes.data);
      if (logRes.data) setLogs(logRes.data);
      setLoading(false);
    }
    load();
  }, []);

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("bitrix24-test-connection");
      if (error) {
        setTestResult({ ok: false, error: "Erro ao contactar o servidor." });
      } else {
        setTestResult(data as { ok: boolean; message?: string; error?: string });
      }
    } catch {
      setTestResult({ ok: false, error: "Erro de rede." });
    }
    setTesting(false);
  };

  const handleResync = async () => {
    setResyncing(true);
    setTestResult(null);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bitrix24-install?action=resync`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: "{}",
      });
      const data = await res.json();
      if (!res.ok || data?.error) {
        toast.error(data?.error || `Falha HTTP ${res.status}`);
      } else {
        toast.success("App atualizada — conector, campos, robôs e placements re-registados.");
        const { data: intRes } = await supabase.from("bitrix24_integrations").select("id, domain, connector_registered, connector_active, updated_at").limit(1).single();
        if (intRes) setIntegration(intRes);
      }
    } catch (e: any) {
      toast.error(e?.message || "Erro de rede.");
    }
    setResyncing(false);
  };

  const bitrixStatus = integration ? (integration.connector_active ? "active" : integration.connector_registered ? "pending" : "inactive") : "inactive";
  const effectiveStatus = testResult?.details ? (testResult.details.connector_active ? "active" : testResult.details.connector_registered ? "pending" : "inactive") : bitrixStatus;
  const activeChannels = channels.filter((c) => c.is_active);
  const errorLogs = logs.filter((l) => l.error);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Bitrix24 */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
              <Plug className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <CardTitle className="text-base">Bitrix24</CardTitle>
              <CardDescription>CRM Principal</CardDescription>
            </div>
          </div>
          <StatusBadge status={effectiveStatus} />
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {integration ? (
            <>
              <div className="flex justify-between"><span className="text-muted-foreground">Domínio</span><span className="font-medium">{integration.domain || "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Conector registado</span><span>{(testResult?.details?.connector_registered ?? integration.connector_registered) ? "✅ Sim" : "❌ Não"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Conector ativo</span><span>{(testResult?.details?.connector_active ?? integration.connector_active) ? "✅ Sim" : "❌ Não"}</span></div>
              {testResult?.details?.active_lines?.length > 0 && (
                <div className="flex justify-between"><span className="text-muted-foreground">Linhas ativas</span><span className="font-medium">{testResult.details.active_lines.length}</span></div>
              )}
              <div className="flex justify-between"><span className="text-muted-foreground">Última atualização</span><span>{new Date(integration.updated_at).toLocaleDateString("pt-PT")}</span></div>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <Button size="sm" variant="outline" onClick={handleTestConnection} disabled={testing || resyncing}>
                  {testing ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Activity className="h-3.5 w-3.5 mr-1.5" />}
                  {testing ? "A testar…" : "Testar Conexão"}
                </Button>
                <Button size="sm" variant="default" onClick={handleResync} disabled={testing || resyncing} title="Re-registar conector, campos, robôs e placements sem reinstalar a app">
                  <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${resyncing ? "animate-spin" : ""}`} />
                  {resyncing ? "A atualizar…" : "Atualizar App"}
                </Button>
              </div>
              {testResult && (
                <div className={`flex items-center gap-2 rounded-md px-3 py-2 ${testResult.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
                  {testResult.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
                  <span className="text-xs">{testResult.ok ? testResult.message : testResult.error}</span>
                </div>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">Nenhuma integração configurada.</p>
          )}
        </CardContent>
      </Card>

      {/* Emmely Messages */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ backgroundColor: "#722F3722" }}>
              <MessageCircle className="h-5 w-5" style={{ color: "#722F37" }} />
            </div>
            <div>
              <CardTitle className="text-base">Emmely Messages</CardTitle>
              <CardDescription>Conector de Mensagens</CardDescription>
            </div>
          </div>
          <StatusBadge status={activeChannels.length > 0 ? "active" : "inactive"} />
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Canais ativos</span><span className="font-medium">{activeChannels.length}</span></div>
          {activeChannels.map((ch) => (
            <div key={ch.id} className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-1.5">
              <span className="capitalize">{ch.channel}</span>
              <span className="text-xs text-muted-foreground">{ch.line_name || "—"}</span>
            </div>
          ))}
          {activeChannels.length === 0 && <p className="text-muted-foreground">Nenhum canal ativo no Contact Center.</p>}
        </CardContent>
      </Card>

      {/* Emmely Pay */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100">
              <CreditCard className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <CardTitle className="text-base">Emmely Pay</CardTitle>
              <CardDescription>Conector de Pagamento</CardDescription>
            </div>
          </div>
          <StatusBadge status="pending" />
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>Integração de pagamentos unificada. Configure na aba Pagamentos.</p>
        </CardContent>
      </Card>

      {/* Saúde do Sistema */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100">
              <Activity className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <CardTitle className="text-base">Saúde do Sistema</CardTitle>
              <CardDescription>Últimos 10 eventos</CardDescription>
            </div>
          </div>
          <StatusBadge status={errorLogs.length === 0 ? "active" : "pending"} />
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm max-h-48 overflow-y-auto">
          {loading && <p className="text-muted-foreground">A carregar…</p>}
          {!loading && logs.length === 0 && <p className="text-muted-foreground">Sem eventos recentes.</p>}
          {logs.map((log) => (
            <div key={log.id} className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-1.5">
              {log.error ? <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-500" /> : <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />}
              <span className="truncate flex-1">{log.event_type}</span>
              <span className="text-xs text-muted-foreground whitespace-nowrap">{new Date(log.created_at).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Credential Row ──────────────────────────────────────────────────────────

function CredentialInput({
  provider,
  credentialKey,
  label,
  credentials,
  drafts,
  setDrafts,
  onSave,
  saving,
}: {
  provider: string;
  credentialKey: string;
  label: string;
  credentials: Record<string, { has_value: boolean; masked: string }>;
  drafts: Record<string, string>;
  setDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onSave: (provider: string, key: string, value: string) => Promise<boolean | void>;
  saving: string | null;
}) {
  const fullKey = `${provider}::${credentialKey}`;
  const existing = credentials[fullKey];
  const draftValue = drafts[fullKey] ?? "";
  const [showValue, setShowValue] = useState(false);
  const isSaving = saving === fullKey;

  // Validação visual em tempo real: detectar Publishable Key do Stripe
  const isStripeField = credentialKey.toUpperCase().includes("STRIPE");
  const isPublishableKey = isStripeField && draftValue.trim().startsWith("pk_");
  const isValidSecretKey = isStripeField && draftValue.trim().startsWith("sk_");

  const handleBlurAutoSave = () => {
    const v = draftValue.trim();
    if (!v) return;
    if (isPublishableKey) return;
    if (existing?.has_value && v === existing.masked) return;
    onSave(provider, credentialKey, v);
  };

  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <Input
            type={showValue ? "text" : "password"}
            placeholder={existing?.has_value ? existing.masked : "Não configurado"}
            value={draftValue}
            onChange={(e) => setDrafts((prev) => ({ ...prev, [fullKey]: e.target.value }))}
            onBlur={handleBlurAutoSave}
            className={`h-8 text-xs pr-8 ${
              isPublishableKey
                ? "border-red-400 focus-visible:ring-red-400"
                : isValidSecretKey
                ? "border-green-400 focus-visible:ring-green-400"
                : ""
            }`}
          />
          <button
            type="button"
            onClick={() => setShowValue(!showValue)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showValue ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8 px-2"
          disabled={!draftValue || isSaving || isPublishableKey}
          onClick={() => onSave(provider, credentialKey, draftValue)}
        >
          {isSaving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {/* Feedback visual em tempo real */}
      {isPublishableKey && (
        <div className="flex items-center gap-1.5 rounded-md bg-red-50 border border-red-200 px-2 py-1.5">
          <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
          <span className="text-xs text-red-700">
            Esta é uma <strong>Publishable Key (pk_)</strong>. Use a <strong>Secret Key (sk_live_... ou sk_test_...)</strong> no Dashboard Stripe → Developers → API Keys.
          </span>
        </div>
      )}
      {isValidSecretKey && draftValue && (
        <span className="text-xs text-green-600">✓ Secret Key válida detectada</span>
      )}
      {existing?.has_value && !draftValue && (
        <span className="text-xs text-green-600">✓ Configurado</span>
      )}
    </div>
  );
}

// ─── Webhook URL Display ─────────────────────────────────────────────────────

function WebhookUrlDisplay({ label, url, hint }: { label: string; url: string; hint?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground flex items-center gap-1">
        <Link className="h-3 w-3" />
        {label}
      </label>
      <div className="flex gap-1.5">
        <Input
          readOnly
          value={url}
          className="h-8 text-xs font-mono bg-muted/50 cursor-text"
          onClick={(e) => (e.target as HTMLInputElement).select()}
        />
        <Button size="sm" variant="outline" className="h-8 px-2 shrink-0" onClick={handleCopy}>
          {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
      {hint && <p className="text-[10px] text-muted-foreground leading-tight">{hint}</p>}
    </div>
  );
}

// ─── WhatsApp API Setup Guide ────────────────────────────────────────────────

function WhatsAppApiSetupGuide() {
  const [open, setOpen] = useState(false);
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || "qohnsluvhyziovfynzlu";
  const webhookUrl = `https://${projectId}.supabase.co/functions/v1/whatsapp-webhook`;

  const steps = [
    {
      title: "Criar conta Meta Business",
      desc: "Aceda a business.facebook.com e crie uma conta Business Manager. Associe a página do Facebook da empresa.",
      link: "https://business.facebook.com/",
      linkLabel: "Abrir Business Manager",
    },
    {
      title: "Criar App no Meta Developers",
      desc: "Vá a developers.facebook.com → My Apps → Create App → Business → selecione a Business Account. Adicione o produto \"WhatsApp\".",
      link: "https://developers.facebook.com/apps/",
      linkLabel: "Abrir Meta Developers",
    },
    {
      title: "Configurar número de telefone",
      desc: "Em WhatsApp → Getting Started, adicione e verifique um número de telefone comercial. Copie o Phone Number ID (campo numérico abaixo do número).",
    },
    {
      title: "Gerar Access Token permanente",
      desc: "Em WhatsApp → Getting Started, gere um token temporário, ou crie um System User em Business Settings → System Users com permissão whatsapp_business_messaging e gere um token permanente. Copie o token (começa com EAA…).",
      link: "https://business.facebook.com/settings/system-users",
      linkLabel: "Abrir System Users",
    },
    {
      title: "Configurar Webhook",
      desc: `Em WhatsApp → Configuration → Webhook, cole o URL abaixo e use o META_APP_SECRET como Verify Token. Subscreva o campo "messages".`,
    },
  ];

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors w-full py-1">
          <HelpCircle className="h-3.5 w-3.5 shrink-0" />
          <span>Como conectar o WhatsApp Business API?</span>
          <ChevronRight className={`h-3 w-3 ml-auto transition-transform ${open ? "rotate-90" : ""}`} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 space-y-2 rounded-lg border border-border bg-muted/30 p-3">
          {steps.map((step, i) => (
            <div key={i} className="flex gap-2.5">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold mt-0.5">
                {i + 1}
              </div>
              <div className="space-y-0.5 min-w-0">
                <p className="text-xs font-medium text-foreground">{step.title}</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{step.desc}</p>
                {step.link && (
                  <a
                    href={step.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline mt-0.5"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {step.linkLabel}
                  </a>
                )}
              </div>
            </div>
          ))}
          <div className="mt-2 pt-2 border-t border-border">
            <p className="text-[11px] text-muted-foreground mb-1">Webhook URL (para o passo 5):</p>
            <code className="block text-[11px] bg-background rounded px-2 py-1.5 break-all select-all border border-border">
              {webhookUrl}
            </code>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Stripe Setup Guide ──────────────────────────────────────────────────────

function StripeSetupGuide({ variant = "pt" }: { variant?: "pt" | "br" }) {
  const [open, setOpen] = useState(false);

  const steps = [
    {
      title: "Criar conta Stripe",
      desc: variant === "pt"
        ? "Aceda a stripe.com e crie uma conta com os dados da empresa portuguesa."
        : "Aceda a stripe.com e crie uma conta com os dados da empresa brasileira.",
      link: "https://dashboard.stripe.com/register",
      linkLabel: "Criar conta",
    },
    {
      title: "Ativar a conta",
      desc: "Complete o onboarding: dados da empresa, conta bancária e documento de identidade. A Stripe pode levar 1-2 dias úteis para verificar.",
    },
    {
      title: "Obter a Secret Key",
      desc: "No Dashboard → Developers → API Keys, copie a Secret key (começa com sk_live_ ou sk_test_). ⚠️ Não use a Publishable key.",
      link: "https://dashboard.stripe.com/apikeys",
      linkLabel: "Abrir API Keys",
    },
    {
      title: "Criar o Webhook",
      desc: "Vá a Developers → Webhooks → Add endpoint. Cole o URL do webhook (acima) e selecione os eventos: payment_intent.succeeded, payment_intent.payment_failed, checkout.session.completed, charge.refunded.",
      link: "https://dashboard.stripe.com/webhooks/create",
      linkLabel: "Criar Webhook",
    },
    {
      title: "Copiar o Webhook Secret",
      desc: "Após criar o webhook, clique nele e copie o Signing secret (começa com whsec_). Cole no campo 'Webhook Secret' acima.",
    },
  ];

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors w-full py-1">
          <HelpCircle className="h-3.5 w-3.5 shrink-0" />
          <span>Como obter as chaves da Stripe?</span>
          <ChevronRight className={`h-3 w-3 ml-auto transition-transform ${open ? "rotate-90" : ""}`} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 space-y-2 rounded-lg border border-border bg-muted/30 p-3">
          {steps.map((step, i) => (
            <div key={i} className="flex gap-2.5">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold mt-0.5">
                {i + 1}
              </div>
              <div className="space-y-0.5 min-w-0">
                <p className="text-xs font-medium text-foreground">{step.title}</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{step.desc}</p>
                {step.link && (
                  <a
                    href={step.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline mt-0.5"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {step.linkLabel}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── WhatsApp QRCode Card ────────────────────────────────────────────────────

function WhatsAppQRCodeCard({ credProps }: { credProps: any }) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<any>(null);
  

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || "qohnsluvhyziovfynzlu";
  const webhookUrl = `https://${projectId}.supabase.co/functions/v1/wuzapi-webhook`;

  const handleTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("wuzapi-test-connection", {
        body: {},
      });
      if (error) {
        setResult({ ok: false, error: "Erro ao contactar o servidor." });
      } else {
        setResult(data);
      }
    } catch {
      setResult({ ok: false, error: "Erro de rede." });
    }
    setTesting(false);
  };

  const handleConnect = async () => {
    setTesting(true);
    try {
      const { data } = await supabase.functions.invoke("wuzapi-test-connection", {
        body: { action: "connect" },
      });
      if (data?.ok) {
        toast.success("Sessão iniciada! A obter QR Code...");
        setTimeout(handleTest, 2000);
      } else {
        toast.error(data?.message || "Erro ao iniciar sessão");
      }
    } catch {
      toast.error("Erro de rede");
    }
    setTesting(false);
  };


  const handleSaveInstance = async () => {
    try {
      // Get credentials to build config
      const { data: credsData } = await supabase.functions.invoke("manage-credentials", { method: "GET" });
      let baseUrl = "";
      if (credsData?.credentials) {
        for (const c of credsData.credentials) {
          if (c.provider === "wuzapi" && c.credential_key === "WUZAPI_BASE_URL") baseUrl = c.credential_value_masked ? "configured" : "";
        }
      }

      // Upsert channel instance
      const { data: existing } = await supabase
        .from("channel_instances")
        .select("id")
        .eq("channel_type", "whatsapp")
        .eq("name", "WhatsApp QRCode")
        .maybeSingle();

      if (existing) {
        await supabase.from("channel_instances").update({
          status: "active",
          config: { provider: "wuzapi" },
          updated_at: new Date().toISOString(),
        }).eq("id", existing.id);
      } else {
        await supabase.from("channel_instances").insert({
          channel_type: "whatsapp",
          name: "WhatsApp QRCode",
          status: "active",
          config: { provider: "wuzapi" },
        });
      }
      toast.success("Instância WhatsApp QRCode ativada!");
    } catch {
      toast.error("Erro ao salvar instância");
    }
  };

  const isAuthenticated = Boolean(result?.logged_in ?? result?.connected);
  const statusLabel = isAuthenticated
    ? "Conectado"
    : result?.status === "pending"
      ? "Aguardando QR Code"
      : result?.status === "disconnected"
        ? "Desconectado"
        : result?.status === "error"
          ? "Erro"
          : "Pendente";
  const statusType = isAuthenticated ? "active" : result?.status === "error" ? "inactive" : "pending";

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
            <QrCode className="h-5 w-5 text-green-600" />
          </div>
          <div>
        <CardTitle className="text-base">WhatsApp QR Code</CardTitle>
            <CardDescription>Conexão via QR Code</CardDescription>
          </div>
        </div>
        <StatusBadge status={statusType as any} />
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="space-y-2">
          <p className="font-medium text-xs uppercase text-muted-foreground tracking-wide">Credenciais do Servidor</p>
          <CredentialInput provider="wuzapi" credentialKey="WUZAPI_BASE_URL" label="URL do Servidor" {...credProps} />
          <CredentialInput provider="wuzapi" credentialKey="WUZAPI_ADMIN_TOKEN" label="Admin Token" {...credProps} />
          <CredentialInput provider="wuzapi" credentialKey="WUZAPI_SECRET_KEY" label="Chave Secreta (HMAC)" {...credProps} />
        </div>

        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="flex-1" onClick={handleTest} disabled={testing}>
            {testing ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Activity className="h-3.5 w-3.5 mr-1.5" />}
            {testing ? "A verificar…" : "Testar Conexão"}
          </Button>
          <Button size="sm" variant="outline" onClick={handleConnect} disabled={testing}>
            <Power className="h-3.5 w-3.5 mr-1.5" />
            Conectar
          </Button>
        </div>

        {/* QR Code Display */}
        {result?.qr_code && !isAuthenticated && (
          <div className="flex flex-col items-center gap-2 rounded-md border p-3">
            <p className="text-xs font-medium text-muted-foreground">Leia o QR Code com o WhatsApp</p>
            <img src={result.qr_code} alt="QR Code WhatsApp" className="w-48 h-48 object-contain" />
            <Button size="sm" variant="ghost" onClick={handleTest} className="text-xs">
              <RefreshCw className="h-3 w-3 mr-1" /> Atualizar QR Code
            </Button>
          </div>
        )}

        {/* Status Result */}
        {result && (
          <div className={`flex items-center gap-2 rounded-md px-3 py-2 ${isAuthenticated ? "bg-green-50 text-green-800" : result.ok === false ? "bg-red-50 text-red-800" : "bg-yellow-50 text-yellow-800"}`}>
            {isAuthenticated ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
            <span className="text-xs">{result.message || result.error || statusLabel}</span>
          </div>
        )}

        {/* Webhook URL - auto-configured */}
        {result?.webhook_configured && (
          <div className="flex items-center gap-2 rounded-md px-3 py-2 bg-blue-50 text-blue-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span className="text-xs">Webhook configurado automaticamente</span>
          </div>
        )}

        <WebhookUrlDisplay
          label="Webhook URL (receber mensagens)"
          url={webhookUrl}
          hint="Configurado automaticamente ao conectar."
        />

        <div className="flex gap-2">
          <Button size="sm" variant="default" className="flex-1" onClick={handleSaveInstance}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            Ativar Instância
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Gupshup (WhatsApp Oficial BSP) Card ────────────────────────────────────

function GupshupCard({ credProps }: { credProps: any }) {
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    checks: Array<{ id: string; label: string; status: "ok" | "warn" | "fail"; message: string; detail?: string }>;
    hasSecret?: boolean;
  } | null>(null);
  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gupshup-webhook`;
  const gupshupFields = [
    { key: "GUPSHUP_API_KEY", label: "API Key", required: true },
    { key: "GUPSHUP_APP_NAME", label: "App Name", required: true },
    { key: "GUPSHUP_SOURCE_NUMBER", label: "Source Number (E.164, sem +)", required: true },
    { key: "GUPSHUP_APP_ID", label: "App ID (UUID — necessário para listar templates HSM)", required: false },
    { key: "GUPSHUP_WEBHOOK_SECRET", label: "Webhook Secret (opcional, HMAC SHA-256)", required: false },
  ];

  const credentials = credProps?.credentials || {};
  const drafts = credProps?.drafts || {};
  const hasCredentialValue = (key: string) =>
    Boolean(credentials?.[`gupshup::${key}`]?.has_value || drafts?.[`gupshup::${key}`]?.trim());
  const hasRequired = gupshupFields.filter((f) => f.required).every((f) => hasCredentialValue(f.key));
  const hasDrafts = gupshupFields.some((f) => Boolean(drafts?.[`gupshup::${f.key}`]?.trim()));
  const canActivate = testResult?.ok === true && !hasDrafts;

  const savePendingGupshupCredentials = async () => {
    const pending = gupshupFields
      .map((field) => ({ ...field, value: drafts?.[`gupshup::${field.key}`]?.trim() || "" }))
      .filter((field) => field.value);

    for (const field of pending) {
      const ok = await credProps.onSave("gupshup", field.key, field.value);
      if (ok === false) return false;
    }

    return true;
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      if (hasDrafts) {
        const saved = await savePendingGupshupCredentials();
        if (!saved) {
          setTestResult({ ok: false, checks: [{ id: "save", label: "Credenciais", status: "fail", message: "Não foi possível guardar os dados Gupshup antes do teste." }] });
          return;
        }
      }
      const { data, error } = await supabase.functions.invoke("gupshup-webhook-test", { body: {} });
      if (error) {
        toast.error("Falha ao testar webhook");
        setTestResult({ ok: false, checks: [{ id: "err", label: "Erro", status: "fail", message: error.message || "Erro desconhecido" }] });
      } else {
        setTestResult(data);
        if (data?.ok) toast.success("Webhook validado com sucesso");
        else toast.error("Algum check falhou — veja detalhes");
      }
    } catch (e: any) {
      toast.error("Erro ao chamar teste");
      setTestResult({ ok: false, checks: [{ id: "err", label: "Erro", status: "fail", message: String(e?.message || e) }] });
    } finally {
      setTesting(false);
    }
  };

  const handleActivate = async () => {
    setSaving(true);
    try {
      if (hasDrafts) {
        const saved = await savePendingGupshupCredentials();
        if (!saved) {
          toast.error("Corrija e guarde as credenciais Gupshup antes de ativar");
          return;
        }
      }
      const { data: existing } = await supabase
        .from("channel_instances")
        .select("id, config")
        .eq("channel_type", "whatsapp")
        .eq("name", "WhatsApp Gupshup")
        .maybeSingle();

      if (existing) {
        await supabase.from("channel_instances").update({
          status: "active",
          config: { ...((existing.config as Record<string, any>) || {}), provider: "gupshup" },
          updated_at: new Date().toISOString(),
        }).eq("id", existing.id);
      } else {
        await supabase.from("channel_instances").insert({
          channel_type: "whatsapp",
          name: "WhatsApp Gupshup",
          status: "active",
          config: { provider: "gupshup" },
        });
      }
      toast.success("Instância Gupshup ativada como provider WhatsApp ativo!");
    } catch {
      toast.error("Erro ao ativar instância Gupshup");
    } finally {
      setSaving(false);
    }
  };

  const statusIcon = (s: "ok" | "warn" | "fail") =>
    s === "ok" ? "✅" : s === "warn" ? "⚠️" : "❌";

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100">
            <Phone className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <CardTitle className="text-base">Gupshup — WhatsApp Oficial</CardTitle>
            <CardDescription>WhatsApp Business via BSP Gupshup</CardDescription>
          </div>
        </div>
        <StatusBadge status="active" />
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="space-y-2">
          <p className="font-medium text-xs uppercase text-muted-foreground tracking-wide">Credenciais Gupshup</p>
          {gupshupFields.map((field) => (
            <CredentialInput key={field.key} provider="gupshup" credentialKey={field.key} label={field.label} {...credProps} />
          ))}
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={savePendingGupshupCredentials}
            disabled={saving || testing || !hasDrafts}
          >
            <Save className="h-3.5 w-3.5 mr-1.5" />
            Guardar credenciais Gupshup
          </Button>
        </div>

        <WebhookUrlDisplay
          label="Webhook URL (colar no painel Gupshup)"
          url={webhookUrl}
          hint="Settings → Webhook Configuration → URL"
        />

        <Button
          size="sm"
          variant="outline"
          className="w-full"
          onClick={handleTest}
          disabled={testing || !hasRequired}
        >
          {testing ? "A testar…" : "Testar webhook e validar assinatura"}
        </Button>

        {!hasRequired && (
          <p className="text-xs text-muted-foreground">
            Preencha API Key, App Name e Source Number para habilitar o teste.
          </p>
        )}

        {testResult && (
          <div className="rounded-md border bg-muted/30 p-2 space-y-1.5">
            {testResult.checks.map((c) => (
              <div key={c.id} className="text-xs">
                <div className="flex items-start gap-2">
                  <span>{statusIcon(c.status)}</span>
                  <div className="flex-1">
                    <div className="font-medium">{c.label}</div>
                    <div className="text-muted-foreground">{c.message}</div>
                    {c.detail && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-muted-foreground/70">detalhe</summary>
                        <pre className="mt-1 whitespace-pre-wrap text-[10px] bg-background/50 p-1 rounded">{c.detail}</pre>
                      </details>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <Button
          size="sm"
          variant="default"
          className="w-full"
          onClick={handleActivate}
          disabled={saving || !canActivate}
          title={!canActivate ? "Execute o teste do webhook com sucesso antes de ativar" : ""}
        >
          <Save className="h-3.5 w-3.5 mr-1.5" />
          {saving ? "A ativar…" : "Ativar Gupshup como Provider WhatsApp"}
        </Button>

        {!canActivate && (
          <p className="text-xs text-muted-foreground">
            Execute o teste acima e obtenha resultado ✅ antes de ativar.
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          Encontre as credenciais em <code>console.gupshup.io</code> → App selecionada → API Key. O App Name é o slug da app criada.
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Omni Channel Tab ────────────────────────────────────────────────────────


function OmniChannelTab() {
  const [conversations, setConversations] = useState<{ channel: string; count: number }[]>([]);
  const [igTesting, setIgTesting] = useState(false);
  const [igResult, setIgResult] = useState<any>(null);
  const [credentials, setCredentials] = useState<Record<string, { has_value: boolean; masked: string }>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem("integracoes::drafts") || "{}"); } catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem("integracoes::drafts", JSON.stringify(drafts)); } catch { /* ignore */ }
  }, [drafts]);
  const [saving, setSaving] = useState<string | null>(null);


  // Provider selection removed - always direct Meta API

  const loadCredentials = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke("manage-credentials", { method: "GET" });
      if (!error && data?.credentials) {
        const map: Record<string, { has_value: boolean; masked: string }> = {};
        for (const c of data.credentials) {
          map[`${c.provider}::${c.credential_key}`] = {
            has_value: c.has_value,
            masked: c.credential_value_masked || "",
          };
        }
        setCredentials(map);
      }
    } catch (e) { console.error("[Credenciais] Falha ao carregar:", e); }
  }, []);

  const handleSaveCredential = async (provider: string, key: string, value: string) => {
    const fullKey = `${provider}::${key}`;
    // Validação prévia no frontend: rejeitar Publishable Keys do Stripe
    if (key.toUpperCase().includes("STRIPE") && value.trim().startsWith("pk_")) {
      toast.error("A chave Stripe configurada é uma Publishable Key (pk_). Configure a Secret Key (sk_) em Integrações.");
      return false;
    }
    setSaving(fullKey);
    try {
      const { data, error } = await supabase.functions.invoke("manage-credentials", {
        method: "POST",
        body: { provider, credential_key: key, credential_value: value },
      });
      // Verificar erro retornado pelo backend no corpo da resposta (status 400)
      if (error || data?.error) {
        toast.error(data?.error || "Erro ao guardar credencial");
        return false;
      } else {
        toast.success(`${key} guardado com sucesso`);
        setDrafts((prev) => ({ ...prev, [fullKey]: "" }));
        await loadCredentials();
        return true;
      }
    } catch {
      toast.error("Erro de rede");
      return false;
    } finally {
      setSaving(null);
    }
  };

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("conversations").select("channel");
      if (data) {
        const counts: Record<string, number> = {};
        data.forEach((c) => { counts[c.channel] = (counts[c.channel] || 0) + 1; });
        setConversations(Object.entries(counts).map(([channel, count]) => ({ channel, count })));
      }
    }
    load();
    loadCredentials();
  }, [loadCredentials]);

  const handleTestInstagram = async () => {
    setIgTesting(true);
    setIgResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("instagram-test-connection");
      if (error) {
        setIgResult({ ok: false, error: "Erro ao contactar o servidor." });
      } else {
        setIgResult(data);
      }
    } catch {
      setIgResult({ ok: false, error: "Erro de rede." });
    }
    setIgTesting(false);
  };

  const credProps = { credentials, drafts, setDrafts, onSave: handleSaveCredential, saving };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* WhatsApp */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
              <Phone className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <CardTitle className="text-base">WhatsApp</CardTitle>
              <CardDescription>WhatsApp Business API (Meta)</CardDescription>
            </div>
          </div>
          <StatusBadge status="active" />
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="space-y-2">
            <p className="font-medium text-xs uppercase text-muted-foreground tracking-wide">Credenciais WhatsApp Business</p>
            <CredentialInput provider="meta" credentialKey="META_WA_ACCESS_TOKEN" label="Access Token" {...credProps} />
            <CredentialInput provider="meta" credentialKey="META_WA_PHONE_NUMBER_ID" label="Phone Number ID" {...credProps} />
          </div>

          <WhatsAppApiSetupGuide />
        </CardContent>
      </Card>

      {/* WhatsApp QRCode */}
      <WhatsAppQRCodeCard credProps={credProps} />

      {/* Gupshup — WhatsApp Oficial (BSP) */}
      <GupshupCard credProps={credProps} />

      {/* Instagram — Direct Meta API */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-pink-100">
              <Instagram className="h-5 w-5 text-pink-600" />
            </div>
            <div>
              <CardTitle className="text-base">Instagram</CardTitle>
              <CardDescription>Meta Graph API (direto)</CardDescription>
            </div>
          </div>
          <StatusBadge status={igResult ? (igResult.ok ? "active" : "inactive") : "pending"} />
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="space-y-2">
            <p className="font-medium text-xs uppercase text-muted-foreground tracking-wide">Credenciais Meta / Instagram</p>
            <CredentialInput provider="meta" credentialKey="META_PAGE_ACCESS_TOKEN" label="Page Access Token" {...credProps} />
            <CredentialInput provider="meta" credentialKey="META_IG_ACCOUNT_ID" label="Instagram Account ID" {...credProps} />
            <CredentialInput provider="meta" credentialKey="META_APP_ID" label="App ID" {...credProps} />
            <CredentialInput provider="meta" credentialKey="META_APP_SECRET" label="App Secret" {...credProps} />
          </div>

          <Button size="sm" variant="outline" className="w-full" onClick={handleTestInstagram} disabled={igTesting}>
            {igTesting ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Activity className="h-3.5 w-3.5 mr-1.5" />}
            {igTesting ? "A testar…" : "Testar Conexão Instagram"}
          </Button>

          {igResult?.meta && (
            <div className={`flex items-start gap-2 rounded-md px-3 py-2 ${igResult.meta.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
              {igResult.meta.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" /> : <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />}
              <div className="text-xs">
                <p className="font-medium">Meta API: {igResult.meta.ok ? igResult.meta.message : "Erro"}</p>
                {igResult.meta.ok && igResult.meta.username && <p>Username: @{igResult.meta.username}</p>}
                {!igResult.meta.ok && <p>{igResult.meta.error}</p>}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* E-mail */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
              <Mail className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <CardTitle className="text-base">E-mail</CardTitle>
              <CardDescription>SMTP / Provider</CardDescription>
            </div>
          </div>
          <StatusBadge status="inactive" />
        </CardHeader>
        <CardContent className="text-sm">
          <p className="text-muted-foreground">Ainda não configurado.</p>
        </CardContent>
      </Card>

      {/* Canais Conectados */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
              <Radio className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <CardTitle className="text-base">Canais Conectados</CardTitle>
              <CardDescription>Resumo da Central de Atendimento</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {conversations.length === 0 && <p className="text-muted-foreground">Nenhuma conversa registada.</p>}
          {conversations.map((c) => (
            <div key={c.channel} className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-1.5">
              <span className="capitalize">{c.channel}</span>
              <Badge variant="secondary">{c.count} conversas</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Pagamentos Tab ──────────────────────────────────────────────────────────

interface PaymentTransaction {
  id: string;
  gateway: string;
  amount: number;
  currency: string;
  status: string;
  payment_method: string;
  created_at: string;
}

// ─── Late Fee Config Card ────────────────────────────────────────────────────

function LateFeeConfigCard() {
  const [config, setConfig] = useState({ penalty_pct: 10, interest_monthly_pct: 1, max_interest_days: 365, grace_days: 0 });
  const [configId, setConfigId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [simAmount, setSimAmount] = useState(200);
  const [simDays, setSimDays] = useState(15);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    supabase
      .from("payment_gateway_config")
      .select("id, config")
      .eq("gateway", "late_fees")
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setConfigId(data.id);
          const c = data.config as any;
          if (c) setConfig({
            penalty_pct: c.penalty_pct ?? 10,
            interest_monthly_pct: c.interest_monthly_pct ?? 1,
            max_interest_days: c.max_interest_days ?? 365,
            grace_days: c.grace_days ?? 0,
          });
        }
        setLoaded(true);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (configId) {
        await supabase.from("payment_gateway_config").update({ config: config as any, updated_at: new Date().toISOString() }).eq("id", configId);
      } else {
        await supabase.from("payment_gateway_config").insert({ gateway: "late_fees" as any, environment: "production", is_active: true, config: config as any });
      }
      toast.success("Configuração de encargos guardada");
    } catch {
      toast.error("Erro ao guardar");
    }
    setSaving(false);
  };

  // Simulate using the shared calculation function
  const simResult = calculateLateFees(simAmount, simDays, config);
  const { daysLate: cappedDays, penalty, interest, charges, total } = simResult;

  return (
    <Card className="md:col-span-3">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100">
            <AlertCircle className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <CardTitle className="text-base">Encargos por Atraso</CardTitle>
            <CardDescription>Multa e juros sobre parcelas vencidas</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 md:grid-cols-2">
          {/* Config inputs */}
          <div className="space-y-4">
            <p className="font-medium text-xs uppercase text-muted-foreground tracking-wide">Configuração</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Multa fixa (%)</Label>
                <Input type="number" min={0} max={100} step={0.5} value={config.penalty_pct} onChange={(e) => setConfig(p => ({ ...p, penalty_pct: Number(e.target.value) }))} className="h-8 text-sm" />
                <p className="text-[10px] text-muted-foreground">Cobrada uma única vez</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Juros mensais (%)</Label>
                <Input type="number" min={0} max={100} step={0.1} value={config.interest_monthly_pct} onChange={(e) => setConfig(p => ({ ...p, interest_monthly_pct: Number(e.target.value) }))} className="h-8 text-sm" />
                <p className="text-[10px] text-muted-foreground">Proporcional ao dia</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Limite máx. dias</Label>
                <Input type="number" min={1} max={3650} value={config.max_interest_days} onChange={(e) => setConfig(p => ({ ...p, max_interest_days: Number(e.target.value) }))} className="h-8 text-sm" />
                <p className="text-[10px] text-muted-foreground">Teto para cálculo de juros</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tolerância (dias)</Label>
                <Input type="number" min={0} max={90} value={config.grace_days} onChange={(e) => setConfig(p => ({ ...p, grace_days: Number(e.target.value) }))} className="h-8 text-sm" />
                <p className="text-[10px] text-muted-foreground">Grace period sem encargos</p>
              </div>
            </div>
            <Button size="sm" className="w-full" onClick={handleSave} disabled={saving || !loaded}>
              {saving ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
              {saving ? "A guardar…" : "Guardar Configuração"}
            </Button>
          </div>

          {/* Simulator */}
          <div className="space-y-4">
            <p className="font-medium text-xs uppercase text-muted-foreground tracking-wide">Simulador</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Valor da parcela</Label>
                <Input type="number" min={0} step={10} value={simAmount} onChange={(e) => setSimAmount(Number(e.target.value))} className="h-8 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Dias de atraso</Label>
                <Input type="number" min={0} max={3650} value={simDays} onChange={(e) => setSimDays(Number(e.target.value))} className="h-8 text-sm" />
              </div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Dias efetivos</span><span className="font-medium">{cappedDays}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Multa ({config.penalty_pct}%)</span><span className="font-medium">{penalty.toFixed(2)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Juros ({config.interest_monthly_pct}%/mês)</span><span className="font-medium">{interest.toFixed(2)}</span></div>
              <div className="flex justify-between border-t pt-2"><span className="text-muted-foreground">Encargos</span><span className="font-semibold">{charges.toFixed(2)}</span></div>
              <div className="flex justify-between border-t pt-2"><span className="font-semibold">Valor Final</span><span className="font-bold text-base">{total.toFixed(2)}</span></div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PagamentosTab() {
  const [credentials, setCredentials] = useState<Record<string, { has_value: boolean; masked: string; warning?: string }>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [testingStripePT, setTestingStripePT] = useState(false);
  const [testingStripeBR, setTestingStripeBR] = useState(false);
  const [testingAsaas, setTestingAsaas] = useState(false);
  const [stripePtResult, setStripePtResult] = useState<{ ok: boolean; message?: string; error?: string } | null>(null);
  const [stripeBrResult, setStripeBrResult] = useState<{ ok: boolean; message?: string; error?: string } | null>(null);
  const [asaasResult, setAsaasResult] = useState<{ ok: boolean; message?: string; error?: string } | null>(null);

  const loadCredentials = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke("manage-credentials", { method: "GET" });
      if (!error && data?.credentials) {
        const map: Record<string, { has_value: boolean; masked: string; warning?: string }> = {};
        for (const c of data.credentials) {
          map[`${c.provider}::${c.credential_key}`] = {
            has_value: c.has_value,
            masked: c.credential_value_masked || "",
            ...(c.warning ? { warning: c.warning } : {}),
          };
        }
        setCredentials(map);
      }
    } catch (e) { console.error("[Credenciais] Falha ao carregar:", e); }
  }, []);

  const handleSaveCredential = async (provider: string, key: string, value: string) => {
    const fullKey = `${provider}::${key}`;
    // Validação prévia no frontend: rejeitar Publishable Keys do Stripe
    if (key.toUpperCase().includes("STRIPE") && value.trim().startsWith("pk_")) {
      toast.error("A chave Stripe configurada é uma Publishable Key (pk_). Configure a Secret Key (sk_) em Integrações.");
      return;
    }
    setSaving(fullKey);
    try {
      const { data, error } = await supabase.functions.invoke("manage-credentials", {
        method: "POST",
        body: { provider, credential_key: key, credential_value: value },
      });
      // Verificar erro retornado pelo backend no corpo da resposta (status 400)
      if (error || data?.error) {
        toast.error(data?.error || "Erro ao guardar credencial");
        return false;
      } else {
        toast.success(`${key} guardado com sucesso`);
        setDrafts((prev) => ({ ...prev, [fullKey]: "" }));
        await loadCredentials();
        return true;
      }
    } catch {
      toast.error("Erro de rede");
      return false;
    } finally {
      setSaving(null);
    }
  };

  useEffect(() => {
    loadCredentials();
    supabase
      .from("payment_transactions")
      .select("id, gateway, amount, currency, status, payment_method, created_at")
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (data) setTransactions(data);
      });
  }, [loadCredentials]);

  const credProps = { credentials, drafts, setDrafts, onSave: handleSaveCredential, saving };

  const stripePtConfigured = credentials["stripe_pt::STRIPE_SECRET_KEY_PT"]?.has_value;
  const stripePtWarning = credentials["stripe_pt::STRIPE_SECRET_KEY_PT"]?.warning;
  const stripeBrConfigured = credentials["stripe_br::STRIPE_SECRET_KEY_BR"]?.has_value;
  const stripeBrWarning = credentials["stripe_br::STRIPE_SECRET_KEY_BR"]?.warning;
  const asaasConfigured = credentials["asaas::ASAAS_API_KEY"]?.has_value;

  // Test connections via lightweight API validation (no real transactions created)
  const handleTestStripePT = async () => {
    setTestingStripePT(true);
    setStripePtResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("manage-credentials", {
        body: { action: "test_stripe", provider: "stripe_pt", credential_key: "STRIPE_SECRET_KEY_PT" },
      });
      if (error || data?.error) {
        setStripePtResult({ ok: false, error: data?.error || "Erro ao contactar Stripe PT" });
      } else {
        setStripePtResult({ ok: true, message: "Conexão Stripe PT válida!" });
      }
    } catch {
      setStripePtResult({ ok: false, error: "Erro de rede" });
    }
    setTestingStripePT(false);
  };

  const handleTestStripeBR = async () => {
    setTestingStripeBR(true);
    setStripeBrResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("manage-credentials", {
        body: { action: "test_stripe", provider: "stripe_br", credential_key: "STRIPE_SECRET_KEY_BR" },
      });
      if (error || data?.error) {
        setStripeBrResult({ ok: false, error: data?.error || "Erro ao contactar Stripe BR" });
      } else {
        setStripeBrResult({ ok: true, message: "Conexão Stripe BR válida!" });
      }
    } catch {
      setStripeBrResult({ ok: false, error: "Erro de rede" });
    }
    setTestingStripeBR(false);
  };

  const handleTestAsaas = async () => {
    setTestingAsaas(true);
    setAsaasResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("manage-credentials", {
        body: { action: "test_asaas", provider: "asaas", credential_key: "ASAAS_API_KEY" },
      });
      if (error || data?.error) {
        setAsaasResult({ ok: false, error: data?.error || "Erro ao contactar Asaas" });
      } else {
        setAsaasResult({ ok: true, message: "Conexão Asaas válida!" });
      }
    } catch {
      setAsaasResult({ ok: false, error: "Erro de rede" });
    }
    setTestingAsaas(false);
  };

  const totalStripePT = transactions.filter(t => (t.gateway === "stripe_pt" || (t.gateway === "stripe" && t.currency === "EUR")) && (t.status === "confirmed" || t.status === "received")).reduce((s, t) => s + Number(t.amount), 0);
  const totalStripeBR = transactions.filter(t => (t.gateway === "stripe_br" || (t.gateway === "stripe" && t.currency === "BRL")) && (t.status === "confirmed" || t.status === "received")).reduce((s, t) => s + Number(t.amount), 0);
  const totalAsaas = transactions.filter(t => t.gateway === "asaas" && (t.status === "confirmed" || t.status === "received")).reduce((s, t) => s + Number(t.amount), 0);

  const statusLabels: Record<string, string> = {
    pending: "Pendente",
    confirmed: "Confirmado",
    received: "Recebido",
    overdue: "Vencido",
    refunded: "Reembolsado",
    canceled: "Cancelado",
    failed: "Falhou",
  };

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    confirmed: "bg-green-100 text-green-800",
    received: "bg-green-100 text-green-800",
    overdue: "bg-red-100 text-red-800",
    refunded: "bg-blue-100 text-blue-800",
    canceled: "bg-gray-100 text-gray-800",
    failed: "bg-red-100 text-red-800",
  };

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {/* Stripe PT Card */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100">
              <CreditCard className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <CardTitle className="text-base">Stripe Portugal</CardTitle>
              <CardDescription>Europa (EUR) — Cartão, Multibanco, MB WAY, SEPA</CardDescription>
            </div>
          </div>
          {stripePtWarning ? (
            <Badge variant="destructive" className="text-xs"><AlertCircle className="h-3 w-3 mr-1" />pk_ inválida</Badge>
          ) : (
            <StatusBadge status={stripePtConfigured ? "active" : "inactive"} />
          )}
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <CredentialInput provider="stripe_pt" credentialKey="STRIPE_SECRET_KEY_PT" label="Secret Key (sk_...)" {...credProps} />
          <CredentialInput provider="stripe_pt" credentialKey="STRIPE_WEBHOOK_SECRET_PT" label="Webhook Secret (whsec_...)" {...credProps} />

          <StripeSetupGuide variant="pt" />

          <WebhookUrlDisplay
            label="Webhook URL"
            url={`https://qohnsluvhyziovfynzlu.supabase.co/functions/v1/payment-webhook-stripe`}
            hint="Eventos: payment_intent.succeeded, checkout.session.completed, charge.refunded"
          />

          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Total processado</span>
            <span className="font-medium text-foreground">€{totalStripePT.toFixed(2)}</span>
          </div>

          <Button size="sm" variant="outline" className="w-full" onClick={handleTestStripePT} disabled={testingStripePT || !stripePtConfigured}>
            {testingStripePT ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Activity className="h-3.5 w-3.5 mr-1.5" />}
            {testingStripePT ? "A testar…" : "Testar Conexão"}
          </Button>
          {stripePtResult && (
            <div className={`flex items-center gap-2 rounded-md px-3 py-2 ${stripePtResult.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
              {stripePtResult.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
              <span className="text-xs">{stripePtResult.ok ? stripePtResult.message : stripePtResult.error}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stripe BR Card */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100">
              <CreditCard className="h-5 w-5 text-violet-600" />
            </div>
            <div>
              <CardTitle className="text-base">Stripe Brasil</CardTitle>
              <CardDescription>Brasil (BRL) — Cartão</CardDescription>
            </div>
          </div>
          {stripeBrWarning ? (
            <Badge variant="destructive" className="text-xs"><AlertCircle className="h-3 w-3 mr-1" />pk_ inválida</Badge>
          ) : (
            <StatusBadge status={stripeBrConfigured ? "active" : "inactive"} />
          )}
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <CredentialInput provider="stripe_br" credentialKey="STRIPE_SECRET_KEY_BR" label="Secret Key (sk_...)" {...credProps} />
          <CredentialInput provider="stripe_br" credentialKey="STRIPE_WEBHOOK_SECRET_BR" label="Webhook Secret (whsec_...)" {...credProps} />

          <StripeSetupGuide variant="br" />

          <WebhookUrlDisplay
            label="Webhook URL"
            url={`https://qohnsluvhyziovfynzlu.supabase.co/functions/v1/payment-webhook-stripe`}
            hint="Eventos: payment_intent.succeeded, checkout.session.completed, charge.refunded"
          />

          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Total processado</span>
            <span className="font-medium text-foreground">R${totalStripeBR.toFixed(2)}</span>
          </div>

          <Button size="sm" variant="outline" className="w-full" onClick={handleTestStripeBR} disabled={testingStripeBR || !stripeBrConfigured}>
            {testingStripeBR ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Activity className="h-3.5 w-3.5 mr-1.5" />}
            {testingStripeBR ? "A testar…" : "Testar Conexão"}
          </Button>
          {stripeBrResult && (
            <div className={`flex items-center gap-2 rounded-md px-3 py-2 ${stripeBrResult.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
              {stripeBrResult.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
              <span className="text-xs">{stripeBrResult.ok ? stripeBrResult.message : stripeBrResult.error}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Asaas Card */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-100">
              <DollarSign className="h-5 w-5 text-teal-600" />
            </div>
            <div>
              <CardTitle className="text-base">Asaas Brasil</CardTitle>
              <CardDescription>Brasil (BRL) — PIX, Boleto, Cartão</CardDescription>
            </div>
          </div>
          <StatusBadge status={asaasConfigured ? "active" : "inactive"} />
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <CredentialInput provider="asaas" credentialKey="ASAAS_API_KEY" label="API Key" {...credProps} />
          <CredentialInput provider="asaas" credentialKey="ASAAS_WEBHOOK_TOKEN" label="Webhook Token" {...credProps} />

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Ambiente</label>
            <div className="flex gap-2">
              {(["sandbox", "production"] as const).map((env) => {
                const currentEnv = credentials["asaas::ASAAS_ENVIRONMENT"]?.masked?.replace(/•/g, "") || "sandbox";
                const isActive = currentEnv.includes(env.slice(0, 4));
                return (
                  <Button
                    key={env}
                    size="sm"
                    variant={isActive ? "default" : "outline"}
                    className={`flex-1 h-8 text-xs ${isActive && env === "sandbox" ? "bg-amber-600 hover:bg-amber-700" : ""} ${isActive && env === "production" ? "bg-green-600 hover:bg-green-700" : ""}`}
                    onClick={async () => {
                      await handleSaveCredential("asaas", "ASAAS_ENVIRONMENT", env);
                    }}
                  >
                    {env === "sandbox" ? "🧪 Sandbox" : "🚀 Produção"}
                  </Button>
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground">
              {credentials["asaas::ASAAS_ENVIRONMENT"]?.masked?.includes("prod")
                ? "⚠️ Ambiente de produção — transações são reais"
                : "Usando ambiente de testes — transações não são reais"}
            </p>
          </div>

          <WebhookUrlDisplay
            label="Webhook URL"
            url={`https://qohnsluvhyziovfynzlu.supabase.co/functions/v1/payment-webhook-asaas`}
            hint="Eventos: PAYMENT_CONFIRMED, PAYMENT_RECEIVED, PAYMENT_OVERDUE, etc."
          />

          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Total processado</span>
            <span className="font-medium text-foreground">R${totalAsaas.toFixed(2)}</span>
          </div>

          <Button size="sm" variant="outline" className="w-full" onClick={handleTestAsaas} disabled={testingAsaas || !asaasConfigured}>
            {testingAsaas ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Activity className="h-3.5 w-3.5 mr-1.5" />}
            {testingAsaas ? "A testar…" : "Testar Conexão"}
          </Button>
          {asaasResult && (
            <div className={`flex items-center gap-2 rounded-md px-3 py-2 ${asaasResult.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
              {asaasResult.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
              <span className="text-xs">{asaasResult.ok ? asaasResult.message : asaasResult.error}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Encargos por Atraso */}
      <LateFeeConfigCard />

      {/* Emmely Pay Summary */}
      <Card className="md:col-span-3">
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100">
              <CreditCard className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <CardTitle className="text-base">Emmely Pay — Transações Recentes</CardTitle>
              <CardDescription>Últimas 10 transações processadas</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="text-sm">
          {transactions.length === 0 ? (
            <p className="text-muted-foreground">Nenhuma transação registada.</p>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {transactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs capitalize">{tx.gateway}</Badge>
                    <span className="capitalize text-xs text-muted-foreground">{tx.payment_method}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{tx.currency === "BRL" ? "R$" : "€"}{Number(tx.amount).toFixed(2)}</span>
                    <Badge variant="outline" className={`text-xs ${statusColors[tx.status] || ""}`}>
                      {statusLabels[tx.status] || tx.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(tx.created_at).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Chatbot Tab ─────────────────────────────────────────────────────────────

interface ChatbotChannelConfig {
  channel: string;
  label: string;
  icon: typeof Phone;
  iconColor: string;
  bgColor: string;
}

const DIRECT_CHANNELS: ChatbotChannelConfig[] = [
  { channel: "whatsapp", label: "WhatsApp", icon: Phone, iconColor: "text-green-600", bgColor: "bg-green-100" },
  { channel: "instagram", label: "Instagram", icon: Instagram, iconColor: "text-pink-600", bgColor: "bg-pink-100" },
];

interface ChatbotSettings {
  channel: string;
  enabled: boolean;
  agent_id: string | null;
}

interface BitrixIntegrationBot {
  id: string;
  domain: string | null;
  config: Record<string, any> | null;
  connector_registered: boolean;
}

function ChatbotTab() {
  const [agents, setAgents] = useState<{ id: string; name: string; bitrix_bot_id: string | null; is_active: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [integration, setIntegration] = useState<BitrixIntegrationBot | null>(null);
  const [reregistering, setReregistering] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [agentsRes, intRes] = await Promise.all([
      supabase.from("ai_agents").select("id, name, bitrix_bot_id, is_active").eq("is_active", true).order("name"),
      supabase.from("bitrix24_integrations").select("id, domain, config, connector_registered").limit(1).single(),
    ]);
    if (agentsRes.data) setAgents(agentsRes.data as any[]);
    if (intRes.data) setIntegration(intRes.data as BitrixIntegrationBot);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleReregisterBot = async () => {
    setReregistering(true);
    try {
      const { data, error } = await supabase.functions.invoke("bitrix24-reregister-bot");
      if (error) throw error;
      if (data?.success) {
        const count = data?.registered ?? 0;
        toast.success(`${count} bot(s) registado(s) no Bitrix24. Vá ao Contact Center → Open Lines → Chatbot para selecionar.`);
        await loadData();
      } else {
        toast.error(data?.error || data?.fallback_error || "Erro ao re-registar bots");
      }
    } catch (e: unknown) {
      toast.error((e as Error)?.message || "Erro de rede");
    } finally {
      setReregistering(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const registeredAgents = agents.filter((a) => a.bitrix_bot_id);
  const unregisteredAgents = agents.filter((a) => !a.bitrix_bot_id);

  return (
    <div className="space-y-6">

      {/* ── Secção 1: Bots Bitrix24 (Contact Center) ── */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Bots Bitrix24 — Contact Center</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Cada agente ativo é registado como um chatbot individual no Bitrix24.
              Para ativar, vá a <strong>Contact Center → Open Line → Configurações → Chatbot</strong> e selecione o agente desejado.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleReregisterBot}
            disabled={reregistering || !integration}
          >
            {reregistering
              ? <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />A sincronizar…</>
              : <><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Sincronizar Bots</>
            }
          </Button>
        </div>

        {!integration && (
          <Card>
            <CardContent className="pt-5">
              <p className="text-sm text-muted-foreground text-center">
                Nenhuma integração Bitrix24 encontrada. Instale a app primeiro.
              </p>
            </CardContent>
          </Card>
        )}

        {integration && agents.length === 0 && (
          <Card>
            <CardContent className="pt-5">
              <p className="text-sm text-muted-foreground text-center">
                Nenhum agente ativo. Crie e ative agentes na página Agentes.
              </p>
            </CardContent>
          </Card>
        )}

        {integration && agents.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2">
            {agents.map((agent) => (
              <Card key={agent.id}>
                <CardContent className="pt-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                        <Bot className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{agent.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {integration.domain || "Bitrix24"}
                        </p>
                      </div>
                    </div>
                    {agent.bitrix_bot_id ? (
                      <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Bot #{agent.bitrix_bot_id}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-200">
                        <Clock className="h-3 w-3 mr-1" />
                        Não registado
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {integration && (
          <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-800 space-y-1 mt-4">
            <p className="font-semibold">📋 Como ativar um chatbot no Contact Center:</p>
            <ol className="list-decimal ml-4 space-y-0.5">
              <li>No Bitrix24, abra <strong>Contact Center</strong></li>
              <li>Selecione a <strong>Open Line</strong> desejada → <strong>Configurações</strong></li>
              <li>Na secção <strong>Chatbot</strong>, selecione o agente desejado</li>
              <li>Guarde as configurações</li>
            </ol>
            <p className="mt-1">
              <strong>Nota:</strong> {registeredAgents.length} de {agents.length} agente(s) registado(s).
              {unregisteredAgents.length > 0 && " Clique em \"Sincronizar Bots\" para registar os restantes."}
            </p>
          </div>
        )}
      </div>

    </div>
  );
}


// ─── Instances Tab ───────────────────────────────────────────────────────────

interface ChannelInstance {
  id: string;
  name: string;
  channel_type: "whatsapp" | "instagram";
  status: "active" | "inactive" | "error";
  config: Record<string, any>;
  created_at: string;
  updated_at: string;
}

// ─── QR Code Dialog ──────────────────────────────────────────────────────────

function QRCodeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("wuzapi-test-connection", { body: {} });
      if (error) {
        setResult({ ok: false, error: "Erro ao contactar o servidor." });
      } else {
        setResult(data);
      }
    } catch {
      setResult({ ok: false, error: "Erro de rede." });
    }
    setLoading(false);
  };

  const handleConnect = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke("wuzapi-test-connection", { body: { action: "connect" } });
      if (data?.ok) {
        toast.success("Sessão iniciada! A obter QR Code...");
        setTimeout(fetchStatus, 2000);
      } else {
        toast.error(data?.message || "Erro ao iniciar sessão");
        setLoading(false);
      }
    } catch {
      toast.error("Erro de rede");
      setLoading(false);
    }
  };

  // Auto-poll every 3s while dialog is open and not yet connected
  useEffect(() => {
    if (open) {
      handleConnect();
    } else {
      setResult(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open || result?.connected) return;
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [open, result?.connected]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-green-600" />
            WhatsApp QR Code
          </DialogTitle>
          <DialogDescription>Leia o QR Code abaixo com o WhatsApp no seu telemóvel.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          {loading && !result?.qr_code && (
            <div className="flex flex-col items-center gap-2 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-xs text-muted-foreground">A preparar sessão…</p>
            </div>
          )}

          {result?.qr_code && (
            <div className="flex flex-col items-center gap-3">
              <img src={result.qr_code} alt="QR Code WhatsApp" className="w-56 h-56 object-contain rounded-lg border p-2" />
              <p className="text-xs text-muted-foreground text-center">Abra o WhatsApp → Menu → Dispositivos conectados → Conectar dispositivo</p>
            </div>
          )}

          {result?.connected && (
            <div className="flex items-center gap-2 rounded-md px-4 py-3 bg-green-50 text-green-800 w-full">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <div>
                <p className="text-sm font-medium">WhatsApp conectado!</p>
                {result.webhook_configured && <p className="text-xs">Webhook configurado automaticamente.</p>}
              </div>
            </div>
          )}

          {result && !result.ok && !result.connected && (
            <div className="flex items-center gap-2 rounded-md px-4 py-3 bg-red-50 text-red-800 w-full">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="text-xs">{result.error || result.message || "Erro desconhecido"}</span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button size="sm" variant="outline" onClick={fetchStatus} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar QR Code
          </Button>
          <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Instances Tab ───────────────────────────────────────────────────────────

function InstancesTab() {
  const [instances, setInstances] = useState<ChannelInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"whatsapp" | "whatsapp_qrcode" | "instagram">("whatsapp");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [configDrafts, setConfigDrafts] = useState<Record<string, Record<string, string>>>({});
  const [savingConfig, setSavingConfig] = useState<string | null>(null);
  const [showValues, setShowValues] = useState<Record<string, boolean>>({});
  const [toggling, setToggling] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [bitrixMappings, setBitrixMappings] = useState<ChannelMapping[]>([]);
  const [linkingInstance, setLinkingInstance] = useState<string | null>(null);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [wuzapiStatus, setWuzapiStatus] = useState<Record<string, any>>({});
  const [testingConnection, setTestingConnection] = useState<string | null>(null);
  const [testLog, setTestLog] = useState<string | null>(null);
  const [testLogDialogOpen, setTestLogDialogOpen] = useState(false);

  const checkWuzapiStatus = useCallback(async () => {
    try {
      const { data } = await supabase.functions.invoke("wuzapi-test-connection", { body: {} });
      if (data) setWuzapiStatus((prev) => ({ ...prev, _global: data }));
    } catch {}
  }, []);

  const handleTestConnection = async (instId: string) => {
    setTestingConnection(instId);
    try {
      const { data, error } = await supabase.functions.invoke("wuzapi-test-connection", { body: {} });
      const log = JSON.stringify(data || { error: error?.message }, null, 2);
      setTestLog(log);
      setTestLogDialogOpen(true);
      if (data) setWuzapiStatus((prev) => ({ ...prev, _global: data }));
      if (data?.logged_in ?? data?.connected) {
        toast.success("WhatsApp conectado!");
      } else {
        toast.info(data?.message || "Desconectado");
      }
    } catch (e: any) {
      const log = JSON.stringify({ error: e.message }, null, 2);
      setTestLog(log);
      setTestLogDialogOpen(true);
      toast.error("Erro ao testar conexão");
    }
    setTestingConnection(null);
  };

  const [disconnecting, setDisconnecting] = useState(false);
  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("wuzapi-test-connection", { body: { action: "disconnect" } });
      if (data?.ok) {
        toast.success("WhatsApp desconectado com sucesso");
        setWuzapiStatus((prev) => ({ ...prev, _global: { ...prev._global, connected: false, logged_in: false, session_connected: false, phone_number: null, status: "disconnected", qr_code: null } }));
      } else {
        toast.error(data?.error || error?.message || "Erro ao desconectar");
      }
    } catch (e: any) {
      toast.error("Erro ao desconectar: " + e.message);
    }
    setDisconnecting(false);
  };

  const loadInstances = useCallback(async () => {
    setLoading(true);
    const [instRes, mappingsRes] = await Promise.all([
      supabase.from("channel_instances").select("*").order("created_at", { ascending: true }),
      supabase.from("bitrix24_channel_mappings").select("id, channel, line_name, is_active"),
    ]);
    if (instRes.data) setInstances(instRes.data as ChannelInstance[]);
    if (mappingsRes.data) setBitrixMappings(mappingsRes.data);
    setLoading(false);
  }, []);

  useEffect(() => { loadInstances(); checkWuzapiStatus(); }, [loadInstances, checkWuzapiStatus]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    const channelType = newType === "whatsapp_qrcode" ? "whatsapp" : newType;
    const { error } = await supabase.from("channel_instances").insert({
      name: newName.trim(),
      channel_type: channelType,
      status: "inactive",
      config: newType === "whatsapp_qrcode" ? { provider: "wuzapi" } : {},
    });
    if (error) {
      toast.error("Erro ao criar instância");
    } else {
      toast.success(`Instância "${newName}" criada`);
      setNewName("");
      setDialogOpen(false);
      await loadInstances();
      if (newType === "whatsapp_qrcode") {
        setQrDialogOpen(true);
      }
    }
    setCreating(false);
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    const { error } = await supabase.from("channel_instances").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao eliminar instância");
    } else {
      toast.success("Instância eliminada");
      setEditingId(null);
      await loadInstances();
    }
    setDeleting(null);
  };

  const handleToggleStatus = async (inst: ChannelInstance) => {
    const newStatus = inst.status === "active" ? "inactive" : "active";
    setToggling(inst.id);
    const { error } = await supabase
      .from("channel_instances")
      .update({ status: newStatus })
      .eq("id", inst.id);
    if (error) {
      toast.error("Erro ao alterar estado");
    } else {
      toast.success(`Instância ${newStatus === "active" ? "ativada" : "desativada"}`);
      await loadInstances();
    }
    setToggling(null);
  };

  const handleSaveConfig = async (inst: ChannelInstance) => {
    const drafts = configDrafts[inst.id] || {};
    const newConfig = { ...inst.config };
    for (const [k, v] of Object.entries(drafts)) {
      if (v) newConfig[k] = v;
    }
    setSavingConfig(inst.id);
    const { error } = await supabase
      .from("channel_instances")
      .update({ config: newConfig })
      .eq("id", inst.id);
    if (error) {
      toast.error("Erro ao guardar configuração");
    } else {
      toast.success("Configuração guardada");
      setConfigDrafts((prev) => ({ ...prev, [inst.id]: {} }));
      await loadInstances();
    }
    setSavingConfig(null);
  };

  const handleLinkToBitrix = async (instanceId: string, mappingId: string) => {
    setLinkingInstance(instanceId);
    const inst = instances.find((i) => i.id === instanceId);
    if (!inst) return;

    // Enforce 1:1 — block if another instance already uses this mapping
    if (mappingId !== "none") {
      const conflict = instances.find(
        (i) => i.id !== instanceId && i.config?.bitrix24_mapping_id === mappingId
      );
      if (conflict) {
        toast.error(`Esta linha já está vinculada à instância "${conflict.name}". Cada Canal Aberto só pode ter 1 instância.`);
        setLinkingInstance(null);
        return;
      }
    }

    const newConfig = { ...inst.config, bitrix24_mapping_id: mappingId === "none" ? null : mappingId };
    const { error } = await supabase
      .from("channel_instances")
      .update({ config: newConfig })
      .eq("id", instanceId);
    if (error) {
      toast.error("Erro ao vincular ao Bitrix24");
    } else {
      const mapping = bitrixMappings.find((m) => m.id === mappingId);
      toast.success(mappingId === "none" ? "Desvinculado do Bitrix24" : `Vinculado à linha "${mapping?.line_name || mappingId}"`);
      await loadInstances();
    }
    setLinkingInstance(null);
  };

  const getConfigFields = (type: string, config?: Record<string, any>): { key: string; label: string }[] => {
    if (type === "whatsapp" && (config?.provider === "wuzapi" || config?.provider === "gupshup")) {
      return [];
    }
    if (type === "whatsapp") {
      return [
        { key: "access_token", label: "Access Token (Meta)" },
        { key: "phone_number_id", label: "Phone Number ID" },
        { key: "waba_id", label: "WhatsApp Business Account ID" },
        { key: "verify_token", label: "Webhook Verify Token" },
      ];
    }
    return [
      { key: "access_token", label: "Page Access Token (Meta)" },
      { key: "ig_account_id", label: "Instagram Account ID" },
      { key: "app_id", label: "App ID" },
      { key: "app_secret", label: "App Secret" },
    ];
  };

  const maskValue = (val: string) => {
    if (!val || val.length < 8) return "••••••••";
    return val.slice(0, 4) + "••••" + val.slice(-4);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with create button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Instâncias de Canal</h3>
          <p className="text-xs text-muted-foreground">Crie e configure instâncias de WhatsApp (API Oficial Meta) ou Instagram.</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5 w-full sm:w-auto">
              <Plus className="h-4 w-4" />
              Nova Instância
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Nova Instância</DialogTitle>
              <DialogDescription>Escolha o tipo de canal e dê um nome à instância.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Nome da Instância</Label>
                <Input
                  placeholder="Ex: WhatsApp Principal, Instagram Loja…"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo de Canal</Label>
                <Select value={newType} onValueChange={(v) => setNewType(v as "whatsapp" | "whatsapp_qrcode" | "instagram")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-green-600" />
                        WhatsApp — API Oficial Meta
                      </div>
                    </SelectItem>
                    <SelectItem value="whatsapp_qrcode">
                      <div className="flex items-center gap-2">
                        <QrCode className="h-4 w-4 text-green-600" />
                        WhatsApp — QR Code
                      </div>
                    </SelectItem>
                    <SelectItem value="instagram">
                      <div className="flex items-center gap-2">
                        <Instagram className="h-4 w-4 text-pink-600" />
                        Instagram — Meta Graph API
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleCreate} disabled={!newName.trim() || creating}>
                {creating ? <RefreshCw className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
                Criar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Empty state */}
      {instances.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Server className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm font-medium">Nenhuma instância configurada</p>
            <p className="text-xs text-muted-foreground mt-1">Crie a sua primeira instância de WhatsApp ou Instagram para começar.</p>
          </CardContent>
        </Card>
      )}

      {/* Instance cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {instances.map((inst) => {
          const isEditing = editingId === inst.id;
          const fields = getConfigFields(inst.channel_type, inst.config);
          const drafts = configDrafts[inst.id] || {};
          const isWhatsapp = inst.channel_type === "whatsapp";
          const isWuzapi = isWhatsapp && inst.config?.provider === "wuzapi";
          const isGupshup = isWhatsapp && inst.config?.provider === "gupshup";
          const showVal = showValues[inst.id] ?? false;

          return (
            <Card key={inst.id} className={inst.status === "active" ? "border-green-200" : ""}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${isWhatsapp ? "bg-green-100" : "bg-pink-100"}`}>
                    {isWuzapi ? <QrCode className="h-5 w-5 text-green-600" /> : isWhatsapp ? <Phone className="h-5 w-5 text-green-600" /> : <Instagram className="h-5 w-5 text-pink-600" />}
                  </div>
                  <div>
                    <CardTitle className="text-base">{inst.name}</CardTitle>
                    <CardDescription>
                      {isWuzapi ? "WhatsApp QR Code" : isGupshup ? "WhatsApp Oficial via Gupshup" : isWhatsapp ? "WhatsApp Business API" : "Instagram Graph API"}
                      {inst.config.bitrix24_mapping_id && bitrixMappings.length > 0 && (
                        <span className="text-[10px] text-blue-600 flex items-center gap-0.5 mt-0.5">
                          <Plug className="h-2.5 w-2.5" />
                          Bitrix24: {bitrixMappings.find((m) => m.id === inst.config.bitrix24_mapping_id)?.line_name || "Vinculado"}
                        </span>
                      )}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {inst.status === "active" && bitrixMappings.length > 0 && !inst.config.bitrix24_mapping_id && (
                    <Badge variant="destructive" className="text-[10px] h-5">Sem Canal Aberto</Badge>
                  )}
                  <StatusBadge status={inst.status === "error" ? "inactive" : inst.status as "active" | "inactive"} />
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {/* Config summary (hidden for QR Code instances) */}
                {!isWuzapi && fields.length > 0 && (
                <div className="space-y-1">
                  {fields.map((f) => (
                    <div key={f.key} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{f.label}</span>
                      <span className={inst.config[f.key] ? "text-green-600" : "text-muted-foreground"}>
                        {inst.config[f.key] ? "✓ Configurado" : "—"}
                      </span>
                    </div>
                  ))}
                </div>
                )}

                {/* Bitrix24 Link */}
                {bitrixMappings.length > 0 && (
                  <div className="space-y-1.5 border-t pt-3">
                    <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <Plug className="h-3 w-3" />
                      Vincular ao Bitrix24 (Open Line)
                    </label>
                    <Select
                      value={inst.config.bitrix24_mapping_id || "none"}
                      onValueChange={(v) => handleLinkToBitrix(inst.id, v)}
                      disabled={linkingInstance === inst.id}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Selecionar linha…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhuma (desvinculado)</SelectItem>
                        {bitrixMappings.map((m) => {
                          const usedBy = instances.find(
                            (i) => i.id !== inst.id && i.config?.bitrix24_mapping_id === m.id
                          );
                          const disabled = !!usedBy || !m.is_active;
                          return (
                            <SelectItem key={m.id} value={m.id} disabled={disabled}>
                              {m.line_name || m.channel} {m.is_active ? "" : "(inativo)"}
                              {usedBy ? ` — em uso por "${usedBy.name}"` : ""}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">
                      Cada instância só pode ligar a 1 Canal Aberto. Mensagens recebidas serão encaminhadas exclusivamente para a linha selecionada.
                    </p>
                    {inst.config.bitrix24_mapping_id && (
                      <p className="text-[10px] text-green-600">
                        ✓ Vinculado à linha "{bitrixMappings.find((m) => m.id === inst.config.bitrix24_mapping_id)?.line_name || "—"}"
                      </p>
                    )}
                  </div>
                )}

                {/* Editing config */}
                {isEditing && !isWuzapi && (
                  <div className="space-y-2 border-t pt-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium uppercase text-muted-foreground tracking-wide">Credenciais</p>
                      <button
                        onClick={() => setShowValues((prev) => ({ ...prev, [inst.id]: !showVal }))}
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                      >
                        {showVal ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        {showVal ? "Ocultar" : "Mostrar"}
                      </button>
                    </div>
                    {fields.map((f) => (
                      <div key={f.key} className="space-y-1">
                        <label className="text-xs text-muted-foreground">{f.label}</label>
                        <Input
                          type={showVal ? "text" : "password"}
                          placeholder={inst.config[f.key] ? maskValue(inst.config[f.key]) : "Não configurado"}
                          value={drafts[f.key] || ""}
                          onChange={(e) =>
                            setConfigDrafts((prev) => ({
                              ...prev,
                              [inst.id]: { ...(prev[inst.id] || {}), [f.key]: e.target.value },
                            }))
                          }
                          className="h-8 text-xs"
                        />
                      </div>
                    ))}
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => handleSaveConfig(inst)}
                        disabled={savingConfig === inst.id}
                      >
                        {savingConfig === inst.id ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                        Guardar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Fechar</Button>
                    </div>
                  </div>
                )}

                {/* Wuzapi connection status */}
                {isWuzapi && (
                  <div className="flex items-center gap-2 py-1 flex-wrap">
                    {Boolean(wuzapiStatus._global?.logged_in ?? wuzapiStatus._global?.connected) ? (
                      <>
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 px-2.5 py-1 rounded-full">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Conectado
                        </span>
                        {wuzapiStatus._global?.phone_number && (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
                            <Phone className="h-3.5 w-3.5" /> +{wuzapiStatus._global.phone_number}
                          </span>
                        )}
                      </>
                    ) : wuzapiStatus._global?.status === "pending" ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full">
                        <QrCode className="h-3.5 w-3.5" /> Aguardando leitura do QR
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full">
                        <AlertCircle className="h-3.5 w-3.5" /> Desconectado
                      </span>
                    )}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2 pt-1">
                  {isWuzapi ? (
                    <>
                      {!Boolean(wuzapiStatus._global?.logged_in ?? wuzapiStatus._global?.connected) && (
                        <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={() => setQrDialogOpen(true)}>
                          <QrCode className="h-3.5 w-3.5" />
                          Ler QR Code
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 gap-1.5"
                        onClick={() => handleTestConnection(inst.id)}
                        disabled={testingConnection === inst.id}
                      >
                        {testingConnection === inst.id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Wifi className="h-3.5 w-3.5" />}
                        Testar Conexão
                      </Button>
                      {wuzapiStatus._global?.connected && (
                        <Button
                          size="sm"
                          variant="destructive"
                          className="flex-1 gap-1.5"
                          onClick={handleDisconnect}
                          disabled={disconnecting}
                        >
                          {disconnecting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
                          Desconectar
                        </Button>
                      )}
                    </>
                  ) : !isEditing ? (
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => setEditingId(inst.id)}>
                      Configurar
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant={inst.status === "active" ? "destructive" : "default"}
                    className="gap-1"
                    onClick={() => handleToggleStatus(inst)}
                    disabled={toggling === inst.id}
                  >
                    {toggling === inst.id ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : inst.status === "active" ? (
                      <PowerOff className="h-3.5 w-3.5" />
                    ) : (
                      <Power className="h-3.5 w-3.5" />
                    )}
                    {inst.status === "active" ? "Desativar" : "Ativar"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDelete(inst.id)}
                    disabled={deleting === inst.id}
                  >
                    {deleting === inst.id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </Button>
                </div>

                {/* Created at */}
                <p className="text-xs text-muted-foreground">
                  Criada em {new Date(inst.created_at).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" })}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* QR Code Dialog */}
      <QRCodeDialog open={qrDialogOpen} onOpenChange={setQrDialogOpen} />

      {/* Test Connection Log Dialog */}
      <Dialog open={testLogDialogOpen} onOpenChange={setTestLogDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wifi className="h-5 w-5" /> Log do Teste de Conexão
            </DialogTitle>
          </DialogHeader>
          <div className="relative">
            <pre className="bg-muted text-xs p-3 rounded-lg overflow-auto max-h-64 whitespace-pre-wrap break-all font-mono">
              {testLog}
            </pre>
            <Button
              size="sm"
              variant="outline"
              className="absolute top-2 right-2 h-7 w-7 p-0"
              onClick={() => {
                if (testLog) {
                  navigator.clipboard.writeText(testLog);
                  toast.success("Log copiado!");
                }
              }}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setTestLogDialogOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── IA Tab (Ollama Remote) ──────────────────────────────────────────────────

interface AuditEntry {
  id: string;
  created_at: string;
  source_ip: string | null;
  received_url: string | null;
  previous_url: string | null;
  status: string;
  error_message: string | null;
  secret_valid: boolean;
}

// ─── Model Benchmark / Ranking ───────────────────────────────────────────────

interface BenchmarkRow {
  model_name: string;
  quality_score: number | null;
  reasoning_score: number | null;
  knowledge_score: number | null;
  instruction_score: number | null;
  avg_latency_ms: number | null;
  tokens_per_second: number | null;
  recommendation: string | null;
  error_message: string | null;
  updated_at: string;
}

function recommendationStyle(rec?: string | null) {
  if (!rec) return "bg-muted text-muted-foreground";
  if (rec.includes("Mais inteligente")) return "bg-amber-100 text-amber-800 border-amber-300";
  if (rec.includes("Mais rápido")) return "bg-blue-100 text-blue-800 border-blue-300";
  if (rec.includes("custo/benefício")) return "bg-emerald-100 text-emerald-800 border-emerald-300";
  if (rec === "Indisponível") return "bg-red-50 text-red-700 border-red-200";
  return "bg-muted text-muted-foreground";
}

// Perfis de uso: cada perfil pondera de forma diferente os scores do benchmark.
// Os pesos somam 1.0 (qualidade total) + um peso opcional para velocidade.
type UsageProfile = {
  id: string;
  label: string;
  description: string;
  weights: { reasoning: number; knowledge: number; instruction: number; speed: number };
};

const USAGE_PROFILES: UsageProfile[] = [
  {
    id: "balanced",
    label: "Equilibrado",
    description: "Ranking padrão por qualidade global.",
    weights: { reasoning: 0.34, knowledge: 0.33, instruction: 0.33, speed: 0.0 },
  },
  {
    id: "triagem",
    label: "Triagem",
    description: "Respostas rápidas e siga-instruções para classificar/encaminhar leads.",
    weights: { reasoning: 0.15, knowledge: 0.15, instruction: 0.40, speed: 0.30 },
  },
  {
    id: "redacao",
    label: "Redação",
    description: "Texto fluente e fiel ao briefing (instrução + conhecimento).",
    weights: { reasoning: 0.20, knowledge: 0.40, instruction: 0.40, speed: 0.0 },
  },
  {
    id: "analise",
    label: "Análise jurídica",
    description: "Raciocínio profundo e conhecimento — velocidade não importa.",
    weights: { reasoning: 0.55, knowledge: 0.35, instruction: 0.10, speed: 0.0 },
  },
];

function computeProfileScore(r: BenchmarkRow, profile: UsageProfile, maxTps: number): number {
  const reasoning = r.reasoning_score ?? 0;
  const knowledge = r.knowledge_score ?? 0;
  const instruction = r.instruction_score ?? 0;
  // Normaliza tokens/s para escala 0-100 conforme o mais rápido do conjunto
  const speed = maxTps > 0 && r.tokens_per_second ? (r.tokens_per_second / maxTps) * 100 : 0;
  const w = profile.weights;
  const totalW = w.reasoning + w.knowledge + w.instruction + w.speed;
  if (totalW <= 0) return 0;
  const weighted =
    reasoning * w.reasoning +
    knowledge * w.knowledge +
    instruction * w.instruction +
    speed * w.speed;
  return weighted / totalW;
}

function ModelBenchmarkCard({ providerSlug }: { providerSlug: string }) {
  const [rows, setRows] = useState<BenchmarkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [profileId, setProfileId] = useState<string>(() => {
    if (typeof window === "undefined") return "balanced";
    return localStorage.getItem("ollama_usage_profile") || "balanced";
  });
  const profile = USAGE_PROFILES.find((p) => p.id === profileId) ?? USAGE_PROFILES[0];

  useEffect(() => {
    try { localStorage.setItem("ollama_usage_profile", profileId); } catch {}
  }, [profileId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("ollama_model_benchmarks")
        .select("model_name, quality_score, reasoning_score, knowledge_score, instruction_score, avg_latency_ms, tokens_per_second, recommendation, error_message, updated_at")
        .eq("provider_slug", providerSlug)
        .order("quality_score", { ascending: false, nullsFirst: false });
      if (data) setRows(data as BenchmarkRow[]);
    } catch {}
    setLoading(false);
  }, [providerSlug]);

  useEffect(() => { load(); }, [load]);

  // Polling enquanto houver linhas marcadas como "__running__"
  useEffect(() => {
    const hasRunning = rows.some((r) => r.error_message === "__running__");
    if (!hasRunning) return;
    const t = setInterval(() => { load(); }, 5000);
    return () => clearInterval(t);
  }, [rows, load]);

  const runBenchmark = async (singleModel?: string) => {
    setRunning(true);
    setProgress(singleModel ? `A reavaliar ${singleModel}…` : "A avaliar modelos em background (5–60s por modelo)…");
    try {
      const { data, error } = await supabase.functions.invoke("ollama-benchmark-models", {
        body: singleModel ? { model: singleModel } : {},
      });
      if (error) {
        toast.error(`Erro: ${error.message}`);
      } else if (data?.ok) {
        toast.success(
          data.queued
            ? `Avaliação iniciada (${data.evaluated} modelo(s)). A tabela atualiza-se automaticamente.`
            : `Avaliados ${data.evaluated} modelo(s)`,
        );
        await load();
      } else {
        toast.error(data?.error || "Falha ao avaliar");
      }
    } catch (e: any) {
      toast.error(e.message || "Erro de rede");
    }
    setProgress("");
    setRunning(false);
  };

  const [pinging, setPinging] = useState<string | null>(null);
  const pingModel = async (modelName: string) => {
    setPinging(modelName);
    try {
      const { data, error } = await supabase.functions.invoke("ollama-ping-model", {
        body: { model: modelName },
      });
      if (error) {
        toast.error(`Erro: ${error.message}`);
      } else if (data?.ok) {
        const sec = (data.latency_ms / 1000).toFixed(1);
        toast.success(`✅ ${modelName} respondeu em ${sec}s`, {
          description: data.response_excerpt ? `Resposta: "${data.response_excerpt}"` : undefined,
        });
      } else {
        toast.error(`❌ ${modelName}: ${data?.error || "sem resposta"}`, {
          description: data?.latency_ms ? `Após ${(data.latency_ms / 1000).toFixed(1)}s` : undefined,
        });
      }
    } catch (e: any) {
      toast.error(e.message || "Erro de rede");
    }
    setPinging(null);
  };

  const maxTps = Math.max(0, ...rows.map((r) => r.tokens_per_second ?? 0));
  const scored = rows.map((r) => ({ ...r, profile_score: computeProfileScore(r, profile, maxTps) }));
  const sorted = [...scored].sort((a, b) => (b.profile_score ?? -1) - (a.profile_score ?? -1));
  const topForProfile = sorted[0];
  const fastest = [...rows].sort((a, b) => (b.tokens_per_second ?? -1) - (a.tokens_per_second ?? -1))[0];
  const smartest = [...rows].sort((a, b) => (b.quality_score ?? -1) - (a.quality_score ?? -1))[0];

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-fuchsia-100">
            <Trophy className="h-5 w-5 text-fuchsia-600" />
          </div>
          <div>
            <CardTitle className="text-base">Classificação de Modelos</CardTitle>
            <CardDescription>
              Avaliação automática de cada modelo: qualidade, velocidade e recomendação de uso.
            </CardDescription>
          </div>
        </div>
        <Button size="sm" onClick={() => runBenchmark()} disabled={running}>
          {running ? (
            <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />A avaliar…</>
          ) : (
            <><Sparkles className="h-3.5 w-3.5 mr-1.5" />Avaliar modelos</>
          )}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {progress && (
          <div className="rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-800 flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {progress}
          </div>
        )}

        {/* Seletor de perfil de uso */}
        {rows.length > 0 && (
          <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Scale className="h-4 w-4 text-fuchsia-600" />
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Perfil de uso
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground italic flex-1 text-right min-w-[200px]">
                {profile.description}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {USAGE_PROFILES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setProfileId(p.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                    profileId === p.id
                      ? "bg-fuchsia-600 text-white border-fuchsia-600"
                      : "bg-background hover:bg-muted border-border"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Cards de destaque */}
        {(topForProfile || smartest || fastest) && (
          <div className="grid gap-3 sm:grid-cols-3">
            {topForProfile && (
              <div className="rounded-lg border border-fuchsia-200 bg-fuchsia-50 p-3">
                <div className="flex items-center gap-2 text-fuchsia-800">
                  <Trophy className="h-4 w-4" />
                  <span className="text-xs font-semibold uppercase tracking-wide">
                    Melhor para “{profile.label}”
                  </span>
                </div>
                <p className="mt-1 text-sm font-mono break-all">{topForProfile.model_name}</p>
                <p className="text-[11px] text-fuchsia-700">
                  Score {topForProfile.profile_score?.toFixed(0)}/100
                </p>
              </div>
            )}
            {smartest && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-center gap-2 text-amber-800">
                  <Sparkles className="h-4 w-4" />
                  <span className="text-xs font-semibold uppercase tracking-wide">Mais inteligente</span>
                </div>
                <p className="mt-1 text-sm font-mono break-all">{smartest.model_name}</p>
                <p className="text-[11px] text-amber-700">Qualidade {smartest.quality_score?.toFixed(0)}/100</p>
              </div>
            )}
            {fastest && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                <div className="flex items-center gap-2 text-blue-800">
                  <Zap className="h-4 w-4" />
                  <span className="text-xs font-semibold uppercase tracking-wide">Mais rápido</span>
                </div>
                <p className="mt-1 text-sm font-mono break-all">{fastest.model_name}</p>
                <p className="text-[11px] text-blue-700">{fastest.tokens_per_second?.toFixed(1)} tok/s</p>
              </div>
            )}
          </div>
        )}

        {/* Tabela */}
        {loading ? (
          <p className="text-xs text-muted-foreground">A carregar…</p>
        ) : sorted.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Gauge className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Ainda não há benchmarks.</p>
            <p className="text-[11px]">Clica em "Avaliar modelos" para gerar o ranking.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs">
                <tr>
                  <th className="text-left px-3 py-2 w-10">#</th>
                  <th className="text-left px-3 py-2">Modelo</th>
                  <th className="text-left px-3 py-2">Score perfil</th>
                  <th className="text-left px-3 py-2">Qualidade</th>
                  <th className="text-left px-3 py-2">Raciocínio</th>
                  <th className="text-left px-3 py-2">Conhec.</th>
                  <th className="text-left px-3 py-2">Instr.</th>
                  <th className="text-left px-3 py-2">Velocidade</th>
                  <th className="text-left px-3 py-2">Latência</th>
                  <th className="text-left px-3 py-2">Recomendação</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => {
                  const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "";
                  const q = r.quality_score ?? 0;
                  const ps = r.profile_score ?? 0;
                  return (
                    <tr key={r.model_name} className="border-t hover:bg-muted/30">
                      <td className="px-3 py-2 text-xs font-medium">
                        {medal || i + 1}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs break-all max-w-[200px]">{r.model_name}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full ${ps >= 75 ? "bg-fuchsia-600" : ps >= 50 ? "bg-fuchsia-400" : "bg-fuchsia-200"}`}
                              style={{ width: `${ps}%` }}
                            />
                          </div>
                          <span className="text-xs font-semibold w-9 text-fuchsia-700">{ps.toFixed(0)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {r.quality_score !== null ? (
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full ${q >= 75 ? "bg-emerald-500" : q >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                                style={{ width: `${q}%` }}
                              />
                            </div>
                            <span className="text-xs font-medium w-9">{q.toFixed(0)}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">{r.reasoning_score?.toFixed(0) ?? "—"}</td>
                      <td className="px-3 py-2 text-xs">{r.knowledge_score?.toFixed(0) ?? "—"}</td>
                      <td className="px-3 py-2 text-xs">{r.instruction_score?.toFixed(0) ?? "—"}</td>
                      <td className="px-3 py-2 text-xs">
                        {r.tokens_per_second ? `${r.tokens_per_second.toFixed(1)} tok/s` : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {r.avg_latency_ms ? `${(r.avg_latency_ms / 1000).toFixed(1)}s` : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {r.recommendation === "Indisponível" ? (
                          <span
                            className={`inline-block text-[10px] px-2 py-0.5 rounded-full border cursor-help ${recommendationStyle(r.recommendation)}`}
                            title="Modelo demasiado grande para o servidor Ollama actual. Soluções: (1) escolher modelo menor; (2) parar outros modelos com 'ollama stop'; (3) aumentar RAM/VRAM do servidor."
                          >
                            {r.recommendation}
                          </span>
                        ) : (
                          <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full border ${recommendationStyle(r.recommendation)}`}>
                            {r.recommendation || "—"}
                          </span>
                        )}
                        {r.error_message === "__running__" ? (
                          <p className="text-[10px] text-violet-700 mt-0.5 flex items-center gap-1">
                            <Loader2 className="h-2.5 w-2.5 animate-spin" /> a avaliar…
                          </p>
                        ) : r.error_message ? (
                          <p className="text-[10px] text-red-600 mt-0.5 max-w-[200px] truncate" title={r.error_message}>
                            ⚠ {r.error_message}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            disabled={pinging === r.model_name}
                            onClick={() => pingModel(r.model_name)}
                            title="Teste rápido de conexão (ping)"
                          >
                            {pinging === r.model_name ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Zap className="h-3 w-3" />
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            disabled={running}
                            onClick={() => runBenchmark(r.model_name)}
                            title="Reavaliar este modelo (benchmark completo)"
                          >
                            <RefreshCw className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[10px] text-muted-foreground">
          Cada modelo é avaliado com 3 prompts (raciocínio, conhecimento, instrução). A qualidade é classificada por um avaliador IA (0-100).
        </p>
      </CardContent>
    </Card>
  );
}

function IATab() {
  const [ollamaUrl, setOllamaUrl] = useState("");
  const [currentUrl, setCurrentUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message?: string; error?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  const loadProviderModels = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("ai_providers")
        .select("available_models")
        .eq("slug", "qwen-local")
        .maybeSingle();
      const list = Array.isArray(data?.available_models) ? data!.available_models : [];
      const names = list
        .map((m: any) => (typeof m === "string" ? m : m?.name))
        .filter((n: any): n is string => typeof n === "string" && n.length > 0);
      if (names.length) setAvailableModels(names);
    } catch {}
  }, []);

  const loadUrl = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ollama-test-connection");
      if (!error && data?.url) {
        setCurrentUrl(data.url);
        if (Array.isArray(data?.models) && data.models.length) {
          setAvailableModels(data.models);
        }
      } else {
        const { data: credData } = await supabase.functions.invoke("manage-credentials", { method: "GET" });
        if (credData?.credentials) {
          const cred = credData.credentials.find((c: any) => c.provider === "qwen-local" && c.credential_key === "OLLAMA_BASE_URL");
          if (cred?.has_value) setCurrentUrl(cred.credential_value_masked || "");
        }
      }
    } catch {}
    setLoading(false);
  }, []);

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const { data } = await supabase
        .from("ollama_url_audit")
        .select("id, created_at, source_ip, received_url, previous_url, status, error_message, secret_valid")
        .order("created_at", { ascending: false })
        .limit(20);
      if (data) setAuditLogs(data as AuditEntry[]);
    } catch {}
    setAuditLoading(false);
  }, []);

  useEffect(() => { loadUrl(); loadAudit(); loadProviderModels(); }, [loadUrl, loadAudit, loadProviderModels]);

  const handleSave = async () => {
    if (!ollamaUrl.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.functions.invoke("manage-credentials", {
        method: "POST",
        body: { provider: "qwen-local", credential_key: "OLLAMA_BASE_URL", credential_value: ollamaUrl.trim().replace(/\/+$/, "") },
      });
      if (error) {
        toast.error("Erro ao guardar URL");
      } else {
        toast.success("URL do Ollama guardada com sucesso");
        setOllamaUrl("");
        await loadUrl();
        await loadProviderModels();
      }
    } catch {
      toast.error("Erro de rede");
    }
    setSaving(false);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("ollama-test-connection", {
        body: { persist: true },
      });
      if (error) {
        setTestResult({ ok: false, error: `Erro ao chamar teste: ${error.message}` });
      } else if (data?.ok) {
        setTestResult({ ok: true, message: data.message });
        if (data.url) setCurrentUrl(data.url);
        if (Array.isArray(data?.models) && data.models.length) {
          setAvailableModels(data.models);
        } else {
          await loadProviderModels();
        }
      } else {
        setTestResult({ ok: false, error: data?.error || "Falha desconhecida" });
      }
    } catch (e: any) {
      setTestResult({ ok: false, error: e.message || "Erro de rede" });
    }
    setTesting(false);
  };

  const statusColor = (s: string) => {
    if (s === "updated") return "text-green-700 bg-green-50";
    if (s === "unchanged") return "text-blue-700 bg-blue-50";
    if (s === "rejected") return "text-orange-700 bg-orange-50";
    return "text-red-700 bg-red-50";
  };

  const statusIcon = (s: string) => {
    if (s === "updated") return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
    if (s === "unchanged") return <Clock className="h-3.5 w-3.5 text-blue-500" />;
    if (s === "rejected") return <XCircle className="h-3.5 w-3.5 text-orange-500" />;
    return <AlertCircle className="h-3.5 w-3.5 text-red-500" />;
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
      {/* Config card */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100">
              <Bot className="h-5 w-5 text-violet-600" />
            </div>
            <div>
              <CardTitle className="text-base">Ollama Remoto — Qwen</CardTitle>
              <CardDescription>Servidor Ollama exposto via túnel Cloudflare</CardDescription>
            </div>
          </div>
          <StatusBadge status={currentUrl ? "active" : "inactive"} />
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="rounded-md border border-violet-200 bg-violet-50 px-4 py-3 text-xs text-violet-800 space-y-1">
            <p className="font-semibold">ℹ️ URLs de túneis Cloudflare são temporárias</p>
            <p>Cada vez que reiniciar o túnel, a URL muda. Atualize aqui ou configure o webhook automático.</p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">URL do Servidor Ollama</Label>
            <div className="flex gap-2">
              <Input
                placeholder="https://xxxx.trycloudflare.com"
                value={ollamaUrl}
                onChange={(e) => setOllamaUrl(e.target.value)}
                className="flex-1"
              />
              <Button size="sm" onClick={handleSave} disabled={!ollamaUrl.trim() || saving}>
                {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              </Button>
            </div>
            {currentUrl && (
              <p className="text-xs text-green-600 break-all">✓ URL atual: {currentUrl}</p>
            )}
            {loading && <p className="text-xs text-muted-foreground">A carregar…</p>}
          </div>

          <Button size="sm" variant="outline" className="w-full" onClick={handleTest} disabled={testing}>
            {testing ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Activity className="h-3.5 w-3.5 mr-1.5" />}
            {testing ? "A testar…" : "Testar Conexão Ollama"}
          </Button>

          {testResult && (
            <div className={`flex items-start gap-2 rounded-md px-3 py-2 ${testResult.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
              {testResult.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" /> : <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />}
              <span className="text-xs">{testResult.ok ? testResult.message : testResult.error}</span>
            </div>
          )}

          <div className="pt-2 border-t space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Modelos disponíveis {availableModels.length > 0 && `(${availableModels.length})`}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {availableModels.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  Nenhum modelo carregado. Clique em "Testar Conexão Ollama" para sincronizar.
                </p>
              ) : (
                availableModels.map((m) => (
                  <Badge key={m} variant="secondary" className="text-xs">{m}</Badge>
                ))
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">Selecione estes modelos ao criar/editar agentes com o provedor "Qwen Local".</p>
          </div>
        </CardContent>
      </Card>

      {/* Audit Monitor card */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100">
              <Radio className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <CardTitle className="text-base">Monitor do Webhook</CardTitle>
              <CardDescription>Últimos recebimentos e mudanças de URL</CardDescription>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => loadAudit()} className="h-8 px-2">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {auditLoading && <p className="text-xs text-muted-foreground">A carregar…</p>}
          {!auditLoading && auditLogs.length === 0 && (
            <div className="text-center py-6 text-muted-foreground">
              <Radio className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-xs">Nenhum webhook recebido ainda.</p>
              <p className="text-[10px] mt-1">O script do túnel deve enviar POST para o endpoint ollama-url-webhook.</p>
            </div>
          )}
          <div className="max-h-80 overflow-y-auto space-y-1.5">
            {auditLogs.map((log) => (
              <div key={log.id} className={`rounded-md px-3 py-2 ${statusColor(log.status)}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {statusIcon(log.status)}
                    <span className="text-xs font-medium capitalize">{log.status}</span>
                    {!log.secret_valid && <Badge variant="outline" className="text-[9px] px-1 py-0 border-orange-300 text-orange-700">secret inválido</Badge>}
                  </div>
                  <span className="text-[10px] opacity-70 whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                </div>
                {log.received_url && (
                  <p className="text-[10px] mt-1 break-all opacity-80 font-mono">→ {log.received_url}</p>
                )}
                {log.previous_url && log.status === "updated" && (
                  <p className="text-[10px] break-all opacity-60 font-mono line-through">← {log.previous_url}</p>
                )}
                {log.error_message && (
                  <p className="text-[10px] mt-0.5 opacity-80">⚠ {log.error_message}</p>
                )}
                {log.source_ip && log.source_ip !== "unknown" && (
                  <p className="text-[10px] opacity-50">IP: {log.source_ip}</p>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      </div>

      {/* Benchmark / Ranking de Modelos — full width */}
      <ModelBenchmarkCard providerSlug="qwen-local" />
    </div>
  );
}

// ─── Mapeamento Tab ──────────────────────────────────────────────────────────

function MapeamentoTab() {
  const FieldMappingManager = lazy(() => import("@/components/bitrix24/FieldMappingManager"));
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
      <FieldMappingManager />
    </Suspense>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function IntegracoesPage() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="Central de Integrações" description="Gerencie todas as integrações e conectores do sistema" />

      <Tabs defaultValue="instancias" className="w-full">
        {/* Mobile: scroll horizontal; Desktop: grid 7 colunas */}
        <TabsList className="flex w-full overflow-x-auto scrollbar-none justify-start md:grid md:grid-cols-8 h-auto p-1">
          <TabsTrigger value="instancias" className="flex items-center gap-1.5 sm:gap-2 shrink-0 text-xs sm:text-sm whitespace-nowrap">
            <Server className="h-4 w-4" />
            Instâncias
          </TabsTrigger>
          <TabsTrigger value="crm" className="flex items-center gap-1.5 sm:gap-2 shrink-0 text-xs sm:text-sm whitespace-nowrap">
            <Plug className="h-4 w-4" />
            CRM
          </TabsTrigger>
          <TabsTrigger value="mapeamento" className="flex items-center gap-1.5 sm:gap-2 shrink-0 text-xs sm:text-sm whitespace-nowrap">
            <Link className="h-4 w-4" />
            Mapeamento
          </TabsTrigger>
          <TabsTrigger value="omnichannel" className="flex items-center gap-1.5 sm:gap-2 shrink-0 text-xs sm:text-sm whitespace-nowrap">
            <MessageCircle className="h-4 w-4" />
            <span className="hidden xs:inline sm:inline">Omni Channel</span>
            <span className="xs:hidden sm:hidden">Omni</span>
          </TabsTrigger>
          <TabsTrigger value="chatbot" className="flex items-center gap-1.5 sm:gap-2 shrink-0 text-xs sm:text-sm whitespace-nowrap">
            <Bot className="h-4 w-4" />
            Chatbot
          </TabsTrigger>
          <TabsTrigger value="pagamentos" className="flex items-center gap-1.5 sm:gap-2 shrink-0 text-xs sm:text-sm whitespace-nowrap">
            <CreditCard className="h-4 w-4" />
            Pagamentos
          </TabsTrigger>
          <TabsTrigger value="ia" className="flex items-center gap-1.5 sm:gap-2 shrink-0 text-xs sm:text-sm whitespace-nowrap">
            <Bot className="h-4 w-4" />
            IA
          </TabsTrigger>
          <TabsTrigger value="openclaw" className="flex items-center gap-1.5 sm:gap-2 shrink-0 text-xs sm:text-sm whitespace-nowrap">
            <Zap className="h-4 w-4" />
            OpenClaw
          </TabsTrigger>
        </TabsList>

        <TabsContent value="instancias"><InstancesTab /></TabsContent>
        <TabsContent value="crm"><CRMTab /></TabsContent>
        <TabsContent value="mapeamento"><MapeamentoTab /></TabsContent>
        <TabsContent value="omnichannel"><OmniChannelTab /></TabsContent>
        <TabsContent value="chatbot"><ChatbotTab /></TabsContent>
        <TabsContent value="pagamentos"><PagamentosTab /></TabsContent>
        <TabsContent value="ia"><IATab /></TabsContent>
        <TabsContent value="openclaw"><OpenClawTab /></TabsContent>
      </Tabs>
    </div>
  );
}

