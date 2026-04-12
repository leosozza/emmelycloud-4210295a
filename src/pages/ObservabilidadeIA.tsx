import { useAiObservability } from "@/hooks/useAiObservability";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Activity, Zap, Clock, AlertTriangle, ThumbsUp, DollarSign, Bot, Cpu, Shield, MessageSquare, ChevronDown, Wrench, Brain, Eye } from "lucide-react";
import { useState } from "react";

interface StepDetail {
  type: "thought" | "tool_call" | "tool_result" | "reflection";
  content: string;
  tool?: string;
  params?: any;
  duration_ms?: number;
  timestamp: string;
}

function StepBadge({ type }: { type: string }) {
  const config: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
    thought: { label: "Pensamento", variant: "secondary" },
    tool_call: { label: "Ferramenta", variant: "default" },
    tool_result: { label: "Resultado", variant: "outline" },
    reflection: { label: "Reflexão", variant: "destructive" },
  };
  const c = config[type] || { label: type, variant: "outline" as const };
  return <Badge variant={c.variant} className="text-[9px]">{c.label}</Badge>;
}

function StepIcon({ type }: { type: string }) {
  switch (type) {
    case "thought": return <Brain className="h-3 w-3 text-chart-3" />;
    case "tool_call": return <Wrench className="h-3 w-3 text-primary" />;
    case "tool_result": return <Eye className="h-3 w-3 text-chart-1" />;
    case "reflection": return <AlertTriangle className="h-3 w-3 text-destructive" />;
    default: return <Activity className="h-3 w-3" />;
  }
}

