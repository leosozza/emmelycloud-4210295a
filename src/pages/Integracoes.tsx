import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
} from "lucide-react";
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
  const [testingStripe, setTestingStripe] = useState(false);
  const [testingAsaas, setTestingAsaas] = useState(false);
  const [stripeResult, setStripeResult] = useState<{ ok: boolean; message?: string; error?: string } | null>(null);
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
    // Load recent transactions
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

  const stripeConfigured = credentials["stripe::STRIPE_SECRET_KEY"]?.has_value;
  const asaasConfigured = credentials["asaas::ASAAS_API_KEY"]?.has_value;

  const handleTestStripe = async () => {
    setTestingStripe(true);
    setStripeResult(null);
    try {
      // Test Stripe by fetching account info
      const { data, error } = await supabase.functions.invoke("payment-create", {
        body: { amount: 0.01, currency: "EUR", payment_method: "card", customer_data: { country: "Portugal", email: "test@test.com" }, description: "Teste de conexão" },
      });
      if (error || data?.error) {
        setStripeResult({ ok: false, error: data?.error || "Erro ao contactar Stripe" });
      } else {
        setStripeResult({ ok: true, message: "Conexão Stripe válida! Transação de teste criada." });
      }
    } catch {
      setStripeResult({ ok: false, error: "Erro de rede" });
    }
    setTestingStripe(false);
  };

  const handleTestAsaas = async () => {
    setTestingAsaas(true);
    setAsaasResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("payment-create", {
        body: { amount: 0.01, currency: "BRL", payment_method: "pix", customer_data: { country: "Brasil", name: "Teste", cpf_cnpj: "00000000000" }, description: "Teste de conexão" },
      });
      if (error || data?.error) {
        setAsaasResult({ ok: false, error: data?.error || "Erro ao contactar Asaas" });
      } else {
        setAsaasResult({ ok: true, message: "Conexão Asaas válida! Transação de teste criada." });
      }
    } catch {
      setAsaasResult({ ok: false, error: "Erro de rede" });
    }
    setTestingAsaas(false);
  };

  const totalStripe = transactions.filter(t => t.gateway === "stripe" && (t.status === "confirmed" || t.status === "received")).reduce((s, t) => s + Number(t.amount), 0);
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
    <div className="grid gap-4 md:grid-cols-2">
      {/* Stripe Card */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100">
              <CreditCard className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <CardTitle className="text-base">Stripe</CardTitle>
              <CardDescription>Portugal / Europa (EUR)</CardDescription>
            </div>
          </div>
          <StatusBadge status={stripeConfigured ? "active" : "inactive"} />
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <CredentialInput provider="stripe" credentialKey="STRIPE_SECRET_KEY" label="Secret Key (sk_...)" {...credProps} />
          <CredentialInput provider="stripe" credentialKey="STRIPE_WEBHOOK_SECRET" label="Webhook Secret (whsec_...)" {...credProps} />

          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Total processado</span>
            <span className="font-medium text-foreground">€{totalStripe.toFixed(2)}</span>
          </div>

          <Button size="sm" variant="outline" className="w-full" onClick={handleTestStripe} disabled={testingStripe || !stripeConfigured}>
            {testingStripe ? <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Activity className="h-3.5 w-3.5 mr-1.5" />}
            {testingStripe ? "A testar…" : "Testar Conexão"}
          </Button>
          {stripeResult && (
            <div className={`flex items-center gap-2 rounded-md px-3 py-2 ${stripeResult.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
              {stripeResult.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
              <span className="text-xs">{stripeResult.ok ? stripeResult.message : stripeResult.error}</span>
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
              <CardTitle className="text-base">Asaas</CardTitle>
              <CardDescription>Brasil (BRL) — PIX, Boleto, Cartão</CardDescription>
            </div>
          </div>
          <StatusBadge status={asaasConfigured ? "active" : "inactive"} />
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <CredentialInput provider="asaas" credentialKey="ASAAS_API_KEY" label="API Key" {...credProps} />
          <CredentialInput provider="asaas" credentialKey="ASAAS_WEBHOOK_TOKEN" label="Webhook Token" {...credProps} />

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
      <Card className="md:col-span-2">
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

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function IntegracoesPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Central de Integrações" description="Gerencie todas as integrações e conectores do sistema" />

      <Tabs defaultValue="crm" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="crm" className="flex items-center gap-2">
            <Plug className="h-4 w-4" />
            CRM
          </TabsTrigger>
          <TabsTrigger value="omnichannel" className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            Omni Channel
          </TabsTrigger>
          <TabsTrigger value="pagamentos" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Pagamentos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="crm"><CRMTab /></TabsContent>
        <TabsContent value="omnichannel"><OmniChannelTab /></TabsContent>
        <TabsContent value="pagamentos"><PagamentosTab /></TabsContent>
      </Tabs>
    </div>
  );
}
