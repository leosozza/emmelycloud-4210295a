import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface SkillDefinition {
  id: string;
  slug: string;
  name: string;
  vertical: string;
  description: string | null;
  intent_keywords: string[];
  allowed_tools: string[];
}

interface Props {
  agentId: string;
}

/**
 * Biblioteca de Skills por Intenção (Evolução 1).
 * Admin pode ativar/desativar skills reutilizáveis. Quando uma mensagem chega,
 * o agent-runtime faz matching por palavra-chave e injeta o prompt da skill +
 * restringe as ferramentas às permitidas (handoff).
 */
export function AgentSkillsLibrary({ agentId }: Props) {
  const [loading, setLoading] = useState(true);
  const [skills, setSkills] = useState<SkillDefinition[]>([]);
  const [enabledIds, setEnabledIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const [{ data: defs, error: e1 }, { data: links, error: e2 }] = await Promise.all([
        supabase
          .from("skill_definitions" as any)
          .select("id,slug,name,vertical,description,intent_keywords,allowed_tools")
          .eq("is_active", true)
          .order("vertical"),
        supabase
          .from("agent_skill_links" as any)
          .select("skill_definition_id,is_enabled")
          .eq("agent_id", agentId)
          .eq("is_enabled", true),
      ]);
      if (cancel) return;
      if (e1) toast.error("Erro ao carregar skills: " + e1.message);
      if (e2) toast.error("Erro ao carregar vínculos: " + e2.message);
      setSkills((defs as any) || []);
      setEnabledIds(new Set(((links as any) || []).map((l: any) => l.skill_definition_id)));
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [agentId]);

  const toggle = async (skillId: string, on: boolean) => {
    setBusy(skillId);
    try {
      if (on) {
        const { error } = await supabase
          .from("agent_skill_links" as any)
          .upsert({ agent_id: agentId, skill_definition_id: skillId, is_enabled: true }, { onConflict: "agent_id,skill_definition_id" });
        if (error) throw error;
        setEnabledIds(prev => new Set([...prev, skillId]));
      } else {
        const { error } = await supabase
          .from("agent_skill_links" as any)
          .delete()
          .eq("agent_id", agentId)
          .eq("skill_definition_id", skillId);
        if (error) throw error;
        setEnabledIds(prev => { const s = new Set(prev); s.delete(skillId); return s; });
      }
    } catch (e: any) {
      toast.error(e?.message || "Erro ao atualizar skill");
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> A carregar biblioteca de skills…</div>;
  }

  if (skills.length === 0) {
    return <div className="p-3 rounded-lg border border-dashed text-xs text-muted-foreground text-center">Sem skills na biblioteca.</div>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Sparkles className="h-3 w-3" />
        <span>Skills por intenção — quando uma palavra-chave bate, o prompt é injetado e as ferramentas são restritas.</span>
      </div>
      {skills.map(skill => {
        const enabled = enabledIds.has(skill.id);
        return (
          <div key={skill.id} className="flex items-start justify-between gap-3 p-3 rounded-lg border bg-muted/20 hover:bg-muted/40 transition-colors">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs font-medium">{skill.name}</p>
                <Badge variant="outline" className="text-[9px] px-1.5 py-0">{skill.vertical}</Badge>
              </div>
              {skill.description && <p className="text-[10px] text-muted-foreground mt-0.5">{skill.description}</p>}
              <div className="flex items-center gap-1 flex-wrap mt-1.5">
                {(skill.intent_keywords || []).slice(0, 5).map(k => (
                  <span key={k} className="text-[9px] px-1.5 py-0.5 rounded bg-background border text-muted-foreground">{k}</span>
                ))}
                {skill.intent_keywords?.length > 5 && (
                  <span className="text-[9px] text-muted-foreground">+{skill.intent_keywords.length - 5}</span>
                )}
              </div>
              {skill.allowed_tools?.length > 0 && (
                <p className="text-[9px] text-muted-foreground mt-1">
                  <span className="font-medium">Tools permitidas:</span> {skill.allowed_tools.join(", ")}
                </p>
              )}
            </div>
            <Switch
              checked={enabled}
              disabled={busy === skill.id}
              onCheckedChange={(v) => toggle(skill.id, v)}
            />
          </div>
        );
      })}
    </div>
  );
}
