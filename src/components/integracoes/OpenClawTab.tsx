import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Bot, Copy, Check, ExternalLink, Plus, Trash2, Loader2, Zap, Key } from "lucide-react";

type OpenClawIntegration = {
  id: string;
  name: string;
  agent_endpoint: string;
  auth_header_name: string;
  auth_token: string | null;
  payload_template: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

const MCP_URL = "https://emmelycloud.lovable.app/mcp-server";
const API_DOCS_URL = "https://emmelycloud.lovable.app/api-docs";

const DEFAULT_TEMPLATE = {
  message: "{{message}}",
  conversation_id: "{{conversation_id}}",
  contact: "{{contact}}",
};

export function OpenClawTab() {
  const [items, setItems] = useState<OpenClawIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  // New integration form
  const [name, setName] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [headerName, setHeaderName] = useState("Authorization");
  const [token, setToken] = useState("");
  const [creating, setCreating] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("openclaw_integrations" as any)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Erro ao carregar integrações OpenClaw: " + error.message);
    } else {
      setItems((data as any) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const copy = (key: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopied(key);
    toast.success("Copiado!");
    setTimeout(() => setCopied(null), 1500);
  };

  const handleCreate = async () => {
    if (!name.trim() || !endpoint.trim()) {
      toast.error("Nome e endpoint são obrigatórios");
      return;
    }
    setCreating(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("openclaw_integrations" as any).insert({
      name: name.trim(),
      agent_endpoint: endpoint.trim(),
      auth_header_name: headerName.trim() || "Authorization",
      auth_token: token.trim() || null,
      payload_template: DEFAULT_TEMPLATE,
      is_active: true,
      created_by: userData.user?.id,
    });
    setCreating(false);
    if (error) {
      toast.error("Erro: " + error.message);
      return;
    }
    toast.success("Integração OpenClaw criada");
    setName("");
    setEndpoint("");
    setToken("");
    load();
  };

  const toggleActive = async (id: string, is_active: boolean) => {
    const { error } = await supabase
      .from("openclaw_integrations" as any)
      .update({ is_active: !is_active })
      .eq("id", id);
    if (error) toast.error(error.message);
    else load();
  };

  const remove = async (id: string) => {
    if (!confirm("Eliminar esta integração OpenClaw?")) return;
    const { error } = await supabase.from("openclaw_integrations" as any).delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Eliminada");
      load();
    }
  };

  const testIntegration = async (id: string) => {
    setTesting(id);
    try {
      const { data, error } = await supabase.functions.invoke("openclaw-send", {
        body: { integration_id: id, test: true, message: "ping from Emmely" },
      });
      if (error) {
        toast.error("Falha no teste: " + error.message);
      } else if ((data as any)?.ok) {
        toast.success(`OK (${(data as any).status}) em ${(data as any).latency_ms}ms`);
      } else {
        toast.error(`Endpoint respondeu ${(data as any)?.status ?? "?"}`);
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setTesting(null);
    }
  };

  return (
    <div className="space-y-6 mt-4">
      {/* Section A: Emmely -> OpenClaw via MCP */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            Conectar OpenClaw ao Emmely (MCP)
          </CardTitle>
          <CardDescription>
            Cola estes dados dentro do teu agente OpenClaw para ele conseguir executar tarefas no Emmely
            (consultar leads, criar pagamentos, enviar mensagens, etc.).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">URL do MCP Server</Label>
            <div className="flex gap-2">
              <Input readOnly value={MCP_URL} className="font-mono text-sm" />
              <Button variant="outline" size="icon" onClick={() => copy("mcp", MCP_URL)}>
                {copied === "mcp" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Header de autenticação</Label>
            <div className="flex gap-2">
              <Input readOnly value="X-API-Key: emk_live_..." className="font-mono text-sm" />
              <Button variant="outline" size="icon" onClick={() => copy("hdr", "X-API-Key")}>
                {copied === "hdr" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Gera uma chave <code className="text-[10px]">emk_live_</code> em API Docs e cola no header.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button asChild variant="default" size="sm">
              <a href={API_DOCS_URL} target="_blank" rel="noreferrer">
                <Key className="h-4 w-4 mr-2" />
                Gerar chave API
                <ExternalLink className="h-3 w-3 ml-1.5" />
              </a>
            </Button>
            <Badge variant="secondary" className="font-normal">CRM</Badge>
            <Badge variant="secondary" className="font-normal">Pagamentos</Badge>
            <Badge variant="secondary" className="font-normal">Mensagens</Badge>
            <Badge variant="secondary" className="font-normal">Faturas</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Section B: OpenClaw -> Emmely (Agent that replies clients) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            Agente OpenClaw que responde clientes
          </CardTitle>
          <CardDescription>
            Configura o endpoint HTTP do teu agente OpenClaw. O Emmely envia as mensagens recebidas
            (WhatsApp, Instagram...) para este endpoint e devolve a resposta ao cliente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome do agente</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Agente Atendimento" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Endpoint HTTP (POST)</Label>
              <Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://api.openclaw.com/agents/xxx/run" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Nome do header de auth</Label>
              <Input value={headerName} onChange={(e) => setHeaderName(e.target.value)} placeholder="Authorization" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Token / API Key</Label>
              <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="sk_..." />
            </div>
          </div>

          <div className="rounded-md bg-muted/50 p-3 text-xs space-y-1">
            <div className="font-medium">Formato do payload enviado:</div>
            <pre className="text-[11px] font-mono whitespace-pre overflow-x-auto">
{JSON.stringify(DEFAULT_TEMPLATE, null, 2)}
            </pre>
          </div>

          <Button onClick={handleCreate} disabled={creating}>
            {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
            Adicionar agente
          </Button>
        </CardContent>
      </Card>

      {/* List of integrations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Agentes OpenClaw configurados</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              A carregar...
            </div>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhum agente OpenClaw configurado ainda.
            </p>
          ) : (
            <div className="space-y-2">
              {items.map((it) => (
                <div key={it.id} className="flex items-center justify-between gap-3 p-3 border rounded-md">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{it.name}</span>
                      {it.is_active ? (
                        <Badge variant="default" className="text-[10px]">Ativo</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">Pausado</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono truncate">{it.agent_endpoint}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="outline" size="sm" onClick={() => testIntegration(it.id)} disabled={testing === it.id}>
                      {testing === it.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                      <span className="ml-1.5 hidden sm:inline">Testar</span>
                    </Button>
                    <Switch checked={it.is_active} onCheckedChange={() => toggleActive(it.id, it.is_active)} />
                    <Button variant="ghost" size="icon" onClick={() => remove(it.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
