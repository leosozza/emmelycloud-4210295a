import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useFinancialDashboard } from "@/hooks/useFinancialDashboard";
import { useBitrixUsers } from "@/hooks/useBitrixUsers";
import { Trophy, Medal, Award, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

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
  const { data: bitrixUsers = [], isLoading: loadingUsers } = useBitrixUsers();

  // Build a map from Bitrix24 user names by ID
  const bitrixUserMap = new Map(bitrixUsers.map((u) => [u.id, u]));

  // Enrich ranking entries with Bitrix24 user data when available
  const enrichedRanking = (data?.ranking || []).map((entry) => {
    // Try to find matching Bitrix24 user by name or keep original
    const bitrixUser = bitrixUserMap.get(entry.profileId) || 
      bitrixUsers.find((u) => u.name.toLowerCase() === entry.name.toLowerCase());
    return {
      ...entry,
      name: bitrixUser?.name || entry.name,
      avatarUrl: bitrixUser?.avatarUrl || null,
      position: bitrixUser?.position || null,
    };
  });

  if (isLoading || loadingUsers) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
        <Card><CardContent className="p-6"><Skeleton className="h-40 w-full" /></CardContent></Card>
      </div>
    );
  }

  if (!data || enrichedRanking.length === 0) {
    return (
      <div className="space-y-6">
        {/* Bitrix24 users list */}
        {bitrixUsers.length > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">Utilizadores Bitrix24</CardTitle>
              <Badge variant="outline" className="ml-auto">{bitrixUsers.length} utilizador(es)</Badge>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                {bitrixUsers.slice(0, 20).map((u) => (
                  <div key={u.id} className="flex items-center gap-2 rounded-lg border p-2 pr-3">
                    <Avatar className="h-7 w-7">
                      {u.avatarUrl && <AvatarImage src={u.avatarUrl} />}
                      <AvatarFallback className="text-xs">{u.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium leading-none">{u.name}</p>
                      {u.position && <p className="text-xs text-muted-foreground">{u.position}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            Nenhuma proposta aceita no período para gerar ranking.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top 3 cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {enrichedRanking.slice(0, 3).map((entry, i) => {
          const Icon = RANK_ICONS[i] || Award;
          return (
            <Card key={entry.profileId} className={i === 0 ? "border-amber-300 bg-amber-50/50 dark:bg-amber-950/10" : ""}>
              <CardHeader className="flex flex-row items-center gap-3 pb-2">
                <Icon className={`h-6 w-6 ${RANK_COLORS[i] || "text-muted-foreground"}`} />
                <Avatar className="h-8 w-8">
                  {entry.avatarUrl && <AvatarImage src={entry.avatarUrl} />}
                  <AvatarFallback className="text-xs">{entry.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <div>
                  <CardTitle className="text-sm">{entry.name}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {entry.position ? `${entry.position} · ` : ""}#{i + 1} no ranking
                  </p>
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

      {/* Bitrix24 users summary */}
      {bitrixUsers.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm text-muted-foreground">
              {bitrixUsers.length} utilizador(es) no Bitrix24
            </CardTitle>
          </CardHeader>
        </Card>
      )}

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
                <TableHead>Cargo</TableHead>
                <TableHead className="text-right">Propostas Aceitas</TableHead>
                <TableHead className="text-right">Receita Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {enrichedRanking.map((entry, i) => (
                <TableRow key={entry.profileId}>
                  <TableCell>
                    <Badge variant={i < 3 ? "default" : "outline"} className="w-8 justify-center">
                      {i + 1}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        {entry.avatarUrl && <AvatarImage src={entry.avatarUrl} />}
                        <AvatarFallback className="text-[10px]">{entry.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{entry.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{entry.position || "—"}</TableCell>
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
