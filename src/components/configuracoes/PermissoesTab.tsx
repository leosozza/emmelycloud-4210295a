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

export default function PermissoesTab() {
  const { data: users, isLoading: usersLoading } = useBitrixUsers();
  const [integrationId, setIntegrationId] = useState<string | null>(null);
  const [appEnabled, setAppEnabled] = useState(false);
  const [appUsers, setAppUsers] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadPermissions();
  }, []);

  async function loadPermissions() {
    const { data: integ } = await supabase
      .from("bitrix24_integrations")
      .select("id, config")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!integ) { setLoaded(true); return; }
    setIntegrationId(integ.id);

    // Read restriction flag from config
    const cfg = (integ as any).config || {};
    if (cfg.restrict_app_access === true) {
      setAppEnabled(true);
    }

    const { data: perms } = await supabase
      .from("bitrix24_user_permissions")
      .select("bitrix_user_id, module")
      .eq("integration_id", integ.id)
      .eq("module", "emmely_app");

    if (perms && perms.length > 0) {
      const ids = new Set<string>(perms.map(p => p.bitrix_user_id));
      setAppUsers(ids);
    }
    setLoaded(true);
  }

  function toggleUser(userId: string) {
    setAppUsers(prev => {
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
      // Persist the restrict_app_access flag in integration config
      const { data: currentInteg } = await supabase
        .from("bitrix24_integrations")
        .select("config")
        .eq("id", integrationId)
        .single();

      const existingConfig = (currentInteg as any)?.config || {};
      const updatedConfig = { ...existingConfig, restrict_app_access: appEnabled };

      const { error: cfgError } = await supabase
        .from("bitrix24_integrations")
        .update({ config: updatedConfig })
        .eq("id", integrationId);
      if (cfgError) throw cfgError;

      // Delete existing emmely_app permissions
      const { error: delError } = await supabase
        .from("bitrix24_user_permissions")
        .delete()
        .eq("integration_id", integrationId)
        .eq("module", "emmely_app");
      if (delError) throw delError;

      // Insert new permissions
      if (appEnabled && appUsers.size > 0) {
        const rows = Array.from(appUsers).map(uid => ({
          integration_id: integrationId,
          bitrix_user_id: uid,
          module: "emmely_app",
        }));
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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Users className="h-4 w-4" />
        <span>Quando a restrição está ativa, apenas os utilizadores selecionados acedem ao aplicativo completo. Os restantes terão acesso apenas ao Chat IA.</span>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <Shield className="h-4 w-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-sm">Acesso ao Aplicativo</CardTitle>
                <CardDescription className="text-xs">Controle quem acede ao aplicativo completo. Os placements CRM não são afectados.</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Restringir</Label>
              <Switch checked={appEnabled} onCheckedChange={setAppEnabled} />
            </div>
          </div>
        </CardHeader>
        {appEnabled && (
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
                      checked={appUsers.has(u.id)}
                      onCheckedChange={() => toggleUser(u.id)}
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
          </CardContent>
        )}
      </Card>

      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
        {saving ? "A guardar…" : "Guardar Permissões"}
      </Button>
    </div>
  );
}
