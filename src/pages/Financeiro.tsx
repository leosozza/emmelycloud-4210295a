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
import { Send, LayoutDashboard, Receipt, AlertTriangle, Percent, Trophy, ExternalLink, Copy } from "lucide-react";
import { toast } from "sonner";
import { FinanceiroOverview } from "@/components/financeiro/FinanceiroOverview";
import { InadimplenciaTab } from "@/components/financeiro/InadimplenciaTab";
import { ComissoesTab } from "@/components/financeiro/ComissoesTab";
import { RankingTab } from "@/components/financeiro/RankingTab";

function getPeriodRange(period: string) {
  const now = new Date();
  let start: Date;
  switch (period) {
    case "today": start = new Date(now.getFullYear(), now.getMonth(), now.getDate()); break;
    case "7d": start = new Date(now); start.setDate(now.getDate() - 7); break;
    case "30d": start = new Date(now); start.setDate(now.getDate() - 30); break;
    case "month": start = new Date(now.getFullYear(), now.getMonth(), 1); break;
    case "quarter": start = new Date(now); start.setMonth(now.getMonth() - 3); break;
    case "year": start = new Date(now.getFullYear(), 0, 1); break;
    case "all": start = new Date(2020, 0, 1); break;
    default: start = new Date(now); start.setDate(now.getDate() - 30);
  }
  return { start: start.toISOString(), end: now.toISOString() };
}

