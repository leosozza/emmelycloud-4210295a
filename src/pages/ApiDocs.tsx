import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  Copy, ChevronDown, Search, MessageCircle, CreditCard, Bot, Phone,
  Plug, Shield, Webhook, FileText, ExternalLink,
} from "lucide-react";

const BASE_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1`;

interface Endpoint {
  name: string;
  method: string;
  path: string;
  auth: "Bearer JWT" | "Webhook Secret" | "Public" | "Service Role";
  description: string;
  category: string;
  request?: string;
  response?: string;
  notes?: string;
}

const endpoints: Endpoint[] = [
  // ── Omni Channel - Unified Send ──
  {
    name: "Enviar Mensagem (Unificado)",
    method: "POST",
    path: "/message-send",
    auth: "Service Role",
    category: "omnichannel",
    description: "Envia mensagem via WhatsApp Business API ou Instagram Graph API. Roteia automaticamente pelo canal da conversa.",
    request: `{
  "conversation_id": "uuid",
  "content": "Olá, como posso ajudar?"
}`,
    response: `{
  "success": true,
  "message_id": "external-id"
}`,
    notes: "Instagram usa META_PAGE_ACCESS_TOKEN + META_IG_ACCOUNT_ID. WhatsApp usa META_WA_ACCESS_TOKEN + META_WA_PHONE_NUMBER_ID.",
  },
  {
    name: "Webhook WhatsApp (Meta)",
    method: "GET/POST",
    path: "/whatsapp-webhook",
    auth: "Public",
    category: "omnichannel",
    description: "Recebe mensagens inbound do WhatsApp Business API. GET para verificação, POST para mensagens. Cria conversas e dispara flow-engine automaticamente.",
    notes: "Configure no Meta Business > WhatsApp > Configuration > Webhook URL. O verify_token é META_APP_SECRET.",
  },
  {
    name: "Webhook Instagram (Meta)",
    method: "GET/POST",
    path: "/instagram-webhook",
    auth: "Public",
    category: "omnichannel",
    description: "Recebe mensagens inbound do Instagram Messaging API. GET para verificação, POST para mensagens. Cria conversas e dispara chatbot-reply automaticamente.",
    notes: "Configure no Meta Developers > Instagram > Webhooks. O verify_token é META_APP_SECRET.",
  },
  // ── Omni Channel - Instagram ──
  {
    name: "Enviar Mensagem (Instagram Direct)",
    method: "POST",
    path: "/instagram-send",
    auth: "Bearer JWT",
    category: "omnichannel",
    description: "Envia mensagem via Instagram Messaging API (Meta Graph API v24.0). Uso direto pelo frontend.",
    request: `{
  "conversation_id": "uuid",
  "content": "Olá!"
}`,
    response: `{
  "success": true,
  "message_id": "ig-message-id"
}`,
    notes: "Requer META_PAGE_ACCESS_TOKEN (prefixo IGAA...) e META_IG_ACCOUNT_ID configurados.",
  },
  {
    name: "Publicar no Instagram Feed",
    method: "POST",
    path: "/instagram-publish",
    auth: "Bearer JWT",
    category: "omnichannel",
    description: "Publica imagem ou vídeo (Reels) no feed do Instagram.",
    request: `{
  "image_url": "https://example.com/image.jpg",
  "caption": "Legenda do post",
  "media_type": "IMAGE"
}`,
    response: `{
  "success": true,
  "media_id": "ig-media-id"
}`,
  },
  {
    name: "Testar Conexão Instagram",
    method: "GET",
    path: "/instagram-test-connection",
    auth: "Public",
    category: "omnichannel",
    description: "Verifica o estado da conexão Meta Graph API para Instagram.",
    response: `{
  "ok": true,
  "message": "Conexão Instagram operacional!",
  "meta": { "ok": true, "username": "emmelycloud" }
}`,
  },
  {
    name: "Chatbot Auto-Reply",
    method: "POST",
    path: "/chatbot-reply",
    auth: "Service Role",
    category: "ai",
    description: "Motor de auto-resposta IA. Busca agente default, gera resposta e envia para o canal externo e Bitrix24.",
    request: `{
  "conversation_id": "uuid",
  "message_text": "Qual o prazo?"
}`,
    response: `{
  "success": true,
  "reply": "O prazo médio é..."
}`,
    notes: "Chamado internamente pelos webhooks. Requer agente com is_default=true e is_active=true.",
  },
  // ── Pagamentos ──
  {
    name: "Criar Cobrança",
    method: "POST",
    path: "/payment-create",
    auth: "Public",
    category: "payments",
    description: "Cria cobrança unificada. Seleciona automaticamente Stripe (EUR/Europa) ou Asaas (BRL/Brasil) com base no país/moeda.",
    request: `{
  "contract_id": "uuid (opcional)",
  "client_id": "uuid (opcional)",
  "financial_record_id": "uuid (opcional)",
  "amount": 150.00,
  "currency": "EUR",  // ou "BRL"
  "payment_method": "card",  // "card", "pix", "boleto"
  "customer_data": {
    "name": "João Silva",
    "email": "joao@email.com",
    "country": "Portugal",
    "cpf_cnpj": "12345678900"  // apenas Brasil
  },
  "description": "Honorários advocatícios"
}`,
    response: `{
  "ok": true,
  "transaction": {
    "id": "uuid",
    "gateway": "stripe",
    "gateway_payment_id": "pi_xxx",
    "status": "pending",
    "payment_url": "https://...",
    "pix_qr_code": "base64 (Asaas PIX)",
    "pix_code": "copia-e-cola"
  }
}`,
    notes: "Para Stripe, retorna client_secret em metadata para integração frontend. Para Asaas PIX, retorna QR code base64 e código copia-e-cola.",
  },
  {
    name: "Consultar Pagamento",
    method: "GET",
    path: "/payment-status?transaction_id=uuid",
    auth: "Public",
    category: "payments",
    description: "Consulta o status de um pagamento em tempo real, incluindo informações do gateway.",
    response: `{
  "ok": true,
  "transaction": { "id": "...", "status": "confirmed", "amount": 150 },
  "gateway_status": {
    "stripe_status": "succeeded",
    "amount_received": 150
  }
}`,
    notes: "Também suporta ?list=true para listar as últimas 20 transações.",
  },
  {
    name: "Webhook Stripe",
    method: "POST",
    path: "/payment-webhook-stripe",
    auth: "Webhook Secret",
    category: "payments",
    description: "Processa eventos Stripe (payment_intent.succeeded, payment_failed, canceled, charge.refunded). Atualiza payment_transactions e financial_records.",
    notes: "Configure o webhook no Stripe Dashboard → Developers → Webhooks. O STRIPE_WEBHOOK_SECRET é lido de integration_credentials. Inclui verificação de assinatura HMAC-SHA256.",
  },
  {
    name: "Webhook Asaas",
    method: "POST",
    path: "/payment-webhook-asaas",
    auth: "Webhook Secret",
    category: "payments",
    description: "Processa eventos Asaas (PAYMENT_CONFIRMED, RECEIVED, OVERDUE, REFUNDED, etc.). Atualiza payment_transactions e financial_records.",
    notes: "O ASAAS_WEBHOOK_TOKEN é opcional mas recomendado. Configure no painel Asaas → Integrações → Webhooks.",
  },
  // ── Inteligência Artificial ──
  {
    name: "AI Playground (Chat)",
    method: "POST",
    path: "/ai-playground",
    auth: "Public",
    category: "ai",
    description: "Envia mensagens para um agente de IA e recebe respostas. Suporta multi-provedor (Emmely AI, OpenAI, Anthropic, etc.) e base de conhecimento RAG.",
    request: `{
  "agent_id": "uuid",
  "messages": [
    { "role": "user", "content": "Qual o prazo para cidadania portuguesa?" }
  ]
}`,
    response: `{
  "content": "O prazo médio para a concessão de cidadania...",
  "usage": {
    "prompt_tokens": 150,
    "completion_tokens": 200,
    "total_tokens": 350
  }
}`,
    notes: "O system_prompt do agente é combinado com os chunks da base de conhecimento vinculada. Chaves de API de provedores externos são lidas de integration_credentials.",
  },
  {
    name: "Token de Conversa (ElevenLabs)",
    method: "POST",
    path: "/elevenlabs-conversation-token",
    auth: "Public",
    category: "ai",
    description: "Gera token WebRTC para conversa de voz com agente ElevenLabs. A API key é lida de integration_credentials.",
    request: `{
  "agent_id": "uuid"
}`,
    response: `{
  "token": "elevenlabs-conversation-token",
  "agent_id": "elevenlabs-agent-id"
}`,
    notes: "Requer integration_credentials: provider='elevenlabs', credential_key='api_key'. O voice_id do agente ou credential 'agent_id' define o ElevenLabs Agent.",
  },
  // ── Credenciais ──
  {
    name: "Listar Credenciais",
    method: "GET",
    path: "/manage-credentials",
    auth: "Bearer JWT",
    category: "admin",
    description: "Lista todas as credenciais de integração (valores mascarados). Apenas admin.",
    response: `{
  "credentials": [
    {
      "id": "uuid",
      "provider": "stripe",
      "credential_key": "STRIPE_SECRET_KEY",
      "credential_value_masked": "sk_l••••test",
      "has_value": true,
      "updated_at": "2025-01-01T00:00:00Z"
    }
  ]
}`,
  },
  {
    name: "Salvar Credencial",
    method: "POST",
    path: "/manage-credentials",
    auth: "Bearer JWT",
    category: "admin",
    description: "Cria ou atualiza uma credencial de integração. Apenas admin.",
    request: `{
  "provider": "stripe",
  "credential_key": "STRIPE_SECRET_KEY",
  "credential_value": "sk_live_xxx"
}`,
    response: `{ "ok": true }`,
  },
  // ── Bitrix24 ──
  {
    name: "Instalação Bitrix24",
    method: "POST",
    path: "/bitrix24-install",
    auth: "Public",
    category: "bitrix24",
    description: "Endpoint de instalação do app Bitrix24. Processa OAuth handshake, regista conector Open Channel, vincula eventos e regista robots BizProc.",
    notes: "Configure como Install URL no Bitrix24 Marketplace. Regista automaticamente: conector 'emmely_connector', eventos (OnImConnectorMessageAdd, etc.) e 4 robots BizProc (WhatsApp, Instagram, Criar Cobrança, Verificar Pagamento).",
  },
  {
    name: "Eventos Bitrix24",
    method: "POST",
    path: "/bitrix24-events",
    auth: "Public",
    category: "bitrix24",
    description: "Processa eventos do Bitrix24 (OnImConnectorMessageAdd, OnImConnectorStatusDelete, ONIMBOTMESSAGEADD). Encaminha mensagens via Meta API direta.",
    notes: "Inclui detecção de mensagens de bot para evitar loops. Faz refresh automático de tokens OAuth expirados.",
  },
  {
    name: "Enviar para Bitrix24",
    method: "POST",
    path: "/bitrix24-send",
    auth: "Service Role",
    category: "bitrix24",
    description: "Encaminha mensagens recebidas para o Open Channel do Bitrix24. Chamado internamente pelos webhooks de Instagram e WhatsApp.",
    request: `{
  "message": "Texto da mensagem",
  "contactName": "João Silva",
  "contactId": "+351912345678",
  "channel": "whatsapp",
  "conversationId": "uuid"
}`,
    notes: "Utiliza imconnector.send.messages como método principal e im.notify.system.add como fallback.",
  },
  {
    name: "Configurações Bitrix24",
    method: "GET/POST",
    path: "/bitrix24-connector-settings",
    auth: "Public",
    category: "bitrix24",
    description: "Settings Handler do conector Bitrix24. Retorna HTML para iframe ou JSON (format=json). Mostra estado do conector e canais mapeados.",
  },
  {
    name: "Testar Conexão Bitrix24",
    method: "GET",
    path: "/bitrix24-test-connection",
    auth: "Public",
    category: "bitrix24",
    description: "Verifica se o token Bitrix24 está válido chamando app.info na API REST.",
    response: `{
  "ok": true,
  "message": "Conexão válida! Token ativo.",
  "details": {
    "domain": "portal.bitrix24.com",
    "connector_registered": true,
    "connector_active": true,
    "app_status": "L"
  }
}`,
  },
  {
    name: "Robot Handler Bitrix24",
    method: "POST",
    path: "/bitrix24-robot-handler",
    auth: "Public",
    category: "bitrix24",
    description: "Processa execuções dos 4 robots BizProc: emmely_send_whatsapp, emmely_send_instagram, emmely_create_charge, emmely_check_payment.",
    request: `{
  "code": "emmely_send_whatsapp",
  "event_token": "bitrix-event-token",
  "properties": {
    "phone": "+351912345678",
    "message": "Olá!"
  },
  "auth": { "member_id": "..." }
}`,
    response: `{
  "ok": true,
  "returnValues": {
    "message_id": "callbell-uuid",
    "status": "sent",
    "error": ""
  }
}`,
    notes: "Retorna resultados ao workflow Bitrix24 via bizproc.event.send. Os robots disponíveis são registados automaticamente durante a instalação.",
  },
];

const categories = [
  { id: "all", label: "Todos", icon: FileText },
  { id: "omnichannel", label: "Omni Channel", icon: MessageCircle },
  { id: "payments", label: "Pagamentos", icon: CreditCard },
  { id: "ai", label: "Inteligência Artificial", icon: Bot },
  { id: "admin", label: "Administração", icon: Shield },
  { id: "bitrix24", label: "Bitrix24", icon: Plug },
];

const methodColors: Record<string, string> = {
  GET: "bg-primary/10 text-primary border-primary/20",
  POST: "bg-accent/20 text-accent-foreground border-accent/30",
  "GET/POST": "bg-muted text-muted-foreground border-border",
};

function CodeBlock({ code, title }: { code: string; title?: string }) {
  const copy = () => {
    navigator.clipboard.writeText(code);
    toast.success("Código copiado!");
  };
  return (
    <div className="relative group">
      {title && <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{title}</p>}
      <pre className="bg-muted/50 border rounded-md p-3 text-xs overflow-x-auto whitespace-pre-wrap font-mono">
        {code}
      </pre>
      <Button
        variant="ghost" size="icon"
        className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={copy}
      >
        <Copy className="h-3 w-3" />
      </Button>
    </div>
  );
}

function EndpointCard({ ep }: { ep: Endpoint }) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="w-full">
        <Card className="hover:border-primary/30 transition-colors cursor-pointer">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Badge variant="outline" className={`text-[10px] font-mono ${methodColors[ep.method] || ""}`}>
                {ep.method}
              </Badge>
              <code className="text-xs font-mono text-muted-foreground flex-1 text-left truncate">
                {ep.path}
              </code>
              <Badge variant="secondary" className="text-[10px]">{ep.auth}</Badge>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform" />
            </div>
            <p className="text-sm font-medium text-left mt-2">{ep.name}</p>
            <p className="text-xs text-muted-foreground text-left">{ep.description}</p>
          </CardContent>
        </Card>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-4 pb-4 space-y-3 border-x border-b rounded-b-lg bg-muted/10 -mt-1">
          <Separator />
          <div className="space-y-2">
            <p className="text-xs font-medium">URL Completa</p>
            <CodeBlock code={`${BASE_URL}${ep.path}`} />
          </div>
          {ep.request && <CodeBlock code={ep.request} title="Request Body" />}
          {ep.response && <CodeBlock code={ep.response} title="Response" />}
          {ep.notes && (
            <div className="bg-primary/5 border border-primary/10 rounded-md p-3">
              <p className="text-xs text-foreground"><strong>Notas:</strong> {ep.notes}</p>
            </div>
          )}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Exemplo cURL</p>
            <CodeBlock code={generateCurl(ep)} />
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function generateCurl(ep: Endpoint): string {
  const url = `${BASE_URL}${ep.path.split("?")[0]}`;
  const parts = [`curl -X ${ep.method.split("/")[0]} "${url}"`];

  parts.push(`  -H "Content-Type: application/json"`);

  if (ep.auth === "Bearer JWT") {
    parts.push(`  -H "Authorization: Bearer YOUR_JWT_TOKEN"`);
    parts.push(`  -H "apikey: YOUR_ANON_KEY"`);
  }

  if (ep.method.includes("POST") && ep.request) {
    try {
      const body = JSON.parse(ep.request);
      parts.push(`  -d '${JSON.stringify(body, null, 2)}'`);
    } catch {
      parts.push(`  -d '${ep.request}'`);
    }
  }

  return parts.join(" \\\n");
}

export default function ApiDocsPage() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");

  const filtered = endpoints.filter((ep) => {
    const matchesCategory = activeCategory === "all" || ep.category === activeCategory;
    const matchesSearch = !search ||
      ep.name.toLowerCase().includes(search.toLowerCase()) ||
      ep.path.toLowerCase().includes(search.toLowerCase()) ||
      ep.description.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const categoryCount = (cat: string) =>
    cat === "all" ? endpoints.length : endpoints.filter((e) => e.category === cat).length;

  return (
    <div>
      <PageHeader
        title="Documentação API"
        description="Referência completa de todos os endpoints, webhooks e edge functions do sistema Emmely Cloud"
      />

      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-primary">{endpoints.length}</p>
            <p className="text-xs text-muted-foreground">Endpoints</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-primary">{endpoints.filter(e => e.category === "omnichannel").length}</p>
            <p className="text-xs text-muted-foreground">Omni Channel</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-primary">{endpoints.filter(e => e.category === "payments").length}</p>
            <p className="text-xs text-muted-foreground">Pagamentos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-primary">{endpoints.filter(e => e.category === "bitrix24").length}</p>
            <p className="text-xs text-muted-foreground">Bitrix24</p>
          </CardContent>
        </Card>
      </div>

      {/* Auth Info */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2"><Shield className="h-4 w-4" /> Autenticação</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Badge variant="outline" className="text-[10px]">Bearer JWT</Badge>
              <p className="text-muted-foreground">Requer token de sessão do utilizador autenticado. Incluir headers: <code className="text-[10px]">Authorization: Bearer TOKEN</code> e <code className="text-[10px]">apikey: ANON_KEY</code></p>
            </div>
            <div className="space-y-1">
              <Badge variant="outline" className="text-[10px]">Webhook Secret</Badge>
              <p className="text-muted-foreground">Validado por assinatura HMAC (Stripe) ou token (Asaas). Credenciais lidas de <code className="text-[10px]">integration_credentials</code>.</p>
            </div>
            <div className="space-y-1">
              <Badge variant="outline" className="text-[10px]">Public</Badge>
              <p className="text-muted-foreground">Sem autenticação. Usado para webhooks externos e endpoints de teste.</p>
            </div>
            <div className="space-y-1">
              <Badge variant="outline" className="text-[10px]">Service Role</Badge>
              <p className="text-muted-foreground">Chamado internamente entre edge functions. Usa <code className="text-[10px]">SUPABASE_SERVICE_ROLE_KEY</code>.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search + Filter */}
      <div className="flex flex-col md:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar endpoints..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <Tabs value={activeCategory} onValueChange={setActiveCategory}>
        <TabsList className="mb-4 flex-wrap h-auto gap-1">
          {categories.map((cat) => (
            <TabsTrigger key={cat.id} value={cat.id} className="text-xs gap-1.5">
              <cat.icon className="h-3 w-3" />
              {cat.label}
              <Badge variant="secondary" className="text-[9px] h-4 px-1">{categoryCount(cat.id)}</Badge>
            </TabsTrigger>
          ))}
        </TabsList>

        {categories.map((cat) => (
          <TabsContent key={cat.id} value={cat.id} className="space-y-3">
            {filtered.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground text-sm">
                  Nenhum endpoint encontrado.
                </CardContent>
              </Card>
            ) : (
              filtered.map((ep, i) => <EndpointCard key={i} ep={ep} />)
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* Database Schema Summary */}
      <Separator className="my-8" />
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Tabelas Principais</CardTitle>
          <CardDescription className="text-xs">Esquema resumido das tabelas utilizadas pelas APIs</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            {[
              { name: "conversations", cols: "channel, contact_name, contact_phone, contact_instagram, status, unread_count" },
              { name: "messages", cols: "conversation_id, direction, content, sender_name, external_id, delivery_status" },
              { name: "payment_transactions", cols: "gateway, amount, currency, status, payment_url, pix_code, gateway_payment_id" },
              { name: "ai_agents", cols: "ai_provider, ai_model, system_prompt, temperature, voice_provider, voice_id, agent_type" },
              { name: "ai_providers", cols: "slug, base_url, credential_key, auth_header, available_models" },
              { name: "integration_credentials", cols: "provider, credential_key, credential_value" },
              { name: "bitrix24_integrations", cols: "member_id, domain, access_token, connector_active" },
              { name: "bitrix24_channel_mappings", cols: "integration_id, channel, line_id, is_active" },
              { name: "knowledge_documents", cols: "title, content, source_type, status, chunks_count" },
            ].map((t) => (
              <div key={t.name} className="border rounded-md p-3">
                <p className="font-mono font-medium text-primary">{t.name}</p>
                <p className="text-muted-foreground mt-1">{t.cols}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