function StepDetails({ steps }: { steps: StepDetail[] }) {
  return (
    <div className="space-y-1.5 pl-4 border-l-2 border-border">
      {steps.map((step, i) => (
        <div key={i} className="flex items-start gap-2 text-xs">
          <StepIcon type={step.type} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <StepBadge type={step.type} />
              {step.tool && <span className="font-mono text-[10px] text-muted-foreground">{step.tool}</span>}
              {step.duration_ms != null && (
                <span className="text-[10px] text-muted-foreground">{step.duration_ms}ms</span>
              )}
            </div>
            <p className="text-foreground/70 line-clamp-2 break-all">{step.content}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

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
    { label: "Custo Estimado", value: `$${metrics.totalCost.toFixed(2)}`, icon: DollarSign, color: "text-chart-2" },
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
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
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
          <CardHeader><CardTitle className="text-base">Uso Diário</CardTitle></CardHeader>
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

      {/* Tabs */}
      <Tabs defaultValue="agents" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="agents" className="gap-1"><Bot className="h-3.5 w-3.5" /> Agentes</TabsTrigger>
          <TabsTrigger value="models" className="gap-1"><Cpu className="h-3.5 w-3.5" /> Modelos</TabsTrigger>
          <TabsTrigger value="react" className="gap-1"><Brain className="h-3.5 w-3.5" /> ReACT Logs</TabsTrigger>
          <TabsTrigger value="sessions" className="gap-1"><Activity className="h-3.5 w-3.5" /> Sessões</TabsTrigger>
          <TabsTrigger value="audit" className="gap-1"><Shield className="h-3.5 w-3.5" /> Audit</TabsTrigger>
          <TabsTrigger value="summaries" className="gap-1"><MessageSquare className="h-3.5 w-3.5" /> Resumos</TabsTrigger>
        </TabsList>

        {/* By Agent */}
        <TabsContent value="agents">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Bot className="h-4 w-4" /> Por Agente (com Budget)</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agente</TableHead>
                    <TableHead className="text-right">Req.</TableHead>
                    <TableHead className="text-right">Tokens</TableHead>
                    <TableHead className="text-right">Latência</TableHead>
                    <TableHead className="text-right">Custo Mês</TableHead>
                    <TableHead className="w-[180px]">Budget</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics.byAgent.slice(0, 15).map((a) => {
                    const budgetPct = a.monthlyBudget ? Math.min((a.monthlyCost / a.monthlyBudget) * 100, 100) : null;
                    const budgetColor = budgetPct !== null
                      ? budgetPct > 100 ? "bg-destructive" : budgetPct > 80 ? "bg-yellow-500" : ""
                      : "";
                    return (
                      <TableRow key={a.agentId}>
                        <TableCell className="font-medium text-sm">
                          {a.agentName}
                          {a.fallbacks > 0 && <Badge variant="outline" className="ml-2 text-[10px]">{a.fallbacks} fb</Badge>}
                        </TableCell>
                        <TableCell className="text-right text-sm">{a.requests}</TableCell>
                        <TableCell className="text-right text-sm">{(a.tokens / 1000).toFixed(1)}K</TableCell>
                        <TableCell className="text-right text-sm">{a.avgLatency}ms</TableCell>
                        <TableCell className="text-right text-sm">${a.monthlyCost.toFixed(3)}</TableCell>
                        <TableCell>
                          {a.monthlyBudget ? (
                            <div className="space-y-1">
                              <Progress value={budgetPct!} className={`h-2 ${budgetColor}`} />
                              <div className="flex justify-between text-[10px] text-muted-foreground">
                                <span>${a.monthlyCost.toFixed(2)}</span>
                                <span>${a.monthlyBudget.toFixed(2)}</span>
                              </div>
                              {budgetPct! > 80 && (
                                <Badge variant={budgetPct! > 100 ? "destructive" : "outline"} className="text-[9px]">
                                  {budgetPct! > 100 ? "Excedido!" : "Atenção"}
                                </Badge>
                              )}
                            </div>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">Ilimitado</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* By Model */}
        <TabsContent value="models">
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
                      <TableCell className="text-right text-sm">${m.cost.toFixed(3)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ReACT Logs — NEW TAB */}
        <TabsContent value="react">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Brain className="h-4 w-4" /> ReACT Agent Logs</CardTitle>
            </CardHeader>
            <CardContent>
              {metrics.reactLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum log ReACT registado neste período.</p>
              ) : (
                <div className="space-y-2">
                  {metrics.reactLogs.map((log) => (
                    <Collapsible key={log.id}>
                      <CollapsibleTrigger className="w-full">
                        <div className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                          <div className="flex items-center gap-3">
                            <Brain className="h-4 w-4 text-primary" />
                            <span className="text-sm font-medium">{log.agent_name}</span>
                            <Badge variant="outline" className="text-[10px]">
                              {log.step_count} passos
                            </Badge>
                            {log.tool_calls > 0 && (
                              <Badge variant="secondary" className="text-[10px]">
                                <Wrench className="h-2.5 w-2.5 mr-0.5" />
                                {log.tool_calls} ferramentas
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground">{log.latency_ms}ms</span>
                            <span className="text-[10px] text-muted-foreground">${Number(log.cost_estimate).toFixed(4)}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(log.created_at).toLocaleString("pt-PT")}
                            </span>
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="p-3 border border-t-0 rounded-b-lg bg-muted/20">
                          <StepDetails steps={log.steps} />
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sessions */}
        <TabsContent value="sessions">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" /> Sessões IA</CardTitle>
            </CardHeader>
            <CardContent>
              {metrics.sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhuma sessão registada neste período.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Agente</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Turns</TableHead>
                      <TableHead className="text-right">Tokens</TableHead>
                      <TableHead className="text-right">Custo</TableHead>
                      <TableHead className="text-right">Latência</TableHead>
                      <TableHead>Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {metrics.sessions.map((s) => (
                      <TableRow key={s.session_id}>
                        <TableCell className="text-sm font-medium">{s.agent_name}</TableCell>
                        <TableCell>
                          <Badge variant={s.status === "active" ? "default" : s.status === "completed" ? "secondary" : "outline"} className="text-[10px]">
                            {s.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-sm">{s.turn_count}</TableCell>
                        <TableCell className="text-right text-sm">{(s.total_tokens / 1000).toFixed(1)}K</TableCell>
                        <TableCell className="text-right text-sm">${Number(s.total_cost_usd).toFixed(4)}</TableCell>
                        <TableCell className="text-right text-sm">{s.avg_latency_ms ? `${Math.round(Number(s.avg_latency_ms))}ms` : "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{new Date(s.created_at).toLocaleDateString("pt-PT")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audit Logs */}
        <TabsContent value="audit">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Shield className="h-4 w-4" /> Audit Logs (Parity)</CardTitle>
            </CardHeader>
            <CardContent>
              {metrics.auditLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum audit log registado.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Erros</TableHead>
                      <TableHead className="text-right">Avisos</TableHead>
                      <TableHead>Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {metrics.auditLogs.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>
                          <Badge variant={a.overall_status === "healthy" ? "secondary" : a.errors_count > 0 ? "destructive" : "outline"} className="text-[10px]">
                            {a.overall_status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-sm">{a.errors_count}</TableCell>
                        <TableCell className="text-right text-sm">{a.warnings_count}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{new Date(a.created_at).toLocaleString("pt-PT")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Summaries */}
        <TabsContent value="summaries">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Resumos de Conversas</CardTitle>
            </CardHeader>
            <CardContent>
              {metrics.summaries.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum resumo gerado neste período.</p>
              ) : (
                <div className="space-y-3">
                  {metrics.summaries.map((s) => (
                    <div key={s.id} className="border rounded-lg p-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-[10px]">{s.messages_summarized} msgs</Badge>
                        <span className="text-[10px] text-muted-foreground">{new Date(s.created_at).toLocaleString("pt-PT")}</span>
                      </div>
                      <p className="text-sm text-foreground/80 line-clamp-3">{s.summary_text}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
