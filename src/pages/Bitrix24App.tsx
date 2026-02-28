import { useEffect, useState, useCallback, useRef, lazy, Suspense, useMemo } from "react";
import { useBitrix24Theme } from "@/hooks/useBitrix24Theme";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AudioRecordButton } from "@/components/chat/AudioRecordButton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ReactFlow, Controls, Background, MiniMap,
  useNodesState, useEdgesState, addEdge,
  type Connection, type Node, MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import CustomFlowNode from "@/components/flows/CustomFlowNode";
import FlowNodePalette from "@/components/flows/FlowNodePalette";
import NodeConfigPanel from "@/components/flows/NodeConfigPanel";
import { type FlowNodeType, type FlowNodeData, getDefaultData } from "@/components/flows/FlowNodeTypes";
import { useFlowHistory } from "@/hooks/useFlowHistory";
import {
  Loader2, Bot, Send, RotateCcw, Sparkles, RefreshCw,
  FileText, Upload, Trash2, Plus, ArrowLeft, Save,
  Undo2, Redo2, LayoutDashboard, Plug, BookOpen, GitBranch,
  Settings, CreditCard, Zap, CheckCircle, XCircle, Activity,
  Power, ExternalLink, AlertCircle, MessageSquare, BarChart3,
  DollarSign, Clock, AlertTriangle, TrendingUp, Link,
} from "lucide-react";
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend,
} from "recharts";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const customNodeTypes = { custom: CustomFlowNode };

type AppView = "loading" | "dashboard" | "agentes" | "training" | "flows" | "playground" | "chatia" | "pagamentos" | "relatorios" | "mapeamento";

