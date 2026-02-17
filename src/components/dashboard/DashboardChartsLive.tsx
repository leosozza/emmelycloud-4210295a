import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocale } from "@/contexts/LocaleContext";
import { useLeadsByOrigin, useRevenueByArea, useMonthlyRevenue, useFunnelData } from "@/hooks/useDashboardData";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, FunnelChart, Funnel, LabelList,
} from "recharts";

const COLORS = [
  "hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))",
  "hsl(var(--chart-4))", "hsl(var(--chart-5))",
];

function ChartSkeleton() {
  return <Skeleton className="h-[250px] w-full rounded-lg" />;
}

export function LeadsByOriginChart() {
  const { data, isLoading } = useLeadsByOrigin();

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-bold">Leads por Origem</CardTitle>
        <CardDescription>Distribuição dos canais de aquisição</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? <ChartSkeleton /> : (
          <>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value">
                    {(data || []).map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(data || []).map((item, i) => (
                <div key={item.name} className="flex items-center gap-2 text-xs">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-muted-foreground">{item.name}</span>
                  <span className="ml-auto font-semibold">{item.value}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function RevenueByAreaChart() {
  const { formatCurrency, currencySymbol } = useLocale();
  const { data, isLoading } = useRevenueByArea();

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-bold">Receita por Área</CardTitle>
        <CardDescription>Faturamento por área jurídica</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? <ChartSkeleton /> : (
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => `${currencySymbol}${(v / 1000).toFixed(0)}k`} fontSize={12} />
                <YAxis type="category" dataKey="area" fontSize={12} width={80} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="receita" fill="hsl(var(--chart-1))" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function MonthlyRevenueChart() {
  const { formatCurrency, currencySymbol } = useLocale();
  const { data, isLoading } = useMonthlyRevenue();

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-bold">Tendência de Receita</CardTitle>
        <CardDescription>Evolução mensal do faturamento</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? <ChartSkeleton /> : (
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis tickFormatter={(v) => `${currencySymbol}${(v / 1000).toFixed(0)}k`} fontSize={12} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Line type="monotone" dataKey="receita" stroke="hsl(var(--chart-1))" strokeWidth={2.5} dot={{ fill: "hsl(var(--chart-1))", r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function FunnelChartWidget() {
  const { data, isLoading } = useFunnelData();

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-bold">Funil de Vendas</CardTitle>
        <CardDescription>Distribuição por etapa do funil</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? <ChartSkeleton /> : (
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" fontSize={12} />
                <YAxis type="category" dataKey="name" fontSize={11} width={70} />
                <Tooltip />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {(data || []).map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
