import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";

interface ChainHealthRow {
  chain_id: string;
  chain_name: string;
  total: number;
  completed: number;
  escalated: number;
  failed: number;
  avg_cost: number;
  avg_tokens: number;
}

function statusBadge(status: string) {
  const variant =
    status === "completed" ? "default" : status === "escalated" ? "secondary" : "destructive";
  return <Badge variant={variant as any}>{status}</Badge>;
}

export default function ChainHealth() {
  const { data: chains, isLoading: loadingChains } = useQuery({
    queryKey: ["ai_chains"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_chains" as any)
        .select("id, name, description, is_active, quality_threshold, phases")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: executions, isLoading: loadingExec } = useQuery({
    queryKey: ["ai_chain_executions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_chain_executions" as any)
        .select("id, chain_id, status, final_score, total_cost_usd, total_tokens, started_at, completed_at")
        .order("started_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 10000,
  });

  const health: ChainHealthRow[] = (chains || []).map((c: any) => {
    const execs = (executions || []).filter((e: any) => e.chain_id === c.id);
    const completed = execs.filter((e: any) => e.status === "completed").length;
    const escalated = execs.filter((e: any) => e.status === "escalated").length;
    const failed = execs.filter((e: any) => e.status === "failed").length;
    const avg_cost =
      execs.length > 0 ? execs.reduce((s: number, e: any) => s + (e.total_cost_usd || 0), 0) / execs.length : 0;
    const avg_tokens =
      execs.length > 0 ? execs.reduce((s: number, e: any) => s + (e.total_tokens || 0), 0) / execs.length : 0;
    return {
      chain_id: c.id,
      chain_name: c.name,
      total: execs.length,
      completed,
      escalated,
      failed,
      avg_cost,
      avg_tokens,
    };
  });

  if (loadingChains || loadingExec) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Chain Health"
        description="Saúde do motor Emmely Chat Chain — execuções, escalações e custo por cadeia."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {health.map((h) => {
          const passRate = h.total > 0 ? Math.round((h.completed / h.total) * 100) : 0;
          return (
            <Card key={h.chain_id}>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span>{h.chain_name}</span>
                  <Badge variant={passRate >= 75 ? "default" : "secondary"}>{passRate}%</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total execuções</span>
                  <span className="font-medium">{h.total}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Concluídas</span>
                  <span className="font-medium text-emerald-600">{h.completed}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Escaladas</span>
                  <span className="font-medium text-amber-600">{h.escalated}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Falhas</span>
                  <span className="font-medium text-destructive">{h.failed}</span>
                </div>
                <div className="flex justify-between pt-2 border-t">
                  <span className="text-muted-foreground">Custo médio</span>
                  <span className="font-mono">${h.avg_cost.toFixed(4)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tokens médios</span>
                  <span className="font-mono">{Math.round(h.avg_tokens)}</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Últimas execuções</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {(executions || []).slice(0, 20).map((e: any) => (
              <div
                key={e.id}
                className="flex items-center justify-between border-b border-border/40 py-2 text-sm"
              >
                <div className="flex items-center gap-3">
                  {statusBadge(e.status)}
                  <span className="font-mono text-xs text-muted-foreground">
                    {e.id.slice(0, 8)}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>{e.total_tokens || 0} tokens</span>
                  <span className="font-mono">${(e.total_cost_usd || 0).toFixed(4)}</span>
                  <span>{new Date(e.started_at).toLocaleString()}</span>
                </div>
              </div>
            ))}
            {(!executions || executions.length === 0) && (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Nenhuma execução ainda. Dispare uma chain via{" "}
                <code className="text-xs">ai-chain-executor</code>.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
