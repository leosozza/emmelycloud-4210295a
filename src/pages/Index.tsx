import { 
  Users, 
  Clock, 
  DollarSign, 
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";

const metrics = [
  {
    title: "Leads Novos",
    value: "47",
    change: "+12%",
    up: true,
    icon: Users,
    description: "Últimos 30 dias",
  },
  {
    title: "SLA Expirando",
    value: "5",
    change: "-2",
    up: false,
    icon: Clock,
    description: "Nas próximas 4h",
  },
  {
    title: "Receita do Mês",
    value: "€32.450",
    change: "+8%",
    up: true,
    icon: DollarSign,
    description: "vs. mês anterior",
  },
  {
    title: "Taxa de Conversão",
    value: "34%",
    change: "+3pp",
    up: true,
    icon: TrendingUp,
    description: "Lead → Contrato",
  },
];

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
  "hsl(217, 71%, 35%)",
  "hsl(142, 71%, 45%)",
  "hsl(38, 92%, 50%)",
  "hsl(199, 89%, 48%)",
  "hsl(262, 83%, 58%)",
];

const Index = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Visão geral do escritório</p>
      </div>

      {/* Metric Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {metric.title}
              </CardTitle>
              <metric.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-display">{metric.value}</div>
              <div className="flex items-center gap-1 mt-1">
                {metric.up ? (
                  <ArrowUpRight className="h-3 w-3 text-success" />
                ) : (
                  <ArrowDownRight className="h-3 w-3 text-destructive" />
                )}
                <span className={`text-xs font-medium ${metric.up ? "text-success" : "text-destructive"}`}>
                  {metric.change}
                </span>
                <span className="text-xs text-muted-foreground">{metric.description}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Leads by Origin */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Leads por Origem</CardTitle>
            <CardDescription>Distribuição dos canais de aquisição</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={leadsByOrigin}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
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
                  <span className="ml-auto font-medium">{item.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Revenue by Area */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Receita por Área</CardTitle>
            <CardDescription>Faturamento por área jurídica</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueByArea} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} fontSize={12} />
                  <YAxis type="category" dataKey="area" fontSize={12} width={80} />
                  <Tooltip formatter={(v: number) => `€${v.toLocaleString()}`} />
                  <Bar dataKey="receita" fill="hsl(217, 71%, 35%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Monthly Revenue Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tendência de Receita</CardTitle>
            <CardDescription>Evolução mensal do faturamento</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyRevenue}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" fontSize={12} />
                  <YAxis tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} fontSize={12} />
                  <Tooltip formatter={(v: number) => `€${v.toLocaleString()}`} />
                  <Line
                    type="monotone"
                    dataKey="receita"
                    stroke="hsl(217, 71%, 35%)"
                    strokeWidth={2}
                    dot={{ fill: "hsl(217, 71%, 35%)", r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Index;
