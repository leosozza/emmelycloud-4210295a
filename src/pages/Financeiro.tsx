import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { PeriodFilter } from "@/components/dashboard/PeriodFilter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { Send, LayoutDashboard, Receipt, AlertTriangle, Percent, Trophy } from "lucide-react";
import { toast } from "sonner";
import { FinanceiroOverview } from "@/components/financeiro/FinanceiroOverview";
import { InadimplenciaTab } from "@/components/financeiro/InadimplenciaTab";
import { ComissoesTab } from "@/components/financeiro/ComissoesTab";
import { RankingTab } from "@/components/financeiro/RankingTab";

function getPeriodRange(period: string) {
  const now = new Date();
  let start: Date;
  switch (period) {
    case "7d": start = new Date(now); start.setDate(now.getDate() - 7); break;
    case "30d": start = new Date(now); start.setDate(now.getDate() - 30); break;
    case "month": start = new Date(now.getFullYear(), now.getMonth(), 1); break;
    case "quarter": start = new Date(now); start.setMonth(now.getMonth() - 3); break;
    case "year": start = new Date(now.getFullYear(), 0, 1); break;
    default: start = new Date(now); start.setDate(now.getDate() - 30);
  }
  return { start: start.toISOString(), end: now.toISOString() };
}

const FinanceiroPage = () => {
  const [period, setPeriod] = useState("30d");
  const [sendingReminder, setSendingReminder] = useState<string | null>(null);
  const [gatewayFilter, setGatewayFilter] = useState("all");
  const range = getPeriodRange(period);

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["all-payments", period, gatewayFilter],
    queryFn: async () => {
      let query = supabase
        .from("payment_transactions")
        .select("*, clients(name)")
        .gte("created_at", range.start)
        .lte("created_at", range.end)
        .order("updated_at", { ascending: false });
      if (gatewayFilter !== "all") query = query.eq("gateway", gatewayFilter);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const { data: reminderCount = 0 } = useQuery({
    queryKey: ["reminders-sent", period],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_transactions")
        .select("id, metadata")
        .gte("created_at", range.start)
        .lte("created_at", range.end);
      if (error) throw error;
      return (data || []).filter((tx) => {
        const meta = (tx.metadata || {}) as Record<string, any>;
        return !!meta.reminder_sent_at;
      }).length;
    },
  });

  const handleSendReminder = async (financialRecordId: string) => {
    setSendingReminder(financialRecordId);
    try {
      const { data, error } = await supabase.functions.invoke("payment-reminder", {
        body: { mode: "manual", financial_record_id: financialRecordId },
      });
      if (error) throw error;
      if (data?.ok) toast.success("Cobrança enviada com sucesso!");
      else toast.error(data?.reason || "Não foi possível enviar a cobrança");
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar cobrança");
    } finally {
      setSendingReminder(null);
    }
  };

  return (
    <div>
      <PageHeader title="EmmeyPay" description="Gestão financeira, comissões e relatórios">
        <PeriodFilter value={period} onChange={setPeriod} />
      </PageHeader>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview" className="gap-1.5 text-xs sm:text-sm">
            <LayoutDashboard className="h-4 w-4 hidden sm:inline" /> Visão Geral
          </TabsTrigger>
          <TabsTrigger value="recebimentos" className="gap-1.5 text-xs sm:text-sm">
            <Receipt className="h-4 w-4 hidden sm:inline" /> Recebimentos
          </TabsTrigger>
          <TabsTrigger value="inadimplencia" className="gap-1.5 text-xs sm:text-sm">
            <AlertTriangle className="h-4 w-4 hidden sm:inline" /> Inadimplência
          </TabsTrigger>
          <TabsTrigger value="comissoes" className="gap-1.5 text-xs sm:text-sm">
            <Percent className="h-4 w-4 hidden sm:inline" /> Comissões
          </TabsTrigger>
          <TabsTrigger value="ranking" className="gap-1.5 text-xs sm:text-sm">
            <Trophy className="h-4 w-4 hidden sm:inline" /> Ranking
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <FinanceiroOverview startDate={range.start} endDate={range.end} reminderCount={reminderCount} />
        </TabsContent>

        <TabsContent value="recebimentos">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Transações</CardTitle>
              <div className="flex gap-1">
                {["all", "direto", "stripe_pt", "stripe_br", "asaas"].map((gw) => (
                  <Button key={gw} size="sm" variant={gatewayFilter === gw ? "default" : "outline"} className="text-xs h-7 px-2"
                    onClick={() => setGatewayFilter(gw)}>
                    {gw === "all" ? "Todos" : gw === "direto" ? "Direto" : gw === "stripe_pt" ? "Stripe PT" : gw === "stripe_br" ? "Stripe BR" : "Asaas"}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-center text-muted-foreground">Carregando...</div>
              ) : transactions.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">Nenhuma transação neste período.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Método</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Baixa em</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((tx) => {
                      const meta = (tx.metadata || {}) as Record<string, any>;
                      const clientName = (tx as any).clients?.name;
                      const paidAt = tx.status === "confirmed" ? tx.updated_at : null;
                      const isPending = tx.status === "pending";
                      return (
                        <TableRow key={tx.id}>
                          <TableCell className="whitespace-nowrap">
                            {format(new Date(tx.created_at), "dd/MM/yyyy", { locale: pt })}
                          </TableCell>
                          <TableCell>{clientName || "—"}</TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {meta.installment_number
                              ? `Parcela ${meta.installment_number}/${meta.total_installments}`
                              : meta.is_down_payment ? "Entrada" : "Recebimento direto"}
                          </TableCell>
                          <TableCell className="text-right font-medium whitespace-nowrap">
                            {Number(tx.amount).toLocaleString("pt-PT", { style: "currency", currency: tx.currency })}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {tx.payment_method === "parcelado_direto" ? "Parcelado" : "Direto"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={tx.status === "confirmed" ? "default" : "secondary"}
                              className={tx.status === "confirmed" ? "bg-emerald-500/15 text-emerald-700 border-emerald-200" : ""}>
                              {tx.status === "confirmed" ? "Pago" : "Pendente"}
                            </Badge>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground text-xs">
                            {paidAt ? format(new Date(paidAt), "dd/MM/yyyy HH:mm", { locale: pt }) : "—"}
                          </TableCell>
                          <TableCell>
                            {isPending && tx.financial_record_id && (
                              <Button size="sm" variant="outline" className="gap-1"
                                disabled={sendingReminder === tx.financial_record_id}
                                onClick={() => handleSendReminder(tx.financial_record_id!)}>
                                <Send className="h-3 w-3" />
                                {sendingReminder === tx.financial_record_id ? "Enviando..." : "Cobrar"}
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inadimplencia">
          <InadimplenciaTab startDate={range.start} endDate={range.end} />
        </TabsContent>

        <TabsContent value="comissoes">
          <ComissoesTab startDate={range.start} endDate={range.end} />
        </TabsContent>

        <TabsContent value="ranking">
          <RankingTab startDate={range.start} endDate={range.end} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default FinanceiroPage;
