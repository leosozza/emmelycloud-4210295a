import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Wand2, Eye, Rocket, AlertTriangle } from "lucide-react";

interface MigrationResult {
  success: boolean;
  mode: string;
  session_id: string;
  background?: boolean;
  total_processed: number;
  success_count: number;
  failed_count: number;
  skipped_count: number;
  stage_map: Record<string, string>;
  mapped_uf_fields: string[];
  sample: any[];
  message?: string;
}

export default function MigracaoSpaTab() {
  const [creating, setCreating] = useState(false);
  const [running, setRunning] = useState(false);
  const [createResult, setCreateResult] = useState<any>(null);
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null);
  const [limitTest, setLimitTest] = useState(5);
  const [bgStatus, setBgStatus] = useState<{ processed: number; total: number; counts: any } | null>(null);

  const callFn = async (path: string, params: Record<string, string> = {}) => {
    const url = new URL(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${path}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString(), {
      headers: {
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
    });
    return res.json();
  };

  const handleCreateFields = async () => {
    setCreating(true);
    try {
      const r = await callFn("bitrix24-spa-create-fields");
      setCreateResult(r);
      if (r.success) {
        toast.success(`Campos: ${r.created} criados, ${r.skipped} já existiam, ${r.errors} erros`);
      } else {
        toast.error(r.error || "Falha ao criar campos");
      }
    } catch (e) {
      toast.error(String(e));
    } finally {
      setCreating(false);
    }
  };

  const handleRun = async (mode: "dry_run" | "execute", limit?: number) => {
    if (mode === "execute") {
      const ok1 = confirm(
        `⚠️ Você vai migrar deals reais do pipeline 25 para a SPA 1118.\n\n` +
        `${limit ? `Limite: ${limit} deals (modo teste)` : "TODOS os deals da carteira"}\n\n` +
        `Isto vai criar itens na SPA e atualizar os deals com link reverso (UF_CRM_1778431525).\n\n` +
        `Continuar?`
      );
      if (!ok1) return;
      if (!limit) {
        const ok2 = confirm(`CONFIRMAÇÃO FINAL: Migrar TODOS os deals da pipeline 25?`);
        if (!ok2) return;
      }
    }
    setRunning(true);
    setBgStatus(null);
    try {
      const params: Record<string, string> = { mode };
      if (limit) params.limit = String(limit);
      const r = await callFn("bitrix24-migrate-deals-to-spa", params);
      setMigrationResult(r);
      if (!r.success) {
        toast.error(r.error || "Falha");
        return;
      }
      if (r.background) {
        toast.info(`Migração iniciada em background: ${r.total_processed} deals. Acompanhando...`);
        // Poll status every 4s
        const sessionId = r.session_id;
        const total = r.total_processed;
        const poll = async () => {
          const s = await callFn("bitrix24-migrate-deals-to-spa", { mode: "status", session_id: sessionId });
          if (s?.success) {
            setBgStatus({ processed: s.processed, total, counts: s.counts });
            if (s.processed >= total) {
              toast.success(`Migração concluída: ${s.counts.success} sucesso, ${s.counts.failed} erros, ${s.counts.skipped} já migrados`);
              return true;
            }
          }
          return false;
        };
        const interval = setInterval(async () => {
          const done = await poll();
          if (done) clearInterval(interval);
        }, 4000);
        // Stop polling after 30 min safety
        setTimeout(() => clearInterval(interval), 30 * 60 * 1000);
      } else {
        toast.success(
          `${mode === "dry_run" ? "Pré-visualização" : "Migração"}: ${r.success_count} sucesso, ${r.failed_count} erros, ${r.skipped_count} já migrados`
        );
      }
    } catch (e) {
      toast.error(String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wand2 className="h-4 w-4" /> Passo 1 — Criar campos na SPA Ação Judicial
          </CardTitle>
          <CardDescription>
            Cria os 19 campos necessários (processo, prazos, audiências, NIF/NISS, link reverso) na SPA 1118. Idempotente — pula campos já existentes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={handleCreateFields} disabled={creating}>
            {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
            Criar campos na SPA 1118
          </Button>
          {createResult && (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <div className="mb-2 flex gap-2">
                <Badge variant="default">{createResult.created} criados</Badge>
                <Badge variant="secondary">{createResult.skipped} já existiam</Badge>
                {createResult.errors > 0 && <Badge variant="destructive">{createResult.errors} erros</Badge>}
              </div>
              <details>
                <summary className="cursor-pointer text-xs text-muted-foreground">Detalhes</summary>
                <pre className="mt-2 max-h-60 overflow-auto text-xs">{JSON.stringify(createResult.results, null, 2)}</pre>
              </details>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-4 w-4" /> Passo 2 — Pré-visualizar (dry-run)
          </CardTitle>
          <CardDescription>
            Lê todos os deals do pipeline 25, monta o payload da SPA mas NÃO grava nada. Use para confirmar o mapeamento de etapas e campos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => handleRun("dry_run", 10)} disabled={running} variant="outline">
              {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
              Dry-run (10 primeiros)
            </Button>
            <Button onClick={() => handleRun("dry_run")} disabled={running} variant="outline">
              {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
              Dry-run (todos)
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Rocket className="h-4 w-4" /> Passo 3 — Executar migração
          </CardTitle>
          <CardDescription className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Cria itens reais na SPA 1118 e grava o ID no campo UF_CRM_1778431525 do deal original. Faça o dry-run primeiro.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="number"
              min={1}
              max={50}
              value={limitTest}
              onChange={(e) => setLimitTest(parseInt(e.target.value) || 5)}
              className="h-9 w-20 rounded-md border bg-background px-2 text-sm"
            />
            <Button onClick={() => handleRun("execute", limitTest)} disabled={running} variant="secondary">
              {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
              Migrar teste ({limitTest})
            </Button>
            <Button onClick={() => handleRun("execute")} disabled={running} variant="destructive">
              {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
              Migrar TODOS
            </Button>
          </div>
        </CardContent>
      </Card>

      {migrationResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resultado da última execução</CardTitle>
            <CardDescription>
              Modo: <Badge variant="outline">{migrationResult.mode}</Badge> · Sessão: <code className="text-xs">{migrationResult.session_id}</code>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="default">{migrationResult.success_count} sucesso</Badge>
              {migrationResult.failed_count > 0 && <Badge variant="destructive">{migrationResult.failed_count} erros</Badge>}
              {migrationResult.skipped_count > 0 && <Badge variant="secondary">{migrationResult.skipped_count} já migrados</Badge>}
              <Badge variant="outline">Total: {migrationResult.total_processed}</Badge>
            </div>

            <details className="text-sm">
              <summary className="cursor-pointer font-medium">Mapeamento de etapas ({Object.keys(migrationResult.stage_map || {}).length})</summary>
              <pre className="mt-2 max-h-48 overflow-auto rounded bg-muted/40 p-2 text-xs">
                {JSON.stringify(migrationResult.stage_map, null, 2)}
              </pre>
            </details>

            <details className="text-sm">
              <summary className="cursor-pointer font-medium">Campos UF mapeados ({migrationResult.mapped_uf_fields?.length || 0})</summary>
              <pre className="mt-2 max-h-48 overflow-auto rounded bg-muted/40 p-2 text-xs">
                {JSON.stringify(migrationResult.mapped_uf_fields, null, 2)}
              </pre>
            </details>

            <details className="text-sm">
              <summary className="cursor-pointer font-medium">Amostra dos primeiros 5 itens</summary>
              <pre className="mt-2 max-h-96 overflow-auto rounded bg-muted/40 p-2 text-xs">
                {JSON.stringify(migrationResult.sample, null, 2)}
              </pre>
            </details>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
