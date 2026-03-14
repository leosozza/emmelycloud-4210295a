import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useFinancialDashboard } from "@/hooks/useFinancialDashboard";

function fmtCurrency(value: number, currency = "EUR") {
  return value.toLocaleString("pt-PT", { style: "currency", currency });
}

interface Props {
  startDate: string;
  endDate: string;
}

export function InadimplenciaTab({ startDate, endDate }: Props) {
  const { data, isLoading } = useFinancialDashboard(startDate, endDate);

  if (isLoading || !data) {
    return <div className="p-8 text-center text-muted-foreground">Carregando...</div>;
  }

  const hasOverdue = data.agingBuckets.some((b) => b.count > 0);

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {data.agingBuckets.map((bucket, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">{bucket.label}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-xl font-bold">{fmtCurrency(bucket.amount, data.currency)}</div>
              <p className="text-xs text-muted-foreground">{bucket.count} transação(ões)</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Total */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>Total em Atraso</span>
            <Badge variant="destructive">{fmtCurrency(data.totalOverdue, data.currency)}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!hasOverdue ? (
            <p className="text-muted-foreground text-center py-4">Nenhuma transação em atraso. 🎉</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Faixa</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead className="text-right">Montante</TableHead>
                  <TableHead className="text-right">% do Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.agingBuckets.filter((b) => b.count > 0).map((bucket, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{bucket.label}</TableCell>
                    <TableCell className="text-right">{bucket.count}</TableCell>
                    <TableCell className="text-right">{fmtCurrency(bucket.amount, data.currency)}</TableCell>
                    <TableCell className="text-right">
                      {data.totalOverdue > 0 ? Math.round((bucket.amount / data.totalOverdue) * 100) : 0}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