// ==================== MAIN COMPONENT ====================
const Bitrix24App = () => {
  const { isDark } = useBitrix24Theme();
  const [view, setView] = useState<AppView>("loading");
  const [memberId, setMemberId] = useState<string | null>(null);
  const [domain, setDomain] = useState<string | null>(null);
  const [integration, setIntegration] = useState<any | null>(null);
  const [botId, setBotId] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(false);

  useEffect(() => {
    // Get URL params (for testing outside Bitrix24)
    const params = new URLSearchParams(window.location.search);
    const midParam = params.get("member_id");
    const domainParam = params.get("DOMAIN");
    if (domainParam) setDomain(domainParam);

    const script = document.createElement("script");
    script.src = "https://api.bitrix24.com/api/v1/";
    script.onload = () => {
      try {
        if ((window as any).BX24) {
          (window as any).BX24.init(() => {
            (window as any).BX24.fitWindow?.();
            try { (window as any).BX24.installFinish?.(); } catch {}
            const auth = (window as any).BX24.getAuth?.();
            const mid = auth?.member_id || midParam;
            if (mid) {
              setMemberId(mid);
              if (auth?.domain) setDomain(auth.domain);
              fetchData(mid);
            } else {
              setView("dashboard");
            }
          });
        } else {
          const mid = midParam || domainParam;
          if (mid) { setMemberId(mid); fetchData(mid); }
          else setView("dashboard");
        }
      } catch {
        setView("dashboard");
      }
    };
    script.onerror = () => {
      const mid = midParam || domainParam;
      if (mid) { setMemberId(mid); fetchData(mid); }
      else setView("dashboard");
    };
    document.head.appendChild(script);
    return () => { try { document.head.removeChild(script); } catch {} };
  }, []);

  const fetchData = useCallback(async (mid: string) => {
    setLoadingData(true);
    try {
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/bitrix24-connector-settings?member_id=${encodeURIComponent(mid)}&format=json`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      if (res.ok) {
        const data = await res.json();
        const int = data.integration || null;
        setIntegration(int);
        // Extract bot_id from config (stored as numeric string)
        const cfg = int?.config || {};
        setBotId(cfg.bot_id ? String(cfg.bot_id) : null);
      }
    } catch (e) {
      console.error("[BITRIX24] Fetch error:", e);
    } finally {
      setLoadingData(false);
      setView("dashboard");
    }
  }, []);

  const handleResync = async () => {
    if (!memberId) return;
    const auth = (window as any).BX24?.getAuth?.();
    if (!auth) return;
    setLoadingData(true);
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/bitrix24-install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auth: {
            access_token: auth.access_token,
            refresh_token: auth.refresh_token,
            member_id: auth.member_id,
            domain: auth.domain,
            expires_in: String(auth.expires || 3600),
          },
          member_id: auth.member_id,
        }),
      });
      await fetchData(memberId);
    } catch (e) {
      console.error("[BITRIX24] Resync error:", e);
    } finally {
      setLoadingData(false);
    }
  };

  const navCategories = [
    {
      label: "Emmely IO",
      items: [
        { id: "chatia", label: "Chat IA", icon: Sparkles },
        { id: "agentes", label: "Persona", icon: Bot },
        { id: "training", label: "Treinamento", icon: BookOpen },
        { id: "playground", label: "Playground", icon: MessageSquare },
      ],
    },
    {
      label: "Emmely CRM",
      items: [
        { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
        { id: "flows", label: "Fluxos", icon: GitBranch },
        { id: "mapeamento", label: "Mapeamento", icon: Link },
      ],
    },
    {
      label: "Emmely Pay",
      items: [
        { id: "pagamentos", label: "Pagamentos", icon: CreditCard },
        { id: "relatorios", label: "Relatórios", icon: BarChart3 },
      ],
    },
  ];

  if (view === "loading") {
    return (
      <div className={cn("min-h-screen bg-background flex items-center justify-center", isDark && "dark")}>
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground text-sm">Carregando Emmely Cloud...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("min-h-screen bg-background flex", isDark && "dark")}>
      {/* ── Sidebar ── */}
      <aside className="w-56 border-r bg-card flex flex-col shrink-0">
        {/* Logo */}
        <div className="p-4 border-b">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center font-extrabold text-primary-foreground text-sm bg-primary">
              E
            </div>
            <div>
              <p className="font-bold text-sm leading-tight">Emmely Cloud</p>
              <p className="text-[10px] text-muted-foreground">for Bitrix24</p>
            </div>
          </div>
          {domain && (
            <Badge variant="secondary" className="mt-2.5 text-[10px] w-full justify-center truncate">
              {domain}
            </Badge>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-0.5">
          {navCategories.map((cat) => (
            <Collapsible key={cat.label} defaultOpen className="mb-1">
              <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-[11px] uppercase tracking-widest font-semibold text-muted-foreground hover:text-foreground transition-colors">
                {cat.label}
                <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 [&[data-state=open]]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-0.5">
                {cat.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setView(item.id as AppView)}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-left",
                      view === item.id
                        ? "bg-primary/10 text-primary font-semibold"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </button>
                ))}
              </CollapsibleContent>
            </Collapsible>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t space-y-2">
          <div className="flex items-center gap-2">
            <div className={cn("w-2 h-2 rounded-full shrink-0", integration ? "bg-green-500" : "bg-red-500")} />
            <span className="text-xs text-muted-foreground truncate">
              {integration ? "Conectado" : "Desconectado"}
            </span>
          </div>
          {botId && (
            <div className="flex items-center gap-2">
              <Bot className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-[10px] text-muted-foreground truncate">Bot ID: {botId}</span>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="flex-1 overflow-auto">
        {view === "dashboard" && (
          <DashboardView
            integration={integration}
            botId={botId}
            domain={domain}
            loading={loadingData}
            onResync={handleResync}
            onRefresh={() => memberId && fetchData(memberId)}
          />
        )}
        {view === "agentes" && <AgentesView botId={botId} integrationId={integration?.id} />}
        {view === "training" && <TrainingView />}
        {view === "flows" && <FlowsView />}
        {view === "playground" && <PlaygroundView />}
        {view === "chatia" && <ChatIABitrixView />}
        {view === "mapeamento" && <MapeamentoView integrationId={integration?.id} />}
        {view === "pagamentos" && <PagamentosView />}
        {view === "relatorios" && <RelatoriosView />}
      </main>
    </div>
  );
};

// ==================== DASHBOARD VIEW ====================
function DashboardView({ integration, botId, domain, loading, onResync, onRefresh }: {
  integration: any;
  botId: string | null;
  domain: string | null;
  loading: boolean;
  onResync: () => void;
  onRefresh: () => void;
}) {
  const [agents, setAgents] = useState<any[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>(integration?.bitrix_agent_id || "");
  const [savingAgent, setSavingAgent] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [rebinding, setRebinding] = useState(false);
  const [rebindResult, setRebindResult] = useState<string | null>(null);
  const [reregisteringBot, setReregisteringBot] = useState(false);
  const [reregisterBotResult, setReregisterBotResult] = useState<string | null>(null);
  const [returnToBotDialogId, setReturnToBotDialogId] = useState("");
  const [returningToBot, setReturningToBot] = useState(false);
  const [returnToBotResult, setReturnToBotResult] = useState<string | null>(null);
  const [openConversations, setOpenConversations] = useState<any[]>([]);

  useEffect(() => {
    fetch(`${SUPABASE_URL}/rest/v1/ai_agents?select=id,name,is_active,is_default&is_active=eq.true&order=name.asc`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    }).then(r => r.json()).then(setAgents).catch(console.error);

    fetch(`${SUPABASE_URL}/rest/v1/bitrix24_debug_logs?select=event_type,direction,created_at,error&order=created_at.desc&limit=10`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    }).then(r => r.json()).then(setLogs).catch(console.error);

    // Load open conversations for "Devolver ao Bot"
    fetch(`${SUPABASE_URL}/rest/v1/conversations?select=id,contact_name,contact_phone,channel,attendance_mode&status=in.(aberta,em_atendimento,aguardando)&order=last_message_at.desc&limit=20`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    }).then(r => r.json()).then(setOpenConversations).catch(console.error);
  }, []);

  useEffect(() => { setSelectedAgent(integration?.bitrix_agent_id || ""); }, [integration?.bitrix_agent_id]);

  const handleSaveAgent = async () => {
    if (!integration?.id) return;
    setSavingAgent(true);
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/bitrix24_integrations?id=eq.${integration.id}`, {
        method: "PATCH",
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ bitrix_agent_id: selectedAgent || null }),
      });
      onRefresh();
    } catch (e) { console.error(e); }
    setSavingAgent(false);
  };

  const handleRebindEvents = async () => {
    setRebinding(true);
    setRebindResult(null);
    try {
      const mid = integration?.member_id;
      const url = mid
        ? `${SUPABASE_URL}/functions/v1/bitrix24-rebind-events?member_id=${encodeURIComponent(mid)}`
        : `${SUPABASE_URL}/functions/v1/bitrix24-rebind-events`;
      const res = await fetch(url, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      });
      const data = await res.json();
      if (data.success) {
        const ok = Object.values(data.results || {}).filter((v) => v === "OK").length;
        const total = Object.keys(data.results || {}).length;
        setRebindResult(`✅ ${ok}/${total} eventos re-registados com sucesso!`);
      } else {
        setRebindResult(`❌ Erro: ${data.error || "Falha desconhecida"}`);
      }
    } catch (e) {
      setRebindResult(`❌ Erro de rede: ${e}`);
    }
    setRebinding(false);
  };

  const handleReturnToBot = async (conversationId?: string) => {
    const targetId = conversationId || returnToBotDialogId.trim();
    if (!targetId) return;
    setReturningToBot(true);
    setReturnToBotResult(null);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/bitrix24-return-to-bot`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        body: JSON.stringify({
          conversation_id: targetId,
          member_id: integration?.member_id,
        }),
      });
      const data = await res.json();
      if (data.success || res.ok) {
        setReturnToBotResult(`✅ Conversa devolvida ao bot com sucesso!`);
        setReturnToBotDialogId("");
        fetch(`${SUPABASE_URL}/rest/v1/conversations?select=id,contact_name,contact_phone,channel,attendance_mode&status=in.(aberta,em_atendimento,aguardando)&order=last_message_at.desc&limit=20`, {
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        }).then(r => r.json()).then(setOpenConversations).catch(console.error);
      } else {
        setReturnToBotResult(`❌ Erro: ${data.error || JSON.stringify(data)}`);
      }
    } catch (e) {
      setReturnToBotResult(`❌ Erro de rede: ${e}`);
    }
    setReturningToBot(false);
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Portal: {domain || integration?.domain || "—"}</p>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              {integration ? (
                <CheckCircle className="h-8 w-8 text-green-500" />
              ) : (
                <XCircle className="h-8 w-8 text-red-500" />
              )}
              <div>
                <p className="text-sm font-semibold">Integração</p>
                <p className="text-xs text-muted-foreground">{integration ? "Conectado" : "Desconectado"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              {botId ? (
                <Bot className="h-8 w-8 text-primary" />
              ) : (
                <Bot className="h-8 w-8 text-muted-foreground" />
              )}
              <div>
                <p className="text-sm font-semibold">Bot IA</p>
                <p className="text-xs text-muted-foreground">{botId ? `ID: ${botId}` : "Não registado"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              {integration?.connector_registered ? (
                <Plug className="h-8 w-8 text-green-500" />
              ) : (
                <Plug className="h-8 w-8 text-muted-foreground" />
              )}
              <div>
                <p className="text-sm font-semibold">Conector</p>
                <p className="text-xs text-muted-foreground">{integration?.connector_registered ? "Registado" : "Não registado"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <Activity className="h-8 w-8 text-primary" />
              <div>
                <p className="text-sm font-semibold">Últimos eventos</p>
                <p className="text-xs text-muted-foreground">{logs.length} registos</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Início Rápido */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Início Rápido</CardTitle>
          <CardDescription>Configure o bot para responder automaticamente</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold", integration ? "bg-green-500 text-white" : "bg-muted-foreground/30 text-muted-foreground")}>1</div>
              <div>
                <p className="text-sm font-medium">Instalar o App</p>
                <p className="text-xs text-muted-foreground">App instalado no Bitrix24 {integration ? "✅" : "⏳"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold", botId ? "bg-green-500 text-white" : "bg-muted-foreground/30 text-muted-foreground")}>2</div>
              <div>
                <p className="text-sm font-medium">Registar Bot IA</p>
                <p className="text-xs text-muted-foreground">Bot Emmely AI {botId ? `registado (ID: ${botId}) ✅` : "não encontrado ❌"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold bg-muted-foreground/30 text-muted-foreground">3</div>
              <div>
                <p className="text-sm font-medium">Configurar Persona</p>
                <p className="text-xs text-muted-foreground">Acesse a aba Personas e selecione um agente IA</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold bg-muted-foreground/30 text-muted-foreground">4</div>
              <div>
                <p className="text-sm font-medium">Vinculação ao Contact Center</p>
                <p className="text-xs text-muted-foreground">No Bitrix24 → Contact Center → Emmely Messages</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Agente do Canal Aberto */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bot className="h-4 w-4" /> Agente do Canal Aberto
          </CardTitle>
          <CardDescription>Selecione qual agente IA responde automaticamente no Open Channel</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select value={selectedAgent} onValueChange={setSelectedAgent}>
            <SelectTrigger>
              <SelectValue placeholder="Selecionar agente..." />
            </SelectTrigger>
            <SelectContent>
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name} {a.is_default ? "(padrão)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={handleSaveAgent}
            disabled={savingAgent || selectedAgent === (integration?.bitrix_agent_id || "")}
            className="w-full"
            size="sm"
          >
            {savingAgent ? <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />Salvando...</> : <><Save className="h-3.5 w-3.5 mr-2" />Salvar Agente</>}
          </Button>
        </CardContent>
      </Card>

      {/* Bot + Events buttons */}
      <div className="space-y-2">
        <Button
          onClick={async () => {
            setReregisteringBot(true);
            setReregisterBotResult(null);
            try {
              const auth = (window as any).BX24?.getAuth?.();
              if (!auth && !integration?.member_id) {
                setReregisterBotResult("❌ Sem sessão BX24 disponível. Abra o app dentro do Bitrix24.");
                return;
              }
              const res = await fetch(`${SUPABASE_URL}/functions/v1/bitrix24-install`, {
                method: "POST",
                headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
                body: JSON.stringify({
                  auth: auth ? {
                    access_token: auth.access_token,
                    refresh_token: auth.refresh_token,
                    member_id: auth.member_id,
                    domain: auth.domain,
                    client_endpoint: auth.client_endpoint,
                    expires_in: String(auth.expires || 3600),
                  } : {
                    member_id: integration?.member_id,
                    access_token: integration?.access_token,
                    refresh_token: integration?.refresh_token,
                    client_endpoint: integration?.client_endpoint,
                    domain: integration?.domain,
                    expires_in: "3600",
                  },
                }),
              });
              const data = await res.json();
              if (data.success || res.ok) {
                setReregisterBotResult("✅ Bot re-registado com EVENT_JOIN_CHAT! Verifique o Contact Center → Chatbot → Emmely AI.");
                if (integration?.member_id) {
                  // reload integration to get new bot_id
                  setTimeout(() => onRefresh(), 1500);
                }
              } else {
                setReregisterBotResult(`❌ Erro: ${data.error || res.status}`);
              }
            } catch (e) {
              setReregisterBotResult(`❌ Erro de rede: ${e}`);
            } finally {
              setReregisteringBot(false);
            }
          }}
          disabled={reregisteringBot}
          className="w-full"
          variant="default"
        >
          {reregisteringBot
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Re-registando Bot...</>
            : <><Bot className="h-4 w-4 mr-2" />Re-registar Bot (EVENT_JOIN_CHAT)</>}
        </Button>
        {reregisterBotResult && (
          <p className="text-xs text-center text-muted-foreground">{reregisterBotResult}</p>
        )}

        <Button onClick={handleRebindEvents} disabled={rebinding} className="w-full" variant="outline">
          {rebinding ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Registando webhooks...</> : <><Zap className="h-4 w-4 mr-2" />Re-registar Webhooks de Eventos</>}
        </Button>
        {rebindResult && (
          <p className="text-xs text-center text-muted-foreground">{rebindResult}</p>
        )}
        <Button onClick={onResync} disabled={loading} className="w-full" variant="outline">
          {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sincronizando...</> : <><RefreshCw className="h-4 w-4 mr-2" />Re-sincronizar Conector</>}
        </Button>
      </div>

      {/* Logs */}
      {logs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Últimos Eventos</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-48">
              <div className="space-y-1">
                {logs.map((log, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0 text-xs">
                    <div className="flex items-center gap-2">
                      <span>{log.direction === "inbound" ? "📥" : "📤"}</span>
                      <span className="font-medium">{log.event_type}</span>
                      {log.error && <span className="text-destructive text-[10px]">⚠️</span>}
                    </div>
                    <span className="text-muted-foreground">{new Date(log.created_at).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* ── Devolver ao Bot ── */}
      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" /> Devolver ao Bot
          </CardTitle>
          <CardDescription>Devolva manualmente uma conversa ao controlo do bot IA</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Open conversations list */}
          {openConversations.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Conversas abertas ({openConversations.length})</p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {openConversations.map((conv) => (
                  <div key={conv.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className={cn(
                        "w-2 h-2 rounded-full shrink-0",
                        conv.attendance_mode === "bot" ? "bg-green-500" : "bg-yellow-500"
                      )} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{conv.contact_name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {conv.channel} • {conv.attendance_mode === "bot" ? "Bot ativo" : "Humano/Aguardando"}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs shrink-0"
                      disabled={returningToBot || conv.attendance_mode === "bot"}
                      onClick={() => handleReturnToBot(conv.id)}
                    >
                      {conv.attendance_mode === "bot" ? "✅ Bot" : <><Bot className="h-3 w-3 mr-1" />Devolver</>}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Manual ID input */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Ou inserir ID manualmente</p>
            <div className="flex gap-2">
              <Input
                value={returnToBotDialogId}
                onChange={(e) => setReturnToBotDialogId(e.target.value)}
                placeholder="ID da conversa..."
                className="text-xs h-9 flex-1"
              />
              <Button
                size="sm"
                className="h-9 shrink-0"
                onClick={() => handleReturnToBot()}
                disabled={returningToBot || !returnToBotDialogId.trim()}
              >
                {returningToBot ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Bot className="h-3.5 w-3.5 mr-1.5" />Devolver</>}
              </Button>
            </div>
          </div>
          {returnToBotResult && (
            <p className="text-xs text-center text-muted-foreground">{returnToBotResult}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ==================== AGENTES / PERSONAS VIEW ====================
function AgentesView({ botId, integrationId }: { botId: string | null; integrationId?: string }) {
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({
    name: "", system_prompt: "", ai_model: "google/gemini-3-flash-preview",
    temperature: 0.7, welcome_message: "", fallback_message: "Desculpe, não consegui processar a sua mensagem."
  });
  const [saving, setSaving] = useState(false);
  const [republishing, setRepublishing] = useState<string | null>(null);

  const fetchAgents = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/ai_agents?select=*&order=created_at.desc`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      });
      if (res.ok) setAgents(await res.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchAgents(); }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = {
        name: form.name, system_prompt: form.system_prompt, ai_model: form.ai_model,
        temperature: form.temperature, welcome_message: form.welcome_message,
        fallback_message: form.fallback_message, ai_provider: "lovable", agent_type: "text"
      };
      const url = editing?.id ? `${SUPABASE_URL}/rest/v1/ai_agents?id=eq.${editing.id}` : `${SUPABASE_URL}/rest/v1/ai_agents`;
      await fetch(url, {
        method: editing?.id ? "PATCH" : "POST",
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify(body),
      });
      setEditing(null);
      fetchAgents();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleSetDefault = async (id: string) => {
    await fetch(`${SUPABASE_URL}/rest/v1/ai_agents?is_default=eq.true`, {
      method: "PATCH",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ is_default: false }),
    });
    await fetch(`${SUPABASE_URL}/rest/v1/ai_agents?id=eq.${id}`, {
      method: "PATCH",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ is_default: true }),
    });
    fetchAgents();
  };

  const handleRepublish = async (id: string) => {
    setRepublishing(id);
    // Link this agent as the active bot agent in the integration
    if (integrationId) {
      await fetch(`${SUPABASE_URL}/rest/v1/bitrix24_integrations?id=eq.${integrationId}`, {
        method: "PATCH",
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ bitrix_agent_id: id }),
      });
    }
    await handleSetDefault(id);
    setRepublishing(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remover esta persona?")) return;
    await fetch(`${SUPABASE_URL}/rest/v1/ai_agents?id=eq.${id}`, {
      method: "DELETE",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    fetchAgents();
  };

  const startEdit = (agent: any) => {
    setEditing(agent);
    setForm({
      name: agent.name || "", system_prompt: agent.system_prompt || "",
      ai_model: agent.ai_model || "google/gemini-3-flash-preview",
      temperature: agent.temperature || 0.7, welcome_message: agent.welcome_message || "",
      fallback_message: agent.fallback_message || ""
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Personas</h1>
          <p className="text-muted-foreground text-sm">Configure a personalidade do seu bot</p>
        </div>
        <Button onClick={() => { setEditing({}); setForm({ name: "", system_prompt: "", ai_model: "google/gemini-3-flash-preview", temperature: 0.7, welcome_message: "", fallback_message: "Desculpe, não consegui processar a sua mensagem." }); }}>
          <Plus className="h-4 w-4 mr-2" /> Nova Persona
        </Button>
      </div>

      {editing && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{editing.id ? "✏️ Editar Persona" : "✨ Nova Persona"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Nome da Persona</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Emmely AI" className="mt-1" />
            </div>
            <div>
              <Label>Prompt do Sistema</Label>
              <Textarea
                value={form.system_prompt}
                onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
                rows={4}
                placeholder="Você é uma assistente virtual..."
                className="mt-1"
              />
            </div>
            <div>
              <Label>Mensagem de Boas-vindas</Label>
              <Textarea value={form.welcome_message} onChange={(e) => setForm({ ...form, welcome_message: e.target.value })} rows={2} className="mt-1" placeholder="Olá! Como posso ajudar?" />
            </div>
            <div>
              <Label>Modelo IA</Label>
              <Select value={form.ai_model} onValueChange={(v) => setForm({ ...form, ai_model: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="google/gemini-3-flash-preview">Gemini Flash (rápido)</SelectItem>
                  <SelectItem value="google/gemini-2.5-flash">Gemini 2.5 Flash</SelectItem>
                  <SelectItem value="google/gemini-2.5-pro">Gemini 2.5 Pro</SelectItem>
                  <SelectItem value="openai/gpt-5-mini">GPT-5 Mini</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={saving} className="flex-1">
                {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</> : <><Save className="h-4 w-4 mr-2" />Salvar</>}
              </Button>
              <Button variant="outline" onClick={() => setEditing(null)} className="flex-1">Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : agents.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Bot className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>Nenhuma persona criada</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {agents.map((agent) => (
            <Card key={agent.id} className={cn("transition-all", agent.is_default && "border-primary/50 shadow-sm")}>
              <CardContent className="pt-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Bot className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-base">{agent.name}</p>
                        {agent.is_default && botId && (
                          <Badge className="text-[10px] bg-green-500/10 text-green-700 border-green-200 dark:text-green-400 dark:border-green-800">
                            Bot Ativo
                          </Badge>
                        )}
                        {agent.is_default && !botId && (
                          <Badge variant="secondary" className="text-[10px]">Padrão</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5 truncate">{agent.description || "Sem descrição"}</p>
                      <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                        <span>{agent.ai_model?.split("/")[1] || agent.ai_model}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant={agent.is_default ? "default" : "outline"}
                      className="h-8 text-xs"
                      onClick={() => handleRepublish(agent.id)}
                      disabled={republishing === agent.id}
                    >
                      {republishing === agent.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Power className="h-3 w-3 mr-1.5" />Republicar</>}
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => startEdit(agent)}>
                      Editar
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive hover:text-destructive" onClick={() => handleDelete(agent.id)}>
                      <Trash2 className="h-3 w-3 mr-1.5" />Remover
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== TRAINING VIEW ====================
function TrainingView() {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");

  const fetchDocs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/knowledge_documents?select=*&order=created_at.desc`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      });
      if (res.ok) setDocs(await res.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchDocs(); }, []);

  const handleUpload = async () => {
    if (!title.trim() || !text.trim()) return;
    setUploading(true);
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/knowledge_documents`, {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ title, content: text, source_type: "text", status: "ready" }),
      });
      setTitle("");
      setText("");
      fetchDocs();
    } catch (e) { console.error(e); }
    setUploading(false);
  };

  const handleDelete = async (id: string) => {
    await fetch(`${SUPABASE_URL}/rest/v1/knowledge_documents?id=eq.${id}`, {
      method: "DELETE",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    fetchDocs();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Treinamento do Bot</h1>
          <p className="text-muted-foreground text-sm">Adicione conhecimento para o seu bot</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" /> Novo Documento
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Título</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nome do documento..." className="mt-1" />
          </div>
          <div>
            <Label>Conteúdo</Label>
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="Cole o texto aqui..." className="mt-1" />
          </div>
          <Button onClick={handleUpload} disabled={uploading || !title.trim() || !text.trim()} className="w-full">
            {uploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</> : <><Upload className="h-4 w-4 mr-2" />Adicionar Documento</>}
          </Button>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-lg font-semibold mb-3">Base de Conhecimento</h2>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : docs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>Nenhum documento adicionado</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {docs.map((d) => (
              <Card key={d.id}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <FileText className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{d.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {d.source_type} • {d.chunks_count || 0} chunks
                        </p>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive shrink-0" onClick={() => handleDelete(d.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== FLOWS VIEW ====================
function FlowsView() {
  const [flows, setFlows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFlow, setSelectedFlow] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newFlowForm, setNewFlowForm] = useState({
    name: "",
    description: "",
    trigger_type: "keyword",
    keywords: "",
    flow_type: "sequential",
    priority: "0",
  });

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const { pushState, undo, redo, canUndo, canRedo } = useFlowHistory(nodes, edges, setNodes as any, setEdges as any);
  const selectedNodeData = selectedNodeId ? (nodes.find(n => n.id === selectedNodeId)?.data as unknown as FlowNodeData | null) : null;

  const fetchFlows = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/flows?select=*&order=created_at.desc`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      });
      if (res.ok) setFlows(await res.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchFlows(); }, []);

  const handleCreateFlow = async () => {
    if (!newFlowForm.name.trim()) return;
    setCreating(true);
    try {
      const keywords = newFlowForm.trigger_type === "keyword" && newFlowForm.keywords.trim()
        ? newFlowForm.keywords.split(",").map((k) => k.trim()).filter(Boolean)
        : [];
      const body = {
        name: newFlowForm.name.trim(),
        description: newFlowForm.description.trim() || null,
        trigger_type: newFlowForm.trigger_type,
        flow_type: newFlowForm.flow_type,
        keywords,
        priority: parseInt(newFlowForm.priority) || 0,
        is_active: false,
        nodes: [],
        edges: [],
      };
      const res = await fetch(`${SUPABASE_URL}/rest/v1/flows`, {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const [created] = await res.json();
        setShowCreateForm(false);
        setNewFlowForm({ name: "", description: "", trigger_type: "keyword", keywords: "", flow_type: "sequential", priority: "0" });
        await fetchFlows();
        if (created) openFlow(created);
      }
    } catch (e) { console.error(e); }
    setCreating(false);
  };

  const handleDeleteFlow = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Remover este fluxo?")) return;
    await fetch(`${SUPABASE_URL}/rest/v1/flows?id=eq.${id}`, {
      method: "DELETE",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    fetchFlows();
  };

  const toggleActive = async (id: string, current: boolean) => {
    await fetch(`${SUPABASE_URL}/rest/v1/flows?id=eq.${id}`, {
      method: "PATCH",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ is_active: !current }),
    });
    fetchFlows();
  };

  const openFlow = (flow: any) => {
    setSelectedFlow(flow);
    const convertedNodes = (flow.nodes || []).map((n: any) => ({
      ...n, type: n.type === "default" ? "custom" : (n.type || "custom"),
      data: n.data?.nodeType ? n.data : { nodeType: n.data?.nodeType || "message", ...n.data },
    }));
    setNodes(convertedNodes);
    setEdges(flow.edges || []);
    setSelectedNodeId(null);
    setTimeout(pushState, 50);
  };

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge({ ...params, markerEnd: { type: MarkerType.ArrowClosed } }, eds));
    setTimeout(pushState, 0);
  }, [setEdges, pushState]);

  const addNode = useCallback((type: FlowNodeType, position?: { x: number; y: number }) => {
    const id = `node_${Date.now()}`;
    const newNode: Node = { id, type: "custom", position: position || { x: 250, y: (nodes.length + 1) * 120 }, data: getDefaultData(type) as any };
    setNodes((nds) => [...nds, newNode]);
    setTimeout(pushState, 0);
  }, [nodes.length, setNodes, pushState]);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const type = event.dataTransfer.getData("application/reactflow-type") as FlowNodeType;
    if (!type) return;
    const bounds = (event.target as HTMLElement).closest(".react-flow")?.getBoundingClientRect();
    if (!bounds) return;
    addNode(type, { x: event.clientX - bounds.left, y: event.clientY - bounds.top });
  }, [addNode]);

  const onDragOver = useCallback((event: React.DragEvent) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }, []);
  const onNodeClick = useCallback((_: any, node: Node) => setSelectedNodeId(node.id), []);
  const onPaneClick = useCallback(() => setSelectedNodeId(null), []);

  const handleNodeDataChange = useCallback((newData: FlowNodeData) => {
    if (!selectedNodeId) return;
    setNodes((nds) => nds.map((n) => n.id === selectedNodeId ? { ...n, data: newData as any } : n));
    setTimeout(pushState, 100);
  }, [selectedNodeId, setNodes, pushState]);

  const handleDeleteNode = useCallback(() => {
    if (!selectedNodeId) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
    setSelectedNodeId(null);
    setTimeout(pushState, 0);
  }, [selectedNodeId, setNodes, setEdges, pushState]);

  const handleSaveFlow = async () => {
    if (!selectedFlow) return;
    setSaving(true);
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/flows?id=eq.${selectedFlow.id}`, {
        method: "PATCH",
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ nodes, edges }),
      });
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  if (selectedFlow) {
    return (
      <div className="flex flex-col h-screen">
        <div className="flex items-center justify-between p-3 border-b bg-card shrink-0">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setSelectedFlow(null); setSelectedNodeId(null); fetchFlows(); }}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h3 className="text-sm font-semibold">{selectedFlow.name}</h3>
              <p className="text-xs text-muted-foreground">{selectedFlow.description || "Sem descrição"}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={undo} disabled={!canUndo}><Undo2 className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={redo} disabled={!canRedo}><Redo2 className="h-3.5 w-3.5" /></Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleSaveFlow} disabled={saving}>
              <Save className="h-3.5 w-3.5 mr-1" />{saving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
        <div className="flex-1 flex relative">
          <FlowNodePalette collapsed={false} onToggleCollapse={() => {}} onAddNode={(type) => addNode(type)} />
          <div className="flex-1">
            <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
              onConnect={onConnect} onDrop={onDrop} onDragOver={onDragOver} onNodeClick={onNodeClick}
              onPaneClick={onPaneClick} nodeTypes={customNodeTypes} fitView>
              <Controls /><Background /><MiniMap className="!bottom-2 !right-2" style={{ height: 80, width: 120 }} />
            </ReactFlow>
          </div>
          {selectedNodeData && (
            <NodeConfigPanel data={selectedNodeData} onChange={handleNodeDataChange} onDelete={handleDeleteNode} onClose={() => setSelectedNodeId(null)} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Fluxos de Automação</h1>
          <p className="text-muted-foreground text-sm">Configure automações integradas ao Bitrix24</p>
        </div>
        <Button onClick={() => setShowCreateForm(!showCreateForm)} variant={showCreateForm ? "secondary" : "default"}>
          {showCreateForm ? "✕ Cancelar" : <><Plus className="h-4 w-4 mr-2" />Novo Fluxo</>}
        </Button>
      </div>

      {/* Create Flow Form */}
      {showCreateForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <GitBranch className="h-4 w-4" /> Novo Fluxo
            </CardTitle>
            <CardDescription>Configure o fluxo e depois edite os nós no editor visual</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Nome do Fluxo *</Label>
              <Input
                value={newFlowForm.name}
                onChange={(e) => setNewFlowForm({ ...newFlowForm, name: e.target.value })}
                placeholder="Ex: Atendimento Inicial"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Descrição</Label>
              <Input
                value={newFlowForm.description}
                onChange={(e) => setNewFlowForm({ ...newFlowForm, description: e.target.value })}
                placeholder="Breve descrição do fluxo..."
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tipo de Gatilho</Label>
                <Select value={newFlowForm.trigger_type} onValueChange={(v) => setNewFlowForm({ ...newFlowForm, trigger_type: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="keyword">Palavra-chave</SelectItem>
                    <SelectItem value="all_messages">Todas as mensagens</SelectItem>
                    <SelectItem value="default_flow">Fluxo padrão</SelectItem>
                    <SelectItem value="intent">Intenção IA</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tipo de Fluxo</Label>
                <Select value={newFlowForm.flow_type} onValueChange={(v) => setNewFlowForm({ ...newFlowForm, flow_type: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sequential">Sequencial</SelectItem>
                    <SelectItem value="ai_agent">Agente IA</SelectItem>
                    <SelectItem value="hybrid">Híbrido</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {newFlowForm.trigger_type === "keyword" && (
              <div>
                <Label>Palavras-chave (separadas por vírgula)</Label>
                <Input
                  value={newFlowForm.keywords}
                  onChange={(e) => setNewFlowForm({ ...newFlowForm, keywords: e.target.value })}
                  placeholder="Ex: oi, olá, menu, ajuda"
                  className="mt-1"
                />
              </div>
            )}
            <div>
              <Label>Prioridade (maior = primeiro)</Label>
              <Input
                type="number"
                value={newFlowForm.priority}
                onChange={(e) => setNewFlowForm({ ...newFlowForm, priority: e.target.value })}
                placeholder="0"
                className="mt-1"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleCreateFlow} disabled={creating || !newFlowForm.name.trim()} className="flex-1">
                {creating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Criando...</> : <><GitBranch className="h-4 w-4 mr-2" />Criar e Editar Fluxo</>}
              </Button>
              <Button variant="outline" onClick={() => setShowCreateForm(false)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : flows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <GitBranch className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-sm mb-3">Nenhum fluxo criado</p>
            <Button size="sm" onClick={() => setShowCreateForm(true)}>
              <Plus className="h-4 w-4 mr-2" />Criar primeiro fluxo
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {flows.map((f) => (
            <Card key={f.id} className="cursor-pointer hover:shadow-sm transition-shadow" onClick={() => openFlow(f)}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <GitBranch className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{f.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{f.description || "Sem descrição"}</p>
                      <div className="flex gap-1.5 mt-1 flex-wrap">
                        <Badge variant="outline" className="text-[10px]">{f.trigger_type}</Badge>
                        <Badge variant="outline" className="text-[10px]">{f.flow_type}</Badge>
                        {f.keywords?.length > 0 && (
                          <Badge variant="secondary" className="text-[10px]">{f.keywords.slice(0, 2).join(", ")}{f.keywords.length > 2 ? "..." : ""}</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <Button
                      variant={f.is_active ? "default" : "secondary"}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={(e) => { e.stopPropagation(); toggleActive(f.id, f.is_active); }}
                    >
                      {f.is_active ? "✅ Ativo" : "❌ Inativo"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-destructive hover:text-destructive"
                      onClick={(e) => handleDeleteFlow(f.id, e)}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />Remover
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== CHAT IA BITRIX VIEW ====================
function ChatIABitrixView() {
  const [agents, setAgents] = useState<any[]>([]);
  const [selectedAgent, setSelectedAgent] = useState("");
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [sessions, setSessions] = useState<Array<{ id: string; title: string; messages: any[] }>>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${SUPABASE_URL}/rest/v1/ai_agents?select=id,name,is_default,is_active,welcome_message&is_active=eq.true&order=is_default.desc`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    }).then(r => r.json()).then(data => {
      setAgents(data || []);
      if (data?.length > 0) setSelectedAgent(data[0].id);
    }).catch(console.error);

    // Load from localStorage
    const saved = localStorage.getItem("chatia_sessions");
    if (saved) {
      try { setSessions(JSON.parse(saved)); } catch {}
    }
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const saveSessions = (updated: typeof sessions) => {
    setSessions(updated);
    localStorage.setItem("chatia_sessions", JSON.stringify(updated));
  };

  const currentAgent = agents.find((a: any) => a.id === selectedAgent);

  const selectSession = (id: string) => {
    const s = sessions.find(x => x.id === id);
    if (s) { setActiveSessionId(id); setMessages(s.messages); }
  };

  const newSession = () => { setActiveSessionId(null); setMessages([]); };

  const deleteSession = (id: string) => {
    const updated = sessions.filter(s => s.id !== id);
    saveSessions(updated);
    if (activeSessionId === id) { setActiveSessionId(null); setMessages([]); }
  };

  const sendMessage = async () => {
    if (!input.trim() || !selectedAgent || loading) return;
    const userMsg = { role: "user", content: input };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-playground`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_KEY}` },
        body: JSON.stringify({ agent_id: selectedAgent, messages: newMessages }),
      });
      const data = await res.json();
      const allMsgs = [...newMessages, { role: "assistant", content: data.content || "Erro ao processar." }];
      setMessages(allMsgs);

      // Persist to localStorage
      if (activeSessionId) {
        const updated = sessions.map(s => s.id === activeSessionId ? { ...s, messages: allMsgs } : s);
        saveSessions(updated);
      } else {
        const newId = crypto.randomUUID();
        const title = input.trim().substring(0, 50);
        const newSession = { id: newId, title, messages: allMsgs };
        saveSessions([newSession, ...sessions]);
        setActiveSessionId(newId);
      }
    } catch {
      setMessages([...newMessages, { role: "assistant", content: "Erro de conexão." }]);
    }
    setLoading(false);
  };

  // Simple markdown render for Bitrix view
  const renderMd = (text: string) => {
    let html = text
      .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="bg-muted rounded p-2 text-xs overflow-x-auto my-1"><code>$2</code></pre>')
      .replace(/`([^`]+)`/g, '<code class="bg-muted px-1 rounded text-xs">$1</code>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/\n/g, '<br>');
    return html;
  };

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className="w-56 border-r bg-card flex flex-col shrink-0">
        <div className="p-3 border-b space-y-2">
          <Button onClick={newSession} size="sm" className="w-full">
            <Plus className="h-3.5 w-3.5 mr-1" /> Nova conversa
          </Button>
          <Select value={selectedAgent} onValueChange={(v) => { setSelectedAgent(v); newSession(); }}>
            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Agente" /></SelectTrigger>
            <SelectContent>
              {agents.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-1.5 space-y-0.5">
            {sessions.map(s => (
              <div
                key={s.id}
                onClick={() => selectSession(s.id)}
                className={cn(
                  "group flex items-center gap-1.5 px-2 py-1.5 rounded text-xs cursor-pointer transition-colors",
                  s.id === activeSessionId ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted"
                )}
              >
                <MessageSquare className="h-3 w-3 shrink-0" />
                <span className="truncate flex-1">{s.title}</span>
                <button onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }} className="opacity-0 group-hover:opacity-100 p-0.5">
                  <Trash2 className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Chat */}
      <div className="flex-1 flex flex-col">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-center text-muted-foreground">
              <div>
                <Sparkles className="h-10 w-10 mx-auto mb-3 opacity-20" />
                {currentAgent?.welcome_message ? (
                  <div className="text-sm" dangerouslySetInnerHTML={{ __html: renderMd(currentAgent.welcome_message) }} />
                ) : (
                  <p className="text-sm">Envie uma mensagem para conversar com o agente</p>
                )}
              </div>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto space-y-4">
              {messages.map((m, i) => (
                <div key={i} className={cn("flex gap-2", m.role === "user" ? "justify-end" : "")}>
                  {m.role === "assistant" && (
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Sparkles className="h-3 w-3 text-primary" />
                    </div>
                  )}
                  <div className={cn(
                    "max-w-[80%] text-sm",
                    m.role === "user" ? "bg-primary text-primary-foreground rounded-2xl rounded-br-md px-3 py-2" : ""
                  )}>
                    {m.role === "assistant" ? (
                      <div dangerouslySetInnerHTML={{ __html: renderMd(m.content) }} />
                    ) : (
                      <p className="whitespace-pre-wrap">{m.content}</p>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex gap-2">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Sparkles className="h-3 w-3 text-primary" />
                  </div>
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
          )}
        </div>
        <div className="border-t p-3">
          <div className="max-w-2xl mx-auto flex gap-2">
            <Input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMessage()} placeholder="Escreva uma mensagem..." disabled={loading} className="flex-1" />
            <AudioRecordButton
              onTranscript={(text) => setInput((prev) => (prev ? prev + " " : "") + text)}
              disabled={loading}
              preferNative
              lang="pt-PT"
              fetchTokenUrl={`${SUPABASE_URL}/functions/v1/elevenlabs-scribe-token`}
              fetchHeaders={{ Authorization: `Bearer ${SUPABASE_KEY}` }}
            />
            <Button size="icon" onClick={sendMessage} disabled={!input.trim() || loading}><Send className="h-4 w-4" /></Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== PLAYGROUND VIEW ====================
function PlaygroundView() {
  const [agents, setAgents] = useState<any[]>([]);
  const [selectedAgent, setSelectedAgent] = useState("");
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${SUPABASE_URL}/rest/v1/ai_agents?select=id,name,is_default,is_active&is_active=eq.true&order=is_default.desc`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    }).then(r => r.json()).then(data => {
      setAgents(data || []);
      if (data?.length > 0) setSelectedAgent(data[0].id);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || !selectedAgent || loading) return;
    const userMsg = { role: "user", content: input };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-playground`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_KEY}` },
        body: JSON.stringify({ agent_id: selectedAgent, messages: newMessages }),
      });
      const data = await res.json();
      setMessages([...newMessages, { role: "assistant", content: data.content || data.error || "Erro ao processar." }]);
    } catch {
      setMessages([...newMessages, { role: "assistant", content: "Erro de conexão." }]);
    }
    setLoading(false);
  };

  return (
    <div className="p-6 flex flex-col h-screen">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Playground</h1>
        <p className="text-muted-foreground text-sm">Teste o seu agente IA em tempo real</p>
      </div>

      <div className="mb-4">
        <Label className="text-sm">Agente</Label>
        <Select value={selectedAgent} onValueChange={(v) => { setSelectedAgent(v); setMessages([]); }}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="Selecionar agente" /></SelectTrigger>
          <SelectContent>
            {agents.map(a => <SelectItem key={a.id} value={a.id}>{a.name} {a.is_default ? "⭐" : ""}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-muted-foreground">
                <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Envie uma mensagem para testar o agente...</p>
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
                m.role === "user" ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted text-foreground rounded-bl-md"
              )}>
                <p className="whitespace-pre-wrap">{m.content}</p>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
        </div>
        <div className="border-t p-3">
          <div className="flex gap-2">
            <Input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMessage()} placeholder="Digite uma mensagem..." disabled={loading} className="flex-1" />
            <Button size="icon" onClick={sendMessage} disabled={!input.trim() || loading}><Send className="h-4 w-4" /></Button>
            {messages.length > 0 && (
              <Button variant="ghost" size="icon" onClick={() => setMessages([])}><RotateCcw className="h-4 w-4" /></Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

// ==================== PAGAMENTOS VIEW ====================
function PagamentosView() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    amount: "", currency: "EUR", payment_method: "card",
    customer_name: "", customer_email: "", description: ""
  });

  useEffect(() => { fetchTransactions(); }, []);

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/payment-status?list=true`, {
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) { const data = await res.json(); setTransactions(data.transactions || []); }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!form.amount || Number(form.amount) <= 0) return;
    setCreating(true);
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/payment-create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(form.amount), currency: form.currency, payment_method: form.payment_method,
          description: form.description || "Cobrança Emmely Cloud",
          customer_data: { name: form.customer_name, email: form.customer_email },
        }),
      });
      setShowForm(false);
      setForm({ amount: "", currency: "EUR", payment_method: "card", customer_name: "", customer_email: "", description: "" });
      fetchTransactions();
    } catch (e) { console.error(e); }
    setCreating(false);
  };

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    confirmed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    received: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pagamentos</h1>
          <p className="text-muted-foreground text-sm">Gerir cobranças e transações</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} variant={showForm ? "secondary" : "default"}>
          {showForm ? "✕ Cancelar" : <><Plus className="h-4 w-4 mr-2" />Nova Cobrança</>}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader><CardTitle className="text-base">💳 Nova Cobrança</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Nome</Label><Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} className="mt-1" /></div>
              <div><Label>Email</Label><Input value={form.customer_email} onChange={(e) => setForm({ ...form, customer_email: e.target.value })} className="mt-1" /></div>
              <div><Label>Valor</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="mt-1" /></div>
              <div>
                <Label>Moeda</Label>
                <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v, payment_method: v === "BRL" ? "pix" : "card" })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EUR">🇪🇺 EUR</SelectItem>
                    <SelectItem value="BRL">🇧🇷 BRL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Descrição</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1" placeholder="Ex: Honorários advocatícios" /></div>
            <Button onClick={handleCreate} disabled={creating || !form.amount} className="w-full">
              {creating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Criando...</> : "Criar Cobrança"}
            </Button>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="text-lg font-semibold mb-3">Transações Recentes</h2>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : transactions.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>Nenhuma transação encontrada</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {transactions.map((t) => (
              <Card key={t.id}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-sm">{t.metadata?.customer_name || "Cliente"}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(t.created_at).toLocaleDateString()} • {t.gateway}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{t.currency} {Number(t.amount).toFixed(2)}</p>
                      <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", statusColors[t.status] || "bg-muted text-muted-foreground")}>
                        {t.status}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== RELATÓRIOS VIEW ====================
const COLORS_STATUS = { confirmed: "#589731", pending: "#c49c00", overdue: "#df532d" };
const COLORS_CHART = ["#2fc6f6", "#589731", "#c49c00", "#df532d", "#8b5cf6"];

type PeriodKey = "7d" | "30d" | "90d" | "year" | "all";
const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "90d", label: "90 dias" },
  { key: "year", label: "Ano" },
  { key: "all", label: "Todos" },
];

function RelatoriosView() {
  const { isDark } = useBitrix24Theme();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [gatewayFilter, setGatewayFilter] = useState<string>("all");
  const [clientFilter, setClientFilter] = useState<string>("all");

  useEffect(() => {
    setLoading(true);
    fetch(
      `${SUPABASE_URL}/rest/v1/payment_transactions?select=*,clients(name)&order=created_at.desc&limit=1000`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    )
      .then((r) => r.json())
      .then((data) => setTransactions(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Unique gateways and clients for filters
  const gateways = Array.from(new Set(transactions.map((t) => t.gateway).filter(Boolean))).sort();
  const clients = Array.from(new Set(transactions.map((t) => t.clients?.name).filter(Boolean))).sort() as string[];

  // Filter by period, gateway, client
  const filtered = (() => {
    let data = transactions;
    if (period !== "all") {
      const now = new Date();
      const ms: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90, year: 365 };
      const cutoff = new Date(now.getTime() - (ms[period] || 30) * 86400000);
      data = data.filter((t) => new Date(t.created_at) >= cutoff);
    }
    if (gatewayFilter !== "all") data = data.filter((t) => t.gateway === gatewayFilter);
    if (clientFilter !== "all") data = data.filter((t) => (t.clients?.name || "") === clientFilter);
    return data;
  })();

  const today = new Date();
  const classify = (t: any) => {
    if (t.status === "confirmed") return "confirmed";
    if (t.status === "pending" && t.metadata?.due_date && new Date(t.metadata.due_date) < today) return "overdue";
    return "pending";
  };

  const confirmed = filtered.filter((t) => classify(t) === "confirmed");
  const pending = filtered.filter((t) => classify(t) === "pending");
  const overdue = filtered.filter((t) => classify(t) === "overdue");

  const totalRevenue = confirmed.reduce((s, t) => s + Number(t.amount || 0), 0);
  const openAmount = pending.reduce((s, t) => s + Number(t.amount || 0), 0);
  const overdueAmount = overdue.reduce((s, t) => s + Number(t.amount || 0), 0);
  const paymentRate = filtered.length ? Math.round((confirmed.length / filtered.length) * 100) : 0;

  const fmt = (v: number) =>
    new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", minimumFractionDigits: 0 }).format(v);

  // Monthly chart data
  const monthlyData = (() => {
    const months: Record<string, { month: string; pago: number; pendente: number }> = {};
    const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    filtered.forEach((t) => {
      const d = new Date(t.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
      if (!months[key]) months[key] = { month: `${monthNames[d.getMonth()]} ${d.getFullYear()}`, pago: 0, pendente: 0 };
      if (classify(t) === "confirmed") months[key].pago += Number(t.amount || 0);
      else months[key].pendente += Number(t.amount || 0);
    });
    return Object.entries(months).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
  })();

  // Status donut data
  const statusData = [
    { name: "Pago", value: confirmed.length, color: COLORS_STATUS.confirmed },
    { name: "Pendente", value: pending.length, color: COLORS_STATUS.pending },
    { name: "Atrasado", value: overdue.length, color: COLORS_STATUS.overdue },
  ].filter((d) => d.value > 0);

  // By method
  const methodData = (() => {
    const map: Record<string, number> = {};
    filtered.forEach((t) => {
      const m = t.payment_method || "outro";
      map[m] = (map[m] || 0) + Number(t.amount || 0);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  })();

  // Top 5 clients
  const clientData = (() => {
    const map: Record<string, number> = {};
    filtered.forEach((t) => {
      const name = t.clients?.name || "Sem cliente";
      map[name] = (map[name] || 0) + Number(t.amount || 0);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5);
  })();

  const textColor = isDark ? "#e5e7eb" : "#374151";
  const gridColor = isDark ? "#374151" : "#e5e7eb";

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header + Period Filter */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Relatórios Financeiros</h1>
          <p className="text-muted-foreground text-sm">{filtered.length} transações no período</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Period pills */}
          <div className="flex gap-1">
            {PERIOD_OPTIONS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                  period === p.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          {/* Gateway filter */}
          <Select value={gatewayFilter} onValueChange={setGatewayFilter}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue placeholder="Gateway" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Gateways</SelectItem>
              {gateways.map((g) => (
                <SelectItem key={g} value={g}>{g}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Client filter */}
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue placeholder="Cliente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Clientes</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: "Total Receita", value: fmt(totalRevenue), icon: DollarSign, accent: "text-green-500" },
          { label: "Em Aberto", value: fmt(openAmount), icon: Clock, accent: "text-yellow-500" },
          { label: "Em Atraso", value: fmt(overdueAmount), icon: AlertTriangle, accent: "text-red-500" },
          { label: "Pagos", value: String(confirmed.length), icon: CheckCircle, accent: "text-green-500" },
          { label: "Taxa Pgto", value: `${paymentRate}%`, icon: TrendingUp, accent: "text-blue-500" },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 mb-1">
                <kpi.icon className={cn("h-4 w-4", kpi.accent)} />
                <span className="text-[11px] text-muted-foreground">{kpi.label}</span>
              </div>
              <p className="text-lg font-bold">{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row 1: Monthly + Status Donut */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm">Receitas por Mês</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-3">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="month" tick={{ fill: textColor, fontSize: 10 }} />
                <YAxis tick={{ fill: textColor, fontSize: 10 }} />
                <RechartsTooltip
                  contentStyle={{ backgroundColor: isDark ? "#1f2937" : "#fff", border: "1px solid " + gridColor, borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: textColor }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="pago" name="Pago" fill={COLORS_STATUS.confirmed} radius={[4, 4, 0, 0]} />
                <Bar dataKey="pendente" name="Pendente" fill={COLORS_STATUS.pending} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm">Por Status</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-3 flex items-center justify-center">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} style={{ fontSize: 11 }}>
                  {statusData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip contentStyle={{ backgroundColor: isDark ? "#1f2937" : "#fff", border: "1px solid " + gridColor, borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2: Method + Client */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm">Por Método de Pagamento</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-3">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={methodData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis type="number" tick={{ fill: textColor, fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: textColor, fontSize: 10 }} width={80} />
                <RechartsTooltip contentStyle={{ backgroundColor: isDark ? "#1f2937" : "#fff", border: "1px solid " + gridColor, borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="value" name="Valor" fill="#2fc6f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm">Top 5 Clientes</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-3">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={clientData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis type="number" tick={{ fill: textColor, fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: textColor, fontSize: 10 }} width={100} />
                <RechartsTooltip contentStyle={{ backgroundColor: isDark ? "#1f2937" : "#fff", border: "1px solid " + gridColor, borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="value" name="Valor" radius={[0, 4, 4, 0]}>
                  {clientData.map((_, i) => (
                    <Cell key={i} fill={COLORS_CHART[i % COLORS_CHART.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Table */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm">Transações Detalhadas</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          <div className="overflow-auto max-h-[400px]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b">
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Data</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Cliente</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground">Valor</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Método</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Gateway</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Vencimento</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const cls = classify(t);
                  const statusBadge: Record<string, string> = {
                    confirmed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
                    pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
                    overdue: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
                  };
                  const statusLabel: Record<string, string> = { confirmed: "Pago", pending: "Pendente", overdue: "Atrasado" };
                  return (
                    <tr key={t.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2">{new Date(t.created_at).toLocaleDateString("pt-PT")}</td>
                      <td className="px-4 py-2">{t.clients?.name || "—"}</td>
                      <td className="px-4 py-2 text-right font-medium">{fmt(Number(t.amount || 0))}</td>
                      <td className="px-4 py-2">{t.payment_method}</td>
                      <td className="px-4 py-2">{t.gateway}</td>
                      <td className="px-4 py-2">
                        <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold", statusBadge[cls])}>
                          {statusLabel[cls]}
                        </span>
                      </td>
                      <td className="px-4 py-2">{t.metadata?.due_date ? new Date(t.metadata.due_date).toLocaleDateString("pt-PT") : "—"}</td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-muted-foreground">Sem transações neste período</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ==================== MAPEAMENTO VIEW ====================
function MapeamentoView({ integrationId }: { integrationId?: string }) {
  const FieldMappingManager = lazy(() => import("@/components/bitrix24/FieldMappingManager"));
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
      <FieldMappingManager integrationId={integrationId} compact />
    </Suspense>
  );
}

export default Bitrix24App;
