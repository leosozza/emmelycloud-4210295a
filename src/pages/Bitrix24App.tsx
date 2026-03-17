import { useEffect, useState, useCallback, useRef, lazy, Suspense, useMemo, Fragment } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { calculateLateFees } from "@/lib/lateFeeCalc";
import { supabase } from "@/integrations/supabase/client";
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
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChatBubble, ChatBubbleAvatar, ChatBubbleMessage, ChatBubbleAction, ChatBubbleActionWrapper } from "@/components/ui/chat-bubble";
import { ChatInput } from "@/components/ui/chat-input";
import { ChatMessageList } from "@/components/ui/chat-message-list";
import { Copy, Ban } from "lucide-react";
import type { AIAgent, AIProvider, FlowOption, DocOption, CollectionOption } from "@/pages/Agentes";
import { defaultAgent } from "@/pages/Agentes";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const customNodeTypes = { custom: CustomFlowNode };

type AppView = "loading" | "dashboard" | "agentes" | "training" | "flows" | "playground" | "chatia" | "pagamentos" | "relatorios" | "mapeamento" | "empresas" | "baixa" | "placement" | "importacao" | "carteira" | "configuracoes";

// ==================== MAIN COMPONENT ====================
const Bitrix24App = () => {
  const { isDark } = useBitrix24Theme();
  const navigate = useNavigate();
  const location = useLocation();
  const [initialLoading, setInitialLoading] = useState(true);
  const [memberId, setMemberId] = useState<string | null>(null);

  // Derive view from URL path
  const view: AppView = useMemo(() => {
    if (initialLoading) return "loading";
    const sub = location.pathname.replace(/^\/bitrix24\/?/, "").split("/")[0];
    if (!sub || sub === "") return "dashboard";
    const validViews: AppView[] = ["dashboard", "agentes", "training", "flows", "playground", "chatia", "pagamentos", "relatorios", "mapeamento", "empresas", "baixa", "placement", "importacao", "carteira", "configuracoes"];
    return validViews.includes(sub as AppView) ? (sub as AppView) : "dashboard";
  }, [location.pathname, initialLoading]);

  const setView = useCallback((v: AppView) => {
    if (v === "loading") return;
    navigate(`/bitrix24/${v === "dashboard" ? "" : v}`, { replace: false });
  }, [navigate]);
  const [domain, setDomain] = useState<string | null>(null);
  const [integration, setIntegration] = useState<any | null>(null);
  const [botId, setBotId] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [cachedPortfolio, setCachedPortfolio] = useState<any>(null);

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
            }
            fetchData(mid || "");
          });
        } else {
          const mid = midParam || domainParam;
          if (mid) setMemberId(mid);
          fetchData(mid || "");
        }
      } catch {
        fetchData("");
      }
    };
    script.onerror = () => {
      const mid = midParam || domainParam;
      if (mid) setMemberId(mid);
      fetchData(mid || "");
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
      setInitialLoading(false);
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
        { id: "carteira", label: "Carteira", icon: Users },
        { id: "baixa", label: "Baixa Carteira", icon: FileDown },
        { id: "importacao", label: "Importação", icon: Upload },
        { id: "placement", label: "Placement", icon: ExternalLink },
        { id: "empresas", label: "Empresas", icon: Building2 },
        { id: "relatorios", label: "Relatórios", icon: BarChart3 },
      ],
    },
    {
      label: "Sistema",
      items: [
        { id: "configuracoes", label: "Configurações", icon: Settings },
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
            onCachePortfolio={setCachedPortfolio}
          />
        )}
        {view === "agentes" && <AgentesView botId={botId} integrationId={integration?.id} />}
        {view === "training" && <TrainingView />}
        {view === "flows" && <FlowsView />}
        {view === "playground" && <PlaygroundView />}
        {view === "chatia" && <ChatIABitrixView />}
        {view === "mapeamento" && <MapeamentoView integrationId={integration?.id} memberId={memberId || integration?.member_id || undefined} />}
        {view === "pagamentos" && <PagamentosView integration={integration} onRefresh={() => memberId && fetchData(memberId)} />}
        {view === "baixa" && <BaixaCarteiraView integration={integration} />}
        {view === "placement" && <PlacementPreviewView integration={integration} memberId={memberId} />}
        {view === "empresas" && <EmpresasView />}
        {view === "relatorios" && <RelatoriosView memberId={memberId || integration?.member_id || undefined} />}
        {view === "importacao" && <ImportacaoAccessView integration={integration} memberId={memberId} />}
        {view === "carteira" && <CarteiraAccessView integration={integration} memberId={memberId} cachedPortfolio={cachedPortfolio} />}
        {view === "configuracoes" && (
          <ConfigView
            integration={integration}
            botId={botId}
            domain={domain}
            loading={loadingData}
            onResync={handleResync}
            onRefresh={() => memberId && fetchData(memberId)}
          />
        )}
      </main>
    </div>
  );
};

// ==================== PERIOD HELPERS ====================
const PERIOD_PRESETS = [
  { label: "Hoje", days: 0 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "Mês", days: 0 },
  { label: "Trim", days: 90 },
  { label: "Ano", days: 0 },
  { label: "Tudo", days: 0 },
];
function getDateRange(preset: string, selectedMonth?: number, selectedYear?: number): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  if (preset === "Hoje") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    return { start, end };
  }
  if (preset === "Tudo") {
    return { start: new Date(2020, 0, 1), end };
  }
  if (preset === "Mês") {
    const m = selectedMonth ?? now.getMonth();
    const y = selectedYear ?? now.getFullYear();
    return { start: new Date(y, m, 1), end: new Date(y, m + 1, 0, 23, 59, 59) };
  }
  if (preset === "Ano") {
    const y = selectedYear ?? now.getFullYear();
    return { start: new Date(y, 0, 1), end: new Date(y, 11, 31, 23, 59, 59) };
  }
  const p = PERIOD_PRESETS.find((pp) => pp.label === preset);
  const days = p?.days || 30;
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

