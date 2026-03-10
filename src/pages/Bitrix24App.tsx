import { useEffect, useState, useCallback, useRef, lazy, Suspense, useMemo } from "react";
import { useBitrix24Theme } from "@/hooks/useBitrix24Theme";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
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
import BitrixFieldSelector from "@/components/flows/BitrixFieldSelector";
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
  ArrowDownLeft, ArrowUpRight, Building2, FileDown, ChevronRight,
} from "lucide-react";
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend,
} from "recharts";
import { cn } from "@/lib/utils";
import { ChevronDown, Star, Edit, Volume2, Users, GitBranch as GitBranchIcon2 } from "lucide-react";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ExpandableTabs, type TabItem } from "@/components/ui/expandable-tabs";
import { AnimatePresence, motion } from "framer-motion";
import { AgentFormDialog } from "@/components/agentes/AgentFormDialog";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { ChatBubble, ChatBubbleAvatar, ChatBubbleMessage, ChatBubbleAction, ChatBubbleActionWrapper } from "@/components/ui/chat-bubble";
import { ChatInput } from "@/components/ui/chat-input";
import { ChatMessageList } from "@/components/ui/chat-message-list";
import { Copy } from "lucide-react";
import type { AIAgent, AIProvider, FlowOption, DocOption, CollectionOption } from "@/pages/Agentes";
import { defaultAgent } from "@/pages/Agentes";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const customNodeTypes = { custom: CustomFlowNode };

