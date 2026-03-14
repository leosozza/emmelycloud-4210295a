import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Clock, AlertTriangle, Banknote, CheckCircle2, Bell, Receipt } from "lucide-react";
import { useFinancialDashboard } from "@/hooks/useFinancialDashboard";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

function fmtCurrency(value: number, currency = "EUR") {
  return value.toLocaleString("pt-PT", { style: "currency", currency });
}

interface Props {
  startDate: string;
  endDate: string;
  reminderCount: number;
}

export function FinanceiroOverview({ startDate, endDate, reminderCount }: Props) {
  const { data, isLoading } = useFinancialDashboard(startDate, endDate);

  if (isLoading || !data) {
    return <div className="p-8 text-center text-muted-foreground">Carregando dashboard...</div>;
  }

  const kpis = [
    { label: "Total Recebido", value: fmtCurrency(data.totalReceived, data.currency), sub: `${data.confirmedCount} pagamento(s)`, icon: TrendingUp, color: "text-emerald-500" },
    { label: "Pendente", value: fmtCurrency(data.totalPending, data.currency), sub: `${data.pendingCount} aguardando`, icon: Clock, color: "text-amber-500" },
    { label: "Vencido", value: fmtCurrency(data.totalOverdue, data.currency), sub: "em atraso", icon: AlertTriangle, color: "text-destructive" },
    { label: "Ticket Médio", value: fmtCurrency(data.ticketMedio, data.currency), sub: "por pagamento", icon: Receipt, color: "text-primary" },
    { label: "Total Transações", value: String(data.totalTransactions), sub: "no período", icon: Banknote, color: "text-primary" },
    { label: "Taxa Confirmação", value: `${data.totalTransactions > 0 ? Math.round((data.confirmedCount / data.totalTransactions) * 100) : 0}%`, sub: "baixas realizadas", icon: CheckCircle2, color: "text-emerald-500" },
    { label: "Cobranças Enviadas", value: String(reminderCount), sub: "lembretes no período", icon: Bell, color: "text-primary" },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-medium text-muted-foreground">{kpi.label}</CardTitle>
              <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-xl font-bold">{kpi.value}</div>
              <p className="text-xs text-muted-foreground">{kpi.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue by Area */}
        {data.revenueByArea.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Receita por Área Jurídica</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data.revenueByArea}>
                  <XAxis dataKey="area" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: number) => fmtCurrency(v, data.currency)} />
                  <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Aging Chart */}
        {data.agingBuckets.some((b) => b.count > 0) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Inadimplência por Faixa</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={data.agingBuckets.filter((b) => b.count > 0)}
                    dataKey="amount"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ label, amount }) => `${label}: ${fmtCurrency(amount, data.currency)}`}
                  >
                    {data.agingBuckets.filter((b) => b.count > 0).map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmtCurrency(v, data.currency)} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
