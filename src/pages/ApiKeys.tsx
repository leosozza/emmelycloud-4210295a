import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useAuthContext } from "@/contexts/AuthContext";
import { Navigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { Key, Plus, Trash2, Copy, AlertTriangle, ArrowLeft } from "lucide-react";

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export default function ApiKeysPage() {
  const { session, loading } = useAuthContext();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  useEffect(() => { if (session) load(); }, [session]);

  async function load() {
    setLoadingKeys(true);
    const { data } = await supabase
      .from("api_keys" as any)
      .select("*")
      .order("created_at", { ascending: false });
    setKeys((data as any) || []);
    setLoadingKeys(false);
  }

  async function create() {
    if (!newName.trim()) { toast.error("Dê um nome à chave"); return; }
    setCreating(true);
    const { data, error } = await supabase.functions.invoke("api-key-create", {
      body: { name: newName, scopes: ["read", "write"] },
    });
    setCreating(false);
    if (error || data?.error) { toast.error(error?.message || data?.error || "Erro"); return; }
    setCreatedKey(data.key);
    setNewName("");
    load();
  }

  async function revoke(id: string) {
    if (!confirm("Revogar esta chave? Esta ação não pode ser desfeita.")) return;
    const { error } = await supabase.functions.invoke("api-key-revoke", { body: { id } });
    if (error) { toast.error(error.message); return; }
    toast.success("Chave revogada");
    load();
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("Copiado!");
  }

  if (loading) return <div className="p-8 text-center text-muted-foreground">A carregar...</div>;
  if (!session) return <Navigate to="/auth?redirect=/api-docs/keys" replace />;

  return (
    <div className="container max-w-5xl mx-auto p-4 md:p-8">
      <Link to="/api-docs" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4" /> Voltar à documentação
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Key className="h-6 w-6" /> Chaves de API</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gere chaves para acesso programático e para conectar agentes MCP (OpenClaw, Claude Desktop, Cursor).
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <Button onClick={() => { setOpen(true); setCreatedKey(null); }}>
            <Plus className="h-4 w-4 mr-2" /> Nova chave
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{createdKey ? "Chave criada" : "Nova chave de API"}</DialogTitle>
            </DialogHeader>

            {createdKey ? (
              <div className="space-y-3">
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Copie esta chave agora. Por motivos de segurança, ela não será exibida novamente.
                  </AlertDescription>
                </Alert>
                <div className="flex gap-2">
                  <Input value={createdKey} readOnly className="font-mono text-xs" />
                  <Button variant="outline" size="icon" onClick={() => copy(createdKey)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <DialogFooter>
                  <Button onClick={() => { setOpen(false); setCreatedKey(null); }}>Fechado</Button>
                </DialogFooter>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <Label>Nome</Label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ex.: OpenClaw Production" />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                  <Button onClick={create} disabled={creating}>
                    {creating ? "A criar..." : "Criar chave"}
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm">Conexão MCP (OpenClaw, Claude Desktop, Cursor)</CardTitle>
          <CardDescription className="text-xs">Configure o seu cliente MCP com este endpoint</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] w-20 justify-center">URL</Badge>
            <code className="font-mono bg-muted/50 px-2 py-1 rounded flex-1 truncate">
              https://{import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/mcp-server
            </code>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() =>
              copy(`https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/mcp-server`)
            }>
              <Copy className="h-3 w-3" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] w-20 justify-center">Header</Badge>
            <code className="font-mono bg-muted/50 px-2 py-1 rounded">X-API-Key: emk_live_...</code>
          </div>
          <p className="text-[10px] text-muted-foreground pl-[88px]">
            Também suportado: <code>Authorization: Bearer emk_live_...</code> ou <code>Authorization: ApiKey emk_live_...</code>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">As suas chaves ({keys.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingKeys ? (
            <p className="text-sm text-muted-foreground py-4 text-center">A carregar...</p>
          ) : keys.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Nenhuma chave criada. Clique em "Nova chave" acima para começar.
            </p>
          ) : (
            <div className="space-y-2">
              {keys.map((k) => (
                <div key={k.id} className="flex items-center gap-3 border rounded-lg p-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm truncate">{k.name}</p>
                      {k.revoked_at && <Badge variant="destructive" className="text-[10px]">Revogada</Badge>}
                      {!k.revoked_at && k.expires_at && new Date(k.expires_at) < new Date() && (
                        <Badge variant="destructive" className="text-[10px]">Expirada</Badge>
                      )}
                      {!k.revoked_at && (!k.expires_at || new Date(k.expires_at) > new Date()) && (
                        <Badge variant="outline" className="text-[10px] text-success">Ativa</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{k.key_prefix}••••••••</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Criada em {new Date(k.created_at).toLocaleDateString("pt-PT")} ·{" "}
                      {k.last_used_at ? `Último uso: ${new Date(k.last_used_at).toLocaleDateString("pt-PT")}` : "Nunca usada"}
                    </p>
                  </div>
                  {!k.revoked_at && (
                    <Button variant="ghost" size="icon" onClick={() => revoke(k.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
