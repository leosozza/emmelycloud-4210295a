import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, FileText, DollarSign, TrendingUp, TrendingDown, Clock, AlertTriangle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import { exportToCSV, exportToPDF } from "@/lib/exportUtils";
import { Skeleton } from "@/components/ui/skeleton";

const COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

interface Props {
  data: any;
  isLoading: boolean;
}

export function FinancialReport({ data, isLoading }: Props) {
  if (isLoading) return <ReportSkeleton />;
  if (!data) return null;

  const handleExportCSV = () => {
    exportToCSV(
      data.records.map((r: any) => ({
        ID: r.id,
        Valor: r.installment_value,
        Status: r.status,
        Método: r.payment_method,
        Vencimento: r.due_date,
        "Pago em": r.paid_at,
        "Data Contrato": r.created_at,
      })),
      "relatorio_financeiro"
    );
  };

  const handleExportPDF = () => {
    const html = `
      <div class="kpi"><div class="kpi-value">€${data.totalReceived.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</div><div class="kpi-label">Receita Total (Paga)</div></div>
      <div class="kpi"><div class="kpi-value">€${data.totalPending.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</div><div class="kpi-label">Pendente + Atraso</div></div>
      <div class="kpi"><div class="kpi-value">${data.growth > 0 ? "+" : ""}${data.growth}%</div><div class="kpi-label">Crescimento</div></div>
      <h2>Receita Mensal</h2>
      <table><tr><th>Mês</th><th>Valor</th></tr>
        ${data.monthlyData.map((m: any) => `<tr><td>${m.month}</td><td>€${m.value.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</td></tr>`).join("")}
      </table>
      <h2>Por Status</h2>
      <table><tr><th>Status</th><th>Valor</th></tr>
        ${data.statusData.map((s: any) => `<tr><td>${s.name}</td><td>€${s.value.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</td></tr>`).join("")}
      </table>
    `;
    exportToPDF("Relatório Financeiro", html);
  };

  const fmt = (v: number) => `€${v.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KPICard icon={DollarSign} label="Receita (Paga)" value={fmt(data.totalReceived)} />
        <KPICard icon={Clock} label="Pendente" value={fmt(data.totalPending)} />
        <KPICard icon={AlertTriangle} label="Em Atraso" value={fmt(data.totalOverdue)} accent={false} />
        <KPICard icon={data.growth >= 0 ? TrendingUp : TrendingDown} label="vs. Período Anterior" value={`${data.growth > 0 ? "+" : ""}${data.growth}%`} accent={data.growth >= 0} />
        <KPICard icon={DollarSign} label="Total Parcelas" value={`${data.totalTransactions}`} />
      </div>

      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={handleExportCSV}><Download className="h-3 w-3 mr-1" /> CSV</Button>
        <Button variant="outline" size="sm" onClick={handleExportPDF}><FileText className="h-3 w-3 mr-1" /> PDF</Button>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Receita Mensal (Paga)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Receita" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Distribuição por Status</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={data.statusData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                  {data.statusData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => fmt(v)} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Trend line */}
      {data.monthlyData.length > 1 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Tendência de Receita</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={data.monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} name="Receita" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function KPICard({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string | number; accent?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`rounded-lg p-2 ${accent === false ? "bg-destructive/10" : "bg-primary/10"}`}>
          <Icon className={`h-4 w-4 ${accent === false ? "text-destructive" : "text-primary"}`} />
        </div>
        <div>
          <div className="text-2xl font-bold">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
      </div>
      <Skeleton className="h-[300px] rounded-lg" />
    </div>
  );
}
