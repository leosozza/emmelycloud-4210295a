import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useFinancialDashboard } from "@/hooks/useFinancialDashboard";
import { Trophy, Medal, Award } from "lucide-react";

function fmtCurrency(value: number, currency = "EUR") {
  return value.toLocaleString("pt-PT", { style: "currency", currency });
}

const RANK_ICONS = [Trophy, Medal, Award];
const RANK_COLORS = ["text-amber-500", "text-zinc-400", "text-amber-700"];

interface Props {
  startDate: string;
  endDate: string;
}

export function RankingTab({ startDate, endDate }: Props) {
  const { data, isLoading } = useFinancialDashboard(startDate, endDate);

  if (isLoading || !data) {
    return <div className="p-8 text-center text-muted-foreground">Carregando ranking...</div>;
  }

  if (data.ranking.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          Nenhuma proposta aceita no período para gerar ranking.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top 3 cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {data.ranking.slice(0, 3).map((entry, i) => {
          const Icon = RANK_ICONS[i] || Award;
          return (
            <Card key={entry.profileId} className={i === 0 ? "border-amber-300 bg-amber-50/50 dark:bg-amber-950/10" : ""}>
              <CardHeader className="flex flex-row items-center gap-3 pb-2">
                <Icon className={`h-6 w-6 ${RANK_COLORS[i] || "text-muted-foreground"}`} />
                <div>
                  <CardTitle className="text-sm">{entry.name}</CardTitle>
                  <p className="text-xs text-muted-foreground">#{i + 1} no ranking</p>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-xl font-bold">{fmtCurrency(entry.totalRevenue, data.currency)}</div>
                <p className="text-xs text-muted-foreground">{entry.proposalsAccepted} proposta(s) aceita(s)</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Full table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ranking Completo</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead className="text-right">Propostas Aceitas</TableHead>
                <TableHead className="text-right">Receita Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.ranking.map((entry, i) => (
                <TableRow key={entry.profileId}>
                  <TableCell>
                    <Badge variant={i < 3 ? "default" : "outline"} className="w-8 justify-center">
                      {i + 1}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{entry.name}</TableCell>
                  <TableCell className="text-right">{entry.proposalsAccepted}</TableCell>
                  <TableCell className="text-right font-medium">{fmtCurrency(entry.totalRevenue, data.currency)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
