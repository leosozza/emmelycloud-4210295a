import { useEffect, useState } from "react";
import { Shield, Save, RefreshCw, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useBitrixUsers } from "@/hooks/useBitrixUsers";
import { toast } from "sonner";

type Module = "emmely_ai" | "emmely_pay";

interface Permission {
  integration_id: string;
  bitrix_user_id: string;
  module: Module;
}

export default function PermissoesTab() {
  const { data: users, isLoading: usersLoading } = useBitrixUsers();
  const [integrationId, setIntegrationId] = useState<string | null>(null);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [payEnabled, setPayEnabled] = useState(false);
  const [aiUsers, setAiUsers] = useState<Set<string>>(new Set());
  const [payUsers, setPayUsers] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadPermissions();
  }, []);

  async function loadPermissions() {
    // Get integration
    const { data: integ } = await supabase
      .from("bitrix24_integrations")
      .select("id")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!integ) { setLoaded(true); return; }
    setIntegrationId(integ.id);

    const { data: perms } = await supabase
      .from("bitrix24_user_permissions")
      .select("bitrix_user_id, module")
      .eq("integration_id", integ.id);

    if (perms && perms.length > 0) {
      const ai = new Set<string>();
      const pay = new Set<string>();
      for (const p of perms) {
        if (p.module === "emmely_ai") ai.add(p.bitrix_user_id);
        if (p.module === "emmely_pay") pay.add(p.bitrix_user_id);
      }
      if (ai.size > 0) { setAiEnabled(true); setAiUsers(ai); }
      if (pay.size > 0) { setPayEnabled(true); setPayUsers(pay); }
    }
    setLoaded(true);
  }

  function toggleUser(module: Module, userId: string) {
    const setter = module === "emmely_ai" ? setAiUsers : setPayUsers;
    setter(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function handleSave() {
    if (!integrationId) return;
    setSaving(true);

    try {
      // Delete existing permissions for this integration
      const { error: delError } = await supabase
        .from("bitrix24_user_permissions")
        .delete()
        .eq("integration_id", integrationId);
      if (delError) throw delError;

      // Insert new permissions
      const rows: any[] = [];
      if (aiEnabled) {
        for (const uid of aiUsers) {
          rows.push({ integration_id: integrationId, bitrix_user_id: uid, module: "emmely_ai" });
        }
      }
      if (payEnabled) {
        for (const uid of payUsers) {
          rows.push({ integration_id: integrationId, bitrix_user_id: uid, module: "emmely_pay" });
        }
      }

      if (rows.length > 0) {
        const { error: insError } = await supabase.from("bitrix24_user_permissions").insert(rows);
        if (insError) throw insError;
      }

      toast.success("Permissões guardadas com sucesso");
    } catch (e: any) {
      console.error(e);
      toast.error("Erro ao guardar permissões");
    }
    setSaving(false);
  }

  if (!loaded) return <div className="text-sm text-muted-foreground p-4">A carregar...</div>;
  if (!integrationId) return <div className="text-sm text-muted-foreground p-4">Nenhuma integração Bitrix24 encontrada.</div>;

  const renderModuleSection = (module: Module, enabled: boolean, setEnabled: (v: boolean) => void, selectedUsers: Set<string>, label: string, description: string) => (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Shield className="h-4 w-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-sm">{label}</CardTitle>
              <CardDescription className="text-xs">{description}</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Restringir</Label>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>
      </CardHeader>
      {enabled && (
        <CardContent className="pt-0">
          {usersLoading ? (
            <p className="text-xs text-muted-foreground">A carregar utilizadores...</p>
          ) : !users || users.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum utilizador Bitrix24 encontrado.</p>
          ) : (
            <div className="grid gap-2 max-h-[300px] overflow-y-auto">
              {users.map(u => (
                <label
                  key={u.id}
                  className="flex items-center gap-3 rounded-lg border p-2.5 cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <Checkbox
                    checked={selectedUsers.has(u.id)}
                    onCheckedChange={() => toggleUser(module, u.id)}
                  />
                  <Avatar className="h-7 w-7">
                    {u.avatarUrl && <AvatarImage src={u.avatarUrl} />}
                    <AvatarFallback className="text-[10px]">
                      {u.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{u.name}</p>
                    {u.email && <p className="text-[11px] text-muted-foreground truncate">{u.email}</p>}
                  </div>
                </label>
              ))}
            </div>
          )}
          {!enabled && (
            <p className="text-xs text-muted-foreground italic">Todos os utilizadores têm acesso.</p>
          )}
        </CardContent>
      )}
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Users className="h-4 w-4" />
        <span>Quando a restrição está ativa, apenas os utilizadores selecionados acedem ao módulo.</span>
      </div>

      {renderModuleSection("emmely_ai", aiEnabled, setAiEnabled, aiUsers, "Emmely AI", "Controle quem acede ao assistente IA nos CRM tabs")}
      {renderModuleSection("emmely_pay", payEnabled, setPayEnabled, payUsers, "Emmely Pay", "Controle quem acede ao módulo de pagamentos")}

      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
        {saving ? "A guardar…" : "Guardar Permissões"}
      </Button>
    </div>
  );
}
