import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, FileText, MessageSquare, Clock, Bot, User } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { exportToCSV, exportToPDF } from "@/lib/exportUtils";
import { Skeleton } from "@/components/ui/skeleton";

const COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

interface Props {
  data: any;
  isLoading: boolean;
}

export function AtendimentoReport({ data, isLoading }: Props) {
  if (isLoading) return <ReportSkeleton />;
  if (!data) return null;

  const handleExportCSV = () => {
    exportToCSV(
      data.conversations.map((c: any) => ({
        ID: c.id,
        Canal: c.channel,
        Status: c.status,
        "Atribuído a": c.assigned_to || "N/A",
        Modo: c.attendance_mode,
        "Data Criação": c.created_at,
      })),
      "relatorio_atendimento"
    );
  };

  const handleExportPDF = () => {
    const html = `
      <div class="kpi"><div class="kpi-value">${data.total}</div><div class="kpi-label">Total Conversas</div></div>
      <div class="kpi"><div class="kpi-value">${data.avgResponseHours}h</div><div class="kpi-label">Tempo Médio Resposta</div></div>
      <div class="kpi"><div class="kpi-value">${data.botCount}</div><div class="kpi-label">Atendimentos Bot</div></div>
      <div class="kpi"><div class="kpi-value">${data.humanCount}</div><div class="kpi-label">Atendimentos Humano</div></div>
      <h2>Volume por Canal</h2>
      <table><tr><th>Canal</th><th>Quantidade</th></tr>
        ${data.channelData.map((c: any) => `<tr><td>${c.name}</td><td>${c.value}</td></tr>`).join("")}
      </table>
      <h2>Status das Conversas</h2>
      <table><tr><th>Status</th><th>Quantidade</th></tr>
        ${data.statusData.map((s: any) => `<tr><td>${s.name}</td><td>${s.value}</td></tr>`).join("")}
      </table>
    `;
    exportToPDF("Relatório de Atendimento", html);
  };

  const modeData = [
    { name: "Bot", value: data.botCount },
    { name: "Humano", value: data.humanCount },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard icon={MessageSquare} label="Total Conversas" value={data.total} />
        <KPICard icon={Clock} label="Tempo Médio Resposta" value={`${data.avgResponseHours}h`} />
        <KPICard icon={Bot} label="Atendimentos Bot" value={data.botCount} />
        <KPICard icon={User} label="Atendimentos Humano" value={data.humanCount} />
      </div>

      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={handleExportCSV}><Download className="h-3 w-3 mr-1" /> CSV</Button>
        <Button variant="outline" size="sm" onClick={handleExportPDF}><FileText className="h-3 w-3 mr-1" /> PDF</Button>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Volume por Canal</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data.channelData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Status das Conversas</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={data.statusData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {data.statusData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Bot vs Humano</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={modeData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  <Cell fill="hsl(var(--chart-2))" />
                  <Cell fill="hsl(var(--primary))" />
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Agents table */}
      {data.agentData.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Conversas por Agente</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data.agentData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" fill="hsl(var(--chart-3))" radius={[0, 4, 4, 0]} />
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