// ==================== DASHBOARD VIEW (NEW) ====================
function DashboardView({ integration, botId, domain, onCachePortfolio }: {
  integration: any;
  botId: string | null;
  domain: string | null;
  loading: boolean;
  onResync: () => void;
  onRefresh: () => void;
  onCachePortfolio?: (data: any) => void;
}) {
  const [period, setPeriod] = useState("30d");
  const [customStart, setCustomStart] = useState<Date | undefined>(undefined);
  const [customEnd, setCustomEnd] = useState<Date | undefined>(undefined);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);

  const dateRange = useMemo(() => {
    if (customStart && customEnd) return { start: customStart, end: customEnd };
    return getDateRange(period, selectedMonth, selectedYear);
  }, [period, customStart, customEnd, selectedMonth, selectedYear]);

  const startISO = dateRange.start.toISOString();
  const endISO = dateRange.end.toISOString();

  const [stats, setStats] = useState({ conversations: 0, messagesToday: 0, revenueReceived: 0, revenuePending: 0, clientsCount: 0, messagesInPeriod: 0 });
  const [messagesChart, setMessagesChart] = useState<{ day: string; count: number }[]>([]);
  const [paymentChart, setPaymentChart] = useState<{ status: string; amount: number }[]>([]);
  const [recentConversations, setRecentConversations] = useState<any[]>([]);
  const [recentPayments, setRecentPayments] = useState<any[]>([]);
  const [ranking, setRanking] = useState<{ name: string; count: number; total: number }[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    const headers: Record<string, string> = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };

    const fetchAll = async () => {
      setLoadingStats(true);
      try {
        const mid = integration?.member_id;
        const memberParam = mid ? `?member_id=${encodeURIComponent(mid)}` : "";

        // Fetch portfolio (already uses service_role internally) and dashboard stats in parallel
        const [portfolioRes, dashRes] = await Promise.all([
          fetch(`${SUPABASE_URL}/functions/v1/bitrix24-fetch-portfolio${memberParam}`, { headers }).then(r => r.json()),
          fetch(`${SUPABASE_URL}/functions/v1/bitrix24-dashboard-stats?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}`, { headers }).then(r => r.json()),
        ]);

        onCachePortfolio?.(portfolioRes);
        const clientsTotal = portfolioRes?.meta?.clientCount ?? (Array.isArray(portfolioRes?.clients) ? portfolioRes.clients.length : 0);

        setStats({
          conversations: dashRes.conversations || 0,
          messagesToday: dashRes.messagesToday || 0,
          revenueReceived: dashRes.revenueReceived || 0,
          revenuePending: (dashRes.revenuePending || 0) + (dashRes.revenueOverdue || 0),
          clientsCount: clientsTotal,
          messagesInPeriod: dashRes.messagesToday || 0,
        });
        setRecentConversations(dashRes.recentConversations || []);
        setRecentPayments(dashRes.recentPayments || []);
        setMessagesChart(dashRes.messagesChart || []);
        setPaymentChart(dashRes.paymentChart || []);
        setRanking((dashRes.ranking || []).map((r: any) => ({ name: r.name, count: r.count, total: r.total })));
      } catch (e) {
        console.error("[DASHBOARD] Error:", e);
      } finally {
        setLoadingStats(false);
      }
    };
    fetchAll();
  }, [startISO, endISO]);

  const fmtCur = (v: number) => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(v);
  const BAR_COLORS = ["#22c55e", "#eab308", "#ef4444"];
  const MEDALS = ["🥇", "🥈", "🥉"];

  const handlePreset = (label: string) => {
    setCustomStart(undefined);
    setCustomEnd(undefined);
    setShowMonthPicker(false);
    setShowYearPicker(false);
    if (label === "Mês") {
      setPeriod(label);
      setShowMonthPicker(true);
    } else if (label === "Ano") {
      setPeriod(label);
      setShowYearPicker(true);
    } else {
      setPeriod(label);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="b24-view-header">
        <div className="flex items-center justify-between w-full">
          <div>
            <h1 className="text-xl font-bold text-white">Dashboard</h1>
            <p className="text-white/60 text-sm mt-0.5">Portal: {domain || integration?.domain || "—"}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className={cn("w-2 h-2 rounded-full", integration ? "bg-success" : "bg-destructive")} />
              <span className="text-white/70 text-xs">{integration ? "Conectado" : "Offline"}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className={cn("w-2 h-2 rounded-full", botId ? "bg-success" : "bg-warning")} />
              <span className="text-white/70 text-xs">{botId ? "Bot OK" : "Sem Bot"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Period Filter Bar */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex flex-wrap items-center gap-2">
            {PERIOD_PRESETS.map((p) => (
              <Button
                key={p.label}
                variant={period === p.label && !customStart ? "default" : "outline"}
                size="sm"
                className="text-xs h-7"
                onClick={() => handlePreset(p.label)}
              >
                {p.label}
              </Button>
            ))}

            {/* Month Picker */}
            {showMonthPicker && period === "Mês" && (
              <>
                <div className="h-5 w-px bg-border mx-1" />
                <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
                  <SelectTrigger className="h-7 w-[110px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"].map((m, i) => (
                      <SelectItem key={i} value={String(i)} className="text-xs">{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
                  <SelectTrigger className="h-7 w-[80px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                      <SelectItem key={y} value={String(y)} className="text-xs">{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}

            {/* Year Picker */}
            {showYearPicker && period === "Ano" && (
              <>
                <div className="h-5 w-px bg-border mx-1" />
                <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
                  <SelectTrigger className="h-7 w-[80px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                      <SelectItem key={y} value={String(y)} className="text-xs">{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}

            <div className="h-5 w-px bg-border mx-1" />
            <Popover>
              <PopoverTrigger asChild>
                <Button variant={customStart ? "default" : "outline"} size="sm" className="text-xs h-7 gap-1">
                  <CalendarIcon className="h-3 w-3" />
                  {customStart ? format(customStart, "dd/MM/yy") : "Início"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={customStart} onSelect={(d) => { setCustomStart(d || undefined); setShowMonthPicker(false); setShowYearPicker(false); if (d && !customEnd) setCustomEnd(new Date()); }} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
            <span className="text-xs text-muted-foreground">—</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant={customEnd ? "default" : "outline"} size="sm" className="text-xs h-7 gap-1">
                  <CalendarIcon className="h-3 w-3" />
                  {customEnd ? format(customEnd, "dd/MM/yy") : "Fim"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={customEnd} onSelect={(d) => { setCustomEnd(d || undefined); }} className="p-3 pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards — 6 columns */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { title: "Clientes na Carteira", value: String(stats.clientsCount), icon: Users, accent: "border-l-primary" },
          { title: "Cobranças Recebidas", value: fmtCur(stats.revenueReceived), icon: ArrowDownLeft, accent: "border-l-success" },
          { title: "Cobranças a Receber", value: fmtCur(stats.revenuePending), icon: ArrowUpRight, accent: "border-l-warning" },
          { title: "Receita Total", value: fmtCur(stats.revenueReceived + stats.revenuePending), icon: DollarSign, accent: "border-l-success" },
          { title: "Conversas Activas", value: String(stats.conversations), icon: MessageSquare, accent: "border-l-primary" },
          { title: "Mensagens Hoje", value: String(stats.messagesToday), icon: Zap, accent: "border-l-warning" },
        ].map((kpi) => (
          <Card key={kpi.title} className={cn("border-l-4 hover:shadow-md transition-shadow", kpi.accent)}>
            <CardContent className="pt-4 pb-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-primary/10 mb-2">
                <kpi.icon className="h-4 w-4 text-primary" strokeWidth={1.5} />
              </div>
              <div className="text-lg font-extrabold text-foreground leading-tight">
                {loadingStats ? <div className="h-6 w-14 bg-muted animate-pulse rounded" /> : kpi.value}
              </div>
              <p className="text-[10px] font-medium text-muted-foreground mt-0.5">{kpi.title}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <Sparkles className="h-4 w-4 text-primary" /> Emmely AI — Mensagens (7 dias)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingStats ? (
              <div className="h-48 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={messagesChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <RechartsTooltip />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Mensagens" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <CreditCard className="h-4 w-4 text-primary" /> EmmelyPay — Receita por Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingStats ? (
              <div className="h-48 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={paymentChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="status" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `€${v}`} />
                  <RechartsTooltip formatter={(value: number) => fmtCur(value)} />
                  <Bar dataKey="amount" name="Valor" radius={[4, 4, 0, 0]}>
                    {paymentChart.map((_, i) => (
                      <Cell key={i} fill={BAR_COLORS[i]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Ranking */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
            <TrendingUp className="h-4 w-4 text-primary" /> Ranking de Negócios Fechados
          </CardTitle>
          <CardDescription className="text-xs">Propostas aceitas no período seleccionado</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingStats ? (
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-10 bg-muted animate-pulse rounded" />)}</div>
          ) : ranking.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">Nenhuma proposta aceita no período</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead className="text-right">Propostas</TableHead>
                  <TableHead className="text-right">Valor Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ranking.map((r, i) => (
                  <TableRow key={i} className={i < 3 ? "bg-primary/5" : ""}>
                    <TableCell className="font-bold text-lg">{MEDALS[i] || `#${i + 1}`}</TableCell>
                    <TableCell className="font-medium text-foreground">{r.name}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{r.count}</TableCell>
                    <TableCell className="text-right font-semibold text-foreground">{fmtCur(r.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Recent lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground">Últimas Conversas</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingStats ? (
              <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-10 bg-muted animate-pulse rounded" />)}</div>
            ) : recentConversations.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">Nenhuma conversa encontrada</p>
            ) : (
              <div className="space-y-2">
                {recentConversations.map((conv) => (
                  <div key={conv.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2 min-w-0">
                      <MessageSquare className="h-4 w-4 text-primary shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate text-foreground">{conv.contact_name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{conv.last_message_preview || conv.channel}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0">{conv.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground">Últimos Pagamentos</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingStats ? (
              <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-10 bg-muted animate-pulse rounded" />)}</div>
            ) : recentPayments.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">Nenhum pagamento encontrado</p>
            ) : (
              <div className="space-y-2">
                {recentPayments.map((pay) => (
                  <div key={pay.id} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-primary shrink-0" />
                      <div>
                        <p className="text-xs font-medium text-foreground">{fmtCur(Number(pay.amount))}</p>
                        <p className="text-[10px] text-muted-foreground">{pay.gateway} • {new Date(pay.created_at).toLocaleDateString("pt-PT")}</p>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn("text-[10px]",
                        pay.status === "confirmed" || pay.status === "paid" ? "text-success border-success/30" :
                        pay.status === "pending" ? "text-warning border-warning/30" : "text-destructive border-destructive/30"
                      )}
                    >
                      {pay.status === "confirmed" || pay.status === "paid" ? "Pago" : pay.status === "pending" ? "Pendente" : pay.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ==================== CONFIG VIEW (old dashboard content) ====================
function ConfigView({ integration, botId, domain, loading, onResync, onRefresh }: {
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
      const res = await fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
      const data = await res.json();
      if (data.success) {
        const ok = Object.values(data.results || {}).filter((v) => v === "OK").length;
        const total = Object.keys(data.results || {}).length;
        setRebindResult(`${ok}/${total} eventos re-registados com sucesso!`);
      } else {
        setRebindResult(`Erro: ${data.error || "Falha desconhecida"}`);
      }
    } catch (e) { setRebindResult(`Erro de rede: ${e}`); }
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
        body: JSON.stringify({ conversation_id: targetId, member_id: integration?.member_id }),
      });
      const data = await res.json();
      if (data.success || res.ok) {
        setReturnToBotResult(`Conversa devolvida ao bot com sucesso!`);
        setReturnToBotDialogId("");
        fetch(`${SUPABASE_URL}/rest/v1/conversations?select=id,contact_name,contact_phone,channel,attendance_mode&status=in.(aberta,em_atendimento,aguardando)&order=last_message_at.desc&limit=20`, {
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        }).then(r => r.json()).then(setOpenConversations).catch(console.error);
      } else {
        setReturnToBotResult(`Erro: ${data.error || JSON.stringify(data)}`);
      }
    } catch (e) { setReturnToBotResult(`Erro de rede: ${e}`); }
    setReturningToBot(false);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="b24-view-header">
        <h1 className="text-xl font-bold text-white">Configurações</h1>
        <p className="text-white/60 text-sm mt-0.5">Integração e bot — Portal: {domain || integration?.domain || "—"}</p>
      </div>

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

      <Card className="b24-card">
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
            <Bot className="h-4 w-4 text-primary" /> Agente do Canal Aberto
          </CardTitle>
          <CardDescription>Selecione qual agente IA responde automaticamente no Open Channel</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select value={selectedAgent} onValueChange={setSelectedAgent}>
            <SelectTrigger className="rounded-md"><SelectValue placeholder="Selecionar agente..." /></SelectTrigger>
            <SelectContent>
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name} {a.is_default ? "(padrão)" : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleSaveAgent} disabled={savingAgent || selectedAgent === (integration?.bitrix_agent_id || "")} className="w-full rounded-md" size="sm">
            {savingAgent ? <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />Salvando...</> : <><Save className="h-3.5 w-3.5 mr-2" />Salvar Agente</>}
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <Button
          onClick={async () => {
            setReregisteringBot(true);
            setReregisterBotResult(null);
            try {
              const auth = (window as any).BX24?.getAuth?.();
              if (!auth && !integration?.member_id) { setReregisterBotResult("Sem sessão BX24 disponível."); return; }
              const res = await fetch(`${SUPABASE_URL}/functions/v1/bitrix24-install`, {
                method: "POST",
                headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
                body: JSON.stringify({
                  auth: auth ? { access_token: auth.access_token, refresh_token: auth.refresh_token, member_id: auth.member_id, domain: auth.domain, client_endpoint: auth.client_endpoint, expires_in: String(auth.expires || 3600) }
                    : { member_id: integration?.member_id, access_token: integration?.access_token, refresh_token: integration?.refresh_token, client_endpoint: integration?.client_endpoint, domain: integration?.domain, expires_in: "3600" },
                }),
              });
              const data = await res.json();
              if (data.success || res.ok) { setReregisterBotResult("Bot re-registado com sucesso!"); if (integration?.member_id) setTimeout(() => onRefresh(), 1500); }
              else { setReregisterBotResult(`Erro: ${data.error || res.status}`); }
            } catch (e) { setReregisterBotResult(`Erro de rede: ${e}`); }
            finally { setReregisteringBot(false); }
          }}
          disabled={reregisteringBot} className="w-full rounded-md"
        >
          {reregisteringBot ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Re-registando Bot...</> : <><Bot className="h-4 w-4 mr-2" />Re-registar Bot</>}
        </Button>
        {reregisterBotResult && (
          <div className={cn("text-xs text-center px-3 py-2 rounded-lg flex items-center justify-center gap-1.5", reregisterBotResult.includes("Erro") ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success")}>
            {reregisterBotResult.includes("Erro") ? <XCircle className="h-3 w-3" /> : <CheckCircle className="h-3 w-3" />}
            {reregisterBotResult}
          </div>
        )}
        <Button onClick={handleRebindEvents} disabled={rebinding} className="w-full rounded-md" variant="outline">
          {rebinding ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Registando webhooks...</> : <><Zap className="h-4 w-4 mr-2" />Re-registar Webhooks</>}
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

      {logs.length > 0 && (
        <Card className="b24-card">
          <CardHeader><CardTitle className="text-sm font-semibold text-foreground">Últimos Eventos</CardTitle></CardHeader>
          <CardContent>
            <ScrollArea className="h-48">
              <div className="space-y-1">
                {logs.map((log, i) => (
                  <div key={i} className="flex items-center justify-between py-2 last:border-0 text-xs border-b border-border">
                    <div className="flex items-center gap-2">
                      {log.direction === "inbound" ? <ArrowDownLeft className="h-3.5 w-3.5 text-primary" /> : <ArrowUpRight className="h-3.5 w-3.5 text-accent" />}
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
                      <div className={cn("w-2.5 h-2.5 rounded-full shrink-0", conv.attendance_mode === "bot" ? "bg-success b24-pulse" : "bg-warning")} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate text-foreground">{conv.contact_name}</p>
                        <p className="text-[10px] text-muted-foreground">{conv.channel} • {conv.attendance_mode === "bot" ? "Bot ativo" : "Humano/Aguardando"}</p>
                      </div>
                    </div>
                    <Button size="sm" variant="outline" className="h-7 text-xs shrink-0 rounded-md" disabled={returningToBot || conv.attendance_mode === "bot"} onClick={() => handleReturnToBot(conv.id)}>
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
              <Input value={returnToBotDialogId} onChange={(e) => setReturnToBotDialogId(e.target.value)} placeholder="ID da conversa..." className="text-xs h-9 flex-1 rounded-md" />
              <Button size="sm" className="h-9 shrink-0 rounded-md" onClick={() => handleReturnToBot()} disabled={returningToBot || !returnToBotDialogId.trim()}>
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

type BitrixReportTransaction = {
  id: string;
  amount: number;
  installment_value: number;
  total_value: number;
  status: string;
  payment_method: string;
  gateway: string;
  due_date: string | null;
  paid_at: string | null;
  created_at: string;
  description: string;
  client_name: string;
  company_name: string;
  responsible_name: string;
};

function RelatoriosView({ memberId }: { memberId?: string }) {
  const [transactions, setTransactions] = useState<BitrixReportTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [gatewayFilter, setGatewayFilter] = useState<string>("all");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportedLink, setExportedLink] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadTransactions = async () => {
      if (!memberId) {
        if (active) {
          setTransactions([]);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/bitrix24-reports?member_id=${encodeURIComponent(memberId)}`, {
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Erro ao carregar relatórios");
        if (active) {
          setTransactions(Array.isArray(data?.transactions) ? data.transactions : []);
        }
      } catch (error) {
        console.error("[bitrix24-relatorios] load error:", error);
        if (active) setTransactions([]);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadTransactions();
    return () => {
      active = false;
    };
  }, [memberId]);

  const gateways = useMemo(
    () => [...new Set(transactions.map((t) => t.gateway).filter((value) => value && value !== "—"))].sort(),
    [transactions]
  );
  const clients = useMemo(
    () => [...new Set(transactions.map((t) => t.client_name).filter(Boolean))].sort(),
    [transactions]
  );
  const companies = useMemo(
    () => [...new Set(transactions.map((t) => t.company_name).filter((value) => value && value !== "—"))].sort(),
    [transactions]
  );

  const classify = useCallback((t: BitrixReportTransaction) => {
    if (t.status === "paga") return "confirmed";
    if (t.status === "atrasada") return "overdue";
    if (t.status === "pendente" && t.due_date && new Date(t.due_date) < new Date()) return "overdue";
    return "pending";
  }, []);

  const filtered = useMemo(() => {
    let data = [...transactions];

    if (gatewayFilter !== "all") {
      data = data.filter((t) => t.gateway === gatewayFilter);
    }
    if (clientFilter !== "all") {
      data = data.filter((t) => t.client_name === clientFilter);
    }
    if (companyFilter !== "all") {
      data = data.filter((t) => t.company_name === companyFilter);
    }

    if (period === "custom" && dateRange.from) {
      const from = new Date(dateRange.from);
      from.setHours(0, 0, 0, 0);
      const to = dateRange.to ? new Date(dateRange.to) : new Date(dateRange.from);
      to.setHours(23, 59, 59, 999);
      data = data.filter((t) => {
        const refDate = t.status === "paga" && t.paid_at ? new Date(t.paid_at) : t.due_date ? new Date(t.due_date) : new Date(t.created_at);
        return refDate >= from && refDate <= to;
      });
    } else if (period !== "all") {
      const now = new Date();
      const ms: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90, year: 365 };
      const cutoff = new Date(now.getTime() - (ms[period] || 30) * 86400000);
      data = data.filter((t) => {
        const refDate = t.status === "paga" && t.paid_at ? new Date(t.paid_at) : t.due_date ? new Date(t.due_date) : new Date(t.created_at);
        return refDate >= cutoff;
      });
    }

    return data;
  }, [transactions, gatewayFilter, clientFilter, companyFilter, period, dateRange]);

  const confirmed = useMemo(() => filtered.filter((t) => classify(t) === "confirmed"), [filtered, classify]);
  const pending = useMemo(() => filtered.filter((t) => classify(t) === "pending"), [filtered, classify]);
  const overdue = useMemo(() => filtered.filter((t) => classify(t) === "overdue"), [filtered, classify]);

  const totalCharged = filtered.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const totalPaid = confirmed.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const openAmount = pending.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const overdueAmount = overdue.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const paymentRate = filtered.length ? Math.round((confirmed.length / filtered.length) * 100) : 0;

  const fmt = (v: number) =>
    new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", minimumFractionDigits: 0 }).format(v);

  const monthlyData = useMemo(() => {
    const months: Record<string, { month: string; pago: number; pendente: number }> = {};
    const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    filtered.forEach((t) => {
      const refDate = t.status === "paga" && t.paid_at ? new Date(t.paid_at) : t.due_date ? new Date(t.due_date) : new Date(t.created_at);
      const key = `${refDate.getFullYear()}-${String(refDate.getMonth()).padStart(2, "0")}`;
      if (!months[key]) months[key] = { month: `${monthNames[refDate.getMonth()]} ${refDate.getFullYear()}`, pago: 0, pendente: 0 };
      if (classify(t) === "confirmed") months[key].pago += Number(t.amount || 0);
      else months[key].pendente += Number(t.amount || 0);
    });
    return Object.entries(months).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
  }, [filtered, classify]);

  const statusData = [
    { name: "Pago", value: confirmed.length, color: COLORS_STATUS.confirmed },
    { name: "Pendente", value: pending.length, color: COLORS_STATUS.pending },
    { name: "Atrasado", value: overdue.length, color: COLORS_STATUS.overdue },
  ].filter((d) => d.value > 0);

  const methodData = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach((t) => {
      const method = t.payment_method || "outro";
      map[method] = (map[method] || 0) + Number(t.amount || 0);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filtered]);

  const clientData = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach((t) => {
      const name = t.client_name || "Sem cliente";
      map[name] = (map[name] || 0) + Number(t.amount || 0);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5);
  }, [filtered]);

  const sellerData = useMemo(() => {
    const map: Record<string, { name: string; total: number; paid: number; count: number }> = {};
    filtered.forEach((t) => {
      const seller = t.responsible_name || "Sem responsável";
      if (!map[seller]) map[seller] = { name: seller, total: 0, paid: 0, count: 0 };
      map[seller].total += Number(t.amount || 0);
      map[seller].count += 1;
      if (classify(t) === "confirmed") map[seller].paid += Number(t.amount || 0);
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filtered, classify]);

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

  const buildSnapshotData = () => ({
    kpis: { totalCharged, totalPaid, openAmount, overdueAmount, confirmedCount: confirmed.length, paymentRate },
    sellerData,
    transactions: filtered.map((t) => ({
      created_at: t.created_at,
      due_date: t.due_date || null,
      paid_at: t.paid_at || null,
      description: t.description || null,
      amount: Number(t.amount || 0),
      payment_method: t.payment_method,
      status: t.status,
      client_name: t.client_name,
      company_name: t.company_name,
      responsible_name: t.responsible_name,
      gateway: t.gateway,
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
          <div className="flex gap-1 bg-white/10 rounded-lg p-0.5">
            {PERIOD_OPTIONS.map((p) => (
              <button
                key={p.key}
                onClick={() => { setPeriod(p.key); if (p.key !== "custom") setDateRange({}); }}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                  period === p.key ? "bg-white text-primary shadow-sm" : "text-white/70 hover:text-white hover:bg-white/10"
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

      <div className="flex items-center gap-3 flex-wrap">
        <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("h-8 text-xs gap-1.5 min-w-[180px] justify-start", period === "custom" && "border-primary")}>
              <CalendarIcon className="h-3.5 w-3.5" />
              {period === "custom" && dateRange.from
                ? `${format(dateRange.from, "dd/MM/yyyy")}${dateRange.to ? ` - ${format(dateRange.to, "dd/MM/yyyy")}` : ""}`
                : "Período personalizado"}
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
                <RechartsTooltip contentStyle={{ backgroundColor: "#fff", border: "1px solid " + gridColor, borderRadius: 8, fontSize: 12 }} labelStyle={{ color: textColor }} />
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
                <Pie data={statusData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value" label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`} labelLine={false} style={{ fontSize: 11 }}>
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
                      <td className="px-4 py-2">{new Date(t.paid_at || t.created_at).toLocaleDateString("pt-PT")}</td>
                      <td className="px-4 py-2">{t.client_name || "—"}</td>
                      <td className="px-4 py-2">{t.company_name || "—"}</td>
                      <td className="px-4 py-2">{t.responsible_name || "—"}</td>
                      <td className="px-4 py-2 text-right font-medium">{fmt(Number(t.amount || 0))}</td>
                      <td className="px-4 py-2">{t.payment_method || "—"}</td>
                      <td className="px-4 py-2">{t.gateway || "—"}</td>
                      <td className="px-4 py-2">
                        <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold", statusBadge[cls])}>
                          {statusLabel[cls]}
                        </span>
                      </td>
                      <td className="px-4 py-2">{t.due_date ? new Date(t.due_date).toLocaleDateString("pt-PT") : "—"}</td>
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
type PlacementType = "payment-tab" | "payment-tab-contact" | "crm-tab" | "im-sidebar" | "im-context-menu";

const PLACEMENT_OPTIONS: { value: PlacementType; label: string; endpoint: string; description: string }[] = [
  { value: "payment-tab", label: "Payment Tab (Deal)", endpoint: "bitrix24-payment-tab", description: "CRM_DEAL_DETAIL_TAB — Pagamentos" },
  { value: "payment-tab-contact", label: "Payment Tab (Contacto)", endpoint: "bitrix24-payment-tab", description: "CRM_CONTACT_DETAIL_TAB — Pagamentos do Contacto" },
  { value: "crm-tab", label: "Emmely AI — CRM Tab", endpoint: "bitrix24-crm-tab", description: "CRM_LEAD_DETAIL_TAB — Conversa e histórico" },
  { value: "im-sidebar", label: "IM Sidebar", endpoint: "bitrix24-im-sidebar", description: "IM_SIDEBAR — Assistente IA no Messenger" },
  { value: "im-context-menu", label: "Context Menu", endpoint: "bitrix24-im-context-menu", description: "IM_CONTEXT_MENU — Analisar mensagem" },
];

function PlacementPreviewView({ integration, memberId }: { integration: any; memberId: string | null }) {
  const [placementType, setPlacementType] = useState<PlacementType>("payment-tab");
  const [dealId, setDealId] = useState("10581");
  const [contactId, setContactId] = useState("1");
  const [leadId, setLeadId] = useState("1");
  const [dialogId, setDialogId] = useState("chat12345");
  const [messageId, setMessageId] = useState("msg1");
  const [resolvedMemberId, setResolvedMemberId] = useState(memberId || integration?.member_id || "");
  const [htmlContent, setHtmlContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const currentPlacement = PLACEMENT_OPTIONS.find((p) => p.value === placementType)!;

  // Auto-resolve member_id from DB if not available from context
  useEffect(() => {
    if (resolvedMemberId) return;
    fetch(
      `${SUPABASE_URL}/rest/v1/bitrix24_integrations?select=member_id&order=updated_at.desc&limit=1`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    )
      .then((r) => r.json())
      .then((rows) => {
        if (rows?.[0]?.member_id) setResolvedMemberId(rows[0].member_id);
      })
      .catch(() => {});
  }, [resolvedMemberId]);

  const buildFormData = useCallback(() => {
    const formData = new URLSearchParams();
    formData.append("member_id", resolvedMemberId);

    switch (placementType) {
      case "payment-tab":
        formData.append("PLACEMENT_OPTIONS", JSON.stringify({ ID: dealId, ENTITY_TYPE_ID: "2" }));
        break;
      case "payment-tab-contact":
        formData.append("PLACEMENT_OPTIONS", JSON.stringify({ ID: contactId, ENTITY_TYPE_ID: "3" }));
        break;
      case "crm-tab":
        formData.append("PLACEMENT_OPTIONS", JSON.stringify({ ID: leadId }));
        break;
      case "im-sidebar":
        formData.append("PLACEMENT", "IM_SIDEBAR");
        formData.append("PLACEMENT_OPTIONS", JSON.stringify({ DIALOG_ID: dialogId }));
        break;
      case "im-context-menu":
        formData.append("PLACEMENT", "IM_CONTEXT_MENU");
        formData.append("PLACEMENT_OPTIONS", JSON.stringify({ DIALOG_ID: dialogId, MESSAGE_ID: messageId }));
        break;
    }
    return formData;
  }, [placementType, resolvedMemberId, dealId, contactId, leadId, dialogId, messageId]);

  const buildBx24Mock = useCallback(() => {
    let placementOptions = "{}";
    switch (placementType) {
      case "payment-tab":
        placementOptions = JSON.stringify({ ID: dealId });
        break;
      case "payment-tab-contact":
        placementOptions = JSON.stringify({ ID: contactId });
        break;
      case "crm-tab":
        placementOptions = JSON.stringify({ ID: leadId });
        break;
      case "im-sidebar":
        placementOptions = JSON.stringify({ DIALOG_ID: dialogId });
        break;
      case "im-context-menu":
        placementOptions = JSON.stringify({ DIALOG_ID: dialogId, MESSAGE_ID: messageId });
        break;
    }
    return `<script>
      window.BX24 = {
        init: function(cb) { if(cb) cb(); },
        callMethod: function() {},
        fitWindow: function() {},
        resizeWindow: function() {},
        getPlacement: function() { return { options: ${placementOptions} }; },
        getDomain: function() { return "preview"; }
      };
    </script>`;
  }, [placementType, dealId, contactId, leadId, dialogId, messageId]);

  const loadPreview = useCallback(() => {
    const mid = resolvedMemberId;
    if (!mid) {
      setError("Nenhuma integração Bitrix24 encontrada.");
      return;
    }

    setLoading(true);
    setError("");
    setHtmlContent("");

    const url = `${SUPABASE_URL}/functions/v1/${currentPlacement.endpoint}`;
    const formData = buildFormData();

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
        const bx24Mock = buildBx24Mock();
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
  }, [resolvedMemberId, buildFormData, buildBx24Mock, currentPlacement.endpoint]);

  // Reset content when switching placement type
  useEffect(() => {
    setHtmlContent("");
    setError("");
  }, [placementType]);

  // Auto-load when member_id is resolved
  useEffect(() => {
    if (resolvedMemberId) loadPreview();
  }, [resolvedMemberId]);

  const iframeLabel = useMemo(() => {
    switch (placementType) {
      case "payment-tab": return `CRM_DEAL_DETAIL_TAB — Deal #${dealId}`;
      case "payment-tab-contact": return `CRM_CONTACT_DETAIL_TAB — Contact #${contactId}`;
      case "crm-tab": return `CRM_LEAD_DETAIL_TAB — Lead #${leadId}`;
      case "im-sidebar": return `IM_SIDEBAR — Dialog ${dialogId}`;
      case "im-context-menu": return `IM_CONTEXT_MENU — Dialog ${dialogId} / Msg ${messageId}`;
    }
  }, [placementType, dealId, contactId, leadId, dialogId, messageId]);

  const canLoad = resolvedMemberId && !loading && (() => {
    switch (placementType) {
      case "payment-tab": return !!dealId;
      case "payment-tab-contact": return !!contactId;
      case "crm-tab": return !!leadId;
      case "im-sidebar": return !!dialogId;
      case "im-context-menu": return !!dialogId && !!messageId;
    }
  })();

  const placementIcon = (placementType === "payment-tab" || placementType === "payment-tab-contact") ? CreditCard
    : placementType === "crm-tab" ? FileText
    : placementType === "im-sidebar" ? MessageSquare
    : Sparkles;
  const PlacementIcon = placementIcon;

  return (
    <div className="p-6 space-y-4">
      <div className="b24-view-header">
        <h1 className="text-xl font-bold text-white">Placement Preview</h1>
        <p className="text-white/60 text-sm mt-0.5">Pré-visualização de placements sem abrir o Bitrix24</p>
      </div>

      <Card className="b24-card">
        <CardContent className="pt-5 space-y-4">
          {/* Placement selector */}
          <div className="flex items-center gap-3 flex-wrap">
            <Label className="text-sm font-medium shrink-0">Placement:</Label>
            <Select value={placementType} onValueChange={(v) => setPlacementType(v as PlacementType)}>
              <SelectTrigger className="max-w-[280px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLACEMENT_OPTIONS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground hidden sm:inline">{currentPlacement.description}</span>
          </div>

          {/* Dynamic input fields */}
          <div className="flex items-center gap-3 flex-wrap">
            {placementType === "payment-tab" && (
              <>
                <Label className="text-sm font-medium shrink-0">Deal ID:</Label>
                <Input value={dealId} onChange={(e) => setDealId(e.target.value)} placeholder="Ex: 10581" className="max-w-[160px]" />
              </>
            )}
            {placementType === "payment-tab-contact" && (
              <>
                <Label className="text-sm font-medium shrink-0">Contact ID:</Label>
                <Input value={contactId} onChange={(e) => setContactId(e.target.value)} placeholder="Ex: 1" className="max-w-[160px]" />
              </>
            )}
            {placementType === "crm-tab" && (
              <>
                <Label className="text-sm font-medium shrink-0">Lead ID:</Label>
                <Input value={leadId} onChange={(e) => setLeadId(e.target.value)} placeholder="Ex: 1" className="max-w-[160px]" />
              </>
            )}
            {(placementType === "im-sidebar" || placementType === "im-context-menu") && (
              <>
                <Label className="text-sm font-medium shrink-0">Dialog ID:</Label>
                <Input value={dialogId} onChange={(e) => setDialogId(e.target.value)} placeholder="Ex: chat12345" className="max-w-[180px]" />
              </>
            )}
            {placementType === "im-context-menu" && (
              <>
                <Label className="text-sm font-medium shrink-0">Message ID:</Label>
                <Input value={messageId} onChange={(e) => setMessageId(e.target.value)} placeholder="Ex: msg1" className="max-w-[160px]" />
              </>
            )}

            <Button onClick={loadPreview} disabled={!canLoad} size="sm">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" strokeWidth={1.5} />}
              Carregar
            </Button>
            {!resolvedMemberId && (
              <span className="text-xs text-muted-foreground">A detectar integração...</span>
            )}
          </div>
        </CardContent>
      </Card>

      {htmlContent && (
        <Card className="b24-card overflow-hidden">
          <div className="border-b border-border px-4 py-2 flex items-center gap-2 bg-muted/30">
            <PlacementIcon className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
            <span className="text-xs text-muted-foreground font-medium">{iframeLabel}</span>
          </div>
          <iframe
            srcDoc={htmlContent}
            className="w-full border-0"
            style={{ minHeight: "700px" }}
            sandbox="allow-scripts allow-same-origin"
            title={`${currentPlacement.label} Preview`}
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
            <PlacementIcon className="h-10 w-10 mx-auto mb-3 opacity-30" strokeWidth={1.5} />
            <p className="text-sm">Selecione o placement, preencha os campos e clique em "Carregar"</p>
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

// ==================== CARTEIRA ACCESS VIEW ====================
interface ClientFinancials {
  client: any;
  accessId: string | null;
  totalValue: number;
  totalPaid: number;
  totalPending: number;
  totalOverdue: number;
  serviceCount: number;
}

function CarteiraAccessView({ integration, memberId, cachedPortfolio }: { integration: any; memberId: string | null; cachedPortfolio?: any }) {
  const [clientsData, setClientsData] = useState<ClientFinancials[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [expandedDetail, setExpandedDetail] = useState<Record<string, any[]>>({});
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);
  const [bitrixModalClient, setBitrixModalClient] = useState<ClientFinancials | null>(null);
  const [bitrixDeals, setBitrixDeals] = useState<any[]>([]);
  const [bitrixUsers, setBitrixUsers] = useState<Record<string, string>>({});
  const [loadingBitrix, setLoadingBitrix] = useState(false);
  const [syncingDealId, setSyncingDealId] = useState<string | null>(null);
  const [creatingContact, setCreatingContact] = useState(false);
  const domain = integration?.domain;

  const extractAccessId = (notes: string | null) => {
    if (!notes) return null;
    const match = notes.match(/Access \(ID:\s*(\d+)\)/);
    return match ? match[1] : null;
  };

  const resolvedMemberId = memberId || integration?.member_id || "";

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const url = resolvedMemberId
        ? `${SUPABASE_URL}/functions/v1/bitrix24-fetch-portfolio?member_id=${encodeURIComponent(resolvedMemberId)}`
        : `${SUPABASE_URL}/functions/v1/bitrix24-fetch-portfolio`;

      const res = await fetch(url, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("[Carteira] Portfolio HTTP error:", res.status, text);
        setClientsData([]);
        return;
      }

      const data = await res.json();
      if (!data.success || !data.clients) {
        console.error("[Carteira] Portfolio error:", data.error);
        setClientsData([]);
        return;
      }
      setClientsData(data.clients as ClientFinancials[]);
    } catch (e) {
      console.error("[Carteira] Error:", e);
      setClientsData([]);
    } finally {
      setLoading(false);
    }
  }, [resolvedMemberId]);

  useEffect(() => {
    if (cachedPortfolio?.success && Array.isArray(cachedPortfolio.clients)) {
      setClientsData(cachedPortfolio.clients as ClientFinancials[]);
      setLoading(false);
      return;
    }
    fetchAll();
  }, [cachedPortfolio, fetchAll]);

  const filtered = useMemo(() => {
    let result = clientsData;
    // Text search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (cf) =>
          cf.client.name?.toLowerCase().includes(q) ||
          cf.client.document_number?.toLowerCase().includes(q) ||
          cf.accessId?.includes(q)
      );
    }
    // Status filter
    if (statusFilter === "overdue") result = result.filter((cf) => cf.totalOverdue > 0);
    else if (statusFilter === "pending") result = result.filter((cf) => cf.totalPending > 0 && cf.totalOverdue === 0);
    else if (statusFilter === "paid") result = result.filter((cf) => cf.totalPaid > 0 && cf.totalPending === 0 && cf.totalOverdue === 0);
    else if (statusFilter === "empty") result = result.filter((cf) => cf.totalValue === 0);
    // Date filter (by client created_at)
    if (dateFrom) result = result.filter((cf) => cf.client.created_at && new Date(cf.client.created_at) >= dateFrom);
    if (dateTo) {
      const end = new Date(dateTo); end.setHours(23, 59, 59, 999);
      result = result.filter((cf) => cf.client.created_at && new Date(cf.client.created_at) <= end);
    }
    return result;
  }, [clientsData, search, statusFilter, dateFrom, dateTo]);

  const totals = useMemo(() => {
    return clientsData.reduce(
      (acc, cf) => ({
        value: acc.value + cf.totalValue,
        paid: acc.paid + cf.totalPaid,
        pending: acc.pending + cf.totalPending,
        overdue: acc.overdue + cf.totalOverdue,
      }),
      { value: 0, paid: 0, pending: 0, overdue: 0 }
    );
  }, [clientsData]);

  const fmt = (v: number) => v.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });

  const getStatusBadge = (cf: ClientFinancials) => {
    if (cf.totalOverdue > 0) return <Badge className="bg-red-500/10 text-red-500 border-red-500/20 text-[10px]">Em atraso</Badge>;
    if (cf.totalPending > 0) return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[10px]">Pendente</Badge>;
    if (cf.totalPaid > 0) return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px]">Quitado</Badge>;
    return <Badge variant="outline" className="text-[10px]">Sem dados</Badge>;
  };

  // ── Bitrix modal ──
  const openBitrixModal = async (cf: ClientFinancials) => {
    setBitrixModalClient(cf);
    setBitrixDeals([]);
    setBitrixUsers({});
    if (!cf.accessId || !memberId) return;
    setLoadingBitrix(true);
    try {
      // Fetch deals filtered by UF_CRM_1768312831 = accessId
      const res = await fetch(`${SUPABASE_URL}/functions/v1/bitrix24-fetch-entities?action=items&entity=deal&member_id=${encodeURIComponent(memberId)}&access_id=${encodeURIComponent(cf.accessId)}`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      });
      const data = await res.json();

      // If the edge function doesn't support access_id filter, we do it via direct Bitrix call
      if (data.items) {
        setBitrixDeals(data.items);
      } else {
        // Fallback: call Bitrix directly via the integration tokens
        const dealRes = await fetch(`${SUPABASE_URL}/functions/v1/bitrix24-send`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
          body: JSON.stringify({
            member_id: memberId,
            method: "crm.deal.list",
            params: {
              filter: { "UF_CRM_1768312831": cf.accessId },
              select: ["ID", "TITLE", "OPPORTUNITY", "CURRENCY_ID", "STAGE_ID", "CONTACT_ID", "ASSIGNED_BY_ID", "DATE_CREATE",
                "UF_CRM_EMMELY_STATUS", "UF_CRM_EMMELY_GATEWAY", "UF_CRM_EMMELY_PARCELAS", "UF_CRM_EMMELY_VALOR_TOTAL",
                "UF_CRM_EMMELY_VALOR_RECEBIDO", "UF_CRM_EMMELY_VENCIMENTO"],
            },
          }),
        });
        const dealData = await dealRes.json();
        const deals = dealData.result || [];
        setBitrixDeals(deals);

        // Fetch user names for ASSIGNED_BY_ID
        const userIds = [...new Set(deals.map((d: any) => d.ASSIGNED_BY_ID).filter(Boolean))];
        if (userIds.length > 0) {
          const usersRes = await fetch(`${SUPABASE_URL}/functions/v1/bitrix24-send`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
            body: JSON.stringify({
              member_id: memberId,
              method: "user.get",
              params: { ID: userIds },
            }),
          });
          const usersData = await usersRes.json();
          const uMap: Record<string, string> = {};
          for (const u of (usersData.result || [])) {
            uMap[String(u.ID)] = [u.NAME, u.LAST_NAME].filter(Boolean).join(" ");
          }
          setBitrixUsers(uMap);
        }
      }
    } catch (e) {
      console.error("[Carteira] Bitrix fetch error:", e);
    } finally {
      setLoadingBitrix(false);
    }
  };

  const handleSyncDeal = async (deal: any) => {
    if (!memberId) return;
    setSyncingDealId(deal.ID || deal.id);
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/bitrix24-update-deal-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        body: JSON.stringify({ member_id: memberId, deal_id: deal.ID || deal.id }),
      });
    } catch (e) {
      console.error("[Carteira] Sync error:", e);
    } finally {
      setSyncingDealId(null);
    }
  };

  const handleCreateContact = async (cf: ClientFinancials) => {
    if (!memberId) return;
    setCreatingContact(true);
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/bitrix24-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        body: JSON.stringify({
          member_id: memberId,
          method: "crm.contact.add",
          params: {
            fields: {
              NAME: cf.client.name?.split(" ")[0] || cf.client.name,
              LAST_NAME: cf.client.name?.split(" ").slice(1).join(" ") || "",
              UF_CRM_1768312831: cf.accessId,
              COMMENTS: `Importado do Access (ID: ${cf.accessId}). Doc: ${cf.client.document_number || "—"}`,
            },
          },
        }),
      });
    } catch (e) {
      console.error("[Carteira] Create contact error:", e);
    } finally {
      setCreatingContact(false);
    }
  };

  // ── Fetch detail for expanded client ──
  const fetchClientDetail = async (clientId: string) => {
    if (expandedDetail[clientId]) return; // already loaded
    setLoadingDetail(clientId);
    try {
      const url = `${SUPABASE_URL}/functions/v1/bitrix24-fetch-portfolio?member_id=${encodeURIComponent(resolvedMemberId)}&client_id=${encodeURIComponent(clientId)}`;
      const res = await fetch(url, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      });
      const data = await res.json();
      if (data.success) {
        setExpandedDetail((prev) => ({ ...prev, [clientId]: data.leads || [] }));
      }
    } catch (e) {
      console.error("[Carteira] Detail error:", e);
    } finally {
      setLoadingDetail(null);
    }
  };

  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);
  const [baixaTarget, setBaixaTarget] = useState<{ fr: any; clientId: string } | null>(null);
  const [baixaForm, setBaixaForm] = useState({ paidAmount: 0, paymentDate: new Date(), paymentMethod: "transferencia", proofFile: null as File | null });
  const [baixaSaving, setBaixaSaving] = useState(false);

  // Cancel contract state
  const [cancelTarget, setCancelTarget] = useState<{ contractId: string; clientId: string } | null>(null);
  const [cancelReason, setCancelReason] = useState("desistencia");
  const [cancelHasRefund, setCancelHasRefund] = useState(false);
  const [cancelRefundAmount, setCancelRefundAmount] = useState(0);
  const [cancelNotes, setCancelNotes] = useState("");
  const [cancelSaving, setCancelSaving] = useState(false);

  const openCancelContractModal = (contractId: string, clientId: string) => {
    setCancelTarget({ contractId, clientId });
    setCancelReason("desistencia");
    setCancelHasRefund(false);
    setCancelRefundAmount(0);
    setCancelNotes("");
  };

  const handleCancelContractConfirm = async () => {
    if (!cancelTarget) return;
    setCancelSaving(true);
    const reasonLabels: Record<string, string> = {
      desistencia: "Desistência do cliente", incumprimento: "Incumprimento",
      acordo_mutuo: "Acordo mútuo", erro_admin: "Erro administrativo", outro: "Outro",
    };
    const fullReason = `${reasonLabels[cancelReason] || cancelReason}${cancelNotes ? ` — ${cancelNotes}` : ""}`;
    try {
      const { error } = await supabase.from("proposals").update({
        contract_status: "cancelado",
        cancelled_at: new Date().toISOString(),
        cancel_reason: fullReason,
        refund_amount: cancelHasRefund ? cancelRefundAmount : 0,
      } as any).eq("id", cancelTarget.contractId);
      if (error) throw error;
      // Refresh detail
      setExpandedDetail((prev) => { const copy = { ...prev }; delete copy[cancelTarget.clientId]; return copy; });
      await fetchClientDetail(cancelTarget.clientId);
      await fetchAll();
      setCancelTarget(null);
    } catch (e) {
      console.error("[Carteira] Cancel error:", e);
    } finally {
      setCancelSaving(false);
    }
  };

  const handleExpandToggle = (clientId: string) => {
    if (expandedClientId === clientId) {
      setExpandedClientId(null);
      return;
    }
    setExpandedClientId(clientId);
    if (!expandedDetail[clientId]) {
      fetchClientDetail(clientId);
    }
  };

  const openBaixaModal = (fr: any, clientId: string) => {
    const now = new Date();
    const dueDate = fr.due_date ? new Date(fr.due_date) : null;
    const originalVal = parseFloat(fr.installment_value) || 0;
    let totalWithFees = originalVal;
    if (dueDate && dueDate < now && fr.status !== "paga") {
      const diffMs = now.getTime() - dueDate.getTime();
      const daysLate = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const fees = calculateLateFees(originalVal, daysLate);
      totalWithFees = fees.total;
    }
    setBaixaTarget({ fr, clientId });
    setBaixaForm({ paidAmount: totalWithFees, paymentDate: new Date(), paymentMethod: "transferencia", proofFile: null });
  };

  const handleBaixaConfirm = async () => {
    if (!baixaTarget) return;
    setBaixaSaving(true);
    const { fr, clientId } = baixaTarget;
    try {
      let receiptUrl = fr.receipt_url || "";
      // Upload proof file if provided
      if (baixaForm.proofFile) {
        const ext = baixaForm.proofFile.name.split(".").pop() || "pdf";
        const path = `payment-proofs/${fr.id}.${ext}`;
        const { error: upErr } = await supabase.storage.from("signatures").upload(path, baixaForm.proofFile, { upsert: true });
        if (!upErr) {
          const { data: urlData } = supabase.storage.from("signatures").getPublicUrl(path);
          receiptUrl = urlData?.publicUrl || receiptUrl;
        }
      }
      const { error } = await supabase
        .from("financial_records")
        .update({
          status: "paga" as any,
          paid_at: baixaForm.paymentDate.toISOString(),
          payment_method: baixaForm.paymentMethod as any,
          installment_value: baixaForm.paidAmount,
          receipt_url: receiptUrl,
        })
        .eq("id", fr.id);
      if (error) throw error;
      setExpandedDetail((prev) => {
        const copy = { ...prev };
        delete copy[clientId];
        return copy;
      });
      await fetchClientDetail(clientId);
      await fetchAll();
      setBaixaTarget(null);
    } catch (e) {
      console.error("[Carteira] Baixa error:", e);
    } finally {
      setBaixaSaving(false);
    }
  };

  const renderBaixaDialog = () => {
    if (!baixaTarget) return null;
    const { fr } = baixaTarget;
    const originalVal = parseFloat(fr.installment_value) || 0;
    const now = new Date();
    const dueDate = fr.due_date ? new Date(fr.due_date) : null;
    let daysLate = 0;
    let feesResult: any = null;
    if (dueDate && dueDate < now) {
      const diffMs = now.getTime() - dueDate.getTime();
      daysLate = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      feesResult = calculateLateFees(originalVal, daysLate);
    }

    return (
      <Dialog open={!!baixaTarget} onOpenChange={(o) => !o && setBaixaTarget(null)}>
        <DialogContent className="max-w-md" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Dar Baixa — Parcela {fr.installment_number}/{fr.total_installments}</DialogTitle>
            <DialogDescription>Confirme os dados do pagamento</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Original value */}
            <div className="rounded-lg border p-3 space-y-1 bg-muted/30">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Valor original</span>
                <span className="font-medium">{fmt(originalVal)}</span>
              </div>
              {feesResult && daysLate > 0 && (
                <>
                  <div className="flex justify-between text-sm text-red-500">
                    <span>Multa ({daysLate}d atraso)</span>
                    <span>+{fmt(feesResult.penalty)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-red-500">
                    <span>Juros</span>
                    <span>+{fmt(feesResult.interest)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-sm font-semibold">
                    <span>Total c/ encargos</span>
                    <span>{fmt(feesResult.total)}</span>
                  </div>
                </>
              )}
            </div>

            {/* Payment method */}
            <div className="space-y-1.5">
              <Label className="text-xs">Forma de pagamento</Label>
              <Select value={baixaForm.paymentMethod} onValueChange={(v) => setBaixaForm((p) => ({ ...p, paymentMethod: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="transferencia">Transferência</SelectItem>
                  <SelectItem value="stripe">Stripe</SelectItem>
                  <SelectItem value="parcelado_direto">Parcelado Direto</SelectItem>
                  <SelectItem value="mbway">MBWay</SelectItem>
                  <SelectItem value="multibanco">Multibanco</SelectItem>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="dinheiro">Dinheiro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Paid amount */}
            <div className="space-y-1.5">
              <Label className="text-xs">Valor pago (€)</Label>
              <Input
                type="number"
                step="0.01"
                className="h-9 text-sm"
                value={baixaForm.paidAmount}
                onChange={(e) => setBaixaForm((p) => ({ ...p, paidAmount: parseFloat(e.target.value) || 0 }))}
              />
            </div>

            {/* Payment date */}
            <div className="space-y-1.5">
              <Label className="text-xs">Data do pagamento</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full h-9 justify-start text-sm font-normal">
                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                    {format(baixaForm.paymentDate, "dd/MM/yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={baixaForm.paymentDate}
                    onSelect={(d) => d && setBaixaForm((p) => ({ ...p, paymentDate: d }))}
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Proof upload */}
            <div className="space-y-1.5">
              <Label className="text-xs">Comprovante (opcional)</Label>
              <Input
                type="file"
                accept="image/*,.pdf"
                className="h-9 text-sm"
                onChange={(e) => setBaixaForm((p) => ({ ...p, proofFile: e.target.files?.[0] || null }))}
              />
              {baixaForm.proofFile && (
                <p className="text-[10px] text-muted-foreground">{baixaForm.proofFile.name}</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setBaixaTarget(null)} disabled={baixaSaving}>Cancelar</Button>
              <Button className="flex-1 gap-1" onClick={handleBaixaConfirm} disabled={baixaSaving}>
                {baixaSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                Confirmar Baixa
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  };

  // ── Render expanded service details ──
  const renderServiceDetails = (cf: ClientFinancials) => {
    const clientId = cf.client.id;
    const leads = expandedDetail[clientId];
    const now = new Date();

    if (loadingDetail === clientId || !leads) {
      return (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-primary mr-2" />
          <span className="text-sm text-muted-foreground">Carregando detalhes...</span>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {leads.length === 0 && (
          <p className="text-xs text-muted-foreground">Sem serviços/honorários importados para este cliente.</p>
        )}
        {leads.map((lead: any) => {
          const cases = lead.cases || [];
          return cases.map((cas: any) => {
            const contracts = cas.contracts || [];
            const records = contracts.flatMap((ct: any) => ct.financial_records || []);
            const svcTotal = records.reduce((s: number, r: any) => s + (parseFloat(r.installment_value) || 0), 0);
            const svcPaid = records.filter((r: any) => r.status === "paga").length;
            return (
              <Card key={cas.id} className="border-l-4 border-l-primary/50">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{cas.title || lead.name}</p>
                      <p className="text-xs text-muted-foreground">{fmt(svcTotal)} • {svcPaid}/{records.length} pagas</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {contracts.some((ct: any) => ct.status === "cancelado") ? (
                        <Badge className="bg-destructive/10 text-destructive border-destructive/20 text-[10px]">Cancelado</Badge>
                      ) : svcPaid === records.length && records.length > 0 ? (
                        <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px]">✓ Quitado</Badge>
                      ) : (
                        <>
                          <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[10px]">Em aberto</Badge>
                          {contracts.length > 0 && contracts[0].status === "pendente" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-5 px-2 text-[10px] gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                              onClick={(e) => {
                                e.stopPropagation();
                                openCancelContractModal(contracts[0].id, clientId);
                              }}
                            >
                              <Ban className="h-3 w-3" />
                              Cancelar
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  {records.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {records
                        .sort((a: any, b: any) => (a.installment_number || 0) - (b.installment_number || 0))
                        .map((fr: any) => {
                          const isOverdue = fr.status !== "paga" && fr.due_date && new Date(fr.due_date) < now;
                          return (
                            <div key={fr.id} className="flex items-center gap-2 text-xs py-1 border-t border-border/50">
                              <span className="w-10 text-muted-foreground">{fr.installment_number}/{fr.total_installments}</span>
                              <span className="w-16 font-medium text-foreground">{fmt(parseFloat(fr.installment_value) || 0)}</span>
                              <span className="w-20 text-muted-foreground">{fr.due_date ? new Date(fr.due_date).toLocaleDateString("pt-PT") : "—"}</span>
                              {fr.status === "paga" ? (
                                <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px]">
                                  ✅ {fr.paid_at ? new Date(fr.paid_at).toLocaleDateString("pt-PT") : "Paga"}
                                </Badge>
                              ) : isOverdue ? (
                                <Badge className="bg-red-500/10 text-red-500 border-red-500/20 text-[10px]">🔴 Atrasada</Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px]">Pendente</Badge>
                              )}
                              {fr.status !== "paga" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-5 px-2 text-[10px] gap-1 ml-auto"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openBaixaModal(fr, clientId);
                                  }}
                                >
                                  <CheckCircle className="h-3 w-3" />
                                  Baixa
                                </Button>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          });
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="b24-view-header">
        <h1 className="text-xl font-bold text-white">Carteira de Clientes</h1>
        <p className="text-white/60 text-sm mt-0.5">
          {clientsData.length} clientes • {fmt(totals.value)} total • {fmt(totals.paid)} pago • {fmt(totals.pending)} pendente
          {totals.overdue > 0 && <span className="text-red-300"> • {fmt(totals.overdue)} em atraso</span>}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Pesquisar por nome, documento ou Access ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px] h-9 text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="overdue">Em atraso</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
            <SelectItem value="paid">Quitado</SelectItem>
            <SelectItem value="empty">Sem dados</SelectItem>
          </SelectContent>
        </Select>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("h-9 text-sm gap-1.5 font-normal", !dateFrom && "text-muted-foreground")}>
              <CalendarIcon className="h-3.5 w-3.5" />
              {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "Data início"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("h-9 text-sm gap-1.5 font-normal", !dateTo && "text-muted-foreground")}>
              <CalendarIcon className="h-3.5 w-3.5" />
              {dateTo ? format(dateTo, "dd/MM/yyyy") : "Data fim"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={dateTo} onSelect={setDateTo} className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>
        {(statusFilter !== "all" || dateFrom || dateTo) && (
          <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => { setStatusFilter("all"); setDateFrom(undefined); setDateTo(undefined); }}>
            Limpar filtros
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
        <Badge variant="secondary">{filtered.length} resultado(s)</Badge>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>Nenhum cliente importado encontrado.</p>
            <p className="text-xs mt-1">Importe clientes na aba "Importação" primeiro.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium text-muted-foreground">Nome</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Documento</th>
                  <th className="text-center p-3 font-medium text-muted-foreground">Serviços</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">V. Total</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Pago</th>
                  <th className="text-right p-3 font-medium text-muted-foreground">Pendente</th>
                  <th className="text-center p-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-center p-3 font-medium text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((cf) => {
                  const isExpanded = expandedClientId === cf.client.id;
                  return (
                    <Fragment key={cf.client.id}>
                      <tr
                        className="border-b hover:bg-muted/30 cursor-pointer transition-colors"
                        onClick={() => handleExpandToggle(cf.client.id)}
                      >
                        <td className="p-3 font-medium text-foreground">
                          <div className="flex items-center gap-2">
                            <ChevronRight className={cn("h-4 w-4 transition-transform text-muted-foreground", isExpanded && "rotate-90")} />
                            <div>
                              <p>{cf.client.name}</p>
                              {cf.accessId && <p className="text-[10px] text-muted-foreground">Access ID: {cf.accessId}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="p-3 text-muted-foreground text-xs">{cf.client.document_number || "—"}</td>
                        <td className="p-3 text-center">
                          <Badge variant="secondary" className="text-[10px]">{cf.serviceCount}</Badge>
                        </td>
                        <td className="p-3 text-right font-medium text-foreground text-xs">{fmt(cf.totalValue)}</td>
                        <td className="p-3 text-right text-emerald-600 text-xs">{fmt(cf.totalPaid)}</td>
                        <td className="p-3 text-right text-amber-600 text-xs">{cf.totalPending > 0 ? fmt(cf.totalPending) : "—"}</td>
                        <td className="p-3 text-center">{getStatusBadge(cf)}</td>
                        <td className="p-3 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              openBitrixModal(cf);
                            }}
                          >
                            <RefreshCw className="h-3 w-3" /> Bitrix
                          </Button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={8} className="bg-muted/20 px-6 py-4">
                            {renderServiceDetails(cf)}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Bitrix Modal ── */}
      <Dialog open={!!bitrixModalClient} onOpenChange={(open) => !open && setBitrixModalClient(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Deals no Bitrix24 — {bitrixModalClient?.client.name}</DialogTitle>
            <DialogDescription>
              Access ID: {bitrixModalClient?.accessId || "—"} • {bitrixDeals.length} deal(s) encontrado(s)
            </DialogDescription>
          </DialogHeader>

          {loadingBitrix ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="ml-2 text-sm text-muted-foreground">A buscar dados do Bitrix24...</span>
            </div>
          ) : bitrixDeals.length === 0 ? (
            <div className="text-center py-6 space-y-3">
              <AlertCircle className="h-8 w-8 mx-auto text-amber-500 opacity-60" />
              <p className="text-sm text-muted-foreground">Nenhum Deal encontrado no Bitrix24 para este cliente.</p>
              {bitrixModalClient && bitrixModalClient.totalPaid > 0 && bitrixModalClient.totalPending === 0 && bitrixModalClient.totalOverdue === 0 && (
                <div className="pt-2">
                  <p className="text-xs text-muted-foreground mb-2">Cliente quitado — criar apenas Contacto no CRM?</p>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={creatingContact}
                    onClick={() => bitrixModalClient && handleCreateContact(bitrixModalClient)}
                  >
                    {creatingContact ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Users className="h-3 w-3 mr-1" />}
                    Criar Contacto no Bitrix
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {bitrixDeals.map((deal: any) => {
                const dealId = deal.ID || deal.id;
                const opportunity = parseFloat(deal.OPPORTUNITY || deal.opportunity) || 0;
                const assignedName = bitrixUsers[String(deal.ASSIGNED_BY_ID)] || `User #${deal.ASSIGNED_BY_ID || "—"}`;
                const contactId = deal.CONTACT_ID || deal.contact_id;
                const parcelas = deal.UF_CRM_EMMELY_PARCELAS;
                const valorRecebido = parseFloat(deal.UF_CRM_EMMELY_VALOR_RECEBIDO) || 0;
                const valorTotal = parseFloat(deal.UF_CRM_EMMELY_VALOR_TOTAL) || opportunity;
                const isSyncing = syncingDealId === dealId;

                return (
                  <Card key={dealId} className="border-l-4 border-l-primary">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-foreground">Deal #{dealId}: {deal.TITLE || deal.title}</p>
                          <p className="text-xs text-muted-foreground">
                            Contacto: {contactId ? `ID ${contactId}` : "—"} • Responsável: {assignedName}
                          </p>
                        </div>
                        {domain && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => window.open(`https://${domain}/crm/deal/details/${dealId}/`, "_blank")}
                          >
                            <ExternalLink className="h-3 w-3" /> Abrir
                          </Button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                        <div className="bg-muted/50 rounded p-2">
                          <span className="text-muted-foreground">Valor</span>
                          <p className="font-semibold text-foreground">{fmt(valorTotal)}</p>
                        </div>
                        <div className="bg-muted/50 rounded p-2">
                          <span className="text-muted-foreground">Recebido</span>
                          <p className="font-semibold text-emerald-600">{fmt(valorRecebido)}</p>
                        </div>
                        <div className="bg-muted/50 rounded p-2">
                          <span className="text-muted-foreground">Parcelas</span>
                          <p className="font-semibold text-foreground">{parcelas || "—"}</p>
                        </div>
                        <div className="bg-muted/50 rounded p-2">
                          <span className="text-muted-foreground">Em aberto</span>
                          <p className="font-semibold text-amber-600">{fmt(valorTotal - valorRecebido)}</p>
                        </div>
                      </div>

                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full mt-2"
                        disabled={isSyncing}
                        onClick={() => handleSyncDeal(deal)}
                      >
                        {isSyncing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                        Sincronizar Parcelas
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
      {renderBaixaDialog()}

      {/* Cancel Contract Dialog */}
      <Dialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <DialogContent className="max-w-md" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Cancelar Contrato</DialogTitle>
            <DialogDescription>Indique o motivo e se houve devolução de valores.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Motivo do cancelamento</Label>
              <Select value={cancelReason} onValueChange={setCancelReason}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="desistencia">Desistência do cliente</SelectItem>
                  <SelectItem value="incumprimento">Incumprimento</SelectItem>
                  <SelectItem value="acordo_mutuo">Acordo mútuo</SelectItem>
                  <SelectItem value="erro_admin">Erro administrativo</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={cancelHasRefund} onCheckedChange={setCancelHasRefund} />
              <Label className="text-sm">Houve devolução de valor?</Label>
            </div>
            {cancelHasRefund && (
              <div className="space-y-1.5">
                <Label className="text-xs">Valor devolvido (€)</Label>
                <Input type="number" step="0.01" className="h-9 text-sm" value={cancelRefundAmount} onChange={(e) => setCancelRefundAmount(parseFloat(e.target.value) || 0)} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Notas adicionais (opcional)</Label>
              <Textarea className="text-sm" rows={2} value={cancelNotes} onChange={(e) => setCancelNotes(e.target.value)} placeholder="Detalhes sobre o cancelamento..." />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setCancelTarget(null)} disabled={cancelSaving}>Voltar</Button>
              <Button variant="destructive" className="flex-1" disabled={cancelSaving} onClick={handleCancelContractConfirm}>
                {cancelSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                Confirmar Cancelamento
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================== IMPORTAÇÃO ACCESS VIEW ====================
function ImportacaoAccessView({ integration, memberId }: { integration: any; memberId: string | null }) {
  // Phase 1: Clients
  const [clientesData, setClientesData] = useState<any[] | null>(null);
  const [importingClients, setImportingClients] = useState(false);
  const [clientsProgress, setClientsProgress] = useState({ processed: 0, total: 0 });
  const [clientsLogs, setClientsLogs] = useState<{ client_name: string; status: string; error?: string; details?: string }[]>([]);
  const [clientsDone, setClientsDone] = useState(false);
  const [clientsSessionId, setClientsSessionId] = useState<string | null>(null);
  const [clientsFileRef, setClientsFileRef] = useState<File | null>(null);

  // Phase 2: Honorarios
  const [honorariosData, setHonorariosData] = useState<any[] | null>(null);
  const [importingHonorarios, setImportingHonorarios] = useState(false);
  const [honorariosProgress, setHonorariosProgress] = useState({ processed: 0, total: 0 });
  const [honorariosLogs, setHonorariosLogs] = useState<{ client_name: string; status: string; error?: string; details?: string }[]>([]);
  const [honorariosDone, setHonorariosDone] = useState(false);
  const [honorariosSessionId, setHonorariosSessionId] = useState<string | null>(null);

  // Resuming state
  const [resumingPhase, setResumingPhase] = useState<string | null>(null);
  const [autoResumeClientsPending, setAutoResumeClientsPending] = useState(false);
  const [autoResumeHonorariosPending, setAutoResumeHonorariosPending] = useState(false);

  // Phase 3: Interactive Sync
   type SyncClient = {
    client_id: string;
    name: string;
    nif: string;
    phones: string[];
    emails: string[];
    total_value: number;
    total_paid: number;
    status_class: "quitado" | "aberto" | "atrasado";
    services: string[];
    records_count: number;
    bitrix_contact_id: string | null;
    bitrix_deal_id: string | null;
    match_type: "access_id" | "nif" | "phone" | "email" | "name" | "new";
    contract_date: string | null;
    synced?: boolean;
    syncResult?: string;
  };
  const [syncClients, setSyncClients] = useState<SyncClient[]>([]);
  const [loadingSyncClients, setLoadingSyncClients] = useState(false);
  const [syncClientsLoaded, setSyncClientsLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<"quitado" | "aberto" | "atrasado">("atrasado");
  const [syncSegment, setSyncSegment] = useState<"existing" | "new">("existing");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingClient, setEditingClient] = useState<SyncClient | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editNif, setEditNif] = useState("");
  const [editActions, setEditActions] = useState({ contact: true, deal: true, invoices: true });
  const [syncingSingle, setSyncingSingle] = useState(false);
  const [syncingBatch, setSyncingBatch] = useState(false);
  const batchAbortRef = useRef(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, contacts: 0, deals: 0, invoices: 0, errors: 0, currentName: "" });
  const [batchActions, setBatchActions] = useState({ contact: true, deal: true, invoices: true });
  const [pipelines, setPipelines] = useState<{ id: string; name: string }[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState("0");
  const [loadingPipelines, setLoadingPipelines] = useState(false);

  // Phase 3 session persistence
  const [syncSessionId, setSyncSessionId] = useState<string | null>(null);
  const [autoResumeSyncPending, setAutoResumeSyncPending] = useState(false);

  // Enrich Bitrix contacts
  const [enriching, setEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState({ processed: 0, total: 0, updated: 0, notFound: 0, skipped: 0, contactsCreated: 0 });
  const [enrichDone, setEnrichDone] = useState(false);

  // Filter states (Phase 2 only)
  const [filterDateFrom, setFilterDateFrom] = useState<Date | undefined>(undefined);
  const [filterDateTo, setFilterDateTo] = useState<Date | undefined>(undefined);
  const [filterStatus, setFilterStatus] = useState("todos");

  // ── Session persistence helpers ──
  const saveSessionProgress = async (sessionId: string, processed: number, logs: any[]) => {
    await supabase.from("import_sessions" as any).update({
      processed_items: processed,
      logs: logs as any,
      updated_at: new Date().toISOString(),
    } as any).eq("id", sessionId);
  };

  const createSession = async (phase: string, filePath: string, totalItems: number, filterCfg?: any): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase.from("import_sessions" as any).insert({
      user_id: user.id,
      phase,
      status: "in_progress",
      file_path: filePath,
      total_items: totalItems,
      processed_items: 0,
      logs: [] as any,
      filter_config: (filterCfg || {}) as any,
    } as any).select("id").single();
    if (error) { console.error("[createSession]", error); return null; }
    return (data as any)?.id || null;
  };

  const markSessionDone = async (sessionId: string) => {
    await supabase.from("import_sessions" as any).update({ status: "done", updated_at: new Date().toISOString() } as any).eq("id", sessionId);
  };

  const clearSession = async (sessionId: string, filePath?: string) => {
    if (filePath) {
      await supabase.storage.from("import-files").remove([filePath]);
    }
    await supabase.from("import_sessions" as any).delete().eq("id", sessionId);
  };

  // ── Resume active sessions on mount ──
  useEffect(() => {
    const resumeSessions = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: sessions } = await supabase
        .from("import_sessions" as any)
        .select("*")
        .eq("user_id", user.id)
        .in("status", ["in_progress", "done"]) as any;

      if (!sessions || sessions.length === 0) return;

      let shouldAutoResumeClients = false;
      let shouldAutoResumeHonorarios = false;
      let shouldAutoResumeSync = false;

      for (const session of sessions as any[]) {
        // Phase 3 sync session
        if (session.phase === "sync_bitrix3") {
          setSyncSessionId(session.id);
          if (session.status === "in_progress") {
            shouldAutoResumeSync = true;
          }
          continue;
        }

        // For completed sessions, just restore the visual state without re-downloading
        if (session.status === "done") {
          const savedLogs = Array.isArray(session.logs) ? session.logs : [];
          const totalItems = session.total_items || 0;
          if (session.phase === "clients") {
            setClientsSessionId(session.id);
            setClientsLogs(savedLogs);
            setClientsProgress({ processed: totalItems, total: totalItems });
            setClientsDone(true);
          } else if (session.phase === "honorarios") {
            setHonorariosSessionId(session.id);
            setHonorariosLogs(savedLogs);
            setHonorariosProgress({ processed: totalItems, total: totalItems });
            setHonorariosDone(true);
            if (session.filter_config) {
              const fc = session.filter_config as any;
              if (fc.dateFrom) setFilterDateFrom(new Date(fc.dateFrom));
              if (fc.dateTo) setFilterDateTo(new Date(fc.dateTo));
              if (fc.status) setFilterStatus(fc.status);
            }
          }
          continue;
        }

        // For in_progress sessions, download and resume
        if (!session.file_path) continue;
        setResumingPhase(session.phase);

        try {
          // Download file from storage
          const { data: fileData, error: dlError } = await supabase.storage
            .from("import-files")
            .download(session.file_path);

          if (dlError || !fileData) {
            console.error("[resume] Failed to download file:", dlError);
            continue;
          }

          // Parse XLSX from blob
          const XLSX = await import("xlsx");
          const buffer = await fileData.arrayBuffer();
          const wb = XLSX.read(buffer, { type: "array" });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

          const savedLogs = Array.isArray(session.logs) ? session.logs : [];
          const processedItems = session.processed_items || 0;
          const totalItems = session.total_items || rows.length || 0;

          if (session.phase === "clients") {
            setClientesData(rows);
            setClientsSessionId(session.id);
            setClientsLogs(savedLogs);
            setClientsProgress({ processed: processedItems, total: totalItems });
            if (processedItems >= totalItems && totalItems > 0) {
              setClientsDone(true);
            } else {
              setClientsDone(false);
              shouldAutoResumeClients = true;
            }
          } else if (session.phase === "honorarios") {
            setHonorariosData(rows);
            setHonorariosSessionId(session.id);
            setHonorariosLogs(savedLogs);
            setHonorariosProgress({ processed: processedItems, total: totalItems });
            if (session.filter_config) {
              const fc = session.filter_config as any;
              if (fc.dateFrom) setFilterDateFrom(new Date(fc.dateFrom));
              if (fc.dateTo) setFilterDateTo(new Date(fc.dateTo));
              if (fc.status) setFilterStatus(fc.status);
            }
            if (processedItems >= totalItems && totalItems > 0) {
              setHonorariosDone(true);
            } else {
              setHonorariosDone(false);
              shouldAutoResumeHonorarios = true;
            }
          }
        } catch (e) {
          console.error("[resume] Error restoring session:", e);
        }
      }

      if (shouldAutoResumeClients) setAutoResumeClientsPending(true);
      if (shouldAutoResumeHonorarios) setAutoResumeHonorariosPending(true);
      if (shouldAutoResumeSync) setAutoResumeSyncPending(true);
      setResumingPhase(null);
    };

    resumeSessions();
  }, []);

  const [pipelinesFeedback, setPipelinesFeedback] = useState<string>("");

   // Resolved member ID: fallback to integration.member_id
  const resolvedMemberId = memberId || integration?.member_id || null;

  // Load pipelines when integration available
  useEffect(() => {
    if (!resolvedMemberId || !integration) return;
    setLoadingPipelines(true);
    setPipelinesFeedback("");
    fetch(`${SUPABASE_URL}/functions/v1/bitrix24-fetch-entities?action=pipelines&entity=deal&member_id=${encodeURIComponent(resolvedMemberId)}`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    })
      .then(r => r.json())
      .then(data => {
        const list = data.pipelines || [];
        if (Array.isArray(list)) {
          setPipelines(list);
          const extra = list.filter((p: any) => p.id !== "0" && p.id !== "C0").length;
          setPipelinesFeedback(extra > 0 ? `${extra + 1} pipelines encontradas` : "Apenas o Pipeline Geral encontrado no Bitrix24");
        }
      })
      .catch(console.error)
      .finally(() => setLoadingPipelines(false));
  }, [resolvedMemberId, integration]);

  const parseXlsx = async (file: File): Promise<any[]> => {
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { defval: "" });
  };

  const uploadFileToStorage = async (file: File, phase: string): Promise<string | null> => {
    const filePath = `${phase}_${Date.now()}.xlsx`;
    const { error } = await supabase.storage.from("import-files").upload(filePath, file, {
      contentType: file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      upsert: false,
    });
    if (error) { console.error("[uploadFile]", error); return null; }
    return filePath;
  };

  const handleClientesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await parseXlsx(file);
      setClientesData(data);
      setClientsLogs([]);
      setClientsDone(false);
      setClientsFileRef(file);

      // Upload to storage and create session
      const filePath = await uploadFileToStorage(file, "clients");
      if (filePath) {
        const validCount = data.filter((c: any) => c.ID > 3).length;
        const sessionId = await createSession("clients", filePath, validCount);
        if (sessionId) setClientsSessionId(sessionId);
      }
    } catch {
      alert("Erro ao ler o ficheiro de clientes.");
    }
  };

  const handleHonorariosUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await parseXlsx(file);
      setHonorariosData(data);
      setHonorariosLogs([]);
      setHonorariosDone(false);

      // Upload to storage and create session
      const filePath = await uploadFileToStorage(file, "honorarios");
      if (filePath) {
        const sessionId = await createSession("honorarios", filePath, data.length, {
          dateFrom: filterDateFrom?.toISOString(),
          dateTo: filterDateTo?.toISOString(),
          status: filterStatus,
        });
        if (sessionId) setHonorariosSessionId(sessionId);
      }
    } catch {
      alert("Erro ao ler o ficheiro de honorários.");
    }
  };

  const parseExcelDate = (val: any): Date | null => {
    if (!val) return null;
    if (typeof val === "number") {
      const d = new Date(Math.round((val - 25569) * 86400 * 1000));
      return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(String(val));
    return isNaN(d.getTime()) ? null : d;
  };

  const validClients = useMemo(() => {
    if (!clientesData) return null;
    return clientesData.filter((c: any) => c.ID > 3);
  }, [clientesData]);

  // ── Phase 1: Import Clients (Supabase only) ──
  const handleImportClients = async () => {
    if (!validClients || validClients.length === 0) return;
    setImportingClients(true);
    setClientsDone(false);

    const batchSize = 10;
    let batchStart = clientsSessionId && clientsProgress.processed > 0 ? clientsProgress.processed : 0;
    const allLogs: any[] = batchStart > 0 ? [...clientsLogs] : [];
    let consecutiveErrors = 0;

    while (batchStart < validClients.length) {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/import-access-data`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
          },
          body: JSON.stringify({
            clientes: validClients,
            mode: "clients_only",
            batch_start: batchStart,
            batch_size: batchSize,
          }),
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        if (data.results) {
          allLogs.push(...data.results);
          setClientsLogs([...allLogs]);
        }

        const processed = typeof data.processed === "number" ? data.processed : batchStart + batchSize;
        setClientsProgress({ processed, total: validClients.length });

        if (clientsSessionId) {
          await saveSessionProgress(clientsSessionId, processed, allLogs);
        }

        consecutiveErrors = 0;

        if (!data.has_more || processed >= validClients.length) {
          batchStart = validClients.length;
          break;
        }

        const nextBatchStart = typeof data.next_batch_start === "number" ? data.next_batch_start : processed;
        batchStart = nextBatchStart > batchStart ? nextBatchStart : batchStart + batchSize;
      } catch (e) {
        consecutiveErrors += 1;
        const errLog = {
          client_name: `Batch ${batchStart}`,
          status: "error",
          error: `Tentativa ${consecutiveErrors}: ${String(e)}`,
        };
        allLogs.push(errLog);
        setClientsLogs([...allLogs]);

        if (clientsSessionId) {
          await saveSessionProgress(clientsSessionId, batchStart, allLogs);
        }

        const waitMs = Math.min(15000, 1500 * consecutiveErrors);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }

    const completed = batchStart >= validClients.length;
    setClientsDone(completed);
    setImportingClients(false);
    if (clientsSessionId && completed) await markSessionDone(clientsSessionId);
  };

  // ── Phase 2: Filtered honorarios ──
  const filteredHonorarios = useMemo(() => {
    if (!honorariosData) return null;
    return honorariosData.filter((h: any) => {
      if (filterStatus !== "todos") {
        const s = (h.STATUS || "").toUpperCase().trim();
        if (filterStatus === "QUITADO" && s !== "QUITADO") return false;
        if (filterStatus === "ATRASADO" && s !== "ATRASADO") return false;
        if (filterStatus === "PENDENTE" && (s === "QUITADO" || s === "ATRASADO")) return false;
      }
      if (filterDateFrom || filterDateTo) {
        const d = parseExcelDate(h.DATA);
        if (!d) return false;
        if (filterDateFrom && d < filterDateFrom) return false;
        if (filterDateTo && d > filterDateTo) return false;
      }
      return true;
    });
  }, [honorariosData, filterStatus, filterDateFrom, filterDateTo]);

  const filteredClientes = useMemo(() => {
    if (!filteredHonorarios) return null;
    const clientIds = [...new Set(filteredHonorarios.map((h: any) => h.CLIENTE))];
    if (clientesData) {
      return clientesData.filter((c: any) => c.ID > 3 && clientIds.includes(c.ID));
    }
    return clientIds.map(id => ({ ID: id, NOME: `Cliente ${id}`, ATIVO: "SIM" }));
  }, [clientesData, filteredHonorarios]);

  const stats = useMemo(() => {
    if (!filteredClientes || !filteredHonorarios) return null;
    const totalClients = filteredClientes.length;
    const activeClients = filteredClientes.filter((c: any) => (c.ATIVO || "").toUpperCase() === "SIM").length;
    const totalHonorarios = filteredHonorarios.length;

    const seenSep = new Set<number>();
    let totalValue = 0;
    for (const h of filteredHonorarios) {
      const sid = h.SEPARADORID;
      if (!seenSep.has(sid)) {
        seenSep.add(sid);
        const v = String(h.VALOR || "0").replace(/,/g, "");
        totalValue += parseFloat(v) || 0;
      }
    }

    const paidCount = filteredHonorarios.filter((h: any) => (h.STATUS || "").toUpperCase() === "QUITADO").length;
    const overdueCount = filteredHonorarios.filter((h: any) => (h.STATUS || "").toUpperCase() === "ATRASADO").length;
    const pendingCount = totalHonorarios - paidCount - overdueCount;

    const totalPaid = filteredHonorarios.reduce((acc: number, h: any) => {
      const v = String(h.TOTALPAGO || "0").replace(/,/g, "");
      return acc + (parseFloat(v) || 0);
    }, 0);

    return { totalClients, activeClients, totalHonorarios, totalValue, paidCount, pendingCount, overdueCount, totalPaid };
  }, [filteredClientes, filteredHonorarios]);

  const handleImportHonorarios = async () => {
    if (!filteredHonorarios || filteredHonorarios.length === 0) return;

    const totalClients = filteredClientes?.length || 0;
    if (totalClients === 0) return;

    setImportingHonorarios(true);
    setHonorariosDone(false);

    const batchSize = 10;
    let batchStart = honorariosSessionId && honorariosProgress.processed > 0 ? honorariosProgress.processed : 0;
    const allLogs: any[] = batchStart > 0 ? [...honorariosLogs] : [];
    let consecutiveErrors = 0;

    // Update session filter config
    if (honorariosSessionId) {
      await supabase.from("import_sessions" as any).update({
        filter_config: { dateFrom: filterDateFrom?.toISOString(), dateTo: filterDateTo?.toISOString(), status: filterStatus } as any,
        total_items: totalClients,
      } as any).eq("id", honorariosSessionId);
    }

    while (batchStart < totalClients) {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/import-access-data`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
          },
          body: JSON.stringify({
            clientes: [],
            honorarios: filteredHonorarios,
            mode: "honorarios",
            batch_start: batchStart,
            batch_size: batchSize,
          }),
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        if (data.results) {
          allLogs.push(...data.results);
          setHonorariosLogs([...allLogs]);
        }

        const processed = typeof data.processed === "number" ? data.processed : batchStart + batchSize;
        setHonorariosProgress({ processed, total: totalClients });

        if (honorariosSessionId) {
          await saveSessionProgress(honorariosSessionId, processed, allLogs);
        }

        consecutiveErrors = 0;

        if (!data.has_more || processed >= totalClients) {
          batchStart = totalClients;
          break;
        }

        const nextBatchStart = typeof data.next_batch_start === "number" ? data.next_batch_start : processed;
        batchStart = nextBatchStart > batchStart ? nextBatchStart : batchStart + batchSize;
      } catch (e) {
        consecutiveErrors += 1;
        const errLog = {
          client_name: `Batch ${batchStart}`,
          status: "error",
          error: `Tentativa ${consecutiveErrors}: ${String(e)}`,
        };
        allLogs.push(errLog);
        setHonorariosLogs([...allLogs]);

        if (honorariosSessionId) {
          await saveSessionProgress(honorariosSessionId, batchStart, allLogs);
        }

        const waitMs = Math.min(15000, 1500 * consecutiveErrors);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }

    const completed = batchStart >= totalClients;
    setHonorariosDone(completed);
    setImportingHonorarios(false);
    if (honorariosSessionId && completed) await markSessionDone(honorariosSessionId);
  };

  useEffect(() => {
    if (
      autoResumeClientsPending &&
      !resumingPhase &&
      !importingClients &&
      !!validClients?.length &&
      clientsProgress.processed < validClients.length
    ) {
      setAutoResumeClientsPending(false);
      void handleImportClients();
    }
  }, [autoResumeClientsPending, resumingPhase, importingClients, validClients, clientsProgress.processed]);

  useEffect(() => {
    const totalClients = filteredClientes?.length || 0;
    if (
      autoResumeHonorariosPending &&
      !resumingPhase &&
      !importingHonorarios &&
      !!filteredHonorarios?.length &&
      totalClients > 0 &&
      honorariosProgress.processed < totalClients
    ) {
      setAutoResumeHonorariosPending(false);
      void handleImportHonorarios();
    }
  }, [
    autoResumeHonorariosPending,
    resumingPhase,
    importingHonorarios,
    filteredHonorarios,
    filteredClientes,
    honorariosProgress.processed,
  ]);

  // ── Phase 3: Auto-resume sync ──
  useEffect(() => {
    if (
      autoResumeSyncPending &&
      !resumingPhase &&
      !syncingBatch &&
      !loadingSyncClients &&
      !!resolvedMemberId &&
      !!integration
    ) {
      setAutoResumeSyncPending(false);
      (async () => {
        const clients = await handleLoadSyncClients();
        if (clients && clients.length > 0) {
          const pending = clients.filter((c: SyncClient) => !c.synced);
          if (pending.length > 0) {
            setSelectedIds(new Set(pending.map((c: SyncClient) => c.client_id)));
            setTimeout(() => { handleSyncBatch(pending); }, 500);
          }
        }
      })();
    }
  }, [autoResumeSyncPending, resumingPhase, syncingBatch, loadingSyncClients, resolvedMemberId, integration]);

  // ── Manual mark as synced ──
  const handleMarkAsSynced = async (client: SyncClient) => {
    if (!client.synced) {
      const { data: cl } = await supabase.from("clients").select("bitrix24_id").eq("id", client.client_id).single();
      if (cl && !cl.bitrix24_id) {
        await supabase.from("clients").update({ bitrix24_id: "MANUAL" }).eq("id", client.client_id);
      }
      const { data: leads } = await supabase
        .from("leads")
        .select("cases!cases_lead_id_fkey(proposals!proposals_case_id_fkey(contracts!contracts_proposal_id_fkey(financial_records!financial_records_contract_id_fkey(id, bitrix24_deal_id, bitrix24_invoice_id))))")
        .eq("client_id", client.client_id)
        .eq("sync_source", "access_import") as any;
      for (const lead of (leads || [])) {
        for (const caso of (lead.cases || [])) {
          for (const proposal of (caso.proposals || [])) {
            for (const contract of (proposal.contracts || [])) {
              for (const fr of (contract.financial_records || [])) {
                const updates: Record<string, string> = {};
                if (!fr.bitrix24_deal_id) updates.bitrix24_deal_id = "MANUAL";
                if (!fr.bitrix24_invoice_id) updates.bitrix24_invoice_id = "MANUAL";
                if (Object.keys(updates).length > 0) {
                  await supabase.from("financial_records").update(updates).eq("id", fr.id);
                }
              }
            }
          }
        }
      }
      setSyncClients(prev => prev.map(c =>
        c.client_id === client.client_id ? { ...c, synced: true, syncResult: "Marcado manualmente" } : c
      ));
    }
  };

  // ── Clear session helper ──
  const handleClearSession = async (phase: "clients" | "honorarios") => {
    if (phase === "clients" && clientsSessionId) {
      const { data: session } = await supabase.from("import_sessions" as any).select("file_path").eq("id", clientsSessionId).single() as any;
      await clearSession(clientsSessionId, session?.file_path);
      setClientesData(null);
      setClientsLogs([]);
      setClientsProgress({ processed: 0, total: 0 });
      setClientsDone(false);
      setClientsSessionId(null);
    } else if (phase === "honorarios" && honorariosSessionId) {
      const { data: session } = await supabase.from("import_sessions" as any).select("file_path").eq("id", honorariosSessionId).single() as any;
      await clearSession(honorariosSessionId, session?.file_path);
      setHonorariosData(null);
      setHonorariosLogs([]);
      setHonorariosProgress({ processed: 0, total: 0 });
      setHonorariosDone(false);
      setHonorariosSessionId(null);
    }
  };

  // ── Phase 3: Load clients for sync ──
  const [syncLoadProgress, setSyncLoadProgress] = useState({ processed: 0, total: 0 });

  const handleLoadSyncClients = async (forceRefresh = false) => {
    setLoadingSyncClients(true);
    if (forceRefresh) {
      setSyncClients([]);
      setSyncClientsLoaded(false);
    }
    setSyncLoadProgress({ processed: 0, total: 0 });

    try {
      let allClients: SyncClient[] = [];
      let hasMore = true;
      let batchStart = 0;

      while (hasMore) {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/import-access-data`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
          },
          body: JSON.stringify({
            clientes: [],
            mode: "list_sync_clients",
            member_id: resolvedMemberId,
            ...(forceRefresh ? { force_refresh: true } : {}),
            ...(batchStart > 0 ? { batch_start: batchStart } : {}),
          }),
        });

        if (!res.ok) {
          console.error("[loadSyncClients] HTTP error:", res.status);
          break;
        }

        const data = await res.json();
        if (!data.success) {
          console.error("[loadSyncClients] API error:", data.error);
          break;
        }

        if (data.clients?.length) {
          // Deduplicate by client_id
          const existingIds = new Set(allClients.map(c => c.client_id));
          const newOnes = data.clients.filter((c: SyncClient) => !existingIds.has(c.client_id));
          allClients = [...allClients, ...newOnes];
          setSyncLoadProgress({ processed: allClients.length, total: data.total || allClients.length });
        }

        // Support both old (paginated) and new (single response) API
        hasMore = !!data.has_more;
        if (data.next_batch_start != null) {
          batchStart = data.next_batch_start;
        } else {
          hasMore = false;
        }
      }

      // Preserve backend synced flag
      const clientsWithSyncStatus = allClients.map(c => ({
        ...c,
        synced: c.synced === true,
      }));
      setSyncClients(clientsWithSyncStatus);
      setSyncLoadProgress({ processed: clientsWithSyncStatus.length, total: clientsWithSyncStatus.length });

      // Auto-select segment and tab that have data
      if (clientsWithSyncStatus.length > 0) {
        const existing = clientsWithSyncStatus.filter(c => !!c.bitrix_deal_id);
        const newOnes = clientsWithSyncStatus.filter(c => !c.bitrix_deal_id);
        const bestSegment = existing.length > 0 ? "existing" : "new";
        setSyncSegment(bestSegment);

        const segData = bestSegment === "existing" ? existing : newOnes;
        const atrasado = segData.filter(c => c.status_class === "atrasado").length;
        const aberto = segData.filter(c => c.status_class === "aberto").length;
        const quitado = segData.filter(c => c.status_class === "quitado").length;
        if (atrasado > 0) setActiveTab("atrasado");
        else if (aberto > 0) setActiveTab("aberto");
        else if (quitado > 0) setActiveTab("quitado");
      }

      return clientsWithSyncStatus;
    } catch (e) {
      console.error("[loadSyncClients]", e);
      return [];
    } finally {
      setSyncClientsLoaded(true);
      setLoadingSyncClients(false);
    }
  };

  const handleSyncSingleClient = async (client: SyncClient, actionsOverride?: { contact: boolean; deal: boolean; invoices: boolean }, overridesOverride?: { name?: string; phone?: string; nif?: string }): Promise<{ contact_id?: string; deal_id?: string; invoices_created?: number } | null> => {
    setSyncingSingle(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/import-access-data`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({
          clientes: [],
          mode: "sync_single_client",
          client_id: client.client_id,
          member_id: resolvedMemberId,
          category_id: selectedCategoryId,
          actions: actionsOverride || editActions,
          overrides: overridesOverride || { name: editName, phone: editPhone, nif: editNif },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSyncClients(prev => prev.map(c =>
          c.client_id === client.client_id
            ? { ...c, synced: true, syncResult: data.results?.join("; ") || "OK", bitrix_contact_id: data.contact_id || c.bitrix_contact_id, bitrix_deal_id: data.deal_id || c.bitrix_deal_id }
            : c
        ));
        return { contact_id: data.contact_id, deal_id: data.deal_id, invoices_created: data.invoices_created || 0 };
      }
      return null;
    } catch (e) {
      console.error("[syncSingle]", e);
      return null;
    } finally {
      setSyncingSingle(false);
      setEditingClient(null);
    }
  };

  const handleSyncBatch = async (clientsToSync?: SyncClient[]) => {
    const useClients = clientsToSync || syncClients;
    const ids = clientsToSync ? clientsToSync.map(c => c.client_id) : Array.from(selectedIds);
    if (ids.length === 0) return;

    setSyncingBatch(true);
    batchAbortRef.current = false;

    // Create or reuse session
    let sessionId = syncSessionId;
    if (!sessionId) {
      sessionId = await createSession("sync_bitrix3", "n/a", ids.length);
      if (sessionId) setSyncSessionId(sessionId);
    }

    const progress = { current: 0, total: ids.length, contacts: 0, deals: 0, invoices: 0, errors: 0, currentName: "" };
    setBatchProgress(progress);
    const processedIds: string[] = [];

    for (const id of ids) {
      if (batchAbortRef.current) {
        console.log("[syncBatch] Aborted by user");
        break;
      }
      const client = useClients.find(c => c.client_id === id);
      if (!client || client.synced) {
        progress.current++;
        processedIds.push(id);
        setBatchProgress({ ...progress });
        continue;
      }
      progress.currentName = client.name;
      progress.current++;
      setBatchProgress({ ...progress });
      const result = await handleSyncSingleClient(client, batchActions, { name: client.name, phone: client.phones[0] || "", nif: client.nif || "" });
      if (result) {
        if (result.contact_id) progress.contacts++;
        if (result.deal_id) progress.deals++;
        progress.invoices += result.invoices_created || 0;
        processedIds.push(id);
        // Update syncClients in real-time so badges refresh
        setSyncClients(prev => prev.map(c => c.client_id === id ? { ...c, synced: true } : c));
      } else {
        progress.errors++;
        processedIds.push(id);
      }
      setBatchProgress({ ...progress });

      // Save progress after each client
      if (sessionId) {
        await saveSessionProgress(sessionId, processedIds.length, processedIds as any);
      }
    }

    setSyncingBatch(false);
    batchAbortRef.current = false;
    setSelectedIds(new Set());

    // Mark session done if all processed
    if (sessionId && processedIds.length >= ids.length) {
      await markSessionDone(sessionId);
    }
  };

  const handleCancelBatch = () => {
    batchAbortRef.current = true;
  };

  const openEditDialog = (client: SyncClient) => {
    setEditingClient(client);
    setEditName(client.name);
    setEditPhone(client.phones[0] || "");
    setEditNif(client.nif || "");
    setEditActions({ contact: true, deal: true, invoices: client.status_class !== "quitado" || true });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Primary segmentation: existing in Bitrix (has Deal) vs new (no Deal)
  const existingClients = syncClients.filter(c => !!c.bitrix_deal_id);
  const newClients = syncClients.filter(c => !c.bitrix_deal_id);
  const segmentedClients = syncSegment === "existing" ? existingClients : newClients;

  const filteredSyncClients = segmentedClients.filter(c => c.status_class === activeTab);
  const quitadoCount = segmentedClients.filter(c => c.status_class === "quitado").length;
  const abertoCount = segmentedClients.filter(c => c.status_class === "aberto").length;
  const atrasadoCount = segmentedClients.filter(c => c.status_class === "atrasado").length;
  const syncedCount = syncClients.filter(c => c.synced).length;
  const pendingCount = syncClients.filter(c => !c.synced).length;

  const selectAllInTab = () => {
    const ids = filteredSyncClients.filter(c => !c.synced).map(c => c.client_id);
    setSelectedIds(new Set(ids));
  };
  const deselectAll = () => setSelectedIds(new Set());

  const clientsErrorCount = clientsLogs.filter(l => l.status === "error").length;
  const clientsSuccessCount = clientsLogs.filter(l => l.status === "ok" || l.status === "partial").length;
  const clientsProgressPct = clientsProgress.total > 0 ? Math.round((clientsProgress.processed / clientsProgress.total) * 100) : 0;

  const honErrorCount = honorariosLogs.filter(l => l.status === "error").length;
  const honSuccessCount = honorariosLogs.filter(l => l.status === "ok" || l.status === "partial").length;
  const honProgressPct = honorariosProgress.total > 0 ? Math.round((honorariosProgress.processed / honorariosProgress.total) * 100) : 0;

  const isImporting = importingClients || importingHonorarios || syncingSingle || syncingBatch || loadingSyncClients;

  if (resumingPhase) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[300px]">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Restaurando sessão de importação ({resumingPhase})...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="b24-view-header">
        <h1 className="text-xl font-bold text-white">Importação Access</h1>
        <p className="text-white/60 text-sm mt-0.5">Importar clientes e honorários das tabelas originais do Access</p>
      </div>

      {/* ═══════ FASE 1: CLIENTES ═══════ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Badge variant={clientsDone ? "default" : "outline"} className="text-xs">FASE 1</Badge>
            <Users className="h-5 w-5" /> Importar Clientes
          </CardTitle>
          <CardDescription>
            Carregue TBL_CLIENTE.xlsx para criar/actualizar clientes na base de dados local
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Resume banner */}
          {clientsSessionId && clientsProgress.processed > 0 && !clientsDone && !importingClients && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20">
              <AlertCircle className="h-4 w-4 text-primary shrink-0" />
              <p className="text-xs text-foreground flex-1">
                Sessão anterior encontrada: {clientsProgress.processed}/{clientsProgress.total} clientes processados. A retomada é automática.
              </p>
              <Button variant="ghost" size="sm" className="text-xs h-7 shrink-0" onClick={() => handleClearSession("clients")}>
                <Trash2 className="h-3 w-3 mr-1" /> Limpar
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-sm font-medium">TBL_CLIENTE.xlsx</Label>
            <Input type="file" accept=".xlsx,.xls" onChange={handleClientesUpload} disabled={isImporting} />
            {validClients && (
              <p className="text-xs text-muted-foreground">✅ {validClients.length} clientes válidos carregados (excluindo IDs ≤ 3){clientsSessionId ? " · 📁 Ficheiro guardado" : ""}</p>
            )}
          </div>

          {validClients && validClients.length > 0 && (
            <div className="flex gap-2">
              <Button onClick={handleImportClients} disabled={isImporting} className="flex-1" size="lg">
                {importingClients ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Importando Clientes... ({clientsProgressPct}%)</>
                ) : clientsProgress.processed > 0 && !clientsDone ? (
                  <><RefreshCw className="h-4 w-4 mr-2" /> Retomar ({clientsProgress.processed}/{validClients.length})</>
                ) : clientsDone ? (
                  <><CheckCircle className="h-4 w-4 mr-2" /> Re-importar {validClients.length} Clientes</>
                ) : (
                  <><Upload className="h-4 w-4 mr-2" /> Importar {validClients.length} Clientes</>
                )}
              </Button>
              {clientsSessionId && (
                <Button variant="outline" size="lg" onClick={() => handleClearSession("clients")} disabled={isImporting} title="Limpar sessão e ficheiro">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}

          {/* Phase 1 Progress */}
          {(importingClients || clientsDone) && (
            <div className="space-y-3 pt-2 border-t">
              <div className="w-full bg-muted rounded-full h-2.5">
                <div className="bg-primary h-2.5 rounded-full transition-all duration-300" style={{ width: `${clientsProgressPct}%` }} />
              </div>
              <p className="text-xs text-muted-foreground text-center">
                {clientsProgress.processed} / {clientsProgress.total} clientes processados
              </p>
              {clientsDone && (
                <div className="flex gap-3 justify-center">
                  <Badge variant="default" className="text-xs">✅ {clientsSuccessCount} OK</Badge>
                  {clientsErrorCount > 0 && <Badge variant="destructive" className="text-xs">❌ {clientsErrorCount} Erros</Badge>}
                </div>
              )}
              {clientsLogs.filter(l => l.status === "error").length > 0 && (
                <ScrollArea className="h-32 border rounded-lg p-2">
                  {clientsLogs.filter(l => l.status === "error").map((l, i) => (
                    <div key={i} className="text-xs text-destructive mb-1">
                      <strong>{l.client_name}:</strong> {l.error}
                    </div>
                  ))}
                </ScrollArea>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══════ FASE 2: HONORÁRIOS ═══════ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Badge variant={honorariosDone ? "default" : "outline"} className="text-xs">FASE 2</Badge>
            <DollarSign className="h-5 w-5" /> Importar Honorários
          </CardTitle>
          <CardDescription>
            Carregue TBL_HONORARIOS.xlsx para criar serviços, contratos e registos financeiros na base de dados local.
            Os clientes já existentes serão usados automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Resume banner */}
          {honorariosSessionId && honorariosProgress.processed > 0 && !honorariosDone && !importingHonorarios && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20">
              <AlertCircle className="h-4 w-4 text-primary shrink-0" />
              <p className="text-xs text-foreground flex-1">
                Sessão anterior encontrada: {honorariosProgress.processed}/{honorariosProgress.total} clientes processados. A retomada é automática.
              </p>
              <Button variant="ghost" size="sm" className="text-xs h-7 shrink-0" onClick={() => handleClearSession("honorarios")}>
                <Trash2 className="h-3 w-3 mr-1" /> Limpar
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-sm font-medium">TBL_HONORARIOS.xlsx</Label>
            <Input type="file" accept=".xlsx,.xls" onChange={handleHonorariosUpload} disabled={isImporting} />
            {honorariosData && (
              <p className="text-xs text-muted-foreground">✅ {honorariosData.length} registos carregados{honorariosSessionId ? " · 📁 Ficheiro guardado" : ""}</p>
            )}
            <p className="text-xs text-muted-foreground">Os clientes importados na Fase 1 serão usados automaticamente da base de dados.</p>
          </div>

          {/* Filters */}
          {honorariosData && (
            <div className="space-y-3 pt-3 border-t">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Filtros</Label>
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Data De (contrato)</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className={cn("w-[150px] justify-start text-left text-xs gap-1", !filterDateFrom && "text-muted-foreground")}>
                        <CalendarIcon className="h-3 w-3" />
                        {filterDateFrom ? format(filterDateFrom, "dd/MM/yyyy") : "Sem limite"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={filterDateFrom} onSelect={setFilterDateFrom} className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Data Até</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className={cn("w-[150px] justify-start text-left text-xs gap-1", !filterDateTo && "text-muted-foreground")}>
                        <CalendarIcon className="h-3 w-3" />
                        {filterDateTo ? format(filterDateTo, "dd/MM/yyyy") : "Sem limite"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={filterDateTo} onSelect={setFilterDateTo} className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Status</Label>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-[150px] h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      <SelectItem value="QUITADO">Quitado</SelectItem>
                      <SelectItem value="ATRASADO">Atrasado</SelectItem>
                      <SelectItem value="PENDENTE">Pendente/Aberto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {(filterDateFrom || filterDateTo || filterStatus !== "todos") && (
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setFilterDateFrom(undefined); setFilterDateTo(undefined); setFilterStatus("todos"); }}>
                    <RotateCcw className="h-3 w-3 mr-1" /> Limpar
                  </Button>
                )}
                <div className="ml-auto text-xs text-muted-foreground">
                  {filteredHonorarios ? `${filteredHonorarios.length} de ${honorariosData.length} parcelas` : ""}
                  {filteredClientes ? ` · ${filteredClientes.length} clientes` : ""}
                </div>
              </div>
            </div>
          )}

          {/* Stats Preview */}
          {stats && (
            <div className="space-y-4 pt-3 border-t">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="text-center p-2.5 rounded-lg bg-muted">
                  <p className="text-xl font-bold text-foreground">{stats.totalClients}</p>
                  <p className="text-xs text-muted-foreground">Clientes</p>
                </div>
                <div className="text-center p-2.5 rounded-lg bg-muted">
                  <p className="text-xl font-bold text-foreground">{stats.totalHonorarios}</p>
                  <p className="text-xs text-muted-foreground">Parcelas</p>
                </div>
                <div className="text-center p-2.5 rounded-lg bg-muted">
                  <p className="text-xl font-bold text-foreground">€{stats.totalValue.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</p>
                  <p className="text-xs text-muted-foreground">Valor Total</p>
                </div>
                <div className="text-center p-2.5 rounded-lg bg-muted">
                  <p className="text-xl font-bold text-foreground">€{stats.totalPaid.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</p>
                  <p className="text-xs text-muted-foreground">Total Pago</p>
                </div>
                <div className="text-center p-2.5 rounded-lg bg-muted">
                  <p className="text-xl font-bold text-green-500">{stats.paidCount}</p>
                  <p className="text-xs text-muted-foreground">Quitados</p>
                </div>
                <div className="text-center p-2.5 rounded-lg bg-muted">
                  <p className="text-xl font-bold text-yellow-500">{stats.pendingCount}</p>
                  <p className="text-xs text-muted-foreground">Pendentes</p>
                </div>
                <div className="text-center p-2.5 rounded-lg bg-muted">
                  <p className="text-xl font-bold text-destructive">{stats.overdueCount}</p>
                  <p className="text-xs text-muted-foreground">Atrasados</p>
                </div>
                <div className="text-center p-2.5 rounded-lg bg-muted">
                  <p className="text-xl font-bold text-foreground">{stats.activeClients}</p>
                  <p className="text-xs text-muted-foreground">Activos</p>
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleImportHonorarios} disabled={isImporting} className="flex-1" size="lg">
                  {importingHonorarios ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Importando Honorários... ({honProgressPct}%)</>
                  ) : honorariosProgress.processed > 0 && !honorariosDone ? (
                    <><RefreshCw className="h-4 w-4 mr-2" /> Retomar ({honorariosProgress.processed}/{stats.totalClients})</>
                  ) : honorariosDone ? (
                    <><CheckCircle className="h-4 w-4 mr-2" /> Re-importar {stats.totalClients} Clientes ({stats.totalHonorarios} parcelas)</>
                  ) : (
                    <><Upload className="h-4 w-4 mr-2" /> Importar {stats.totalClients} Clientes ({stats.totalHonorarios} parcelas)</>
                  )}
                </Button>
                {honorariosSessionId && (
                  <Button variant="outline" size="lg" onClick={() => handleClearSession("honorarios")} disabled={isImporting} title="Limpar sessão e ficheiro">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Phase 2 Progress */}
          {(importingHonorarios || honorariosDone) && (
            <div className="space-y-3 pt-2 border-t">
              <div className="w-full bg-muted rounded-full h-2.5">
                <div className="bg-primary h-2.5 rounded-full transition-all duration-300" style={{ width: `${honProgressPct}%` }} />
              </div>
              <p className="text-xs text-muted-foreground text-center">
                {honorariosProgress.processed} / {honorariosProgress.total} clientes processados
              </p>
              {honorariosDone && (
                <div className="flex gap-3 justify-center">
                  <Badge variant="default" className="text-xs">✅ {honSuccessCount} OK</Badge>
                  {honErrorCount > 0 && <Badge variant="destructive" className="text-xs">❌ {honErrorCount} Erros</Badge>}
                </div>
              )}
              {honorariosLogs.filter(l => l.status === "error").length > 0 && (
                <ScrollArea className="h-32 border rounded-lg p-2">
                  {honorariosLogs.filter(l => l.status === "error").map((l, i) => (
                    <div key={i} className="text-xs text-destructive mb-1">
                      <strong>{l.client_name}:</strong> {l.error}
                    </div>
                  ))}
                </ScrollArea>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══════ FASE 3: SINCRONIZAR BITRIX24 (INTERACTIVO) ═══════ */}
      <Card className={cn(!integration && "opacity-50")}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Badge variant={syncClientsLoaded ? "default" : "outline"} className="text-xs">FASE 3</Badge>
            <RefreshCw className="h-5 w-5" /> Sincronizar com Bitrix24
          </CardTitle>
          <CardDescription>
            {integration
              ? "Carregue os clientes importados, revise por status e aprove um a um ou em lote."
              : "Integração com Bitrix24 não disponível."
            }
          </CardDescription>
          {syncClientsLoaded && syncClients.length > 0 && (
            <div className="flex items-center gap-3 mt-2">
              <Badge variant="default" className="text-xs">✅ {syncedCount} sincronizados</Badge>
              <Badge variant="outline" className="text-xs">⏳ {pendingCount} pendentes</Badge>
              <span className="text-xs text-muted-foreground">{syncClients.length} total</span>
              {syncSessionId && (
                <Badge variant="secondary" className="text-[10px]">📁 Sessão activa</Badge>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {!integration ? (
            <p className="text-sm text-muted-foreground">⚠️ Sem integração Bitrix24 activa.</p>
          ) : (
            <>
              {/* Auto-resume banner */}
              {syncSessionId && !syncingBatch && !loadingSyncClients && autoResumeSyncPending && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20">
                  <AlertCircle className="h-4 w-4 text-primary shrink-0" />
                  <p className="text-xs text-foreground flex-1">
                    Sessão anterior detectada. A retomada automática será iniciada...
                  </p>
                  <Button variant="ghost" size="sm" className="text-xs h-7 shrink-0" onClick={async () => {
                    if (syncSessionId) { await markSessionDone(syncSessionId); setSyncSessionId(null); }
                    setAutoResumeSyncPending(false);
                  }}>
                    <Trash2 className="h-3 w-3 mr-1" /> Cancelar
                  </Button>
                </div>
              )}

              {/* Pipeline selector */}
              <div className="space-y-1.5">
                <Label className="text-sm">Pipeline de destino para novos Deals</Label>
                <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId} disabled={isImporting || loadingPipelines}>
                  <SelectTrigger className="w-full md:w-64">
                    <SelectValue placeholder={loadingPipelines ? "Carregando..." : "Selecionar pipeline"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Pipeline Geral (padrão)</SelectItem>
                    {pipelines.filter(p => p.id !== "0" && p.id !== "C0").map(p => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {pipelinesFeedback && !loadingPipelines && (
                  <p className="text-xs text-muted-foreground">ℹ️ {pipelinesFeedback}</p>
                )}
              </div>

              {/* Load clients buttons */}
              <div className="flex gap-2">
                <Button onClick={() => handleLoadSyncClients(false)} disabled={isImporting} className="flex-1" size="lg" variant="outline">
                  {loadingSyncClients ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando clientes... {syncLoadProgress.total > 0 ? `(${syncLoadProgress.processed}/${syncLoadProgress.total})` : ""}</>
                  ) : syncClientsLoaded ? (
                    <><RefreshCw className="h-4 w-4 mr-2" /> Recarregar ({syncClients.length} clientes)</>
                  ) : (
                    <><Users className="h-4 w-4 mr-2" /> Carregar Clientes para Sincronização</>
                  )}
                </Button>
                {syncClientsLoaded && (
                  <Button onClick={() => handleLoadSyncClients(true)} disabled={isImporting || loadingSyncClients} size="lg" variant="ghost" title="Forçar actualização dos dados do Bitrix24 (ignora cache)">
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {/* Loading progress bar */}
              {loadingSyncClients && syncLoadProgress.total > 0 && (
                <div className="space-y-1">
                  <Progress value={Math.round((syncLoadProgress.processed / syncLoadProgress.total) * 100)} className="h-2" />
                  <p className="text-xs text-muted-foreground text-center">
                    {syncLoadProgress.processed} / {syncLoadProgress.total} clientes carregados ({syncClients.length} com dados financeiros)
                  </p>
                </div>
              )}

              {/* Tabs + Client list */}
              {syncClientsLoaded && syncClients.length > 0 && (
                <div className="space-y-4 pt-3 border-t">
                  {/* Primary segmentation: Existing vs New */}
                  <div className="flex gap-2 mb-2">
                    <Button
                      variant={syncSegment === "existing" ? "default" : "outline"}
                      size="sm"
                      onClick={() => { setSyncSegment("existing"); setSelectedIds(new Set()); }}
                      className="text-xs"
                    >
                      <RefreshCw className="h-3.5 w-3.5 mr-1" /> Etapa A: Sincronizar existentes ({existingClients.length})
                    </Button>
                    <Button
                      variant={syncSegment === "new" ? "default" : "outline"}
                      size="sm"
                      onClick={() => { setSyncSegment("new"); setSelectedIds(new Set()); }}
                      className="text-xs"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" /> Etapa B: Cadastrar novos ({newClients.length})
                    </Button>
                  </div>

                  {/* Status tabs (secondary filter) */}
                  <div className="flex gap-2">
                    <Button
                      variant={activeTab === "atrasado" ? "default" : "outline"}
                      size="sm"
                      onClick={() => { setActiveTab("atrasado"); setSelectedIds(new Set()); }}
                      className="text-xs"
                    >
                      <AlertTriangle className="h-3.5 w-3.5 mr-1" /> Atrasados ({atrasadoCount})
                    </Button>
                    <Button
                      variant={activeTab === "aberto" ? "default" : "outline"}
                      size="sm"
                      onClick={() => { setActiveTab("aberto"); setSelectedIds(new Set()); }}
                      className="text-xs"
                    >
                      <Clock className="h-3.5 w-3.5 mr-1" /> Em Aberto ({abertoCount})
                    </Button>
                    <Button
                      variant={activeTab === "quitado" ? "default" : "outline"}
                      size="sm"
                      onClick={() => { setActiveTab("quitado"); setSelectedIds(new Set()); }}
                      className="text-xs"
                    >
                      <CheckCircle className="h-3.5 w-3.5 mr-1" /> Quitados ({quitadoCount})
                    </Button>
                  </div>

                  {/* Batch toolbar */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <Button variant="ghost" size="sm" className="text-xs" onClick={selectAllInTab}>
                      Selecionar todos ({filteredSyncClients.filter(c => !c.synced).length})
                    </Button>
                    {selectedIds.size > 0 && (
                      <>
                        <Button variant="ghost" size="sm" className="text-xs" onClick={deselectAll}>
                          Desmarcar
                        </Button>
                        <Separator orientation="vertical" className="h-5" />
                        <div className="flex items-center gap-2 text-xs">
                          <label className="flex items-center gap-1"><input type="checkbox" checked={batchActions.contact} onChange={e => setBatchActions(p => ({ ...p, contact: e.target.checked }))} className="h-3 w-3" /> Contacto</label>
                          <label className="flex items-center gap-1"><input type="checkbox" checked={batchActions.deal} onChange={e => setBatchActions(p => ({ ...p, deal: e.target.checked }))} className="h-3 w-3" /> Deal</label>
                          <label className="flex items-center gap-1"><input type="checkbox" checked={batchActions.invoices} onChange={e => setBatchActions(p => ({ ...p, invoices: e.target.checked }))} className="h-3 w-3" /> Faturas</label>
                        </div>
                        {syncingBatch ? (
                          <Button size="sm" variant="destructive" onClick={handleCancelBatch} className="text-xs ml-auto">
                            <XCircle className="h-3.5 w-3.5 mr-1" /> Parar Sincronização
                          </Button>
                        ) : (
                          <Button size="sm" onClick={() => handleSyncBatch()} disabled={selectedIds.size === 0} className="text-xs ml-auto">
                            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Sincronizar {selectedIds.size} seleccionados
                          </Button>
                        )}
                      </>
                    )}
                  </div>

                  {/* Batch progress panel */}
                  {batchProgress.total > 0 && (
                    <div className={cn("border rounded-lg p-3 space-y-2", syncingBatch ? "bg-muted/30" : "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800")}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-foreground">
                          {syncingBatch 
                            ? `Sincronizando ${batchProgress.current}/${batchProgress.total} — ${batchProgress.currentName}`
                            : `✅ Concluído — ${batchProgress.current}/${batchProgress.total} processados`
                          }
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">{Math.round((batchProgress.current / batchProgress.total) * 100)}%</span>
                          {!syncingBatch && (
                            <Button variant="ghost" size="sm" className="h-5 px-1.5 text-xs" onClick={() => setBatchProgress({ current: 0, total: 0, contacts: 0, deals: 0, invoices: 0, errors: 0, currentName: "" })}>
                              Fechar
                            </Button>
                          )}
                        </div>
                      </div>
                      <Progress value={(batchProgress.current / batchProgress.total) * 100} className="h-2" />
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> Contactos: <span className="font-semibold text-foreground">{batchProgress.contacts}</span></span>
                        <span className="flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> Negócios: <span className="font-semibold text-foreground">{batchProgress.deals}</span></span>
                        <span className="flex items-center gap-1"><CreditCard className="h-3.5 w-3.5" /> Faturas: <span className="font-semibold text-foreground">{batchProgress.invoices}</span></span>
                        {batchProgress.errors > 0 && (
                          <span className="flex items-center gap-1 text-destructive"><XCircle className="h-3.5 w-3.5" /> Erros: <span className="font-semibold">{batchProgress.errors}</span></span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Client list */}
                  <ScrollArea className="h-[400px] border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10"></TableHead>
                          <TableHead>Nome</TableHead>
                          <TableHead>NIF</TableHead>
                          <TableHead>Telefone</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                          <TableHead className="text-right">Pago</TableHead>
                          <TableHead>Bitrix</TableHead>
                          <TableHead className="w-24">Acção</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredSyncClients.map(client => (
                          <TableRow key={client.client_id} className={cn(client.synced && "opacity-60 bg-muted/30")}>
                            <TableCell>
                              {!client.synced && (
                                <input
                                  type="checkbox"
                                  checked={selectedIds.has(client.client_id)}
                                  onChange={() => toggleSelect(client.client_id)}
                                  className="h-4 w-4"
                                />
                              )}
                              {client.synced && <CheckCircle className="h-4 w-4 text-green-500" />}
                            </TableCell>
                            <TableCell className="font-medium text-xs">{client.name}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{client.nif || "—"}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{client.phones[0] || "—"}</TableCell>
                            <TableCell className="text-right text-xs">€{client.total_value.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</TableCell>
                            <TableCell className="text-right text-xs">€{client.total_paid.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</TableCell>
                            <TableCell>
                              {client.bitrix_deal_id ? (
                                <div className="flex flex-col gap-0.5">
                                  <Badge variant="outline" className="text-[10px]">Deal #{client.bitrix_deal_id}</Badge>
                                  <span className="text-[9px] text-muted-foreground">
                                    via {client.match_type === "access_id" ? "Access ID" : client.match_type === "nif" ? "NIF" : client.match_type === "phone" ? "Telefone" : client.match_type === "email" ? "Email" : client.match_type === "name" ? "Nome" : "—"}
                                  </span>
                                </div>
                              ) : client.bitrix_contact_id ? (
                                <div className="flex flex-col gap-0.5">
                                  <Badge variant="secondary" className="text-[10px]">Contacto #{client.bitrix_contact_id}</Badge>
                                  <span className="text-[9px] text-muted-foreground">
                                    via {client.match_type === "phone" ? "Telefone" : client.match_type === "email" ? "Email" : client.match_type === "name" ? "Nome" : "—"}
                                  </span>
                                </div>
                              ) : (
                                <Badge variant="outline" className="text-[10px] border-dashed">Novo</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {client.synced ? (
                                <span className="text-[10px] text-green-600">{client.syncResult?.substring(0, 30) || "✅"}</span>
                              ) : (
                                <div className="flex gap-1">
                                  <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => openEditDialog(client)}>
                                    <Edit className="h-3 w-3 mr-1" /> Sync
                                  </Button>
                                  <Button size="sm" variant="ghost" className="text-xs h-7 text-muted-foreground" onClick={() => handleMarkAsSynced(client)} title="Marcar como sincronizado manualmente">
                                    <CheckCircle className="h-3 w-3" />
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                        {filteredSyncClients.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                              Nenhum cliente com status "{activeTab}" encontrado.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>
              )}

              {syncClientsLoaded && syncClients.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum cliente importado encontrado na base de dados. Execute as Fases 1 e 2 primeiro.</p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ═══════ ENRIQUECER CONTACTOS BITRIX24 ═══════ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link className="h-5 w-5" /> Enriquecer Contactos Bitrix24
          </CardTitle>
          <CardDescription>
            Importe o CSV de contactos do Bitrix24 para associar o ID e nome do contacto aos clientes (correspondência via ID Access → coluna EF). ⚠️ O CSV não inclui telefone — use a API do Bitrix para obter esse dado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Input
              type="file"
              accept=".csv"
              disabled={enriching}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setEnriching(true);
                setEnrichDone(false);
                setEnrichProgress({ processed: 0, total: 0, updated: 0, notFound: 0, skipped: 0, contactsCreated: 0 });

                try {
                  const text = await file.text();
                  const lines = text.split("\n").filter(l => l.trim());
                  const rows = lines.slice(1); // skip header
                  const total = rows.length;
                  setEnrichProgress(p => ({ ...p, total }));

                  let updated = 0, notFound = 0, skipped = 0, contactsCreated = 0;
                  const BATCH = 50;

                  for (let i = 0; i < rows.length; i += BATCH) {
                    const batch = rows.slice(i, i + BATCH);
                    const promises = batch.map(async (row) => {
                      const cols = row.split(";").map(c => c.replace(/^"|"$/g, "").trim());
                      const ef = cols[0]; // EF = id_access
                      const rawName = cols[2] || ""; // Nome
                      const bitrixId = cols[22]; // ID = bitrix24 contact id
                      if (!ef || !bitrixId || ef === "EF" || bitrixId === "ID") {
                        skipped++;
                        return;
                      }

                      // Extract clean contact name (remove "EF XXX - " prefix and " - ADMINISTRAT..." suffix)
                      let contactName = rawName;
                      const nameMatch = rawName.match(/^EF\s+\d+\s*-\s*(.+?)(?:\s*-\s*ADMINISTRAT.*)?$/i);
                      if (nameMatch) contactName = nameMatch[1].trim();

                      // Update bitrix24_id on client
                      const { data, error } = await supabase
                        .from("clients")
                        .update({ bitrix24_id: bitrixId })
                        .eq("id_access", ef)
                        .is("bitrix24_id", null)
                        .select("id")
                        .maybeSingle();

                      let clientId: string | null = null;

                      if (data) {
                        updated++;
                        clientId = data.id;
                      } else if (!error) {
                        // Check if client exists but already has bitrix24_id
                        const { data: existing } = await supabase
                          .from("clients")
                          .select("id, bitrix24_id")
                          .eq("id_access", ef)
                          .maybeSingle();
                        if (existing) {
                          skipped++;
                          clientId = existing.id;
                        } else {
                          notFound++;
                        }
                      } else {
                        notFound++;
                      }

                      // Create/update contact entry with Bitrix name
                      if (clientId && contactName) {
                        const { data: existingContact } = await supabase
                          .from("client_contacts")
                          .select("id")
                          .eq("client_id", clientId)
                          .eq("name", contactName)
                          .maybeSingle();
                        if (!existingContact) {
                          await supabase.from("client_contacts").insert({
                            client_id: clientId,
                            name: contactName,
                          });
                          contactsCreated++;
                        }
                      }
                    });
                    await Promise.all(promises);
                    setEnrichProgress({ processed: Math.min(i + BATCH, total), total, updated, notFound, skipped, contactsCreated });
                  }

                  setEnrichProgress({ processed: total, total, updated, notFound, skipped, contactsCreated });
                  setEnrichDone(true);
                } catch (err: any) {
                  console.error("[enrich]", err);
                } finally {
                  setEnriching(false);
                }
              }}
              className="max-w-sm"
            />
            {enriching && <Loader2 className="h-4 w-4 animate-spin" />}
          </div>

          {(enriching || enrichDone) && (
            <div className="space-y-3">
              <Progress value={enrichProgress.total > 0 ? (enrichProgress.processed / enrichProgress.total) * 100 : 0} className="h-2" />
              <div className="flex gap-4 text-sm flex-wrap">
                <span className="text-muted-foreground">{enrichProgress.processed}/{enrichProgress.total} processados</span>
                <span className="text-green-500 font-medium">✅ {enrichProgress.updated} actualizados</span>
                <span className="text-yellow-500">⏭ {enrichProgress.skipped} já existentes</span>
                <span className="text-red-400">❌ {enrichProgress.notFound} não encontrados</span>
                <span className="text-blue-500">👤 {enrichProgress.contactsCreated} contactos criados</span>
              </div>
              {enrichDone && (
                <Badge variant="default" className="text-xs">
                  <CheckCircle className="h-3 w-3 mr-1" /> Concluído
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══════ DIALOG: Aprovação Individual ═══════ */}
      <Dialog open={!!editingClient} onOpenChange={(open) => { if (!open) setEditingClient(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sincronizar Cliente</DialogTitle>
            <DialogDescription>
              Revise e edite os dados antes de enviar ao Bitrix24.
            </DialogDescription>
          </DialogHeader>
          {editingClient && (
            <div className="space-y-4">
              {/* Match info */}
              {editingClient.bitrix_deal_id && (
                <div className="p-2.5 rounded-lg bg-muted text-xs">
                  <p className="font-medium">Match encontrado no Bitrix24</p>
                  <p className="text-muted-foreground">Deal #{editingClient.bitrix_deal_id} {editingClient.bitrix_contact_id ? `· Contacto #${editingClient.bitrix_contact_id}` : ""}</p>
                </div>
              )}

              {/* Status badge */}
              <div className="flex items-center gap-2">
                <Badge variant={editingClient.status_class === "quitado" ? "default" : editingClient.status_class === "atrasado" ? "destructive" : "secondary"} className="text-xs">
                  {editingClient.status_class === "quitado" ? "Quitado" : editingClient.status_class === "atrasado" ? "Atrasado" : "Em Aberto"}
                </Badge>
                <span className="text-xs text-muted-foreground">{editingClient.records_count} parcelas · {editingClient.services.length} serviço(s)</span>
              </div>

              {/* Editable fields */}
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Nome</Label>
                  <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-9 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Telefone</Label>
                    <Input value={editPhone} onChange={e => setEditPhone(e.target.value)} className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">NIF/CPF</Label>
                    <Input value={editNif} onChange={e => setEditNif(e.target.value)} className="h-9 text-sm" />
                  </div>
                </div>
              </div>

              {/* Totals */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-2 rounded bg-muted text-center">
                  <p className="text-sm font-bold">€{editingClient.total_value.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</p>
                  <p className="text-[10px] text-muted-foreground">Valor Total</p>
                </div>
                <div className="p-2 rounded bg-muted text-center">
                  <p className="text-sm font-bold">€{editingClient.total_paid.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</p>
                  <p className="text-[10px] text-muted-foreground">Total Pago</p>
                </div>
              </div>

              {/* Actions checkboxes */}
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">O que criar/actualizar no Bitrix24</Label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={editActions.contact} onChange={e => setEditActions(p => ({ ...p, contact: e.target.checked }))} className="h-4 w-4 rounded" />
                    Contacto
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={editActions.deal} onChange={e => setEditActions(p => ({ ...p, deal: e.target.checked }))} className="h-4 w-4 rounded" />
                    Deal
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={editActions.invoices} onChange={e => setEditActions(p => ({ ...p, invoices: e.target.checked }))} className="h-4 w-4 rounded" />
                    Faturas
                  </label>
                </div>
              </div>

              <Button
                onClick={() => handleSyncSingleClient(editingClient)}
                disabled={syncingSingle || (!editActions.contact && !editActions.deal && !editActions.invoices)}
                className="w-full"
              >
                {syncingSingle ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Sincronizando...</>
                ) : (
                  <><RefreshCw className="h-4 w-4 mr-2" /> Confirmar Sincronização</>
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default Bitrix24App;
