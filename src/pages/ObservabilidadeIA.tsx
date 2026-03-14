import { useAiObservability } from "@/hooks/useAiObservability";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Activity, Zap, Clock, AlertTriangle, ThumbsUp, DollarSign, Bot, Cpu } from "lucide-react";
import { useState } from "react";

export default function ObservabilidadeIAPage() {
  const [period, setPeriod] = useState(30);
  const { metrics, loading } = useAiObservability(period);

  if (loading || !metrics) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Observabilidade IA</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <Card key={i}><CardContent className="p-6"><div className="h-16 bg-muted animate-pulse rounded" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  const kpis = [
    { label: "Requisições", value: metrics.totalRequests.toLocaleString(), icon: Activity, color: "text-primary" },
    { label: "Tokens Totais", value: metrics.totalTokens > 1_000_000 ? `${(metrics.totalTokens / 1_000_000).toFixed(1)}M` : metrics.totalTokens > 1000 ? `${(metrics.totalTokens / 1000).toFixed(1)}K` : metrics.totalTokens.toString(), icon: Zap, color: "text-chart-1" },
    { label: "Custo Estimado", value: `€${metrics.totalCost.toFixed(2)}`, icon: DollarSign, color: "text-chart-2" },
    { label: "Latência Média", value: `${metrics.avgLatency}ms`, icon: Clock, color: "text-chart-3" },
    { label: "Taxa Fallback", value: `${metrics.fallbackRate.toFixed(1)}%`, icon: AlertTriangle, color: metrics.fallbackRate > 10 ? "text-destructive" : "text-chart-4" },
    { label: "Taxa Erro", value: `${metrics.errorRate.toFixed(1)}%`, icon: AlertTriangle, color: metrics.errorRate > 5 ? "text-destructive" : "text-chart-5" },
    { label: "Rating Médio", value: metrics.feedbackCount > 0 ? `${metrics.avgFeedbackRating}/5` : "N/A", icon: ThumbsUp, color: "text-primary" },
    { label: "Feedbacks", value: metrics.feedbackCount.toString(), icon: ThumbsUp, color: "text-muted-foreground" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Observabilidade IA</h1>
        <Select value={String(period)} onValueChange={(v) => setPeriod(Number(v))}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 dias</SelectItem>
            <SelectItem value="30">30 dias</SelectItem>
            <SelectItem value="90">90 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                <span className="text-xs text-muted-foreground">{kpi.label}</span>
              </div>
              <p className="text-2xl font-bold">{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Daily Usage Chart */}
      {metrics.dailyUsage.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Uso Diário</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.dailyUsage}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                  />
                  <Bar dataKey="requests" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Requisições" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* By Agent */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Bot className="h-4 w-4" /> Por Agente</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agente</TableHead>
                  <TableHead className="text-right">Req.</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead className="text-right">Latência</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.byAgent.slice(0, 10).map((a) => (
                  <TableRow key={a.agentId}>
                    <TableCell className="font-medium text-sm">
                      {a.agentName}
                      {a.fallbacks > 0 && <Badge variant="outline" className="ml-2 text-[10px]">{a.fallbacks} fb</Badge>}
                    </TableCell>
                    <TableCell className="text-right text-sm">{a.requests}</TableCell>
                    <TableCell className="text-right text-sm">{(a.tokens / 1000).toFixed(1)}K</TableCell>
                    <TableCell className="text-right text-sm">{a.avgLatency}ms</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* By Model */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Cpu className="h-4 w-4" /> Por Modelo</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Modelo</TableHead>
                  <TableHead className="text-right">Req.</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead className="text-right">Custo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.byModel.slice(0, 10).map((m) => (
                  <TableRow key={m.model}>
                    <TableCell className="font-medium text-sm font-mono">{m.model.replace(/^(google|openai)\//, "")}</TableCell>
                    <TableCell className="text-right text-sm">{m.requests}</TableCell>
                    <TableCell className="text-right text-sm">{(m.tokens / 1000).toFixed(1)}K</TableCell>
                    <TableCell className="text-right text-sm">€{m.cost.toFixed(3)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
