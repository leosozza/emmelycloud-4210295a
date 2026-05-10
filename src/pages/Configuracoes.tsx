import { useEffect, useState } from "react";
import { Settings, Check, AlertCircle, Save, RefreshCw, Palette, Shield, CalendarDays, ArrowRightLeft } from "lucide-react";
import MigracaoSpaTab from "@/components/configuracoes/MigracaoSpaTab";
import { useColorTheme, type ColorTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { calculateLateFees } from "@/lib/lateFeeCalc";
import PermissoesTab from "@/components/configuracoes/PermissoesTab";
import AgendaTab from "@/components/configuracoes/AgendaTab";

const themes: { id: ColorTheme; label: string; colors: string[] }[] = [
  { id: "red", label: "Vermelho", colors: ["hsl(0,56%,39%)", "hsl(48,96%,89%)", "hsl(43,93%,91%)"] },
  { id: "blue", label: "Azul", colors: ["hsl(220,60%,42%)", "hsl(210,80%,90%)", "hsl(210,60%,92%)"] },
];

function AparenciaTab() {
  const { colorTheme, setColorTheme } = useColorTheme();

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {themes.map((t) => {
          const selected = colorTheme === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setColorTheme(t.id)}
              className={cn(
                "relative flex flex-col items-center gap-3 rounded-xl border-2 p-5 transition-all hover:shadow-md active:scale-[0.97]",
                selected
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border bg-card hover:border-muted-foreground/30"
              )}
            >
              {selected && (
                <div className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                  <Check className="h-3 w-3 text-primary-foreground" strokeWidth={2.5} />
                </div>
              )}
              <div className="flex gap-1.5">
                {t.colors.map((c, i) => (
                  <div
                    key={i}
                    className="h-10 w-10 rounded-lg shadow-inner"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <span className={cn("text-sm font-medium", selected ? "text-primary" : "text-foreground")}>
                {t.label}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function EncargosTab() {
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
        const { error } = await supabase.from("payment_gateway_config").update({ config: config as any, updated_at: new Date().toISOString() }).eq("id", configId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("payment_gateway_config").insert({ gateway: "late_fees" as any, environment: "production", is_active: true, config: config as any });
        if (error) throw error;
      }
      toast.success("Configuração de encargos guardada");
    } catch {
      toast.error("Erro ao guardar");
    }
    setSaving(false);
  };

  const simResult = calculateLateFees(simAmount, simDays, config);
  const { daysLate: cappedDays, penalty, interest, charges, total } = simResult;

  return (
    <div className="space-y-6">
      {/* Fórmulas */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Fórmulas de Cálculo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 text-sm">
            <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
              <code className="flex-1 text-xs font-mono text-muted-foreground">Multa = Valor Parcela × {config.penalty_pct}%</code>
              <span className="text-[10px] text-muted-foreground">(uma única vez)</span>
            </div>
            <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
              <code className="flex-1 text-xs font-mono text-muted-foreground">Juros = Valor Parcela × {config.interest_monthly_pct}% × (Dias Atraso / 30)</code>
              <span className="text-[10px] text-muted-foreground">(proporcional)</span>
            </div>
            <div className="flex items-center gap-2 rounded-md border bg-primary/5 px-3 py-2">
              <code className="flex-1 text-xs font-mono font-semibold">Encargo Total = Multa + Juros</code>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Config + Simulator */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30">
              <AlertCircle className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <CardTitle className="text-base">Regras de Encargos</CardTitle>
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
    </div>
  );
}

export default function Configuracoes() {
  return (
    <div className="max-w-5xl space-y-8">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Settings className="h-5 w-5 text-primary" strokeWidth={1.5} />
        </div>
        <div>
          <h1 className="text-xl font-bold">Configurações</h1>
          <p className="text-sm text-muted-foreground">Personalize a sua experiência</p>
        </div>
      </div>

      <Tabs defaultValue="aparencia">
        <TabsList>
          <TabsTrigger value="aparencia" className="gap-1.5">
            <Palette className="h-3.5 w-3.5" /> Aparência
          </TabsTrigger>
        <TabsTrigger value="encargos" className="gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" /> Encargos
          </TabsTrigger>
          <TabsTrigger value="agenda" className="gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" /> Agenda
          </TabsTrigger>
          <TabsTrigger value="permissoes" className="gap-1.5">
            <Shield className="h-3.5 w-3.5" /> Permissões
          </TabsTrigger>
          <TabsTrigger value="migracao-spa" className="gap-1.5">
            <ArrowRightLeft className="h-3.5 w-3.5" /> Migração SPA
          </TabsTrigger>
        </TabsList>
        <TabsContent value="aparencia">
          <AparenciaTab />
        </TabsContent>
        <TabsContent value="encargos">
          <EncargosTab />
        </TabsContent>
        <TabsContent value="agenda">
          <AgendaTab />
        </TabsContent>
        <TabsContent value="permissoes">
          <PermissoesTab />
        </TabsContent>
        <TabsContent value="migracao-spa">
          <MigracaoSpaTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