type AppView = "loading" | "dashboard" | "agentes" | "training" | "flows" | "playground" | "chatia" | "pagamentos" | "relatorios" | "mapeamento" | "empresas" | "baixa" | "placement";

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
        { id: "baixa", label: "Baixa Carteira", icon: FileDown },
        { id: "placement", label: "Placement", icon: ExternalLink },
        { id: "empresas", label: "Empresas", icon: Building2 },
        { id: "relatorios", label: "Relatórios", icon: BarChart3 },
      ],
    },
  ];

  // Build flat tabs array with separators between categories
  const { tabs: expandableTabs, indexToView } = useMemo(() => {
    const tabs: TabItem[] = [];
    const indexToView: Record<number, AppView> = {};
    let idx = 0;
    navCategories.forEach((cat, catIdx) => {
      if (catIdx > 0) {
        tabs.push({ type: "separator" as const });
        idx++;
      }
      cat.items.forEach((item) => {
        tabs.push({ title: item.label, icon: item.icon });
        indexToView[idx] = item.id as AppView;
        idx++;
      });
    });
    return { tabs, indexToView };
  }, []);

  // Find active tab index from current view
  const activeTabIndex = useMemo(() => {
    for (const [idx, v] of Object.entries(indexToView)) {
      if (v === view) return Number(idx);
    }
    return null;
  }, [view, indexToView]);

  const handleTabChange = (index: number | null) => {
    if (index !== null && indexToView[index]) {
      setView(indexToView[index]);
    }
  };
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
    <div className={cn("min-h-screen flex flex-col bg-background", isDark && "dark")}>
      {/* ── Top Header ── */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-card px-4 py-2">
        {/* Logo */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center font-extrabold text-xs bg-primary text-primary-foreground">
            E
          </div>
          <div className="hidden sm:block">
            <p className="font-bold text-sm leading-tight text-foreground">Emmely Cloud</p>
          </div>
        </div>

        {domain && (
          <Badge variant="outline" className="hidden md:inline-flex text-[10px] shrink-0">
            {domain}
          </Badge>
        )}

        {/* Tabs */}
        <div className="flex-1 flex justify-center overflow-x-auto">
          <ExpandableTabs
            tabs={expandableTabs}
            activeIndex={activeTabIndex}
            onChange={handleTabChange}
            className="border-none shadow-none bg-transparent p-0"
          />
        </div>

        {/* Status */}
        <div className="flex items-center gap-2 shrink-0">
          <div className={cn("w-2 h-2 rounded-full", integration ? "bg-success b24-pulse" : "bg-destructive")} />
          <span className="hidden sm:inline text-xs text-muted-foreground">
            {integration ? "Online" : "Offline"}
          </span>
          {botId && (
            <span className="hidden lg:inline text-[10px] text-muted-foreground">
              Bot {botId}
            </span>
          )}
        </div>
      </header>

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
        {view === "mapeamento" && <MapeamentoView integrationId={integration?.id} memberId={memberId || undefined} />}
        {view === "pagamentos" && <PagamentosView integration={integration} onRefresh={() => memberId && fetchData(memberId)} />}
        {view === "baixa" && <BaixaCarteiraView integration={integration} />}
        {view === "placement" && <PlacementPreviewView integration={integration} memberId={memberId} />}
        {view === "empresas" && <EmpresasView />}
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
      {/* View Header */}
      <div className="b24-view-header">
        <h1 className="text-xl font-bold text-white">Dashboard</h1>
        <p className="text-white/60 text-sm mt-0.5">Portal: {domain || integration?.domain || "—"}</p>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-2 gap-4">
        <Card className={cn("b24-card", integration ? "b24-status-success" : "b24-status-danger")}>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-full flex items-center justify-center", integration ? "bg-success/10" : "bg-destructive/10")}>
                {integration ? <CheckCircle className="h-5 w-5 text-success" /> : <XCircle className="h-5 w-5 text-destructive" />}
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Integração</p>
                <p className="text-xs text-muted-foreground">{integration ? "Conectado" : "Desconectado"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={cn("b24-card", botId ? "b24-status-info" : "b24-status-warning")}>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-full flex items-center justify-center", botId ? "bg-primary/10" : "bg-warning/10")}>
                <Bot className={cn("h-5 w-5", botId ? "text-primary" : "text-warning")} />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Bot IA</p>
                <p className="text-xs text-muted-foreground">{botId ? `ID: ${botId}` : "Não registado"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={cn("b24-card", integration?.connector_registered ? "b24-status-success" : "b24-status-warning")}>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-full flex items-center justify-center", integration?.connector_registered ? "bg-success/10" : "bg-warning/10")}>
                <Plug className={cn("h-5 w-5", integration?.connector_registered ? "text-success" : "text-warning")} />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Conector</p>
                <p className="text-xs text-muted-foreground">{integration?.connector_registered ? "Registado" : "Não registado"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="b24-card b24-status-info">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center bg-primary/10">
                <Activity className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Últimos eventos</p>
                <p className="text-xs text-muted-foreground">{logs.length} registos</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Início Rápido - stepper */}
      <Card className="b24-card">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-foreground">Início Rápido</CardTitle>
          <CardDescription>Configure o bot para responder automaticamente</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="b24-stepper">
            {[
              { done: !!integration, label: "Instalar o App", desc: `App instalado no Bitrix24${integration ? "" : " — pendente"}` },
              { done: !!botId, label: "Registar Bot IA", desc: botId ? `Bot Emmely AI registado (ID: ${botId})` : "Bot Emmely AI não encontrado" },
              { done: false, label: "Configurar Persona", desc: "Acesse a aba Personas e selecione um agente IA" },
              { done: false, label: "Vinculação ao Contact Center", desc: "No Bitrix24 → Contact Center → Emmely Messages" },
            ].map((step, i) => (
              <div key={i} className="b24-step">
                <div className={cn("b24-step-dot", step.done ? "done" : "pending")}>
                  {step.done ? <CheckCircle className="h-3 w-3" /> : (i + 1)}
                </div>
                <p className="text-sm font-medium text-foreground">{step.label}</p>
                <p className="text-xs mt-0.5 flex items-center gap-1 text-muted-foreground">
                  {step.done && <CheckCircle className="h-3 w-3 text-success" />}
                  {!step.done && i < 2 && <AlertCircle className="h-3 w-3 text-warning" />}
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Agente do Canal Aberto */}
      <Card className="b24-card">
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
            <Bot className="h-4 w-4 text-primary" /> Agente do Canal Aberto
          </CardTitle>
          <CardDescription>Selecione qual agente IA responde automaticamente no Open Channel</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select value={selectedAgent} onValueChange={setSelectedAgent}>
            <SelectTrigger className="rounded-md">
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
            className="w-full rounded-md"
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
                setReregisterBotResult("Sem sessão BX24 disponível. Abra o app dentro do Bitrix24.");
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
                setReregisterBotResult("Bot re-registado com EVENT_JOIN_CHAT! Verifique o Contact Center → Chatbot → Emmely AI.");
                if (integration?.member_id) {
                  setTimeout(() => onRefresh(), 1500);
                }
              } else {
                setReregisterBotResult(`Erro: ${data.error || res.status}`);
              }
            } catch (e) {
              setReregisterBotResult(`Erro de rede: ${e}`);
            } finally {
              setReregisteringBot(false);
            }
          }}
          disabled={reregisteringBot}
          className="w-full rounded-md"
        >
          {reregisteringBot
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Re-registando Bot...</>
            : <><Bot className="h-4 w-4 mr-2" />Re-registar Bot (EVENT_JOIN_CHAT)</>}
        </Button>
        {reregisterBotResult && (
          <div className={cn("text-xs text-center px-3 py-2 rounded-lg flex items-center justify-center gap-1.5", reregisterBotResult.includes("Erro") ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success")}>
            {reregisterBotResult.includes("Erro") ? <XCircle className="h-3 w-3" /> : <CheckCircle className="h-3 w-3" />}
            {reregisterBotResult}
          </div>
        )}

        <Button onClick={handleRebindEvents} disabled={rebinding} className="w-full rounded-md" variant="outline">
          {rebinding ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Registando webhooks...</> : <><Zap className="h-4 w-4 mr-2" />Re-registar Webhooks de Eventos</>}
        </Button>
        {rebindResult && (
          <div className={cn("text-xs text-center px-3 py-2 rounded-lg flex items-center justify-center gap-1.5", rebindResult.includes("Erro") ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success")}>
            {rebindResult.includes("Erro") ? <XCircle className="h-3 w-3" /> : <CheckCircle className="h-3 w-3" />}
            {rebindResult}
          </div>
        )}
        <Button onClick={onResync} disabled={loading} className="w-full rounded-md" variant="outline">
          {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sincronizando...</> : <><RefreshCw className="h-4 w-4 mr-2" />Re-sincronizar Conector</>}
        </Button>
      </div>

      {/* Logs */}
      {logs.length > 0 && (
        <Card className="b24-card">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-foreground">Últimos Eventos</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-48">
              <div className="space-y-1">
                {logs.map((log, i) => (
                  <div key={i} className="flex items-center justify-between py-2 last:border-0 text-xs border-b border-border">
                    <div className="flex items-center gap-2">
                      {log.direction === "inbound" ? (
                        <ArrowDownLeft className="h-3.5 w-3.5 text-primary" />
                      ) : (
                        <ArrowUpRight className="h-3.5 w-3.5 text-accent" />
                      )}
                      <span className="font-medium text-foreground">{log.event_type}</span>
                      {log.error && <AlertCircle className="h-3 w-3 text-destructive" />}
                    </div>
                    <span className="text-muted-foreground">{new Date(log.created_at).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Devolver ao Bot */}
      <Card className="b24-card border-l-4 border-l-accent">
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
            <Bot className="h-4 w-4 text-accent" /> Devolver ao Bot
          </CardTitle>
          <CardDescription>Devolva manualmente uma conversa ao controlo do bot IA</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {openConversations.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Conversas abertas ({openConversations.length})</p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {openConversations.map((conv) => (
                  <div key={conv.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg transition-colors bg-muted/30">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className={cn(
                        "w-2.5 h-2.5 rounded-full shrink-0",
                        conv.attendance_mode === "bot" ? "bg-success b24-pulse" : "bg-warning"
                      )} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate text-foreground">{conv.contact_name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {conv.channel} • {conv.attendance_mode === "bot" ? "Bot ativo" : "Humano/Aguardando"}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs shrink-0 rounded-md"
                      disabled={returningToBot || conv.attendance_mode === "bot"}
                      onClick={() => handleReturnToBot(conv.id)}
                    >
                      {conv.attendance_mode === "bot" ? <><CheckCircle className="h-3 w-3 mr-1 text-success" />Bot</> : <><Bot className="h-3 w-3 mr-1" />Devolver</>}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Ou inserir ID manualmente</p>
            <div className="flex gap-2">
              <Input
                value={returnToBotDialogId}
                onChange={(e) => setReturnToBotDialogId(e.target.value)}
                placeholder="ID da conversa..."
                className="text-xs h-9 flex-1 rounded-md"
              />
              <Button
                size="sm"
                className="h-9 shrink-0 rounded-md"
                onClick={() => handleReturnToBot()}
                disabled={returningToBot || !returnToBotDialogId.trim()}
              >
                {returningToBot ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Bot className="h-3.5 w-3.5 mr-1.5" />Devolver</>}
              </Button>
            </div>
          </div>
          {returnToBotResult && (
            <div className={cn("text-xs text-center px-3 py-2 rounded-lg flex items-center justify-center gap-1.5", returnToBotResult.includes("Erro") ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success")}>
              {returnToBotResult.includes("Erro") ? <XCircle className="h-3 w-3" /> : <CheckCircle className="h-3 w-3" />}
              {returnToBotResult}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ==================== AGENTES / PERSONAS VIEW ====================
function AgentesView({ botId, integrationId }: { botId: string | null; integrationId?: string }) {
  const [agents, setAgents] = useState<AIAgent[]>([]);
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [flows, setFlows] = useState<FlowOption[]>([]);
  const [docs, setDocs] = useState<DocOption[]>([]);
  const [collections, setCollections] = useState<CollectionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Partial<AIAgent>>({ ...defaultAgent });
  const [saving, setSaving] = useState(false);
  const [republishing, setRepublishing] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [agentsRes, providersRes, flowsRes, docsRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/ai_agents?select=*&order=created_at.desc`, {
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        }),
        fetch(`${SUPABASE_URL}/rest/v1/ai_providers?select=*&order=name.asc`, {
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        }),
        fetch(`${SUPABASE_URL}/rest/v1/flows?select=id,name&order=name.asc`, {
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        }),
        fetch(`${SUPABASE_URL}/rest/v1/knowledge_documents?select=id,title,collection_id,collection_name&order=title.asc`, {
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        }),
      ]);
      if (agentsRes.ok) setAgents(await agentsRes.json());
      if (providersRes.ok) setProviders(await providersRes.json());
      if (flowsRes.ok) setFlows(await flowsRes.json());
      if (docsRes.ok) {
        const docsData = await docsRes.json();
        setDocs(docsData);
        const collMap = new Map<string, CollectionOption>();
        for (const doc of docsData) {
          if (doc.collection_id && doc.collection_name) {
            const existing = collMap.get(doc.collection_id);
            if (existing) existing.doc_count++;
            else collMap.set(doc.collection_id, { collection_id: doc.collection_id, collection_name: doc.collection_name, doc_count: 1 });
          }
        }
        setCollections(Array.from(collMap.values()));
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleSave = async () => {
    if (!editingAgent.name?.trim()) return;
    setSaving(true);
    try {
      const url = editingAgent.id
        ? `${SUPABASE_URL}/rest/v1/ai_agents?id=eq.${editingAgent.id}`
        : `${SUPABASE_URL}/rest/v1/ai_agents`;
      await fetch(url, {
        method: editingAgent.id ? "PATCH" : "POST",
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify(editingAgent),
      });
      setDialogOpen(false);
      loadData();
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
    loadData();
  };

  const handleToggleActive = async (id: string, current: boolean) => {
    await fetch(`${SUPABASE_URL}/rest/v1/ai_agents?id=eq.${id}`, {
      method: "PATCH",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ is_active: !current }),
    });
    loadData();
  };

  const handleDeleteAgent = async (id: string) => {
    if (!confirm("Remover este agente?")) return;
    await fetch(`${SUPABASE_URL}/rest/v1/ai_agents?id=eq.${id}`, {
      method: "DELETE",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    loadData();
  };

  const handleRepublishBot = async (agent: AIAgent) => {
    if (!integrationId) return;
    setRepublishing(agent.id);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/bitrix24-reregister-bot`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        body: JSON.stringify({ integration_id: integrationId, agent_id: agent.id }),
      });
      const data = await res.json();
      if (!data.success) console.error("Republish failed:", data.error);
    } catch (e) { console.error(e); }
    setRepublishing(null);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="b24-view-header flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Personas / Agentes IA</h1>
          <p className="text-white/60 text-sm mt-0.5">Configure o comportamento do bot</p>
        </div>
        <Button
          onClick={() => { setEditingAgent({ ...defaultAgent }); setDialogOpen(true); }}
          className="rounded-md bg-white/15 hover:bg-white/25 text-white border-0"
        >
          <Plus className="h-4 w-4 mr-2" /> Novo Agente
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : agents.length === 0 ? (
        <Card className="b24-card">
          <CardContent className="py-12 text-center">
            <Bot className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-30" />
            <p className="text-muted-foreground">Nenhum agente configurado</p>
            <Button onClick={() => { setEditingAgent({ ...defaultAgent }); setDialogOpen(true); }} className="mt-4">
              <Plus className="h-4 w-4 mr-2" /> Criar Primeiro Agente
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {agents.map((agent) => (
            <Card key={agent.id} className="b24-card">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-bitrix-gradient flex items-center justify-center text-white font-bold text-lg shrink-0">
                    {agent.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-foreground">{agent.name}</h3>
                      {agent.is_default && <Badge variant="secondary" className="text-[10px]">Padrão</Badge>}
                      <Badge variant={agent.is_active ? "default" : "outline"} className="text-[10px]">
                        {agent.is_active ? "Ativo" : "Inativo"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{agent.description || "Sem descrição"}</p>
                    <div className="flex items-center gap-1 mt-2 text-[10px] text-muted-foreground">
                      <span>{agent.ai_provider}/{agent.ai_model}</span>
                      <span>•</span>
                      <span>Temp: {agent.temperature}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!agent.is_default && (
                      <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => handleSetDefault(agent.id)}>
                        <Star className="h-3.5 w-3.5 mr-1" /> Padrão
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingAgent(agent); setDialogOpen(true); }}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleToggleActive(agent.id, agent.is_active)}>
                      <Power className={cn("h-3.5 w-3.5", agent.is_active ? "text-success" : "text-muted-foreground")} />
                    </Button>
                    {integrationId && (
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleRepublishBot(agent)} disabled={republishing === agent.id}>
                        {republishing === agent.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDeleteAgent(agent.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AgentFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingAgent={editingAgent}
        setEditingAgent={setEditingAgent}
        providers={providers}
        flows={flows}
        docs={docs}
        collections={collections}
        agents={agents}
        saving={saving}
        onSave={handleSave}
      />
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
      <div className="b24-view-header">
        <h1 className="text-xl font-bold text-white">Treinamento do Bot</h1>
        <p className="text-white/60 text-sm mt-0.5">Adicione conhecimento para o seu bot</p>
      </div>

      <Card className="b24-card">
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
        <h2 className="text-lg font-semibold mb-3 text-foreground">Base de Conhecimento</h2>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : docs.length === 0 ? (
          <Card className="b24-card">
            <CardContent className="py-12 text-center text-muted-foreground">
              <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>Nenhum documento adicionado</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {docs.map((d) => (
              <Card key={d.id} className="b24-card">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <FileText className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate text-foreground">{d.title}</p>
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
        <div className="flex items-center justify-between p-3 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setSelectedFlow(null); setSelectedNodeId(null); fetchFlows(); }}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h3 className="text-sm font-semibold text-foreground">{selectedFlow.name}</h3>
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
      <div className="b24-view-header flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Fluxos de Automação</h1>
          <p className="text-white/60 text-sm mt-0.5">Configure automações integradas ao Bitrix24</p>
        </div>
        <Button onClick={() => setShowCreateForm(!showCreateForm)} variant={showCreateForm ? "secondary" : "default"} className={showCreateForm ? "" : "rounded-md bg-white/15 hover:bg-white/25 text-white border-0"}>
          {showCreateForm ? "✕ Cancelar" : <><Plus className="h-4 w-4 mr-2" />Novo Fluxo</>}
        </Button>
      </div>

      {/* Create Flow Form */}
      {showCreateForm && (
        <Card className="b24-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <GitBranch className="h-4 w-4" /> Novo Fluxo
            </CardTitle>
            <CardDescription>Configure o fluxo e depois edite os nós no editor visual</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Nome do Fluxo *</Label>
              <Input value={newFlowForm.name} onChange={(e) => setNewFlowForm({ ...newFlowForm, name: e.target.value })} placeholder="Ex: Atendimento Inicial" className="mt-1" />
            </div>
            <div>
              <Label>Descrição</Label>
              <Input value={newFlowForm.description} onChange={(e) => setNewFlowForm({ ...newFlowForm, description: e.target.value })} placeholder="Breve descrição do fluxo..." className="mt-1" />
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
                <Input value={newFlowForm.keywords} onChange={(e) => setNewFlowForm({ ...newFlowForm, keywords: e.target.value })} placeholder="Ex: oi, olá, menu, ajuda" className="mt-1" />
              </div>
            )}
            <div>
              <Label>Prioridade (maior = primeiro)</Label>
              <Input type="number" value={newFlowForm.priority} onChange={(e) => setNewFlowForm({ ...newFlowForm, priority: e.target.value })} className="mt-1" />
            </div>
            <Button onClick={handleCreateFlow} disabled={creating || !newFlowForm.name.trim()} className="w-full">
              {creating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Criando...</> : <><Plus className="h-4 w-4 mr-2" />Criar Fluxo</>}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Flow List */}
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : flows.length === 0 ? (
        <Card className="b24-card">
          <CardContent className="py-12 text-center text-muted-foreground">
            <GitBranch className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>Nenhum fluxo criado</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {flows.map((flow) => (
            <Card key={flow.id} className="b24-card cursor-pointer" onClick={() => openFlow(flow)}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <GitBranch className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate text-foreground">{flow.name}</p>
                        <Badge variant={flow.is_active ? "default" : "outline"} className="text-[10px]">
                          {flow.is_active ? "Ativo" : "Inativo"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {flow.trigger_type} • {flow.flow_type} • {(flow.nodes || []).length} nós
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Switch checked={flow.is_active} onCheckedChange={() => toggleActive(flow.id, flow.is_active)} />
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={(e) => handleDeleteFlow(flow.id, e)}>
                      <Trash2 className="h-4 w-4" />
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

// ==================== CHAT IA VIEW ====================
function ChatIABitrixView() {
  const [agents, setAgents] = useState<any[]>([]);
  const [selectedAgent, setSelectedAgent] = useState("");
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<Array<{ id: string; title: string; messages: Array<{ role: string; content: string }> }>>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${SUPABASE_URL}/rest/v1/ai_agents?select=id,name,is_default,is_active,welcome_message&is_active=eq.true&order=is_default.desc`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    }).then(r => r.json()).then(data => {
      setAgents(data || []);
      if (data?.length > 0) setSelectedAgent(data[0].id);
    }).catch(console.error);
    const saved = localStorage.getItem("chatia_sessions");
    if (saved) {
      try { setSessions(JSON.parse(saved)); } catch {}
    }
  }, []);

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

      if (activeSessionId) {
        const updated = sessions.map(s => s.id === activeSessionId ? { ...s, messages: allMsgs } : s);
        saveSessions(updated);
      } else {
        const newId = crypto.randomUUID();
        const title = input.trim().substring(0, 50);
        const newSess = { id: newId, title, messages: allMsgs };
        saveSessions([newSess, ...sessions]);
        setActiveSessionId(newId);
      }
    } catch {
      setMessages([...newMessages, { role: "assistant", content: "Erro de conexão." }]);
    }
    setLoading(false);
  };

  const renderMd = (text: string) => {
    let html = text
      .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="bg-muted rounded-md p-3 text-xs overflow-x-auto my-2 border border-border"><code>$2</code></pre>')
      .replace(/`([^`]+)`/g, '<code class="bg-muted px-1.5 py-0.5 rounded text-xs border border-border/50">$1</code>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^- (.+)$/gm, '<li class="ml-3">$1</li>')
      .replace(/\n/g, '<br>');
    return html;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const copyMessage = (content: string) => {
    navigator.clipboard.writeText(content);
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <div className="w-60 flex flex-col shrink-0 border-r border-border bg-card">
        <div className="p-3 space-y-2.5 border-b border-border">
          <Button onClick={newSession} size="sm" className="w-full rounded-lg gap-1.5 h-9 text-xs font-medium">
            <Plus className="h-3.5 w-3.5" /> Nova conversa
          </Button>
          <Select value={selectedAgent} onValueChange={(v) => { setSelectedAgent(v); newSession(); }}>
            <SelectTrigger className="h-8 text-xs rounded-lg border-border">
              <SelectValue placeholder="Selecionar agente" />
            </SelectTrigger>
            <SelectContent>
              {agents.map((a: any) => (
                <SelectItem key={a.id} value={a.id}>
                  <span className="flex items-center gap-1.5">
                    <Bot className="h-3 w-3 text-primary" />
                    {a.name}
                    {a.is_default && <Star className="h-2.5 w-2.5 text-warning fill-warning" />}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-0.5">
            {sessions.length === 0 && (
              <p className="text-[11px] text-muted-foreground text-center py-6 px-2">
                As suas conversas aparecerão aqui
              </p>
            )}
            {sessions.map(s => (
              <div
                key={s.id}
                onClick={() => selectSession(s.id)}
                className={cn(
                  "group flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs cursor-pointer transition-all",
                  s.id === activeSessionId
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted/60"
                )}
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-60" />
                <span className="truncate flex-1">{s.title}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-destructive/10 transition-opacity"
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Messages */}
        {messages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <h3 className="text-sm font-semibold text-foreground mb-1">
                {currentAgent?.name || "Emmely AI"}
              </h3>
              {currentAgent?.welcome_message ? (
                <div className="text-xs max-w-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: renderMd(currentAgent.welcome_message) }} />
              ) : (
                <p className="text-xs max-w-sm">Envie uma mensagem para iniciar a conversa</p>
              )}
            </div>
          </div>
        ) : (
          <ChatMessageList className="flex-1" smooth>
            <div className="max-w-2xl mx-auto w-full">
              {messages.map((m, i) => (
                <ChatBubble key={i} variant={m.role === "user" ? "sent" : "received"} layout="ai">
                  {m.role === "assistant" && (
                    <ChatBubbleAvatar fallback="✨" className="bg-primary/10 text-primary" />
                  )}
                  <ChatBubbleMessage variant={m.role === "user" ? "sent" : "received"}>
                    {m.role === "assistant" ? (
                      <div dangerouslySetInnerHTML={{ __html: renderMd(m.content) }} />
                    ) : (
                      <span>{m.content}</span>
                    )}
                  </ChatBubbleMessage>
                  {m.role === "assistant" && (
                    <ChatBubbleActionWrapper>
                      <ChatBubbleAction
                        icon={<Copy className="h-3 w-3" />}
                        onClick={() => copyMessage(m.content)}
                        className="text-muted-foreground hover:text-foreground"
                      />
                    </ChatBubbleActionWrapper>
                  )}
                </ChatBubble>
              ))}
              {loading && (
                <ChatBubble variant="received" layout="ai">
                  <ChatBubbleAvatar fallback="✨" className="bg-primary/10 text-primary" />
                  <ChatBubbleMessage variant="received" isLoading />
                </ChatBubble>
              )}
            </div>
          </ChatMessageList>
        )}

        {/* Input */}
        <div className="border-t border-border bg-card/50 backdrop-blur-sm p-3">
          <div className="max-w-2xl mx-auto flex items-end gap-2">
            <AudioRecordButton
              onTranscript={(text) => setInput((prev) => (prev ? prev + " " : "") + text)}
              disabled={loading}
              preferNative
              lang="pt-PT"
              fetchTokenUrl={`${SUPABASE_URL}/functions/v1/elevenlabs-scribe-token`}
              fetchHeaders={{ Authorization: `Bearer ${SUPABASE_KEY}` }}
            />
            <ChatInput
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escreva a sua mensagem..."
              disabled={loading}
              className="flex-1"
            />
            <Button
              size="icon"
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              className="shrink-0 rounded-full h-10 w-10"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
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

  useEffect(() => {
    fetch(`${SUPABASE_URL}/rest/v1/ai_agents?select=id,name,is_default,is_active&is_active=eq.true&order=is_default.desc`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    }).then(r => r.json()).then(data => {
      setAgents(data || []);
      if (data?.length > 0) setSelectedAgent(data[0].id);
    }).catch(console.error);
  }, []);

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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const renderMd = (text: string) => {
    let html = text
      .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="bg-muted rounded-md p-3 text-xs overflow-x-auto my-2 border border-border"><code>$2</code></pre>')
      .replace(/`([^`]+)`/g, '<code class="bg-muted px-1.5 py-0.5 rounded text-xs border border-border/50">$1</code>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^- (.+)$/gm, '<li class="ml-3">$1</li>')
      .replace(/\n/g, '<br>');
    return html;
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="p-4 pb-0">
        <div className="b24-view-header mb-4">
          <h1 className="text-lg font-bold text-white">Playground</h1>
          <p className="text-white/60 text-xs mt-0.5">Teste o seu agente IA em tempo real</p>
        </div>
        <div className="mb-3">
          <Select value={selectedAgent} onValueChange={(v) => { setSelectedAgent(v); setMessages([]); }}>
            <SelectTrigger className="h-9 rounded-lg border-border">
              <SelectValue placeholder="Selecionar agente" />
            </SelectTrigger>
            <SelectContent>
              {agents.map(a => (
                <SelectItem key={a.id} value={a.id}>
                  <span className="flex items-center gap-1.5">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                    {a.name} {a.is_default && <Star className="h-2.5 w-2.5 text-warning fill-warning" />}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Chat card */}
      <div className="flex-1 flex flex-col overflow-hidden mx-4 mb-4 rounded-xl border border-border bg-card">
        {messages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <Sparkles className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-xs">Envie uma mensagem para testar o agente...</p>
            </div>
          </div>
        ) : (
          <ChatMessageList className="flex-1" smooth>
            <div className="max-w-xl mx-auto w-full">
              {messages.map((m, i) => (
                <ChatBubble key={i} variant={m.role === "user" ? "sent" : "received"} layout="ai">
                  {m.role === "assistant" && (
                    <ChatBubbleAvatar fallback="🤖" className="bg-primary/10 text-primary" />
                  )}
                  <ChatBubbleMessage variant={m.role === "user" ? "sent" : "received"}>
                    {m.role === "assistant" ? (
                      <div dangerouslySetInnerHTML={{ __html: renderMd(m.content) }} />
                    ) : (
                      <span>{m.content}</span>
                    )}
                  </ChatBubbleMessage>
                </ChatBubble>
              ))}
              {loading && (
                <ChatBubble variant="received" layout="ai">
                  <ChatBubbleAvatar fallback="🤖" className="bg-primary/10 text-primary" />
                  <ChatBubbleMessage variant="received" isLoading />
                </ChatBubble>
              )}
            </div>
          </ChatMessageList>
        )}

        {/* Input */}
        <div className="border-t border-border p-3">
          <div className="flex items-end gap-2">
            {messages.length > 0 && (
              <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 rounded-full text-muted-foreground" onClick={() => setMessages([])}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            )}
            <ChatInput
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Digite uma mensagem..."
              disabled={loading}
              className="flex-1"
            />
            <Button
              size="icon"
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              className="shrink-0 rounded-full h-10 w-10"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== PAGAMENTOS VIEW ====================
function PagamentosView({ integration, onRefresh }: { integration: any; onRefresh: () => void }) {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [form, setForm] = useState({
    amount: "", currency: "EUR", payment_method: "card",
    customer_name: "", customer_email: "", description: ""
  });

  const config = (integration?.config as any) || {};
  const [gwConfig, setGwConfig] = useState({
    deal_gateway_field: config.deal_gateway_field || "",
    deal_won_stage: config.deal_won_stage || "WON",
    deal_amount_field: config.deal_amount_field || "OPPORTUNITY",
    deal_currency_field: config.deal_currency_field || "CURRENCY_ID",
    auto_charge_on_close: config.auto_charge_on_close ?? false,
    deal_installments_field: config.deal_installments_field || "",
    deal_down_payment_field: config.deal_down_payment_field || "",
    deal_first_due_date_field: config.deal_first_due_date_field || "",
    deal_interval_days_field: config.deal_interval_days_field || "",
    deal_customer_name_field: config.deal_customer_name_field || "",
    deal_customer_email_field: config.deal_customer_email_field || "",
    deal_customer_cpf_field: config.deal_customer_cpf_field || "",
  });

  useEffect(() => {
    const c = (integration?.config as any) || {};
    setGwConfig({
      deal_gateway_field: c.deal_gateway_field || "",
      deal_won_stage: c.deal_won_stage || "WON",
      deal_amount_field: c.deal_amount_field || "OPPORTUNITY",
      deal_currency_field: c.deal_currency_field || "CURRENCY_ID",
      auto_charge_on_close: c.auto_charge_on_close ?? false,
      deal_installments_field: c.deal_installments_field || "",
      deal_down_payment_field: c.deal_down_payment_field || "",
      deal_first_due_date_field: c.deal_first_due_date_field || "",
      deal_interval_days_field: c.deal_interval_days_field || "",
      deal_customer_name_field: c.deal_customer_name_field || "",
      deal_customer_email_field: c.deal_customer_email_field || "",
      deal_customer_cpf_field: c.deal_customer_cpf_field || "",
    });
  }, [integration?.config]);

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

  const handleSaveGwConfig = async () => {
    if (!integration?.id) return;
    setSavingConfig(true);
    try {
      const mergedConfig = { ...config, ...gwConfig };
      await fetch(`${SUPABASE_URL}/rest/v1/bitrix24_integrations?id=eq.${integration.id}`, {
        method: "PATCH",
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ config: mergedConfig }),
      });
      onRefresh();
    } catch (e) { console.error(e); }
    setSavingConfig(false);
  };

  const statusColors: Record<string, string> = {
    pending: "bg-warning/10 text-warning",
    confirmed: "bg-success/10 text-success",
    received: "bg-success/10 text-success",
    failed: "bg-destructive/10 text-destructive",
  };

  return (
    <div className="p-6 space-y-6">
      <div className="b24-view-header flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Pagamentos</h1>
          <p className="text-white/60 text-sm mt-0.5">Gerir cobranças e transações</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} variant={showForm ? "secondary" : "default"} className={showForm ? "" : "rounded-md bg-white/15 hover:bg-white/25 text-white border-0"}>
          {showForm ? "✕ Cancelar" : <><Plus className="h-4 w-4 mr-2" />Nova Cobrança</>}
        </Button>
      </div>

      {/* Gateway Config for Bitrix24 Deals */}
      <Card className="b24-card">
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground"><Settings className="h-4 w-4 text-primary" /> Cobrança Automática ao Fechar Negócio</CardTitle>
          <CardDescription className="text-xs">Configure os campos do Bitrix24 para criar cobranças automaticamente quando um negócio for fechado.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={gwConfig.auto_charge_on_close}
              onChange={(e) => setGwConfig({ ...gwConfig, auto_charge_on_close: e.target.checked })}
              className="rounded"
            />
            <Label className="text-sm">Ativar cobrança automática</Label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Campo Gateway (Deal)</Label>
              <BitrixFieldSelector entity="deal" value={gwConfig.deal_gateway_field || ""} onChange={(v) => setGwConfig({ ...gwConfig, deal_gateway_field: v })} placeholder="Ex: UF_CRM_GATEWAY" />
            </div>
            <div>
              <Label className="text-xs">Stage Won</Label>
              <Input value={gwConfig.deal_won_stage} onChange={(e) => setGwConfig({ ...gwConfig, deal_won_stage: e.target.value })} className="mt-1 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Campo Valor</Label>
              <BitrixFieldSelector entity="deal" value={gwConfig.deal_amount_field || "OPPORTUNITY"} onChange={(v) => setGwConfig({ ...gwConfig, deal_amount_field: v })} placeholder="OPPORTUNITY" />
            </div>
            <div>
              <Label className="text-xs">Campo Moeda</Label>
              <BitrixFieldSelector entity="deal" value={gwConfig.deal_currency_field || "CURRENCY_ID"} onChange={(v) => setGwConfig({ ...gwConfig, deal_currency_field: v })} placeholder="CURRENCY_ID" />
            </div>
            <div>
              <Label className="text-xs">Nº Parcelas</Label>
              <BitrixFieldSelector entity="deal" value={gwConfig.deal_installments_field || ""} onChange={(v) => setGwConfig({ ...gwConfig, deal_installments_field: v })} placeholder="Campo com nº parcelas" />
            </div>
            <div>
              <Label className="text-xs">Valor Entrada</Label>
              <BitrixFieldSelector entity="deal" value={gwConfig.deal_down_payment_field || ""} onChange={(v) => setGwConfig({ ...gwConfig, deal_down_payment_field: v })} placeholder="Campo com valor de entrada" />
            </div>
            <div>
              <Label className="text-xs">Data 1º Vencimento</Label>
              <BitrixFieldSelector entity="deal" value={gwConfig.deal_first_due_date_field || ""} onChange={(v) => setGwConfig({ ...gwConfig, deal_first_due_date_field: v })} placeholder="Campo com data 1º venc." />
            </div>
            <div>
              <Label className="text-xs">Intervalo (dias)</Label>
              <BitrixFieldSelector entity="deal" value={gwConfig.deal_interval_days_field || ""} onChange={(v) => setGwConfig({ ...gwConfig, deal_interval_days_field: v })} placeholder="Campo com intervalo (default 30)" />
            </div>
            <div>
              <Label className="text-xs">Nome Cliente</Label>
              <BitrixFieldSelector entity="deal" value={gwConfig.deal_customer_name_field || ""} onChange={(v) => setGwConfig({ ...gwConfig, deal_customer_name_field: v })} placeholder="Ou busca do contacto" />
            </div>
            <div>
              <Label className="text-xs">Email Cliente</Label>
              <BitrixFieldSelector entity="deal" value={gwConfig.deal_customer_email_field || ""} onChange={(v) => setGwConfig({ ...gwConfig, deal_customer_email_field: v })} placeholder="Ou busca do contacto" />
            </div>
            <div>
              <Label className="text-xs">CPF/CNPJ</Label>
              <BitrixFieldSelector entity="deal" value={gwConfig.deal_customer_cpf_field || ""} onChange={(v) => setGwConfig({ ...gwConfig, deal_customer_cpf_field: v })} placeholder="Campo com CPF/CNPJ" />
            </div>
          </div>
          <Button onClick={handleSaveGwConfig} disabled={savingConfig} size="sm" className="w-full">
            {savingConfig ? <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />Salvando...</> : <><Save className="h-3.5 w-3.5 mr-2" />Salvar Configuração</>}
          </Button>
        </CardContent>
      </Card>

      {/* Create Payment Form */}
      {showForm && (
        <Card className="b24-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="h-4 w-4" /> Nova Cobrança
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Valor *</Label>
                <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Moeda</Label>
                <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="BRL">BRL</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Nome do Cliente</Label>
                <Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Email</Label>
                <Input type="email" value={form.customer_email} onChange={(e) => setForm({ ...form, customer_email: e.target.value })} className="mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Método</Label>
              <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="card">Cartão</SelectItem>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="boleto">Boleto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Descrição</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1" />
            </div>
            <Button onClick={handleCreate} disabled={creating || !form.amount} className="w-full">
              {creating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Criando...</> : <><CreditCard className="h-4 w-4 mr-2" />Criar Cobrança</>}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Transactions */}
      <div>
        <h2 className="text-lg font-semibold mb-3 text-foreground">Transações Recentes</h2>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : transactions.length === 0 ? (
          <Card className="b24-card">
            <CardContent className="py-12 text-center text-muted-foreground">
              <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>Nenhuma transação encontrada</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {transactions.map((t) => (
              <Card key={t.id} className="b24-card">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <DollarSign className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate text-foreground">{t.gateway} • {t.payment_method}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(t.created_at).toLocaleDateString("pt-PT")}
                          {t.payment_url && (
                            <a href={t.payment_url} target="_blank" rel="noopener noreferrer" className="ml-2 text-primary hover:underline inline-flex items-center gap-0.5">
                              Link <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-foreground">{t.currency} {Number(t.amount).toFixed(2)}</p>
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

// ==================== EMPRESAS VIEW ====================
function EmpresasView() {
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "", legal_name: "", document_number: "", country: "Portugal", currency: "EUR",
    email: "", phone: "", address: "", city: "", state: "", postal_code: "",
    stripe_credential_key: "", asaas_credential_key: "", default_gateway: "auto",
  });

  const fetchCompanies = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/companies?select=*&order=name.asc`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      });
      if (res.ok) setCompanies(await res.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchCompanies(); }, []);

  const openNew = () => {
    setEditId(null);
    setForm({ name: "", legal_name: "", document_number: "", country: "Portugal", currency: "EUR", email: "", phone: "", address: "", city: "", state: "", postal_code: "", stripe_credential_key: "", asaas_credential_key: "", default_gateway: "auto" });
    setShowForm(true);
  };

  const openEdit = (c: any) => {
    setEditId(c.id);
    setForm({
      name: c.name || "", legal_name: c.legal_name || "", document_number: c.document_number || "",
      country: c.country || "Portugal", currency: c.currency || "EUR",
      email: c.email || "", phone: c.phone || "", address: c.address || "",
      city: c.city || "", state: c.state || "", postal_code: c.postal_code || "",
      stripe_credential_key: c.stripe_credential_key || "", asaas_credential_key: c.asaas_credential_key || "",
      default_gateway: c.default_gateway || "auto",
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const url = editId
        ? `${SUPABASE_URL}/rest/v1/companies?id=eq.${editId}`
        : `${SUPABASE_URL}/rest/v1/companies`;
      await fetch(url, {
        method: editId ? "PATCH" : "POST",
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify(form),
      });
      setShowForm(false);
      fetchCompanies();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/companies?id=eq.${id}`, {
        method: "PATCH",
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ is_active: !isActive }),
      });
      fetchCompanies();
    } catch (e) { console.error(e); }
  };

  const gatewayLabels: Record<string, string> = { auto: "Automático", stripe_pt: "Stripe PT", stripe_br: "Stripe BR", asaas: "Asaas", direto: "Crediário Próprio" };

  return (
    <div className="p-6 space-y-6">
      <div className="b24-view-header flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Empresas</h1>
          <p className="text-white/60 text-sm mt-0.5">Filiais e configurações de pagamento</p>
        </div>
        <Button onClick={openNew} className="rounded-md bg-white/15 hover:bg-white/25 text-white border-0">
          <Plus className="h-4 w-4 mr-2" />Nova Empresa
        </Button>
      </div>

      {showForm && (
        <Card className="b24-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4" /> {editId ? "Editar Empresa" : "Nova Empresa"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Nome *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" placeholder="Nome comercial" />
              </div>
              <div>
                <Label className="text-xs">Razão Social</Label>
                <Input value={form.legal_name} onChange={(e) => setForm({ ...form, legal_name: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">CNPJ/NIF</Label>
                <Input value={form.document_number} onChange={(e) => setForm({ ...form, document_number: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">País</Label>
                <Select value={form.country} onValueChange={(v) => setForm({ ...form, country: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Portugal">Portugal</SelectItem>
                    <SelectItem value="Brasil">Brasil</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Moeda</Label>
                <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="BRL">BRL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Email</Label>
                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1" type="email" />
              </div>
              <div>
                <Label className="text-xs">Telefone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Endereço</Label>
                <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="mt-1" />
              </div>
            </div>

            <Separator />

            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><CreditCard className="h-4 w-4 text-primary" /> Credenciais de Pagamento</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Gateway Padrão</Label>
                <Select value={form.default_gateway} onValueChange={(v) => setForm({ ...form, default_gateway: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Automático</SelectItem>
                    <SelectItem value="stripe_pt">Stripe Portugal</SelectItem>
                    <SelectItem value="stripe_br">Stripe Brasil</SelectItem>
                    <SelectItem value="asaas">Asaas</SelectItem>
                    <SelectItem value="direto">Crediário Próprio</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Provider Stripe (integration_credentials)</Label>
                <Input value={form.stripe_credential_key} onChange={(e) => setForm({ ...form, stripe_credential_key: e.target.value })} className="mt-1" placeholder="ex: stripe_pt_empresa1" />
                <p className="text-[10px] text-muted-foreground mt-1">Nome do provider na tabela de credenciais</p>
              </div>
              <div>
                <Label className="text-xs">Provider Asaas (integration_credentials)</Label>
                <Input value={form.asaas_credential_key} onChange={(e) => setForm({ ...form, asaas_credential_key: e.target.value })} className="mt-1" placeholder="ex: asaas_empresa1" />
                <p className="text-[10px] text-muted-foreground mt-1">Nome do provider na tabela de credenciais</p>
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
                {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</> : <><Save className="h-4 w-4 mr-2" />Salvar</>}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : companies.length === 0 ? (
        <Card className="b24-card">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Building2 className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>Nenhuma empresa cadastrada</p>
            <p className="text-xs mt-1">Adicione as suas filiais para configurar pagamentos por empresa</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {companies.map((c) => (
            <Card key={c.id} className="b24-card cursor-pointer" onClick={() => openEdit(c)}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Building2 className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate text-foreground">{c.name}</p>
                        <Badge variant={c.is_active ? "default" : "outline"} className="text-[10px]">
                          {c.is_active ? "Ativa" : "Inativa"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {c.document_number || "Sem CNPJ"} • {gatewayLabels[c.default_gateway] || c.default_gateway} • {c.currency}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Switch checked={c.is_active} onCheckedChange={() => toggleActive(c.id, c.is_active)} />
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

// ==================== RELATÓRIOS VIEW ====================
const COLORS_STATUS = { confirmed: "#589731", pending: "#c49c00", overdue: "#df532d" };
const COLORS_CHART = ["#2fc6f6", "#589731", "#c49c00", "#df532d", "#8b5cf6"];

type PeriodKey = "7d" | "30d" | "90d" | "year" | "all" | "custom";
const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "90d", label: "90 dias" },
  { key: "year", label: "Ano" },
  { key: "all", label: "Todos" },
];

function RelatoriosView() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [gatewayFilter, setGatewayFilter] = useState<string>("all");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(
      `${SUPABASE_URL}/rest/v1/payment_transactions?select=*,clients(name),companies(name)&order=created_at.desc&limit=1000`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    )
      .then((r) => r.json())
      .then((data) => setTransactions(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const gateways = Array.from(new Set(transactions.map((t) => t.gateway).filter(Boolean))).sort();
  const clients = Array.from(new Set(transactions.map((t) => t.clients?.name).filter(Boolean))).sort() as string[];
  const companies = Array.from(new Set(transactions.map((t) => t.companies?.name).filter(Boolean))).sort() as string[];

  const filtered = useMemo(() => {
    let data = transactions;
    // Date filtering
    if (period === "custom" && dateRange.from) {
      const from = new Date(dateRange.from);
      from.setHours(0, 0, 0, 0);
      const to = dateRange.to ? new Date(dateRange.to) : new Date(dateRange.from);
      to.setHours(23, 59, 59, 999);
      data = data.filter((t) => { const d = new Date(t.created_at); return d >= from && d <= to; });
    } else if (period !== "all") {
      const now = new Date();
      const ms: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90, year: 365 };
      const cutoff = new Date(now.getTime() - (ms[period] || 30) * 86400000);
      data = data.filter((t) => new Date(t.created_at) >= cutoff);
    }
    if (gatewayFilter !== "all") data = data.filter((t) => t.gateway === gatewayFilter);
    if (clientFilter !== "all") data = data.filter((t) => (t.clients?.name || "") === clientFilter);
    if (companyFilter !== "all") data = data.filter((t) => (t.companies?.name || "") === companyFilter);
    return data;
  }, [transactions, period, dateRange, gatewayFilter, clientFilter, companyFilter]);

  const today = new Date();
  const classify = (t: any) => {
    if (t.status === "confirmed") return "confirmed";
    if (t.status === "pending" && t.metadata?.due_date && new Date(t.metadata.due_date) < today) return "overdue";
    return "pending";
  };

  const confirmed = filtered.filter((t) => classify(t) === "confirmed");
  const pending = filtered.filter((t) => classify(t) === "pending");
  const overdue = filtered.filter((t) => classify(t) === "overdue");

  const totalCharged = filtered.reduce((s, t) => s + Number(t.amount || 0), 0);
  const totalPaid = confirmed.reduce((s, t) => s + Number(t.amount || 0), 0);
  const openAmount = pending.reduce((s, t) => s + Number(t.amount || 0), 0);
  const overdueAmount = overdue.reduce((s, t) => s + Number(t.amount || 0), 0);
  const paymentRate = filtered.length ? Math.round((confirmed.length / filtered.length) * 100) : 0;

  const fmt = (v: number) =>
    new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", minimumFractionDigits: 0 }).format(v);

  const monthlyData = useMemo(() => {
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
  }, [filtered]);

  const statusData = [
    { name: "Pago", value: confirmed.length, color: COLORS_STATUS.confirmed },
    { name: "Pendente", value: pending.length, color: COLORS_STATUS.pending },
    { name: "Atrasado", value: overdue.length, color: COLORS_STATUS.overdue },
  ].filter((d) => d.value > 0);

  const methodData = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach((t) => {
      const m = t.payment_method || "outro";
      map[m] = (map[m] || 0) + Number(t.amount || 0);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filtered]);

  const clientData = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach((t) => {
      const name = t.clients?.name || "Sem cliente";
      map[name] = (map[name] || 0) + Number(t.amount || 0);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5);
  }, [filtered]);

  // Seller / Responsible report
  const sellerData = useMemo(() => {
    const map: Record<string, { name: string; total: number; paid: number; count: number }> = {};
    filtered.forEach((t) => {
      const seller = (t.metadata as any)?.responsible_name || "Sem responsável";
      if (!map[seller]) map[seller] = { name: seller, total: 0, paid: 0, count: 0 };
      map[seller].total += Number(t.amount || 0);
      map[seller].count += 1;
      if (classify(t) === "confirmed") map[seller].paid += Number(t.amount || 0);
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filtered]);

  const sellerChartData = sellerData.map((s) => ({
    name: s.name.length > 20 ? s.name.slice(0, 18) + "…" : s.name,
    pago: s.paid,
    pendente: s.total - s.paid,
  }));

  const textColor = "#374151";
  const gridColor = "#e5e7eb";

  const handleDateRangeSelect = (range: any) => {
    if (range?.from) {
      setDateRange({ from: range.from, to: range.to });
      setPeriod("custom");
      if (range.to) setDatePickerOpen(false);
    }
  };

  const clearDateRange = () => {
    setDateRange({});
    setPeriod("30d");
  };
  const [exporting, setExporting] = useState(false);
  const [exportedLink, setExportedLink] = useState<string | null>(null);

  const buildSnapshotData = () => ({
    kpis: { totalCharged, totalPaid, openAmount, overdueAmount, confirmedCount: confirmed.length, paymentRate },
    sellerData,
    transactions: filtered.map((t) => ({
      created_at: t.created_at,
      client_name: t.clients?.name || null,
      company_name: t.companies?.name || null,
      responsible: (t.metadata as any)?.responsible_name || null,
      amount: Number(t.amount || 0),
      payment_method: t.payment_method,
      gateway: t.gateway,
      status: t.status,
      due_date: (t.metadata as any)?.due_date || null,
    })),
  });

  const handleExportLink = async () => {
    setExporting(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/report_snapshots`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          title: "Relatório Financeiro",
          data: buildSnapshotData(),
          filters: { period, company: companyFilter, gateway: gatewayFilter, client: clientFilter },
        }),
      });
      const [snap] = await res.json();
      if (snap?.id) {
        const link = `${SUPABASE_URL}/functions/v1/report-public?id=${snap.id}`;
        setExportedLink(link);
        try { await navigator.clipboard.writeText(link); } catch {}
      }
    } catch (e) { console.error(e); }
    setExporting(false);
  };

  const handleExportPDF = () => {
    window.print();
  };

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
      <div className="b24-view-header flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Relatórios Financeiros</h1>
          <p className="text-white/60 text-sm mt-0.5">{filtered.length} transações no período</p>
          {exportedLink && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[11px] text-green-300">✅ Link copiado!</span>
              <a href={exportedLink} target="_blank" rel="noopener noreferrer" className="text-[11px] text-blue-300 underline truncate max-w-[300px]">{exportedLink}</a>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Period pills */}
          <div className="flex gap-1 bg-white/10 rounded-lg p-0.5">
            {PERIOD_OPTIONS.map((p) => (
              <button
                key={p.key}
                onClick={() => { setPeriod(p.key); if (p.key !== "custom") setDateRange({}); }}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                  period === p.key
                    ? "bg-white text-primary shadow-sm"
                    : "text-white/70 hover:text-white hover:bg-white/10"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 bg-white/10 border-white/20 text-white hover:bg-white/20" onClick={handleExportLink} disabled={exporting}>
              {exporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link className="h-3 w-3" />}
              Link Público
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 bg-white/10 border-white/20 text-white hover:bg-white/20 print:hidden" onClick={handleExportPDF}>
              <FileText className="h-3 w-3" />
              PDF
            </Button>
          </div>
        </div>
      </div>

      {/* Filters Row */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Date Range Picker */}
        <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("h-8 text-xs gap-1.5 min-w-[180px] justify-start", period === "custom" && "border-primary")}>
              <CalendarIcon className="h-3.5 w-3.5" />
              {period === "custom" && dateRange.from
                ? `${format(dateRange.from, "dd/MM/yyyy")}${dateRange.to ? ` - ${format(dateRange.to, "dd/MM/yyyy")}` : ""}`
                : "Período personalizado"
              }
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={dateRange.from ? { from: dateRange.from, to: dateRange.to } : undefined}
              onSelect={handleDateRangeSelect}
              numberOfMonths={2}
              className="p-3 pointer-events-auto"
            />
            {period === "custom" && (
              <div className="px-3 pb-3">
                <Button variant="ghost" size="sm" className="text-xs w-full" onClick={clearDateRange}>
                  Limpar período
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>

        <Select value={companyFilter} onValueChange={setCompanyFilter}>
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <SelectValue placeholder="Empresa" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas Empresas</SelectItem>
            {companies.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>

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

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Total Cobrado", value: fmt(totalCharged), icon: DollarSign, bg: "bg-primary/10", color: "text-primary" },
          { label: "Total Pago", value: fmt(totalPaid), icon: CheckCircle, bg: "bg-success/10", color: "text-success" },
          { label: "Em Aberto", value: fmt(openAmount), icon: Clock, bg: "bg-warning/10", color: "text-warning" },
          { label: "Em Atraso", value: fmt(overdueAmount), icon: AlertTriangle, bg: "bg-destructive/10", color: "text-destructive" },
          { label: "Pagos", value: String(confirmed.length), icon: CheckCircle, bg: "bg-success/10", color: "text-success" },
          { label: "Taxa Pgto", value: `${paymentRate}%`, icon: TrendingUp, bg: "bg-primary/10", color: "text-primary" },
        ].map((kpi) => (
          <Card key={kpi.label} className="b24-card">
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2.5 mb-1.5">
                <div className={cn("w-8 h-8 rounded-full flex items-center justify-center", kpi.bg)}>
                  <kpi.icon className={cn("h-4 w-4", kpi.color)} />
                </div>
                <span className="text-[11px] text-muted-foreground">{kpi.label}</span>
              </div>
              <p className="text-lg font-bold text-foreground">{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="b24-card">
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
                  contentStyle={{ backgroundColor: "#fff", border: "1px solid " + gridColor, borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: textColor }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="pago" name="Pago" fill={COLORS_STATUS.confirmed} radius={[4, 4, 0, 0]} />
                <Bar dataKey="pendente" name="Pendente" fill={COLORS_STATUS.pending} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="b24-card">
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
                <RechartsTooltip contentStyle={{ backgroundColor: "#fff", border: "1px solid " + gridColor, borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="b24-card">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm">Por Método de Pagamento</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-3">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={methodData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis type="number" tick={{ fill: textColor, fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: textColor, fontSize: 10 }} width={80} />
                <RechartsTooltip contentStyle={{ backgroundColor: "#fff", border: "1px solid " + gridColor, borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="value" name="Valor" fill="#2fc6f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="b24-card">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm">Top 5 Clientes</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-3">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={clientData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis type="number" tick={{ fill: textColor, fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: textColor, fontSize: 10 }} width={100} />
                <RechartsTooltip contentStyle={{ backgroundColor: "#fff", border: "1px solid " + gridColor, borderRadius: 8, fontSize: 12 }} />
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

      {/* Seller / Responsible Report */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="b24-card">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4" /> Recebimentos por Vendedor
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-3">
            {sellerChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(200, sellerChartData.length * 40)}>
                <BarChart data={sellerChartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                  <XAxis type="number" tick={{ fill: textColor, fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fill: textColor, fontSize: 10 }} width={120} />
                  <RechartsTooltip contentStyle={{ backgroundColor: "#fff", border: "1px solid " + gridColor, borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="pago" name="Pago" fill={COLORS_STATUS.confirmed} stackId="a" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="pendente" name="Pendente" fill={COLORS_STATUS.pending} stackId="a" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground text-sm py-8">Sem dados de vendedor</p>
            )}
          </CardContent>
        </Card>

        <Card className="b24-card">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm">Resumo por Vendedor</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-2">
            <div className="overflow-auto max-h-[300px]">
              <table className="w-full text-xs b24-table">
                <thead className="sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Vendedor</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">Nº Trans.</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">Total</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">Pago</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">Em Aberto</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground">% Pago</th>
                  </tr>
                </thead>
                <tbody>
                  {sellerData.map((s) => (
                    <tr key={s.name} className="border-b border-border hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2 font-medium">{s.name}</td>
                      <td className="px-4 py-2 text-right">{s.count}</td>
                      <td className="px-4 py-2 text-right">{fmt(s.total)}</td>
                      <td className="px-4 py-2 text-right text-success">{fmt(s.paid)}</td>
                      <td className="px-4 py-2 text-right text-warning">{fmt(s.total - s.paid)}</td>
                      <td className="px-4 py-2 text-right font-semibold">{s.total > 0 ? Math.round((s.paid / s.total) * 100) : 0}%</td>
                    </tr>
                  ))}
                  {sellerData.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-6 text-muted-foreground">Sem dados</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Table */}
      <Card className="b24-card">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm">Transações Detalhadas</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          <div className="overflow-auto max-h-[400px]">
            <table className="w-full text-xs b24-table">
              <thead className="sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Data</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Cliente</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Empresa</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Responsável</th>
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
                    confirmed: "bg-success/10 text-success",
                    pending: "bg-warning/10 text-warning",
                    overdue: "bg-destructive/10 text-destructive",
                  };
                  const statusLabel: Record<string, string> = { confirmed: "Pago", pending: "Pendente", overdue: "Atrasado" };
                  return (
                    <tr key={t.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2">{new Date(t.created_at).toLocaleDateString("pt-PT")}</td>
                      <td className="px-4 py-2">{t.clients?.name || "—"}</td>
                      <td className="px-4 py-2">{t.companies?.name || "—"}</td>
                      <td className="px-4 py-2">{(t.metadata as any)?.responsible_name || "—"}</td>
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
                    <td colSpan={9} className="text-center py-8 text-muted-foreground">Sem transações neste período</td>
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
function MapeamentoView({ integrationId, memberId }: { integrationId?: string; memberId?: string }) {
  const FieldMappingManager = lazy(() => import("@/components/bitrix24/FieldMappingManager"));
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
      <FieldMappingManager integrationId={integrationId} memberId={memberId} compact />
    </Suspense>
  );
}

// ==================== BAIXA CARTEIRA VIEW ====================
type EntityType = "lead" | "deal" | "spa";

interface BaixaDeal {
  id: string;
  title: string;
  opportunity: number;
  currency: string;
  stage_id: string;
  stage_name: string;
  contact_id: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  date_create: string;
}

interface BaixaForm {
  totalInstallments: number;
  installmentValue: number;
  paidInstallments: number;
  paidDates: string[];
  nextDueDate: string;
  gateway: string;
  paymentMethod: string;
  notes: string;
}

interface PipelineOption {
  id: string;
  name: string;
}

interface StageOption {
  id: string;
  name: string;
}

const PAYMENT_METHODS = [
  { value: "transferencia", label: "Transferência Bancária" },
  { value: "cartao", label: "Cartão de Crédito/Débito" },
  { value: "mbway", label: "MB Way" },
  { value: "multibanco", label: "Multibanco" },
  { value: "pix", label: "PIX" },
  { value: "boleto", label: "Boleto" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "outro", label: "Outro" },
];

const ENTITY_LABELS: Record<EntityType, string> = {
  lead: "Lead",
  deal: "Negócio (Deal)",
  spa: "SPA (Smart Process)",
};

function countMissingFields(form: BaixaForm | undefined, deal: BaixaDeal): number {
  if (!form) return 5;
  let missing = 0;
  if (!form.totalInstallments || form.totalInstallments < 1) missing++;
  if (!form.installmentValue || form.installmentValue <= 0) missing++;
  if (!form.paymentMethod) missing++;
  if (form.paidInstallments > 0 && form.paidDates.some(d => !d)) missing++;
  if (form.paidInstallments < form.totalInstallments && !form.nextDueDate) missing++;
  return missing;
}

// ==================== PLACEMENT PREVIEW VIEW ====================
function PlacementPreviewView({ integration, memberId }: { integration: any; memberId: string | null }) {
  const [dealId, setDealId] = useState("8857");
  const [memberIdInput, setMemberIdInput] = useState(memberId || integration?.member_id || "");
  const [htmlContent, setHtmlContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadPreview = useCallback(() => {
    const mid = (memberIdInput || memberId || integration?.member_id || "").trim();
    if (!mid) {
      setError("Informe o Member ID da integração para carregar o placement.");
      return;
    }

    setLoading(true);
    setError("");
    setHtmlContent("");

    const url = `${SUPABASE_URL}/functions/v1/bitrix24-payment-tab`;
    const formData = new URLSearchParams();
    formData.append("member_id", mid);
    formData.append("PLACEMENT_OPTIONS", JSON.stringify({ ID: dealId, ENTITY_TYPE_ID: "2" }));

    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      body: formData.toString(),
    })
      .then((r) => r.text())
      .then((html) => {
        // Strip Bitrix24 SDK script (won't work outside Bitrix iframe) and inject a mock
        const bx24Mock = `<script>
          window.BX24 = {
            init: function(cb) { if(cb) cb(); },
            callMethod: function() {},
            fitWindow: function() {},
            resizeWindow: function() {},
            getPlacement: function() { return { options: { ID: "${dealId}" } }; },
            getDomain: function() { return "preview"; }
          };
        </script>`;
        const cleaned = html
          .replace(/<script[^>]*src=["']https:\/\/api\.bitrix24\.com[^"']*["'][^>]*><\/script>/gi, bx24Mock)
          .replace(/<script[^>]*src=["']https:\/\/cdn\.bitrix24\.com[^"']*["'][^>]*><\/script>/gi, "");
        setHtmlContent(cleaned);
      })
      .catch((e) => {
        console.error("[PLACEMENT] Error:", e);
        setError(e.message || "Erro ao carregar");
      })
      .finally(() => setLoading(false));
  }, [dealId, memberIdInput, memberId, integration?.member_id]);

  useEffect(() => {
    const fallbackMid = memberId || integration?.member_id || "";
    if (fallbackMid && !memberIdInput) setMemberIdInput(fallbackMid);
  }, [memberId, integration?.member_id, memberIdInput]);

  useEffect(() => {
    if (memberId || integration?.member_id) loadPreview();
  }, [memberId, integration?.member_id, loadPreview]);

  return (
    <div className="p-6 space-y-4">
      <div className="b24-view-header">
        <h1 className="text-xl font-bold text-white">Placement Preview</h1>
        <p className="text-white/60 text-sm mt-0.5">Pré-visualização do Payment Tab sem abrir o Bitrix24</p>
      </div>

      <Card className="b24-card">
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-center gap-3">
            <Label className="text-sm font-medium shrink-0">Member ID:</Label>
            <Input
              value={memberIdInput}
              onChange={(e) => setMemberIdInput(e.target.value)}
              placeholder="Ex: bea4c89b89c5c33f21450b1a633e6fb1"
              className="min-w-[260px] flex-1"
            />
            <Label className="text-sm font-medium shrink-0">Deal ID:</Label>
            <Input
              value={dealId}
              onChange={(e) => setDealId(e.target.value)}
              placeholder="Ex: 10581"
              className="max-w-[160px]"
            />
            <Button onClick={loadPreview} disabled={loading || !dealId} size="sm">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" strokeWidth={1.5} />}
              Carregar
            </Button>
          </div>
        </CardContent>
      </Card>

      {htmlContent && (
        <Card className="b24-card overflow-hidden">
          <div className="border-b border-border px-4 py-2 flex items-center gap-2 bg-muted/30">
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
            <span className="text-xs text-muted-foreground font-medium">CRM_DEAL_DETAIL_TAB — Deal #{dealId}</span>
          </div>
          <iframe
            srcDoc={htmlContent}
            className="w-full border-0"
            style={{ minHeight: "700px" }}
            sandbox="allow-scripts allow-same-origin"
            title="Payment Tab Preview"
          />
        </Card>
      )}

      {error && (
        <Card className="b24-card">
          <CardContent className="pt-5 text-center text-destructive">
            <p className="text-sm">{error}</p>
          </CardContent>
        </Card>
      )}

      {!htmlContent && !loading && !error && (
        <Card className="b24-card">
          <CardContent className="pt-8 pb-8 text-center text-muted-foreground">
            <CreditCard className="h-10 w-10 mx-auto mb-3 opacity-30" strokeWidth={1.5} />
            <p className="text-sm">Insira um Deal ID e clique em "Carregar" para pré-visualizar o placement</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BaixaCarteiraView({ integration }: { integration: any }) {
  const [loading, setLoading] = useState(false);
  const [deals, setDeals] = useState<BaixaDeal[]>([]);
  const [expandedDeal, setExpandedDeal] = useState<string | null>(null);
  const [forms, setForms] = useState<Record<string, BaixaForm>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [savingBitrix, setSavingBitrix] = useState<string | null>(null);
  const [savedDeals, setSavedDeals] = useState<Set<string>>(new Set());

  // Cascading filters
  const [entityType, setEntityType] = useState<EntityType>("deal");
  const [pipelines, setPipelines] = useState<PipelineOption[]>([]);
  const [pipelineId, setPipelineId] = useState("");
  const [stages, setStages] = useState<StageOption[]>([]);
  const [stageId, setStageId] = useState("");
  const [loadingPipelines, setLoadingPipelines] = useState(false);
  const [loadingStages, setLoadingStages] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  const fetchEntityData = async (act: string, extra: Record<string, string> = {}) => {
    if (!integration?.member_id) return null;
    const params = new URLSearchParams({ member_id: integration.member_id, action: act, entity: entityType, ...extra });
    const res = await fetch(`${SUPABASE_URL}/functions/v1/bitrix24-fetch-entities?${params}`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    return res.json();
  };

  // Auto-load pipelines on mount
  useEffect(() => {
    if (integration?.member_id) {
      handleEntityChange("deal");
    }
  }, [integration?.member_id]);

  // When entity type changes, load pipelines
  const handleEntityChange = async (et: EntityType) => {
    setEntityType(et);
    setPipelineId("");
    setStageId("");
    setStages([]);
    setDeals([]);
    setPipelines([]);

    if (et === "lead") {
      // Leads have no pipelines, load stages directly
      setPipelines([]);
      setLoadingStages(true);
      try {
        const data = await fetchEntityDataWithEntity(et, "stages", {});
        if (data?.stages) setStages(data.stages);
      } catch (e) { console.error(e); }
      setLoadingStages(false);
      return;
    }

    setLoadingPipelines(true);
    try {
      const data = await fetchEntityDataWithEntity(et, "pipelines", {});
      if (data?.pipelines) {
        setPipelines(data.pipelines);
        // If deal has stages returned directly (from lead endpoint)
        if (data.stages) setStages(data.stages);
      }
    } catch (e) { console.error(e); }
    setLoadingPipelines(false);
  };

  const fetchEntityDataWithEntity = async (et: EntityType, act: string, extra: Record<string, string> = {}) => {
    if (!integration?.member_id) return null;
    const params = new URLSearchParams({ member_id: integration.member_id, action: act, entity: et, ...extra });
    const res = await fetch(`${SUPABASE_URL}/functions/v1/bitrix24-fetch-entities?${params}`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    return res.json();
  };

  // When pipeline changes, load stages
  const handlePipelineChange = async (pid: string) => {
    setPipelineId(pid);
    setStageId("");
    setStages([]);
    setDeals([]);

    if (!pid) return;

    setLoadingStages(true);
    try {
      const extra: Record<string, string> = {};
      if (entityType === "deal") extra.category_id = pid;
      if (entityType === "spa") extra.spa_entity_type_id = pid;
      const data = await fetchEntityData("stages", extra);
      if (data?.stages) setStages(data.stages);
    } catch (e) { console.error(e); }
    setLoadingStages(false);
  };

  const fetchItems = async () => {
    if (!integration?.member_id) return;
    setLoading(true);
    try {
      const extra: Record<string, string> = {};
      if (stageId && stageId !== "all") extra.stage_id = stageId;
      if (entityType === "deal" && pipelineId) extra.category_id = pipelineId;
      if (entityType === "spa" && pipelineId) extra.spa_entity_type_id = pipelineId;
      if (dateFrom) extra.date_from = format(dateFrom, "yyyy-MM-dd");
      if (dateTo) extra.date_to = format(dateTo, "yyyy-MM-dd");

      const data = await fetchEntityData("items", extra);
      if (data?.items) {
        setDeals(data.items);
        const newForms: Record<string, BaixaForm> = {};
        for (const d of data.items) {
          newForms[d.id] = {
            totalInstallments: 1,
            installmentValue: d.opportunity,
            paidInstallments: 0,
            paidDates: [],
            nextDueDate: format(new Date(), "yyyy-MM-dd"),
            gateway: "direto",
            paymentMethod: "",
            notes: "",
          };
        }
        setForms(newForms);
      }
    } catch (e) {
      console.error("[BaixaCarteira] Error:", e);
    } finally {
      setLoading(false);
    }
  };

  const updateForm = (dealId: string, updates: Partial<BaixaForm>) => {
    setForms((prev) => {
      const current: BaixaForm = prev[dealId] || {
        totalInstallments: 1,
        installmentValue: 0,
        paidInstallments: 0,
        paidDates: [],
        nextDueDate: format(new Date(), "yyyy-MM-dd"),
        gateway: "direto",
        paymentMethod: "",
        notes: "",
      };
      const updated = { ...current, ...updates };

      // Auto-adjust paidDates array length
      if (updates.paidInstallments !== undefined) {
        const newDates = [...current.paidDates];
        while (newDates.length < updates.paidInstallments) {
          newDates.push(format(new Date(), "yyyy-MM-dd"));
        }
        while (newDates.length > updates.paidInstallments) {
          newDates.pop();
        }
        updated.paidDates = newDates;
      }

      return { ...prev, [dealId]: updated };
    });
  };

  const updatePaidDate = (dealId: string, index: number, date: string) => {
    setForms((prev) => {
      const current = prev[dealId];
      if (!current) return prev;
      const newDates = [...current.paidDates];
      newDates[index] = date;
      return { ...prev, [dealId]: { ...current, paidDates: newDates } };
    });
  };

  const handleSaveToBitrix = async (deal: BaixaDeal) => {
    const form = forms[deal.id];
    if (!form || !integration?.member_id) return;

    setSavingBitrix(deal.id);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/bitrix24-update-deal-payment`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          member_id: integration.member_id,
          deal_id: deal.id,
          entity_type: entityType,
          spa_entity_type_id: entityType === "spa" ? pipelineId : undefined,
          payment_data: {
            total_installments: form.totalInstallments,
            installment_value: form.installmentValue,
            paid_installments: form.paidInstallments,
            paid_dates: form.paidDates,
            next_due_date: form.nextDueDate,
            payment_method: form.paymentMethod,
            gateway: form.gateway,
            notes: form.notes,
          },
        }),
      });

      const data = await res.json();
      if (data.success) {
        console.log("[BaixaCarteira] Saved to Bitrix24:", data);
      } else {
        console.error("[BaixaCarteira] Bitrix24 save error:", data);
      }
    } catch (e) {
      console.error("[BaixaCarteira] Save to Bitrix24 error:", e);
    } finally {
      setSavingBitrix(null);
    }
  };

  const handleImport = async (deal: BaixaDeal) => {
    const form = forms[deal.id];
    if (!form) return;

    setSaving(deal.id);
    try {
      // 1. Find or create client
      let clientId: string | null = null;
      if (deal.contact_phone || deal.contact_email) {
        // Check if client exists
        let query = `${SUPABASE_URL}/rest/v1/clients?select=id`;
        if (deal.contact_phone) {
          query += `&or=(phone.eq.${encodeURIComponent(deal.contact_phone)},mobile.eq.${encodeURIComponent(deal.contact_phone)})`;
        }
        const clientRes = await fetch(query, {
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        });
        const existingClients = await clientRes.json();
        
        if (existingClients && existingClients.length > 0) {
          clientId = existingClients[0].id;
        } else if (deal.contact_name) {
          // Create new client
          const createRes = await fetch(`${SUPABASE_URL}/rest/v1/clients`, {
            method: "POST",
            headers: {
              apikey: SUPABASE_KEY,
              Authorization: `Bearer ${SUPABASE_KEY}`,
              "Content-Type": "application/json",
              Prefer: "return=representation",
            },
            body: JSON.stringify({
              name: deal.contact_name,
              notes: `Importado do Bitrix24 Deal ${deal.id}`,
            }),
          });
          const newClients = await createRes.json();
          if (newClients && newClients.length > 0) {
            clientId = newClients[0].id;

            // Create contact
            if (deal.contact_phone || deal.contact_email) {
              await fetch(`${SUPABASE_URL}/rest/v1/client_contacts`, {
                method: "POST",
                headers: {
                  apikey: SUPABASE_KEY,
                  Authorization: `Bearer ${SUPABASE_KEY}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  client_id: clientId,
                  name: deal.contact_name,
                  phone: deal.contact_phone,
                  email: deal.contact_email,
                }),
              });
            }
          }
        }
      }

      const groupId = crypto.randomUUID();

      // 2. Create confirmed transactions for paid installments
      for (let i = 0; i < form.paidInstallments; i++) {
        const paidDate = form.paidDates[i] || format(new Date(), "yyyy-MM-dd");
        await fetch(`${SUPABASE_URL}/rest/v1/payment_transactions`, {
          method: "POST",
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amount: form.installmentValue,
            currency: deal.currency || "EUR",
            status: "confirmed",
            gateway: "direto",
            payment_method: "historico",
            client_id: clientId,
            metadata: {
              bitrix_deal_id: deal.id,
              bitrix_contact_id: deal.contact_id,
              installment_number: i + 1,
              total_installments: form.totalInstallments,
              installment_group_id: groupId,
              imported: true,
              original_paid_date: paidDate,
              customer_name: deal.contact_name,
              customer_phone: deal.contact_phone,
            },
          }),
        });
      }

      // 3. Create pending transactions for remaining installments
      const pendingCount = form.totalInstallments - form.paidInstallments;
      const baseDate = form.nextDueDate ? new Date(form.nextDueDate) : new Date();

      for (let i = 0; i < pendingCount; i++) {
        const dueDate = new Date(baseDate);
        dueDate.setDate(dueDate.getDate() + 30 * i);

        await fetch(`${SUPABASE_URL}/rest/v1/payment_transactions`, {
          method: "POST",
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amount: form.installmentValue,
            currency: deal.currency || "EUR",
            status: "pending",
            gateway: form.gateway,
            payment_method: form.gateway === "direto" ? "parcelado_direto" : "card",
            client_id: clientId,
            metadata: {
              bitrix_deal_id: deal.id,
              bitrix_contact_id: deal.contact_id,
              installment_number: form.paidInstallments + i + 1,
              total_installments: form.totalInstallments,
              installment_group_id: groupId,
              imported: true,
              due_date: format(dueDate, "yyyy-MM-dd"),
              customer_name: deal.contact_name,
              customer_phone: deal.contact_phone,
            },
          }),
        });
      }

      setSavedDeals((prev) => new Set(prev).add(deal.id));
      setExpandedDeal(null);
    } catch (e) {
      console.error("[BaixaCarteira] Import error:", e);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="b24-view-header">
        <h1 className="text-xl font-bold text-white">Baixa Carteira</h1>
        <p className="text-white/60 text-sm mt-0.5">Importar pagamentos manuais do Bitrix24</p>
      </div>

      {/* Filters */}
      <Card className="b24-card">
        <CardContent className="pt-5 space-y-4">
          {/* Row 1: Entity Type + Pipeline + Stage */}
          <div className="flex flex-wrap gap-4 items-end">
            <div className="w-[180px]">
              <Label className="text-xs text-muted-foreground">Tipo de Entidade</Label>
              <Select value={entityType} onValueChange={(v) => handleEntityChange(v as EntityType)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lead">Lead</SelectItem>
                  <SelectItem value="deal">Negócio (Deal)</SelectItem>
                  <SelectItem value="spa">SPA (Smart Process)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {entityType !== "lead" && (
              <div className="w-[200px]">
                <Label className="text-xs text-muted-foreground">
                  {entityType === "deal" ? "Pipeline / Categoria" : "Tipo SPA"}
                </Label>
                <Select value={pipelineId} onValueChange={handlePipelineChange} disabled={loadingPipelines}>
                  <SelectTrigger className="h-9">
                    {loadingPipelines ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <SelectValue placeholder="Selecionar..." />
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    {pipelines.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="w-[200px]">
              <Label className="text-xs text-muted-foreground">Etapa</Label>
              <Select value={stageId} onValueChange={setStageId} disabled={loadingStages || (entityType !== "lead" && !pipelineId)}>
                <SelectTrigger className="h-9">
                  {loadingStages ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <SelectValue placeholder="Todas as etapas" />
                  )}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as etapas</SelectItem>
                  {stages.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 2: Date filters + Search */}
          <div className="flex flex-wrap gap-4 items-end">
            <div className="w-[140px]">
              <Label className="text-xs text-muted-foreground">Data Início</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full h-9 justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "Selecionar"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
            <div className="w-[140px]">
              <Label className="text-xs text-muted-foreground">Data Fim</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full h-9 justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateTo ? format(dateTo, "dd/MM/yyyy") : "Selecionar"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
            <Button onClick={fetchItems} disabled={loading} className="h-9">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Buscar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Items List */}
      <Card className="b24-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{ENTITY_LABELS[entityType]} Encontrados ({deals.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {deals.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {loading ? "Carregando..." : "Nenhum negócio encontrado. Use os filtros acima."}
            </div>
          ) : (
            <div className="space-y-3">
              {deals.map((deal) => {
                const form = forms[deal.id];
                const isExpanded = expandedDeal === deal.id;
                const isSaved = savedDeals.has(deal.id);
                const missingCount = countMissingFields(form, deal);

                return (
                  <div key={deal.id} className={cn(
                    "border rounded-lg transition-colors",
                    isSaved && "border-success/50 bg-success/5",
                    !isSaved && missingCount > 0 && "border-warning/50"
                  )}>
                    {/* Deal Header */}
                    <div
                      className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50"
                      onClick={() => setExpandedDeal(isExpanded ? null : deal.id)}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{deal.title}</span>
                          <Badge variant="outline" className="text-[10px]">ID: {deal.id}</Badge>
                          {isSaved && <Badge className="bg-success text-success-foreground text-[10px]">Importado</Badge>}
                          {!isSaved && missingCount > 0 && (
                            <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/30 gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              {missingCount} campo{missingCount > 1 ? "s" : ""} faltante{missingCount > 1 ? "s" : ""}
                            </Badge>
                          )}
                          {!isSaved && missingCount === 0 && (
                            <Badge className="bg-success/20 text-success text-[10px] border-0">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Completo
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                          <span className="font-semibold text-foreground">
                            {new Intl.NumberFormat("pt-PT", { style: "currency", currency: deal.currency || "EUR" }).format(deal.opportunity)}
                          </span>
                          <span>Etapa: {deal.stage_name}</span>
                          {deal.contact_name && <span>Contacto: {deal.contact_name}</span>}
                        </div>
                      </div>
                      <ChevronRight className={cn("h-5 w-5 transition-transform", isExpanded && "rotate-90")} />
                    </div>

                    {/* Expanded Form */}
                    {isExpanded && form && (
                      <div className="border-t p-4 bg-muted/30 space-y-4">
                        {/* Contact Info */}
                        {deal.contact_name && (
                          <div className="flex items-center gap-4 text-sm">
                            <span className="text-muted-foreground">Cliente:</span>
                            <span className="font-medium">{deal.contact_name}</span>
                            {deal.contact_phone && <span className="text-muted-foreground">{deal.contact_phone}</span>}
                            {deal.contact_email && <span className="text-muted-foreground">{deal.contact_email}</span>}
                          </div>
                        )}

                        {/* Form Fields Row 1 */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                          <div>
                            <Label className={cn("text-xs flex items-center gap-1", (!form.totalInstallments || form.totalInstallments < 1) && "text-warning")}>
                              {(!form.totalInstallments || form.totalInstallments < 1) && <AlertTriangle className="h-3 w-3" />}
                              Parcelas Totais
                            </Label>
                            <Input
                              type="number"
                              min={1}
                              value={form.totalInstallments}
                              onChange={(e) => updateForm(deal.id, { totalInstallments: parseInt(e.target.value) || 1 })}
                              className={cn("h-9", (!form.totalInstallments || form.totalInstallments < 1) && "border-warning bg-warning/5")}
                            />
                          </div>
                          <div>
                            <Label className={cn("text-xs flex items-center gap-1", (!form.installmentValue || form.installmentValue <= 0) && "text-warning")}>
                              {(!form.installmentValue || form.installmentValue <= 0) && <AlertTriangle className="h-3 w-3" />}
                              Valor Parcela
                            </Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={form.installmentValue}
                              onChange={(e) => updateForm(deal.id, { installmentValue: parseFloat(e.target.value) || 0 })}
                              className={cn("h-9", (!form.installmentValue || form.installmentValue <= 0) && "border-warning bg-warning/5")}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Parcelas Pagas</Label>
                            <Input
                              type="number"
                              min={0}
                              max={form.totalInstallments}
                              value={form.paidInstallments}
                              onChange={(e) => updateForm(deal.id, { paidInstallments: Math.min(parseInt(e.target.value) || 0, form.totalInstallments) })}
                              className="h-9"
                            />
                          </div>
                          <div>
                            <Label className={cn("text-xs flex items-center gap-1", !form.paymentMethod && "text-warning")}>
                              {!form.paymentMethod && <AlertTriangle className="h-3 w-3" />}
                              Método de Pagamento
                            </Label>
                            <Select value={form.paymentMethod} onValueChange={(v) => updateForm(deal.id, { paymentMethod: v })}>
                              <SelectTrigger className={cn("h-9", !form.paymentMethod && "border-warning bg-warning/5")}>
                                <SelectValue placeholder="Selecionar..." />
                              </SelectTrigger>
                              <SelectContent>
                                {PAYMENT_METHODS.map((m) => (
                                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {/* Form Fields Row 2 */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                          <div>
                            <Label className="text-xs">Gateway Futuro</Label>
                            <Select value={form.gateway} onValueChange={(v) => updateForm(deal.id, { gateway: v })}>
                              <SelectTrigger className="h-9">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="direto">Manual (Direto)</SelectItem>
                                <SelectItem value="stripe_pt">Stripe PT</SelectItem>
                                <SelectItem value="stripe_br">Stripe BR</SelectItem>
                                <SelectItem value="asaas">Asaas</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-3">
                            <Label className="text-xs">Notas / Observações</Label>
                            <Input
                              value={form.notes}
                              onChange={(e) => updateForm(deal.id, { notes: e.target.value })}
                              placeholder="Observações sobre este cliente..."
                              className="h-9"
                            />
                          </div>
                        </div>

                        {/* Paid Dates */}
                        {form.paidInstallments > 0 && (
                          <div>
                            <Label className="text-xs mb-2 block flex items-center gap-1">
                              {form.paidDates.some(d => !d) && <AlertTriangle className="h-3 w-3 text-warning" />}
                              Datas dos Pagamentos Recebidos
                            </Label>
                            <div className="flex flex-wrap gap-2">
                              {form.paidDates.map((date, idx) => (
                                <div key={idx} className="flex items-center gap-1">
                                  <span className="text-xs text-muted-foreground">[{idx + 1}]</span>
                                  <Input
                                    type="date"
                                    value={date}
                                    onChange={(e) => updatePaidDate(deal.id, idx, e.target.value)}
                                    className={cn("h-8 w-[140px]", !date && "border-warning bg-warning/5")}
                                  />
                                  {date && <CheckCircle className="h-3 w-3 text-success" />}
                                  {!date && <AlertTriangle className="h-3 w-3 text-warning" />}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Next Due Date */}
                        {form.paidInstallments < form.totalInstallments && (
                          <div className="flex items-center gap-4">
                            <div className="w-[180px]">
                              <Label className={cn("text-xs flex items-center gap-1", !form.nextDueDate && "text-warning")}>
                                {!form.nextDueDate && <AlertTriangle className="h-3 w-3" />}
                                Próximo Vencimento
                              </Label>
                              <Input
                                type="date"
                                value={form.nextDueDate}
                                onChange={(e) => updateForm(deal.id, { nextDueDate: e.target.value })}
                                className={cn("h-9", !form.nextDueDate && "border-warning bg-warning/5")}
                              />
                            </div>
                            <div className="text-sm text-muted-foreground pt-5">
                              {form.totalInstallments - form.paidInstallments} parcela(s) pendente(s)
                            </div>
                          </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex justify-end gap-2 pt-2">
                          <Button
                            variant="outline"
                            onClick={() => handleSaveToBitrix(deal)}
                            disabled={savingBitrix === deal.id}
                            className="gap-2"
                          >
                            {savingBitrix === deal.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Save className="h-4 w-4" />
                            )}
                            Salvar no Bitrix24
                          </Button>
                          <Button
                            onClick={() => handleImport(deal)}
                            disabled={saving === deal.id || isSaved}
                            className="gap-2"
                          >
                            {saving === deal.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle className="h-4 w-4" />
                            )}
                            {isSaved ? "Já Importado" : "Importar e Dar Baixa"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default Bitrix24App;
