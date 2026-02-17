import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

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
      return Object.entries(counts)
        .map(([area, count]) => ({ area, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
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
      {/* Top Areas */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold">Top Áreas Jurídicas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2.5">
          {areaStats.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sem dados</p>
          ) : areaStats.map((item, i) => (
            <div key={item.area} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                <span className="font-semibold text-foreground mr-1.5">{i + 1}.</span>
                {legalAreaLabels[item.area] || item.area}
              </span>
              <span className="text-xs font-bold text-primary">{item.count} leads</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Top Team Members */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold">Top Equipa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {teamStats.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sem dados</p>
          ) : teamStats.map((member) => (
            <div key={member.name} className="flex items-center gap-2.5">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="text-[10px] bg-primary/10 text-primary font-semibold">
                  {member.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm flex-1 truncate">{member.name}</span>
              <span className="text-xs font-bold text-primary">{member.count} leads</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
