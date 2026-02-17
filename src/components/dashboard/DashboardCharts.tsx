import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocale } from "@/contexts/LocaleContext";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from "recharts";

const leadsByOrigin = [
  { name: "WhatsApp", value: 42 },
  { name: "Instagram", value: 18 },
  { name: "Email", value: 15 },
  { name: "Landing Page", value: 25 },
];

const revenueByArea = [
  { area: "Previdência", receita: 12400 },
  { area: "Cidadania", receita: 8900 },
  { area: "Vistos", receita: 5200 },
  { area: "Trabalhista", receita: 3800 },
  { area: "Família", receita: 2150 },
];

const monthlyRevenue = [
  { month: "Set", receita: 18000 },
  { month: "Out", receita: 22000 },
  { month: "Nov", receita: 25000 },
  { month: "Dez", receita: 28000 },
  { month: "Jan", receita: 30000 },
  { month: "Fev", receita: 32450 },
];

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export function DashboardCharts() {
  const { formatCurrency, currencySymbol } = useLocale();

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {/* Leads by Origin */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-bold">Leads por Origem</CardTitle>
          <CardDescription>Distribuição dos canais de aquisição</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={leadsByOrigin} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value">
                  {leadsByOrigin.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {leadsByOrigin.map((item, i) => (
              <div key={item.name} className="flex items-center gap-2 text-xs">
                <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                <span className="text-muted-foreground">{item.name}</span>
                <span className="ml-auto font-semibold">{item.value}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Revenue by Area */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-bold">Receita por Área</CardTitle>
          <CardDescription>Faturamento por área jurídica</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueByArea} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => `${currencySymbol}${(v / 1000).toFixed(0)}k`} fontSize={12} />
                <YAxis type="category" dataKey="area" fontSize={12} width={80} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="receita" fill="hsl(var(--chart-1))" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Monthly Revenue Trend */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-bold">Tendência de Receita</CardTitle>
          <CardDescription>Evolução mensal do faturamento</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyRevenue}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis tickFormatter={(v) => `${currencySymbol}${(v / 1000).toFixed(0)}k`} fontSize={12} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Line type="monotone" dataKey="receita" stroke="hsl(var(--chart-1))" strokeWidth={2.5} dot={{ fill: "hsl(var(--chart-1))", r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
