import { useEffect, useState, useCallback, lazy, Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
  const [testResult, setTestResult] = useState<{ ok: boolean; message?: string; error?: string } | null>(null);

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

  const bitrixStatus = integration ? (integration.connector_active ? "active" : integration.connector_registered ? "pending" : "inactive") : "inactive";
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
          <StatusBadge status={bitrixStatus} />
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {integration ? (
            <>
              <div className="flex justify-between"><span className="text-muted-foreground">Domínio</span><span className="font-medium">{integration.domain || "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Conector registado</span><span>{integration.connector_registered ? "Sim" : "Não"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Última atualização</span><span>{new Date(integration.updated_at).toLocaleDateString("pt-PT")}</span></div>
              <Button size="sm" variant="outline" className="w-full mt-1" onClick={handleTestConnection} disabled={testing}>
                {testing ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Activity className="h-3.5 w-3.5 mr-1.5" />}
                {testing ? "A testar…" : "Testar Conexão"}
              </Button>
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
  onSave: (provider: string, key: string, value: string) => Promise<void>;
  saving: string | null;
}) {
  const fullKey = `${provider}::${credentialKey}`;
  const existing = credentials[fullKey];
  const draftValue = drafts[fullKey] ?? "";
  const [showValue, setShowValue] = useState(false);
  const isSaving = saving === fullKey;

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
            className="h-8 text-xs pr-8"
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
          disabled={!draftValue || isSaving}
          onClick={() => onSave(provider, credentialKey, draftValue)}
        >
          {isSaving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        </Button>
      </div>
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

// ─── Omni Channel Tab ────────────────────────────────────────────────────────

function OmniChannelTab() {
  const [conversations, setConversations] = useState<{ channel: string; count: number }[]>([]);
  const [igTesting, setIgTesting] = useState(false);
  const [igResult, setIgResult] = useState<any>(null);
  const [credentials, setCredentials] = useState<Record<string, { has_value: boolean; masked: string }>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
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
    } catch {}
  }, []);

  const handleSaveCredential = async (provider: string, key: string, value: string) => {
    const fullKey = `${provider}::${key}`;
    setSaving(fullKey);
    try {
      const { error } = await supabase.functions.invoke("manage-credentials", {
        method: "POST",
        body: { provider, credential_key: key, credential_value: value },
      });
      if (error) {
        toast.error("Erro ao guardar credencial");
      } else {
        toast.success(`${key} guardado com sucesso`);
        setDrafts((prev) => ({ ...prev, [fullKey]: "" }));
        await loadCredentials();
      }
    } catch {
      toast.error("Erro de rede");
    }
    setSaving(null);
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
        </CardContent>
      </Card>

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

function PagamentosTab() {
  const [credentials, setCredentials] = useState<Record<string, { has_value: boolean; masked: string }>>({});
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
        const map: Record<string, { has_value: boolean; masked: string }> = {};
        for (const c of data.credentials) {
          map[`${c.provider}::${c.credential_key}`] = {
            has_value: c.has_value,
            masked: c.credential_value_masked || "",
          };
        }
        setCredentials(map);
      }
    } catch {}
  }, []);

  const handleSaveCredential = async (provider: string, key: string, value: string) => {
    const fullKey = `${provider}::${key}`;
    setSaving(fullKey);
    try {
      const { error } = await supabase.functions.invoke("manage-credentials", {
        method: "POST",
        body: { provider, credential_key: key, credential_value: value },
      });
      if (error) {
        toast.error("Erro ao guardar credencial");
      } else {
        toast.success(`${key} guardado com sucesso`);
        setDrafts((prev) => ({ ...prev, [fullKey]: "" }));
        await loadCredentials();
      }
    } catch {
      toast.error("Erro de rede");
    }
    setSaving(null);
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
  const stripeBrConfigured = credentials["stripe_br::STRIPE_SECRET_KEY_BR"]?.has_value;
  const asaasConfigured = credentials["asaas::ASAAS_API_KEY"]?.has_value;

  const handleTestStripePT = async () => {
    setTestingStripePT(true);
    setStripePtResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("payment-create", {
        body: { amount: 0.01, currency: "EUR", payment_method: "card", force_gateway: "stripe_pt", customer_data: { country: "Portugal", email: "test@test.com" }, description: "Teste Stripe PT" },
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
      const { data, error } = await supabase.functions.invoke("payment-create", {
        body: { amount: 0.01, currency: "BRL", payment_method: "card", force_gateway: "stripe_br", customer_data: { country: "Brasil", email: "test@test.com" }, description: "Teste Stripe BR" },
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
      const { data, error } = await supabase.functions.invoke("payment-create", {
        body: { amount: 5.00, currency: "BRL", payment_method: "pix", customer_data: { country: "Brasil", name: "Teste Emmely", cpf_cnpj: "24971563792" }, description: "Teste de conexão Emmely Pay" },
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
          <StatusBadge status={stripePtConfigured ? "active" : "inactive"} />
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <CredentialInput provider="stripe_pt" credentialKey="STRIPE_SECRET_KEY_PT" label="Secret Key (sk_...)" {...credProps} />
          <CredentialInput provider="stripe_pt" credentialKey="STRIPE_WEBHOOK_SECRET_PT" label="Webhook Secret (whsec_...)" {...credProps} />

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
          <StatusBadge status={stripeBrConfigured ? "active" : "inactive"} />
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <CredentialInput provider="stripe_br" credentialKey="STRIPE_SECRET_KEY_BR" label="Secret Key (sk_...)" {...credProps} />
          <CredentialInput provider="stripe_br" credentialKey="STRIPE_WEBHOOK_SECRET_BR" label="Webhook Secret (whsec_...)" {...credProps} />

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
  const [settings, setSettings] = useState<ChatbotSettings[]>(
    DIRECT_CHANNELS.map((c) => ({ channel: c.channel, enabled: false, agent_id: null }))
  );
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [integration, setIntegration] = useState<BitrixIntegrationBot | null>(null);
  const [reregistering, setReregistering] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [agentsRes, settingsRes, intRes] = await Promise.all([
        supabase.from("ai_agents").select("id, name").eq("is_active", true).order("name"),
        supabase.from("chatbot_channel_settings" as any).select("channel, enabled, agent_id"),
        supabase.from("bitrix24_integrations").select("id, domain, config, connector_registered").limit(1).single(),
      ]);

      if (agentsRes.data) setAgents(agentsRes.data as { id: string; name: string }[]);
      if (intRes.data) setIntegration(intRes.data as BitrixIntegrationBot);

      if (settingsRes.data && settingsRes.data.length > 0) {
        setSettings((prev) =>
          prev.map((s) => {
            const row = (settingsRes.data as unknown as ChatbotSettings[]).find((r) => r.channel === s.channel);
            return row ? { channel: s.channel, enabled: row.enabled ?? false, agent_id: row.agent_id ?? null } : s;
          })
        );
      }
      setLoading(false);
    }
    load();
  }, []);

  const handleToggle = async (channel: string, enabled: boolean) => {
    setSettings((prev) => prev.map((s) => (s.channel === channel ? { ...s, enabled } : s)));
    await saveChannel(channel, enabled, settings.find((s) => s.channel === channel)?.agent_id ?? null);
  };

  const handleAgentChange = async (channel: string, agentId: string) => {
    const newAgentId = agentId === "none" ? null : agentId;
    setSettings((prev) => prev.map((s) => (s.channel === channel ? { ...s, agent_id: newAgentId } : s)));
    await saveChannel(channel, settings.find((s) => s.channel === channel)?.enabled ?? false, newAgentId);
  };

  const saveChannel = async (channel: string, enabled: boolean, agentId: string | null) => {
    setSaving(channel);
    try {
      const { error } = await supabase.from("chatbot_channel_settings" as any).upsert({
        channel,
        enabled,
        agent_id: agentId,
        updated_at: new Date().toISOString(),
      }, { onConflict: "channel" });
      if (error) throw error;
      toast.success(`Chatbot ${channel} ${enabled ? "ativado" : "desativado"}`);
    } catch (e: unknown) {
      toast.error((e as Error)?.message || "Erro ao guardar");
    } finally {
      setSaving(null);
    }
  };

  const handleReregisterBot = async () => {
    setReregistering(true);
    try {
      // Calls dedicated re-registration function (NOT rebind-events which only rebinds webhooks)
      const { data, error } = await supabase.functions.invoke("bitrix24-reregister-bot");
      if (error) throw error;
      if (data?.success) {
        const botIdNew = data?.bot_id;
        toast.success(`Bot Emmely AI registado com ID: ${botIdNew}. Agora vá ao Contact Center → Open Lines → Chatbot e selecione "Emmely AI".`);
        const { data: intData } = await supabase.from("bitrix24_integrations").select("id, domain, config, connector_registered").limit(1).single();
        if (intData) setIntegration(intData as BitrixIntegrationBot);
      } else {
        toast.error(data?.error || data?.fallback_error || "Erro ao re-registar bot");
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

  const botId = (integration?.config as any)?.bot_id;
  const botRegistered = integration?.connector_registered;

  return (
    <div className="space-y-6">

      {/* ── Secção 1: Bot Bitrix24 (Contact Center) ── */}
      <div>
        <div className="mb-3">
          <h3 className="text-sm font-semibold">Bot Bitrix24 — Contact Center</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            O bot "Emmely AI" registado no Bitrix24. Para ativá-lo numa Open Line vá a{" "}
            <strong>Contact Center → selecione a linha → Configurações → Chatbot → Emmely AI</strong>.
          </p>
        </div>

        <Card>
          <CardContent className="pt-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                  <Bot className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">Emmely AI</p>
                  <p className="text-xs text-muted-foreground">
                    {integration?.domain ? `Registado em ${integration.domain}` : "Não conectado ao Bitrix24"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {botRegistered ? (
                  <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Registado
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-200">
                    <Clock className="h-3 w-3 mr-1" />
                    Pendente
                  </Badge>
                )}
              </div>
            </div>

            {botId && (
              <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs">
                <span className="text-muted-foreground">Bot ID:</span>
                <span className="font-mono font-medium">{botId}</span>
              </div>
            )}

            <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-800 space-y-1">
              <p className="font-semibold">📋 Como ativar o chatbot no Contact Center:</p>
              <ol className="list-decimal ml-4 space-y-0.5">
                <li>No Bitrix24, abra <strong>Contact Center</strong></li>
                <li>Selecione a <strong>Open Line</strong> desejada → <strong>Configurações</strong></li>
                <li>Na secção <strong>Chatbot</strong>, selecione <strong>Emmely AI</strong></li>
                <li>Guarde as configurações</li>
              </ol>
            </div>

            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={handleReregisterBot}
              disabled={reregistering || !integration}
            >
              {reregistering
                ? <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />A re-registar…</>
                : <><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Re-registar Bot no Bitrix24</>
              }
            </Button>
            {!integration && (
              <p className="text-xs text-muted-foreground text-center">
                Nenhuma integração Bitrix24 encontrada. Instale a app primeiro.
              </p>
            )}
          </CardContent>
        </Card>
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

function InstancesTab() {
  const [instances, setInstances] = useState<ChannelInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"whatsapp" | "instagram">("whatsapp");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [configDrafts, setConfigDrafts] = useState<Record<string, Record<string, string>>>({});
  const [savingConfig, setSavingConfig] = useState<string | null>(null);
  const [showValues, setShowValues] = useState<Record<string, boolean>>({});
  const [toggling, setToggling] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [bitrixMappings, setBitrixMappings] = useState<ChannelMapping[]>([]);
  const [linkingInstance, setLinkingInstance] = useState<string | null>(null);

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

  useEffect(() => { loadInstances(); }, [loadInstances]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    const { error } = await supabase.from("channel_instances").insert({
      name: newName.trim(),
      channel_type: newType,
      status: "inactive",
      config: {},
    });
    if (error) {
      toast.error("Erro ao criar instância");
    } else {
      toast.success(`Instância "${newName}" criada`);
      setNewName("");
      setDialogOpen(false);
      await loadInstances();
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

  const getConfigFields = (type: string): { key: string; label: string }[] => {
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
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Instâncias de Canal</h3>
          <p className="text-xs text-muted-foreground">Crie e configure instâncias de WhatsApp (API Oficial Meta) ou Instagram.</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
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
                <Select value={newType} onValueChange={(v) => setNewType(v as "whatsapp" | "instagram")}>
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
          const fields = getConfigFields(inst.channel_type);
          const drafts = configDrafts[inst.id] || {};
          const isWhatsapp = inst.channel_type === "whatsapp";
          const showVal = showValues[inst.id] ?? false;

          return (
            <Card key={inst.id} className={inst.status === "active" ? "border-green-200" : ""}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${isWhatsapp ? "bg-green-100" : "bg-pink-100"}`}>
                    {isWhatsapp ? <Phone className="h-5 w-5 text-green-600" /> : <Instagram className="h-5 w-5 text-pink-600" />}
                  </div>
                  <div>
                    <CardTitle className="text-base">{inst.name}</CardTitle>
                    <CardDescription>
                      {isWhatsapp ? "WhatsApp Business API" : "Instagram Graph API"}
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
                  <StatusBadge status={inst.status === "error" ? "inactive" : inst.status as "active" | "inactive"} />
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {/* Config summary */}
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
                        {bitrixMappings.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.line_name || m.channel} {m.is_active ? "✓" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {inst.config.bitrix24_mapping_id && (
                      <p className="text-[10px] text-green-600">
                        ✓ Vinculado à linha "{bitrixMappings.find((m) => m.id === inst.config.bitrix24_mapping_id)?.line_name || "—"}"
                      </p>
                    )}
                  </div>
                )}

                {/* Editing config */}
                {isEditing && (
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

                {/* Action buttons */}
                <div className="flex gap-2 pt-1">
                  {!isEditing && (
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => setEditingId(inst.id)}>
                      Configurar
                    </Button>
                  )}
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
    </div>
  );
}

// ─── IA Tab (Ollama Remote) ──────────────────────────────────────────────────

function IATab() {
  const [ollamaUrl, setOllamaUrl] = useState("");
  const [currentUrl, setCurrentUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message?: string; error?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUrl = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch real URL via the test endpoint (reads from DB server-side)
      const { data, error } = await supabase.functions.invoke("ollama-test-connection");
      if (!error && data?.url) {
        setCurrentUrl(data.url);
      } else {
        // Fallback to masked value
        const { data: credData } = await supabase.functions.invoke("manage-credentials", { method: "GET" });
        if (credData?.credentials) {
          const cred = credData.credentials.find((c: any) => c.provider === "qwen-local" && c.credential_key === "OLLAMA_BASE_URL");
          if (cred?.has_value) setCurrentUrl(cred.credential_value_masked || "");
        }
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadUrl(); }, [loadUrl]);

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
      // Test server-side — the edge function reads the real URL from the DB
      const { data, error } = await supabase.functions.invoke("ollama-test-connection");
      if (error) {
        setTestResult({ ok: false, error: `Erro ao chamar teste: ${error.message}` });
      } else if (data?.ok) {
        setTestResult({ ok: true, message: data.message });
        // Update the displayed URL if returned
        if (data.url) setCurrentUrl(data.url);
      } else {
        setTestResult({ ok: false, error: data?.error || "Falha desconhecida" });
      }
    } catch (e: any) {
      setTestResult({ ok: false, error: e.message || "Erro de rede" });
    }
    setTesting(false);
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="md:col-span-2">
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
            <p>Cada vez que reiniciar o túnel, a URL muda. Atualize aqui a nova URL do seu servidor Ollama.</p>
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
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Modelos disponíveis</p>
            <div className="flex flex-wrap gap-1.5">
              {["qwen2.5:7b", "qwen2.5:14b", "qwen2.5:32b"].map((m) => (
                <Badge key={m} variant="secondary" className="text-xs">{m}</Badge>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">Selecione estes modelos ao criar/editar agentes com o provedor "Qwen Local".</p>
          </div>
        </CardContent>
      </Card>
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
    <div className="space-y-6">
      <PageHeader title="Central de Integrações" description="Gerencie todas as integrações e conectores do sistema" />

      <Tabs defaultValue="instancias" className="w-full">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="instancias" className="flex items-center gap-2">
            <Server className="h-4 w-4" />
            Instâncias
          </TabsTrigger>
          <TabsTrigger value="crm" className="flex items-center gap-2">
            <Plug className="h-4 w-4" />
            CRM
          </TabsTrigger>
          <TabsTrigger value="mapeamento" className="flex items-center gap-2">
            <Link className="h-4 w-4" />
            Mapeamento
          </TabsTrigger>
          <TabsTrigger value="omnichannel" className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            Omni Channel
          </TabsTrigger>
          <TabsTrigger value="chatbot" className="flex items-center gap-2">
            <Bot className="h-4 w-4" />
            Chatbot
          </TabsTrigger>
          <TabsTrigger value="pagamentos" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Pagamentos
          </TabsTrigger>
          <TabsTrigger value="ia" className="flex items-center gap-2">
            <Bot className="h-4 w-4" />
            IA
          </TabsTrigger>
        </TabsList>

        <TabsContent value="instancias"><InstancesTab /></TabsContent>
        <TabsContent value="crm"><CRMTab /></TabsContent>
        <TabsContent value="mapeamento"><MapeamentoTab /></TabsContent>
        <TabsContent value="omnichannel"><OmniChannelTab /></TabsContent>
        <TabsContent value="chatbot"><ChatbotTab /></TabsContent>
        <TabsContent value="pagamentos"><PagamentosTab /></TabsContent>
        <TabsContent value="ia"><IATab /></TabsContent>
      </Tabs>
    </div>
  );
}
