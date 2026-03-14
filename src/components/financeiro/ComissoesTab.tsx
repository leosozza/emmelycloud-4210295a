import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCommissionEntries, useUpdateCommissionStatus } from "@/hooks/useCommissions";
import { useReportProfiles } from "@/hooks/useReportsData";
import { ComissaoRulesDialog } from "./ComissaoRulesDialog";
import { exportToCSV } from "@/lib/exportUtils";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { Settings, Download, CheckCircle2 } from "lucide-react";

function fmtCurrency(value: number, currency = "EUR") {
  return value.toLocaleString("pt-PT", { style: "currency", currency });
}

interface Props {
  startDate: string;
  endDate: string;
}

export function ComissoesTab({ startDate, endDate }: Props) {
  const [profileFilter, setProfileFilter] = useState("all");
  const [rulesOpen, setRulesOpen] = useState(false);
  const { data: entries = [], isLoading } = useCommissionEntries(startDate, endDate, profileFilter);
  const { data: profiles = [] } = useReportProfiles();
  const updateStatus = useUpdateCommissionStatus();

  const totalPending = entries.filter((e) => e.status === "pending").reduce((s, e) => s + Number(e.commission_amount), 0);
  const totalApproved = entries.filter((e) => e.status === "approved").reduce((s, e) => s + Number(e.commission_amount), 0);
  const totalPaid = entries.filter((e) => e.status === "paid").reduce((s, e) => s + Number(e.commission_amount), 0);

  const handleExport = () => {
    if (!entries.length) return;
    const rows = entries.map((e) => ({
      Vendedor: (e as any).profiles?.full_name || "—",
      "Valor Base": Number(e.base_amount).toFixed(2),
      "Percentagem (%)": Number(e.percentage).toFixed(1),
      Comissão: Number(e.commission_amount).toFixed(2),
      Moeda: e.currency,
      Status: e.status,
      Data: format(new Date(e.created_at), "dd/MM/yyyy"),
    }));
    exportToCSV(rows, "comissoes");
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Pendente</CardTitle></CardHeader>
          <CardContent className="pt-0"><div className="text-xl font-bold text-amber-600">{fmtCurrency(totalPending)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Aprovada</CardTitle></CardHeader>
          <CardContent className="pt-0"><div className="text-xl font-bold text-primary">{fmtCurrency(totalApproved)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Paga</CardTitle></CardHeader>
          <CardContent className="pt-0"><div className="text-xl font-bold text-emerald-600">{fmtCurrency(totalPaid)}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Comissões</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={profileFilter} onValueChange={setProfileFilter}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.full_name || "Sem nome"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={handleExport} className="gap-1">
              <Download className="h-3 w-3" /> CSV
            </Button>
            <Button size="sm" variant="outline" onClick={() => setRulesOpen(true)} className="gap-1">
              <Settings className="h-3 w-3" /> Regras
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Carregando...</div>
          ) : entries.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Nenhuma comissão no período.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendedor</TableHead>
                  <TableHead className="text-right">Valor Base</TableHead>
                  <TableHead className="text-right">%</TableHead>
                  <TableHead className="text-right">Comissão</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{(entry as any).profiles?.full_name || "—"}</TableCell>
                    <TableCell className="text-right">{fmtCurrency(Number(entry.base_amount), entry.currency)}</TableCell>
                    <TableCell className="text-right">{Number(entry.percentage).toFixed(1)}%</TableCell>
                    <TableCell className="text-right font-medium">{fmtCurrency(Number(entry.commission_amount), entry.currency)}</TableCell>
                    <TableCell>
                      <Badge variant={entry.status === "paid" ? "default" : entry.status === "approved" ? "secondary" : "outline"}
                        className={entry.status === "paid" ? "bg-emerald-500/15 text-emerald-700 border-emerald-200" : ""}>
                        {entry.status === "pending" ? "Pendente" : entry.status === "approved" ? "Aprovada" : "Paga"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(entry.created_at), "dd/MM/yyyy", { locale: pt })}
                    </TableCell>
                    <TableCell>
                      {entry.status === "pending" && (
                        <Button size="sm" variant="outline" className="gap-1 text-xs h-7"
                          onClick={() => updateStatus.mutate({ id: entry.id, status: "approved" })}>
                          <CheckCircle2 className="h-3 w-3" /> Aprovar
                        </Button>
                      )}
                      {entry.status === "approved" && (
                        <Button size="sm" variant="outline" className="gap-1 text-xs h-7"
                          onClick={() => updateStatus.mutate({ id: entry.id, status: "paid", paid_at: new Date().toISOString() })}>
                          Marcar Paga
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ComissaoRulesDialog open={rulesOpen} onOpenChange={setRulesOpen} />
    </div>
  );
}
