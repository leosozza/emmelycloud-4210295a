import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users } from "lucide-react";
import { toast } from "sonner";

interface BitrixUser { ID: string; NAME?: string; LAST_NAME?: string; EMAIL?: string }
interface AgentUserRow { id: string; bitrix_user_id: string; bitrix_user_name: string | null }

export function BitrixUserLink({ agentId }: { agentId?: string }) {
  const [users, setUsers] = useState<BitrixUser[]>([]);
  const [linked, setLinked] = useState<AgentUserRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!agentId) return;
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const [usersRes, linksRes] = await Promise.all([
          supabase.functions.invoke("bitrix24-fetch-users"),
          supabase.from("ai_agent_users").select("id, bitrix_user_id, bitrix_user_name").eq("agent_id", agentId),
        ]);
        if (cancel) return;
        if (usersRes.error) throw usersRes.error;
        if (linksRes.error) throw linksRes.error;
        setUsers((usersRes.data as any)?.users || []);
        setLinked((linksRes.data || []) as AgentUserRow[]);
      } catch (e: any) {
        toast.error(e.message || "Erro ao carregar utilizadores Bitrix24");
      } finally {
        setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [agentId]);

  const toggle = async (u: BitrixUser) => {
    if (!agentId) return;
    setSaving(true);
    try {
      const existing = linked.find(l => l.bitrix_user_id === u.ID);
      if (existing) {
        const { error } = await supabase.from("ai_agent_users").delete().eq("id", existing.id);
        if (error) throw error;
        setLinked(prev => prev.filter(l => l.id !== existing.id));
      } else {
        const name = [u.NAME, u.LAST_NAME].filter(Boolean).join(" ") || u.EMAIL || `User ${u.ID}`;
        const { data, error } = await supabase.from("ai_agent_users")
          .insert({ agent_id: agentId, bitrix_user_id: u.ID, bitrix_user_name: name } as any)
          .select("id, bitrix_user_id, bitrix_user_name").single();
        if (error) throw error;
        setLinked(prev => [...prev, data as AgentUserRow]);
      }
    } catch (e: any) {
      toast.error(e.message || "Erro ao atualizar vínculo");
    } finally {
      setSaving(false);
    }
  };

  if (!agentId) {
    return (
      <div className="text-xs text-muted-foreground p-3 rounded-lg border border-dashed">
        Guarde o agente primeiro para vincular utilizadores Bitrix24.
      </div>
    );
  }

  return (
    <div>
      <Label className="text-sm font-medium flex items-center gap-2">
        <Users className="h-4 w-4" /> Utilizadores Bitrix24 vinculados
      </Label>
      <p className="text-xs text-muted-foreground mb-2">
        O treinamento e as conversas destes utilizadores são associados a este agente.
      </p>
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> A carregar utilizadores...</div>
      ) : users.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sem utilizadores Bitrix24 disponíveis.</p>
      ) : (
        <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
          {users.map(u => {
            const selected = linked.some(l => l.bitrix_user_id === u.ID);
            const label = [u.NAME, u.LAST_NAME].filter(Boolean).join(" ") || u.EMAIL || `User ${u.ID}`;
            return (
              <Badge
                key={u.ID}
                variant={selected ? "default" : "outline"}
                className={`cursor-pointer text-xs py-1 px-3 ${saving ? "opacity-60" : ""}`}
                onClick={() => !saving && toggle(u)}
              >
                {selected ? "✓ " : ""}{label}
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}
