import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { PeriodFilter } from "@/components/dashboard/PeriodFilter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { Banknote, CheckCircle2, Clock, TrendingUp, Send, Bell } from "lucide-react";
import { toast } from "sonner";

function getPeriodRange(period: string) {
  const now = new Date();
  let start: Date;
  switch (period) {
    case "7d":
      start = new Date(now); start.setDate(now.getDate() - 7); break;
    case "30d":
      start = new Date(now); start.setDate(now.getDate() - 30); break;
    case "month":
      start = new Date(now.getFullYear(), now.getMonth(), 1); break;
    case "quarter":
      start = new Date(now); start.setMonth(now.getMonth() - 3); break;
    case "year":
      start = new Date(now.getFullYear(), 0, 1); break;
    default:
      start = new Date(now); start.setDate(now.getDate() - 30);
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

      if (gatewayFilter !== "all") {
        query = query.eq("gateway", gatewayFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  // Count reminders sent in the period
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

  const confirmed = transactions.filter((t) => t.status === "confirmed");
  const pending = transactions.filter((t) => t.status === "pending");
  const totalConfirmed = confirmed.reduce((s, t) => s + Number(t.amount), 0);
  const totalPending = pending.reduce((s, t) => s + Number(t.amount), 0);

  const handleSendReminder = async (financialRecordId: string) => {
    setSendingReminder(financialRecordId);
    try {
      const { data, error } = await supabase.functions.invoke("payment-reminder", {
        body: { mode: "manual", financial_record_id: financialRecordId },
      });
      if (error) throw error;
      if (data?.ok) {
        toast.success("Cobrança enviada com sucesso!");
      } else {
        toast.error(data?.reason || "Não foi possível enviar a cobrança");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar cobrança");
    } finally {
      setSendingReminder(null);
    }
  };

  return (
    <div>
      <PageHeader title="Financeiro" description="Pagamentos, parcelas e receitas">
        <PeriodFilter value={period} onChange={setPeriod} />
      </PageHeader>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Recebido</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalConfirmed.toLocaleString("pt-PT", { style: "currency", currency: confirmed[0]?.currency || "EUR" })}</div>
            <p className="text-xs text-muted-foreground">{confirmed.length} pagamento(s) confirmado(s)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pendente</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalPending.toLocaleString("pt-PT", { style: "currency", currency: pending[0]?.currency || "EUR" })}</div>
            <p className="text-xs text-muted-foreground">{pending.length} aguardando baixa</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Transações</CardTitle>
            <Banknote className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{transactions.length}</div>
            <p className="text-xs text-muted-foreground">transações no período</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Taxa Confirmação</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {transactions.length > 0 ? Math.round((confirmed.length / transactions.length) * 100) : 0}%
            </div>
            <p className="text-xs text-muted-foreground">baixas realizadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cobranças Enviadas</CardTitle>
            <Bell className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{reminderCount}</div>
            <p className="text-xs text-muted-foreground">lembretes no período</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Transações</CardTitle>
          <div className="flex gap-1">
            {["all", "direto", "stripe_pt", "stripe_br", "asaas"].map((gw) => (
              <Button
                key={gw}
                size="sm"
                variant={gatewayFilter === gw ? "default" : "outline"}
                className="text-xs h-7 px-2"
                onClick={() => setGatewayFilter(gw)}
              >
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
                          : meta.is_down_payment
                          ? "Entrada"
                          : "Recebimento direto"}
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
                        <Badge
                          variant={tx.status === "confirmed" ? "default" : "secondary"}
                          className={tx.status === "confirmed" ? "bg-emerald-500/15 text-emerald-700 border-emerald-200" : ""}
                        >
                          {tx.status === "confirmed" ? "Pago" : "Pendente"}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground text-xs">
                        {paidAt ? format(new Date(paidAt), "dd/MM/yyyy HH:mm", { locale: pt }) : "—"}
                      </TableCell>
                      <TableCell>
                        {isPending && tx.financial_record_id && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1"
                            disabled={sendingReminder === tx.financial_record_id}
                            onClick={() => handleSendReminder(tx.financial_record_id!)}
                          >
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
    </div>
  );
};

export default FinanceiroPage;