const FinanceiroPage = () => {
  const [period, setPeriod] = useState("30d");
  const [sendingReminder, setSendingReminder] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const range = getPeriodRange(period);
  const startDateOnly = range.start.split("T")[0];
  const endDateOnly = range.end.split("T")[0];

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["all-payments", period, statusFilter],
    queryFn: async () => {
      // Fetch paid (by paid_at), pending (by due_date), overdue (by due_date) from financial_records
      const queries = [];

      // Paid records
      let paidQ = supabase
        .from("financial_records")
        .select("id, installment_value, total_value, status, payment_method, due_date, paid_at, created_at, contract_id, description")
        .eq("status", "paga")
        .gte("paid_at", range.start)
        .lte("paid_at", range.end)
        .order("paid_at", { ascending: false });

      // Pending records
      let pendingQ = supabase
        .from("financial_records")
        .select("id, installment_value, total_value, status, payment_method, due_date, paid_at, created_at, contract_id, description")
        .eq("status", "pendente")
        .gte("due_date", startDateOnly)
        .lte("due_date", endDateOnly)
        .order("due_date", { ascending: false });

      // Overdue records
      let overdueQ = supabase
        .from("financial_records")
        .select("id, installment_value, total_value, status, payment_method, due_date, paid_at, created_at, contract_id, description")
        .eq("status", "atrasada")
        .lte("due_date", endDateOnly)
        .order("due_date", { ascending: false });

      const [paidRes, pendingRes, overdueRes] = await Promise.all([
        paidQ, pendingQ, overdueQ,
      ]);

      let all = [
        ...(paidRes.data || []),
        ...(pendingRes.data || []),
        ...(overdueRes.data || []),
      ];

      if (statusFilter === "paga") all = all.filter((r) => r.status === "paga");
      else if (statusFilter === "pendente") all = all.filter((r) => r.status === "pendente");
      else if (statusFilter === "atrasada") all = all.filter((r) => r.status === "atrasada");

      return all;
    },
  });

  // Fetch receipt links
  const { data: receiptLinks = [] } = useQuery({
    queryKey: ["receipt-links"],
    queryFn: async () => {
      const { data } = await supabase
        .from("receipt_links")
        .select("token, contract_id, bitrix24_deal_id");
      return data || [];
    },
  });

  const getReceiptUrl = (rec: any) => {
    const link = receiptLinks.find(
      (rl: any) => (rl.contract_id && rl.contract_id === rec.contract_id) ||
                   (rl.bitrix24_deal_id && rl.bitrix24_deal_id === rec.bitrix24_deal_id)
    );
    if (!link) return null;
    return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/payment-receipt?token=${link.token}`;
  };

  const copyReceiptLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado!");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

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

  const fmtCurrency = (v: number) => v.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });

  return (
    <div>
      <PageHeader title="EmmeyPay" description="Gestão financeira, comissões e relatórios">
        <PeriodFilter value={period} onChange={setPeriod} />
      </PageHeader>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex w-full overflow-x-auto scrollbar-none justify-start md:grid md:grid-cols-5 h-auto p-1">
          <TabsTrigger value="overview" className="gap-1.5 text-xs sm:text-sm shrink-0 whitespace-nowrap">
            <LayoutDashboard className="h-4 w-4 hidden sm:inline" /> Visão Geral
          </TabsTrigger>
          <TabsTrigger value="recebimentos" className="gap-1.5 text-xs sm:text-sm shrink-0 whitespace-nowrap">
            <Receipt className="h-4 w-4 hidden sm:inline" /> Recebimentos
          </TabsTrigger>
          <TabsTrigger value="inadimplencia" className="gap-1.5 text-xs sm:text-sm shrink-0 whitespace-nowrap">
            <AlertTriangle className="h-4 w-4 hidden sm:inline" /> Inadimplência
          </TabsTrigger>
          <TabsTrigger value="comissoes" className="gap-1.5 text-xs sm:text-sm shrink-0 whitespace-nowrap">
            <Percent className="h-4 w-4 hidden sm:inline" /> Comissões
          </TabsTrigger>
          <TabsTrigger value="ranking" className="gap-1.5 text-xs sm:text-sm shrink-0 whitespace-nowrap">
            <Trophy className="h-4 w-4 hidden sm:inline" /> Ranking
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <FinanceiroOverview startDate={range.start} endDate={range.end} reminderCount={0} />
        </TabsContent>

        <TabsContent value="recebimentos">
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <CardTitle className="text-base">Parcelas</CardTitle>
              <div className="flex flex-wrap gap-1">
                {["all", "paga", "pendente", "atrasada"].map((st) => (
                  <Button key={st} size="sm" variant={statusFilter === st ? "default" : "outline"} className="text-xs h-7 px-2"
                    onClick={() => setStatusFilter(st)}>
                    {st === "all" ? "Todos" : st === "paga" ? "Pagas" : st === "pendente" ? "Pendentes" : "Atrasadas"}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {isLoading ? (
                <div className="p-8 text-center text-muted-foreground">Carregando...</div>
              ) : transactions.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">Nenhuma parcela neste período.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Método</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Pago em</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.slice(0, 200).map((rec) => {
                      const isPending = rec.status === "pendente" || rec.status === "atrasada";
                      return (
                        <TableRow key={rec.id}>
                          <TableCell className="whitespace-nowrap">
                            {rec.due_date ? format(new Date(rec.due_date), "dd/MM/yyyy", { locale: pt }) : "—"}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {rec.description || `Parcela ${rec.installment_value}`}
                          </TableCell>
                          <TableCell className="text-right font-medium whitespace-nowrap">
                            {fmtCurrency(Number(rec.installment_value || 0))}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {rec.payment_method || "—"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={rec.status === "paga" ? "default" : "secondary"}
                              className={
                                rec.status === "paga"
                                  ? "bg-emerald-500/15 text-emerald-700 border-emerald-200"
                                  : rec.status === "atrasada"
                                  ? "bg-destructive/15 text-destructive border-destructive/20"
                                  : ""
                              }
                            >
                              {rec.status === "paga" ? "Paga" : rec.status === "atrasada" ? "Atrasada" : "Pendente"}
                            </Badge>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground text-xs">
                            {rec.paid_at ? format(new Date(rec.paid_at), "dd/MM/yyyy", { locale: pt }) : "—"}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {isPending && (
                                <Button size="sm" variant="outline" className="gap-1"
                                  disabled={sendingReminder === rec.id}
                                  onClick={() => handleSendReminder(rec.id)}>
                                  <Send className="h-3 w-3" />
                                  {sendingReminder === rec.id ? "Enviando..." : "Cobrar"}
                                </Button>
                              )}
                              {(() => {
                                const url = getReceiptUrl(rec);
                                if (!url) return null;
                                return (
                                  <>
                                    <Button size="sm" variant="ghost" className="gap-1 h-7 px-2"
                                      onClick={() => copyReceiptLink(url)} title="Copiar link do comprovante">
                                      <Copy className="h-3 w-3" />
                                    </Button>
                                    <Button size="sm" variant="ghost" className="gap-1 h-7 px-2" asChild title="Abrir comprovante">
                                      <a href={url} target="_blank" rel="noopener noreferrer">
                                        <ExternalLink className="h-3 w-3" />
                                      </a>
                                    </Button>
                                  </>
                                );
                              })()}
                            </div>
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
