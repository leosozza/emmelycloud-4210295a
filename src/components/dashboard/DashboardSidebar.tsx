import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";

const legalAreaLabels: Record<string, string> = {
  previdencia: "Previdência", cidadania: "Cidadania", vistos: "Vistos",
  trabalhista: "Trabalhista", familia: "Família", empresarial: "Empresarial",
  tributario: "Tributário", outro: "Outro",
};

export function DashboardSidebar() {
  const { data: areaStats = [] } = useQuery({
    queryKey: ["leads-by-area"],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("legal_area");
      if (error) throw error;
      const counts: Record<string, number> = {};
      data.forEach((l) => {
        const area = l.legal_area || "outro";
        counts[area] = (counts[area] || 0) + 1;
      });
      const entries = Object.entries(counts)
        .map(([area, count]) => ({ area, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
      const max = entries[0]?.count || 1;
      return entries.map((e) => ({ ...e, pct: Math.round((e.count / max) * 100) }));
    },
  });

  const { data: teamStats = [] } = useQuery({
    queryKey: ["team-leads"],
    queryFn: async () => {
      const { data: leads, error } = await supabase.from("leads").select("assigned_attorney_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      leads.forEach((l) => {
        if (l.assigned_attorney_id) {
          counts[l.assigned_attorney_id] = (counts[l.assigned_attorney_id] || 0) + 1;
        }
      });
      const topIds = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
      if (topIds.length === 0) return [];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", topIds.map(([id]) => id));

      const profileMap = Object.fromEntries((profiles || []).map((p) => [p.id, p.full_name]));
      return topIds.map(([id, count]) => ({ name: profileMap[id] || "—", count }));
    },
  });

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl shadow-sm hover:shadow-md transition-shadow">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold">Top Áreas Jurídicas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {areaStats.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sem dados</p>
          ) : areaStats.map((item, i) => (
            <div key={item.area} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {legalAreaLabels[item.area] || item.area}
                </span>
                <span className="font-semibold text-foreground">{item.count}</span>
              </div>
              <Progress value={item.pct} className="h-1.5" />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm hover:shadow-md transition-shadow">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold">Top Equipa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {teamStats.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sem dados</p>
          ) : teamStats.map((member) => (
            <div key={member.name} className="flex items-center gap-2.5">
              <Avatar className="h-7 w-7 ring-2 ring-primary/20">
                <AvatarFallback className="text-[10px] bg-primary/10 text-primary font-semibold">
                  {member.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm flex-1 truncate">{member.name}</span>
              <span className="text-xs font-bold text-primary">{member.count}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
