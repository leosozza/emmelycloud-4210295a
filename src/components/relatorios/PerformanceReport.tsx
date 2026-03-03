import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, FileText, Award, Users, Briefcase, Target } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { exportToCSV, exportToPDF } from "@/lib/exportUtils";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface Props {
  data: any;
  isLoading: boolean;
}

export function PerformanceReport({ data, isLoading }: Props) {
  if (isLoading) return <ReportSkeleton />;
  if (!data) return null;

  const handleExportCSV = () => {
    const rows = [
      ...data.comercialData.map((c: any) => ({ Tipo: "Comercial", Nome: c.name, Leads: c.leads, Convertidos: c.converted, "Taxa (%)": c.rate })),
      ...data.advogadoData.map((a: any) => ({ Tipo: "Advogado", Nome: a.name, Casos: a.cases, Concluídos: a.concluded, "Taxa (%)": a.rate })),
    ];
    exportToCSV(rows, "relatorio_performance");
  };

  const handleExportPDF = () => {
    const html = `
      <div class="kpi"><div class="kpi-value">${data.totalLeads}</div><div class="kpi-label">Total Leads</div></div>
      <div class="kpi"><div class="kpi-value">${data.totalCases}</div><div class="kpi-label">Total Casos</div></div>
      <h2>Performance Comercial</h2>
      <table>
        <tr><th>Nome</th><th>Leads</th><th>Convertidos</th><th>Taxa</th></tr>
        ${data.comercialData.map((c: any) => `<tr><td>${c.name}</td><td>${c.leads}</td><td>${c.converted}</td><td>${c.rate}%</td></tr>`).join("")}
      </table>
      <h2>Performance Jurídica</h2>
      <table>
        <tr><th>Nome</th><th>Casos</th><th>Concluídos</th><th>Taxa</th></tr>
        ${data.advogadoData.map((a: any) => `<tr><td>${a.name}</td><td>${a.cases}</td><td>${a.concluded}</td><td>${a.rate}%</td></tr>`).join("")}
      </table>
    `;
    exportToPDF("Relatório de Performance", html);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard icon={Users} label="Total Leads" value={data.totalLeads} />
        <KPICard icon={Briefcase} label="Total Casos" value={data.totalCases} />
        <KPICard icon={Target} label="Comerciais" value={data.comercialData.length} />
        <KPICard icon={Award} label="Advogados" value={data.advogadoData.length} />
      </div>

      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={handleExportCSV}><Download className="h-3 w-3 mr-1" /> CSV</Button>
        <Button variant="outline" size="sm" onClick={handleExportPDF}><FileText className="h-3 w-3 mr-1" /> PDF</Button>
      </div>

      {/* Commercial performance */}
      {data.comercialData.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Performance Comercial</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data.comercialData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="leads" fill="hsl(var(--primary))" name="Leads" radius={[4, 4, 0, 0]} />
                <Bar dataKey="converted" fill="hsl(var(--chart-2))" name="Convertidos" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead className="text-center">Leads</TableHead>
                  <TableHead className="text-center">Convertidos</TableHead>
                  <TableHead className="text-center">Taxa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.comercialData.map((c: any) => (
                  <TableRow key={c.name}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-center">{c.leads}</TableCell>
                    <TableCell className="text-center">{c.converted}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={c.rate >= 50 ? "default" : c.rate >= 25 ? "secondary" : "outline"}>{c.rate}%</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Attorney performance */}
      {data.advogadoData.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Performance Jurídica</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data.advogadoData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="cases" fill="hsl(var(--chart-3))" name="Casos" radius={[4, 4, 0, 0]} />
                <Bar dataKey="concluded" fill="hsl(var(--chart-4))" name="Concluídos" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead className="text-center">Casos</TableHead>
                  <TableHead className="text-center">Concluídos</TableHead>
                  <TableHead className="text-center">Taxa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.advogadoData.map((a: any) => (
                  <TableRow key={a.name}>
                    <TableCell className="font-medium">{a.name}</TableCell>
                    <TableCell className="text-center">{a.cases}</TableCell>
                    <TableCell className="text-center">{a.concluded}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={a.rate >= 50 ? "default" : a.rate >= 25 ? "secondary" : "outline"}>{a.rate}%</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
