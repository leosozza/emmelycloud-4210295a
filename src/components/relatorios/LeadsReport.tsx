import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, FileText, TrendingUp, Users, Target } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, FunnelChart, Funnel, LabelList } from "recharts";
import { exportToCSV, exportToPDF } from "@/lib/exportUtils";
import { Skeleton } from "@/components/ui/skeleton";

const COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))", "#8b5cf6", "#f59e0b"];

interface Props {
  data: any;
  isLoading: boolean;
}

export function LeadsReport({ data, isLoading }: Props) {
  if (isLoading) return <ReportSkeleton />;
  if (!data) return null;

  const handleExportCSV = () => {
    exportToCSV(
      data.leads.map((l: any) => ({
        Nome: l.name,
        Etapa: l.funnel_stage,
        Origem: l.origin,
        "Área Jurídica": l.legal_area,
        "Data Criação": l.created_at,
      })),
      "relatorio_leads"
    );
  };

  const handleExportPDF = () => {
    const funnelHtml = `
      <h2>Funil de Conversão</h2>
      <table>
        <tr><th>Etapa</th><th>Quantidade</th></tr>
        ${data.funnelData.map((f: any) => `<tr><td>${f.label}</td><td>${f.count}</td></tr>`).join("")}
      </table>
      <h2>Taxas de Conversão</h2>
      <table>
        <tr><th>De</th><th>Para</th><th>Taxa</th></tr>
        ${data.conversionRates.map((c: any) => `<tr><td>${c.from}</td><td>${c.to}</td><td>${c.rate}%</td></tr>`).join("")}
      </table>
      <h2>Origem dos Leads</h2>
      <table>
        <tr><th>Origem</th><th>Quantidade</th></tr>
        ${data.originData.map((o: any) => `<tr><td>${o.name}</td><td>${o.value}</td></tr>`).join("")}
      </table>
    `;
    exportToPDF("Relatório de Leads", funnelHtml);
  };

  const totalConverted = data.funnelData.find((f: any) => f.stage === "fechado")?.count || 0;
  const conversionRate = data.total > 0 ? Math.round((totalConverted / data.total) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard icon={Users} label="Total Leads" value={data.total} />
        <KPICard icon={Target} label="Convertidos" value={totalConverted} />
        <KPICard icon={TrendingUp} label="Taxa Conversão" value={`${conversionRate}%`} />
        <KPICard icon={Users} label="Origens" value={data.originData.length} />
      </div>

      {/* Export buttons */}
      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={handleExportCSV}><Download className="h-3 w-3 mr-1" /> CSV</Button>
        <Button variant="outline" size="sm" onClick={handleExportPDF}><FileText className="h-3 w-3 mr-1" /> PDF</Button>
      </div>

      {/* Charts */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Funil de Conversão</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.funnelData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="label" type="category" width={80} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Origem dos Leads</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={data.originData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                  {data.originData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Conversion rates table */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Taxas de Conversão por Etapa</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {data.conversionRates.map((c: any) => (
              <div key={c.from} className="rounded-lg border p-3 text-center">
                <div className="text-xs text-muted-foreground capitalize">{c.from} → {c.to}</div>
                <div className="text-2xl font-bold mt-1">{c.rate}%</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Area breakdown */}
      {data.areaData.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Leads por Área Jurídica</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data.areaData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function KPICard({ icon: Icon, label, value }: { icon: any; label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2"><Icon className="h-4 w-4 text-primary" /></div>
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
      </div>
      <Skeleton className="h-[300px] rounded-lg" />
    </div>
  );
}
