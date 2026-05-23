import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { useAuthContext } from "@/contexts/AuthContext";
import {
  Copy, ChevronDown, Search, MessageCircle, CreditCard, Bot, FileText,
  Shield, Plug, Workflow, Database, Key, Server, Volume2, Brain, Mic, Layers, ArrowLeft,
  Github, Zap, ExternalLink,
} from "lucide-react";

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const BASE_URL = `https://${PROJECT_ID}.supabase.co/functions/v1`;
const MCP_URL = `${BASE_URL}/mcp-server`;

type AuthType = "Bearer JWT" | "API Key" | "Webhook Secret" | "Public" | "Service Role";
type Category =
  | "omnichannel" | "payments" | "ai" | "agents" | "voice"
  | "bitrix24" | "knowledge" | "flows" | "admin" | "mcp" | "integracoes";

interface Endpoint {
  name: string;
  method: string;
  path: string;
  auth: AuthType;
  category: Category;
  description: string;
  request?: string;
  response?: string;
  notes?: string;
}

const endpoints: Endpoint[] = [
  // ─────────── OMNICHANNEL ───────────
  { category: "omnichannel", name: "Enviar Mensagem (Unificado)", method: "POST", path: "/message-send", auth: "Service Role",
    description: "Roteia automaticamente para WhatsApp/Instagram/Email conforme o canal da conversa.",
    request: `{ "conversation_id": "uuid", "content": "Olá!" }`,
    response: `{ "success": true, "message_id": "..." }` },
  { category: "omnichannel", name: "Webhook WhatsApp Cloud (Meta)", method: "GET/POST", path: "/whatsapp-webhook", auth: "Public",
    description: "Recebe mensagens do WhatsApp Business API. GET = verificação, POST = mensagens." },
  { category: "omnichannel", name: "Webhook Instagram (Meta)", method: "GET/POST", path: "/instagram-webhook", auth: "Public",
    description: "Recebe DMs e comentários do Instagram via Graph API." },
  { category: "omnichannel", name: "Enviar Instagram Direct", method: "POST", path: "/instagram-send", auth: "Bearer JWT",
    description: "Envia DM via Instagram Messaging API.",
    request: `{ "conversation_id": "uuid", "content": "Olá!" }` },
  { category: "omnichannel", name: "Publicar no Instagram Feed", method: "POST", path: "/instagram-publish", auth: "Bearer JWT",
    description: "Publica imagem ou vídeo no feed via Graph API.",
    request: `{ "image_url": "...", "caption": "...", "media_type": "IMAGE" }` },
  { category: "omnichannel", name: "Testar Conexão Instagram", method: "POST", path: "/instagram-test-connection", auth: "Bearer JWT",
    description: "Valida META_PAGE_ACCESS_TOKEN e META_IG_ACCOUNT_ID." },
  { category: "omnichannel", name: "Webhook WUZAPI (WhatsApp QR)", method: "POST", path: "/wuzapi-webhook", auth: "Public",
    description: "Recebe mensagens do WhatsApp QR-Code via WUZAPI. Encaminha para Open Channels do Bitrix24." },
  { category: "omnichannel", name: "Testar Conexão WUZAPI", method: "POST", path: "/wuzapi-test-connection", auth: "Bearer JWT",
    description: "Verifica estado da sessão WUZAPI (connected/loggedIn)." },

  // ─────────── PAGAMENTOS ───────────
  { category: "payments", name: "Criar Pagamento", method: "POST", path: "/payment-create", auth: "Bearer JWT",
    description: "Cria transação Stripe ou Asaas com normalização de gateway/método.",
    request: `{ "amount": 99.90, "currency": "BRL", "gateway": "asaas", "method": "pix", "customer": {...} }` },
  { category: "payments", name: "Criar Link de Pagamento", method: "POST", path: "/payment-create-link", auth: "Bearer JWT",
    description: "Gera link público de pagamento com idempotência (reutiliza transação ativa)." },
  { category: "payments", name: "Status de Pagamento", method: "GET", path: "/payment-status?id=...", auth: "Public",
    description: "Consulta status de uma transação pública." },
  { category: "payments", name: "Webhook Stripe", method: "POST", path: "/payment-webhook-stripe", auth: "Webhook Secret",
    description: "Recebe eventos Stripe (multi-conta). Suporta stripe_pt e stripe_br via integration_credentials." },
  { category: "payments", name: "Webhook Asaas", method: "POST", path: "/payment-webhook-asaas", auth: "Webhook Secret",
    description: "Recebe eventos Asaas (PIX, boleto, cartão). Atualiza financial_records." },
  { category: "payments", name: "Comprovativo de Pagamento", method: "POST", path: "/payment-receipt", auth: "Service Role",
    description: "Envia automaticamente comprovativo + extrato ao cliente após confirmação." },
  { category: "payments", name: "Lembrete de Cobrança (CRON)", method: "POST", path: "/payment-reminder", auth: "Service Role",
    description: "Executado diariamente (09h) — envia lembretes D-3, D-1, D0 e atrasos via WhatsApp." },

  // ─────────── INTELIGÊNCIA ARTIFICIAL ───────────
  { category: "ai", name: "Processar Mensagem (ReACT Loop)", method: "POST", path: "/ai-process-message", auth: "Service Role",
    description: "Motor principal de IA com ciclo ReACT (Reasoning → Action → Observation), max 5 iterações. Audit trail completa." },
  { category: "ai", name: "Playground de IA", method: "POST", path: "/ai-playground", auth: "Bearer JWT",
    description: "Chat de teste contra qualquer agente/modelo configurado. Suporta streaming." },
  { category: "ai", name: "Sessão de Runtime", method: "POST", path: "/ai-session-runtime", auth: "Service Role",
    description: "Gere ciclo de vida de sessões de IA (start, continue, timeout, complete)." },
  { category: "ai", name: "Compactar Histórico", method: "POST", path: "/ai-history-compactor", auth: "Service Role",
    description: "Compacta histórico longo de conversas em sumários (top-5 mantidos por conversa)." },
  { category: "ai", name: "Auditoria de Paridade", method: "POST", path: "/ai-parity-audit", auth: "Bearer JWT",
    description: "Compara respostas entre múltiplos modelos para garantir paridade." },
  { category: "ai", name: "Tracker de Custo", method: "POST", path: "/ai-cost-tracker", auth: "Service Role",
    description: "Registra tokens, custo USD e latência em ai_usage_logs por agente." },
  { category: "ai", name: "Automações Internas (CRON)", method: "POST", path: "/ai-internal-automations", auth: "Service Role",
    description: "Suite de automações executada a cada 2h: enriquecimento de leads, scoring, classificação." },
  { category: "ai", name: "Agente de Automação", method: "POST", path: "/ai-automation-agent", auth: "Service Role",
    description: "Executa ações automáticas baseadas em regras (consolidação de logica de agentes)." },
  { category: "ai", name: "Executor de Crew Multi-Agente", method: "POST", path: "/ai-crew-executor", auth: "Bearer JWT",
    description: "Executa tarefas distribuídas entre múltiplos agentes com delegate_to_agent." },

  // ─────────── EMMELY CHAT CHAIN (multi-fase ChatDev-style) ───────────
  { category: "ai", name: "Chain Executor (Multi-Fase)", method: "POST", path: "/ai-chain-executor", auth: "Service Role",
    description: "Motor 'Emmely Chat Chain' inspirado em ChatDev. Executa uma ai_chain sequencialmente (fases instrutor↔assistente), com protocolo anti-alucinação, revisor por fase e quality gate global. Tudo auditado em ai_chain_executions + ai_phase_executions.",
    request: `{
  "chain_name": "atendimento_juridico_padrao",
  "conversation_id": "uuid",
  "lead_id": "uuid",
  "input": { "user_message": "..." },
  "triggered_by": "system"
}`,
    response: `{
  "success": true,
  "execution_id": "uuid",
  "status": "completed | failed | escalated",
  "chain": "atendimento_juridico_padrao",
  "final_output": "...",
  "total_cost_usd": 0.0123,
  "total_tokens": 4210
}`,
    notes: "Cada fase pode exigir review (requires_review:true). Score < quality_threshold dispara retry (max_retries) e depois on_failure: abort | escalate. Pedidos de clarificação retornados pelo agente em JSON {needs_clarification:true,...} escalam automaticamente." },
  { category: "ai", name: "Reviewer / Quality Gate", method: "POST", path: "/ai-review-message", auth: "Service Role",
    description: "Avalia uma mensagem AI antes do envio (coerência factual, compliance LGPD/RGPD, tom, ausência de alucinações). Usado pelo hook em message-send: score < 0.75 bloqueia e marca delivery_status='pending_review'.",
    request: `{
  "message_id": "uuid",
  "content": "Texto a revisar",
  "context": { "conversation_id": "uuid", "agent_id": "uuid" }
}`,
    response: `{
  "score": 0.87,
  "decision": "approved | pending_review",
  "feedback": "...",
  "issues": ["..."],
  "review_id": "uuid"
}` },

  // ─────────── AGENTES ───────────
  { category: "agents", name: "Builder de Agente", method: "POST", path: "/agent-builder", auth: "Bearer JWT",
    description: "Cria/atualiza agentes IA com prompts, modelos, ferramentas e personalidade." },
  { category: "agents", name: "Heartbeat Runner (CRON)", method: "POST", path: "/agent-heartbeat-runner", auth: "Service Role",
    description: "Executa tarefas agendadas (Heartbeats) de cada agente autonomamente." },
  { category: "agents", name: "Persona Trainer", method: "POST", path: "/persona-trainer", auth: "Bearer JWT",
    description: "Treina o base_prompt (Persona) a partir de documentos e exemplos." },
  { category: "agents", name: "Sumarizar Treinamento", method: "POST", path: "/summarize-training", auth: "Bearer JWT",
    description: "Gera resumo estruturado dos dados de treino para o Persona." },
  { category: "agents", name: "Engine de Simulação", method: "POST", path: "/simulation-engine", auth: "Bearer JWT",
    description: "Sandbox multi-persona para teste de agentes com memória temporal." },
  { category: "agents", name: "Agente de Relatórios", method: "POST", path: "/report-agent", auth: "Bearer JWT",
    description: "Gera relatórios analíticos com IA sobre dados internos." },
  { category: "agents", name: "Relatório Público", method: "GET", path: "/report-public?token=...", auth: "Public",
    description: "Acesso público a relatórios partilhados via token." },

  // ─────────── VOZ / ÁUDIO ───────────
  { category: "voice", name: "Token ElevenLabs (Conversa)", method: "POST", path: "/elevenlabs-conversation-token", auth: "Bearer JWT",
    description: "Gera token efémero para conversas em tempo real com agentes ElevenLabs." },
  { category: "voice", name: "Token ElevenLabs (Scribe/STT)", method: "POST", path: "/elevenlabs-scribe-token", auth: "Bearer JWT",
    description: "Gera token para transcrição de áudio (Speech-to-Text)." },

  // ─────────── BITRIX24 ───────────
  { category: "bitrix24", name: "Instalar Aplicação", method: "POST", path: "/bitrix24-install", auth: "Public",
    description: "Handler de instalação OAuth + binding de placements + registro de robots." },
  { category: "bitrix24", name: "Receber Eventos", method: "POST", path: "/bitrix24-events", auth: "Public",
    description: "Recebe ONIMBOTMESSAGEADD, ONIMCONNECTORMESSAGEADD, OnCrmDealUpdate, etc." },
  { category: "bitrix24", name: "Enviar Mensagem (Bitrix)", method: "POST", path: "/bitrix24-send", auth: "Service Role",
    description: "Envia mensagens para Open Channels via imconnector.send.messages." },
  { category: "bitrix24", name: "Worker (Inbound)", method: "POST", path: "/bitrix24-worker", auth: "Service Role",
    description: "Encaminha mensagens inbound do Bitrix para conversations + dispara flow-engine." },
  { category: "bitrix24", name: "Sincronização Bidirecional", method: "POST", path: "/bitrix24-sync", auth: "Bearer JWT",
    description: "Sincroniza Leads, Deals, Contacts entre Emmely e Bitrix24 com anti-loop." },
  { category: "bitrix24", name: "Robot Handler (BizProc)", method: "POST", path: "/bitrix24-robot-handler", auth: "Public",
    description: "Suite de robots: emmely_send_whatsapp, emmely_generate_proposal, emmely_create_invoice, etc." },
  { category: "bitrix24", name: "Configurações de Conector", method: "POST", path: "/bitrix24-connector-settings", auth: "Bearer JWT",
    description: "Configura LINE_ID, ACTIVE, ICONs do Open Channel." },
  { category: "bitrix24", name: "Testar Conexão", method: "POST", path: "/bitrix24-test-connection", auth: "Bearer JWT",
    description: "Valida access_token, refresh proativo (5min antes da expiração)." },
  { category: "bitrix24", name: "Listar Campos", method: "GET", path: "/bitrix24-fields?entity=lead", auth: "Bearer JWT",
    description: "Retorna schema de campos (incluindo userfields) de Lead/Deal/Contact." },
  { category: "bitrix24", name: "Buscar Deals", method: "GET", path: "/bitrix24-fetch-deals", auth: "Bearer JWT",
    description: "Lista deals com paginação (até 50 por página, ordem decrescente)." },
  { category: "bitrix24", name: "Buscar Entidades", method: "GET", path: "/bitrix24-fetch-entities", auth: "Bearer JWT",
    description: "Lista batch de entidades CRM (lead, contact, company, deal)." },
  { category: "bitrix24", name: "Buscar Carteira", method: "GET", path: "/bitrix24-fetch-portfolio", auth: "Bearer JWT",
    description: "Carrega carteira de clientes importados (Pipeline 15)." },
  { category: "bitrix24", name: "Buscar Utilizadores", method: "GET", path: "/bitrix24-fetch-users", auth: "Bearer JWT",
    description: "Lista utilizadores (responsáveis) do portal Bitrix24." },
  { category: "bitrix24", name: "Estatísticas Dashboard", method: "GET", path: "/bitrix24-dashboard-stats", auth: "Bearer JWT",
    description: "KPIs em tempo real do portal Bitrix24 com cache." },
  { category: "bitrix24", name: "Relatórios", method: "POST", path: "/bitrix24-reports", auth: "Bearer JWT",
    description: "Relatórios financeiros centralizados com nome do responsável." },
  { category: "bitrix24", name: "Limpar Duplicados", method: "POST", path: "/bitrix24-cleanup-duplicates", auth: "Bearer JWT",
    description: "Remove duplicatas de Leads/Contacts baseado em telefone/email." },
  { category: "bitrix24", name: "Atualizar Pagamento do Deal", method: "POST", path: "/bitrix24-update-deal-payment", auth: "Service Role",
    description: "Atualiza Smart Invoice + status do Deal após reconciliação." },
  { category: "bitrix24", name: "Sincronizar Status de Fatura", method: "POST", path: "/bitrix24-sync-invoice-status", auth: "Service Role",
    description: "Sincroniza status financial_records → Bitrix24 (com anti-loop via emmely.sync_origin)." },
  { category: "bitrix24", name: "Sincronizar Produto", method: "POST", path: "/bitrix24-sync-product", auth: "Service Role",
    description: "Mantém sincronização services ↔ catálogo Bitrix24." },
  { category: "bitrix24", name: "Webhook de Pagamento", method: "POST", path: "/bitrix24-payment-webhook", auth: "Public",
    description: "Recebe eventos de pagamento do Bitrix24 (Sale.Payment)." },
  { category: "bitrix24", name: "Re-registrar Eventos", method: "POST", path: "/bitrix24-rebind-events", auth: "Bearer JWT",
    description: "Re-vincula handlers de eventos e placements (incluindo IM_TEXTAREA, CRM_*)." },
  { category: "bitrix24", name: "Re-registrar Bot", method: "POST", path: "/bitrix24-reregister-bot", auth: "Bearer JWT",
    description: "Re-registra agentes IA como chatbots (multi-bot architecture)." },
  { category: "bitrix24", name: "Devolver ao Bot", method: "POST", path: "/bitrix24-return-to-bot", auth: "Public",
    description: "Devolve controlo de uma sessão ao bot (após handoff humano)." },
  // Placements (servem iframe HTML)
  { category: "bitrix24", name: "Placement: CRM Tab", method: "GET", path: "/bitrix24-crm-tab", auth: "Public",
    description: "Iframe Emmely Consulta na ficha CRM (Lead/Deal/Contact)." },
  { category: "bitrix24", name: "Placement: Payment Tab", method: "GET", path: "/bitrix24-payment-tab", auth: "Public",
    description: "Iframe Emmely Pay (geração de links + reconciliação)." },
  { category: "bitrix24", name: "Placement: Booking Tab", method: "GET", path: "/bitrix24-booking-tab", auth: "Public",
    description: "Iframe de agendamento integrado (Calendar/Booking)." },
  { category: "bitrix24", name: "Placement: IM Sidebar", method: "GET", path: "/bitrix24-im-sidebar", auth: "Public",
    description: "Sidebar IA no chat IM (perfil + histórico + sugestões)." },
  { category: "bitrix24", name: "Placement: IM Context Menu", method: "GET", path: "/bitrix24-im-context-menu", auth: "Public",
    description: "Menu de contexto em mensagens (gerar tarefa, criar lead)." },
  { category: "bitrix24", name: "Placement: IM Send Audio", method: "GET", path: "/bitrix24-im-send-audio", auth: "Public",
    description: "Botão 🎙️ no IM_TEXTAREA para gravar e enviar áudio (ogg/opus) via WhatsApp." },
  { category: "bitrix24", name: "Placement: IM Send File", method: "GET", path: "/bitrix24-im-send-file", auth: "Public",
    description: "Botão 📎 no IM_TEXTAREA para enviar imagem/vídeo/documento via WhatsApp." },
  { category: "bitrix24", name: "Payment Handler (UI)", method: "POST", path: "/bitrix24-payment-handler", auth: "Public",
    description: "Backend do iframe Emmely Pay — cria links, reconcilia, gera comprovativos." },

  // ─────────── KNOWLEDGE / RAG ───────────
  { category: "knowledge", name: "Gerar Embeddings", method: "POST", path: "/generate-embeddings", auth: "Service Role",
    description: "Gera embeddings vectoriais de chunks de documentos para busca semântica." },
  { category: "knowledge", name: "Parser de Documentos", method: "POST", path: "/parse-document", auth: "Bearer JWT",
    description: "Parse local de PDF/DOCX/XLSX. Fallback para LLM se necessário." },
  { category: "knowledge", name: "Gerar Template a partir de Imagem", method: "POST", path: "/generate-template-from-image", auth: "Bearer JWT",
    description: "Gera template de proposta a partir de imagem (Vision)." },

  // ─────────── FLUXOS / AUTOMAÇÕES ───────────
  { category: "flows", name: "Flow Engine", method: "POST", path: "/flow-engine", auth: "Service Role",
    description: "Motor de fluxos com IA-Intenção, IA-Ação, IA-Roteador, sub-flows e waiting_for_reply." },
  { category: "flows", name: "Queue Worker", method: "POST", path: "/queue-worker", auth: "Service Role",
    description: "Processa message_queue com SKIP LOCKED, retries e release de jobs presos." },

  // ─────────── ADMINISTRAÇÃO ───────────
  { category: "admin", name: "Aceitar Proposta (Público)", method: "POST", path: "/proposal-accept", auth: "Public",
    description: "Endpoint público para aceitação de propostas via /proposta/:token." },
  { category: "admin", name: "Gerar PDF de Proposta", method: "POST", path: "/proposal-pdf", auth: "Bearer JWT",
    description: "Gera PDF formatado da proposta (uso interno)." },
  { category: "admin", name: "Assinar Contrato (Público)", method: "POST", path: "/sign-contract", auth: "Public",
    description: "Captura assinatura digital, IP, geo, hash do documento." },
  { category: "admin", name: "Certificado de Assinatura", method: "GET", path: "/signature-certificate?id=...", auth: "Public",
    description: "Gera PDF do certificado de assinatura (validade jurídica BR/UE)." },
  { category: "admin", name: "Importar Dados (Access)", method: "POST", path: "/import-access-data", auth: "Bearer JWT",
    description: "Importa XLSX legado para tabelas internas com import_sessions." },
  { category: "admin", name: "Gerir Credenciais", method: "POST", path: "/manage-credentials", auth: "Bearer JWT",
    description: "CRUD de integration_credentials (chaves de API por integração)." },
  { category: "admin", name: "Dashboard Principal", method: "GET", path: "/dashboard-main", auth: "Bearer JWT",
    description: "KPIs agregados do dashboard (leads, receita, casos, contratos)." },

  // ─────────── OLLAMA (IA local) ───────────
  { category: "ai", name: "Webhook URL Ollama", method: "POST", path: "/ollama-url-webhook", auth: "Webhook Secret",
    description: "Sincroniza URL base do servidor Ollama remoto (qwen-local)." },
  { category: "ai", name: "Testar Conexão Ollama", method: "POST", path: "/ollama-test-connection", auth: "Bearer JWT",
    description: "Verifica acessibilidade do servidor Ollama configurado." },
  { category: "ai", name: "Ping ao Modelo Ollama", method: "POST", path: "/ollama-ping-model", auth: "Bearer JWT",
    description: "Faz ping num modelo específico para verificar disponibilidade." },
  { category: "ai", name: "Aquecer Modelo Ollama", method: "POST", path: "/ollama-warm-model", auth: "Bearer JWT",
    description: "Pré-carrega modelo na memória do servidor Ollama." },
  { category: "ai", name: "Benchmark de Modelos Ollama", method: "POST", path: "/ollama-benchmark-models", auth: "Bearer JWT",
    description: "Compara performance (tokens/s, latência) entre modelos Ollama." },

  // ─────────── MCP ───────────
  { category: "mcp", name: "MCP Server (JSON-RPC)", method: "GET/POST", path: "/mcp-server", auth: "API Key",
    description: "Servidor MCP (Model Context Protocol) — Streamable HTTP. Compatível com OpenClaw, Claude Desktop, Cursor. Expõe 13 ferramentas: CRM, omnichannel, pagamentos, conhecimento + nova suite de IA (chains, reviewer, fases).",
    request: `{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "execute_ai_chain",
    "arguments": {
      "chain_name": "atendimento_juridico_padrao",
      "conversation_id": "uuid",
      "input": { "user_message": "..." }
    }
  }
}`,
    response: `{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [{ "type": "text", "text": "{...execution_id, status, final_output...}" }],
    "isError": false
  }
}`,
    notes: "Métodos: initialize, tools/list, tools/call, ping. Ferramentas IA: execute_ai_chain, list_ai_chains, get_chain_execution, review_message. Headers: X-API-Key: emk_live_... + Accept: application/json, text/event-stream." },
  { category: "mcp", name: "Criar Chave de API", method: "POST", path: "/api-key-create", auth: "Bearer JWT",
    description: "Gera nova chave API (mostrada apenas uma vez).",
    request: `{ "name": "OpenClaw Production", "scopes": ["read", "write"] }`,
    response: `{ "id": "...", "key": "emk_live_...", "key_prefix": "emk_live_xxxxx" }` },
  { category: "mcp", name: "Revogar Chave de API", method: "POST", path: "/api-key-revoke", auth: "Bearer JWT",
    description: "Revoga uma chave existente. Definitivo.",
    request: `{ "id": "uuid-da-chave" }` },
];

const categories: { id: Category | "all"; label: string; icon: any }[] = [
  { id: "all", label: "Todos", icon: FileText },
  { id: "mcp", label: "MCP", icon: Server },
  { id: "omnichannel", label: "Omnichannel", icon: MessageCircle },
  { id: "payments", label: "Pagamentos", icon: CreditCard },
  { id: "ai", label: "IA", icon: Bot },
  { id: "agents", label: "Agentes", icon: Brain },
  { id: "voice", label: "Voz", icon: Mic },
  { id: "bitrix24", label: "Bitrix24", icon: Plug },
  { id: "knowledge", label: "Conhecimento", icon: Database },
  { id: "flows", label: "Fluxos", icon: Workflow },
  { id: "admin", label: "Admin", icon: Shield },
];

const methodColors: Record<string, string> = {
  GET: "bg-primary/10 text-primary border-primary/20",
  POST: "bg-accent/20 text-accent-foreground border-accent/30",
  "GET/POST": "bg-muted text-muted-foreground border-border",
};

function CodeBlock({ code, title }: { code: string; title?: string }) {
  return (
    <div className="relative group">
      {title && <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{title}</p>}
      <pre className="bg-muted/50 border rounded-md p-3 text-xs overflow-x-auto whitespace-pre-wrap font-mono">{code}</pre>
      <Button variant="ghost" size="icon"
        className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={() => { navigator.clipboard.writeText(code); toast.success("Copiado!"); }}>
        <Copy className="h-3 w-3" />
      </Button>
    </div>
  );
}

function generateCurl(ep: Endpoint): string {
  const url = `${BASE_URL}${ep.path.split("?")[0]}`;
  const verb = ep.method.split("/")[0];
  const parts = [`curl -X ${verb} "${url}"`, `  -H "Content-Type: application/json"`];
  if (ep.auth === "Bearer JWT") {
    parts.push(`  -H "Authorization: Bearer YOUR_JWT_TOKEN"`);
    parts.push(`  -H "apikey: YOUR_ANON_KEY"`);
  } else if (ep.auth === "API Key") {
    parts.push(`  -H "X-API-Key: emk_live_YOUR_API_KEY"`);
    parts.push(`  -H "Accept: application/json, text/event-stream"`);
  }
  if (verb !== "GET" && ep.request) {
    try {
      const body = JSON.parse(ep.request);
      parts.push(`  -d '${JSON.stringify(body, null, 2)}'`);
    } catch { parts.push(`  -d '${ep.request}'`); }
  }
  return parts.join(" \\\n");
}

function EndpointCard({ ep }: { ep: Endpoint }) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="w-full">
        <Card className="hover:border-primary/30 transition-colors cursor-pointer">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Badge variant="outline" className={`text-[10px] font-mono ${methodColors[ep.method] || ""}`}>{ep.method}</Badge>
              <code className="text-xs font-mono text-muted-foreground flex-1 text-left truncate">{ep.path}</code>
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
              <p className="text-xs"><strong>Notas:</strong> {ep.notes}</p>
            </div>
          )}
          <CodeBlock code={generateCurl(ep)} title="Exemplo cURL" />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function ApiDocsPage() {
  const { session } = useAuthContext();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const filtered = endpoints.filter((ep) => {
    const cat = activeCategory === "all" || ep.category === activeCategory;
    const q = !search ||
      ep.name.toLowerCase().includes(search.toLowerCase()) ||
      ep.path.toLowerCase().includes(search.toLowerCase()) ||
      ep.description.toLowerCase().includes(search.toLowerCase());
    return cat && q;
  });

  const categoryCount = (cat: string) =>
    cat === "all" ? endpoints.length : endpoints.filter((e) => e.category === cat).length;

  return (
    <div className="container max-w-7xl mx-auto p-4 md:p-8">
      {/* Header público */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Layers className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Documentação API · Emmely Cloud</h1>
            <Badge variant="outline" className="text-[10px]">Pública</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Referência completa de {endpoints.length} endpoints, webhooks, edge functions e do servidor MCP.
          </p>
        </div>
        <div className="flex gap-2">
          {session ? (
            <>
              <Link to="/api-docs/keys">
                <Button variant="default" size="sm"><Key className="h-4 w-4 mr-2" /> Minhas Chaves API</Button>
              </Link>
              <Link to="/">
                <Button variant="outline" size="sm"><ArrowLeft className="h-4 w-4 mr-2" /> App</Button>
              </Link>
            </>
          ) : (
            <Link to="/auth?redirect=/api-docs/keys">
              <Button variant="default" size="sm"><Key className="h-4 w-4 mr-2" /> Iniciar sessão para gerar chave</Button>
            </Link>
          )}
        </div>
      </div>

      {/* Cartão MCP em destaque */}
      <Card className="mb-6 border-primary/30 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Server className="h-5 w-5 text-primary" /> Servidor MCP (Model Context Protocol)
          </CardTitle>
          <CardDescription className="text-xs">
            Conecte agentes (OpenClaw, Claude Desktop, Cursor, Continue) directamente ao Emmely.
            Suporta JSON-RPC 2.0 sobre Streamable HTTP.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] w-16 justify-center">URL</Badge>
            <code className="font-mono bg-background px-2 py-1 rounded flex-1 truncate">{MCP_URL}</code>
            <Button variant="ghost" size="icon" className="h-6 w-6"
              onClick={() => { navigator.clipboard.writeText(MCP_URL); toast.success("Copiado!"); }}>
              <Copy className="h-3 w-3" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] w-16 justify-center">Header</Badge>
            <code className="font-mono bg-background px-2 py-1 rounded">X-API-Key: emk_live_…</code>
            <span className="text-[10px] text-muted-foreground">(ou Authorization: Bearer / ApiKey)</span>
          </div>
          <div className="flex items-start gap-2">
            <Badge variant="outline" className="text-[10px] w-16 justify-center shrink-0 mt-0.5">Tools</Badge>
            <span className="text-muted-foreground">
              <strong className="text-foreground">CRM/Atendimento:</strong> list_leads · get_lead · create_lead · send_whatsapp · list_conversations · list_financial_records · create_payment_link · search_knowledge · get_dashboard<br/>
              <strong className="text-foreground">IA (novo):</strong> execute_ai_chain · list_ai_chains · get_chain_execution · review_message
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {[
          { label: "Endpoints", value: endpoints.length },
          { label: "Omnichannel", value: endpoints.filter((e) => e.category === "omnichannel").length },
          { label: "Pagamentos", value: endpoints.filter((e) => e.category === "payments").length },
          { label: "Bitrix24", value: endpoints.filter((e) => e.category === "bitrix24").length },
          { label: "MCP Tools", value: 13 },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-primary">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Auth info */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2"><Shield className="h-4 w-4" /> Autenticação</CardTitle>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-3 text-xs">
          <div className="space-y-1">
            <Badge variant="outline" className="text-[10px]">API Key (MCP / programático)</Badge>
            <p className="text-muted-foreground">Gere em <Link to="/api-docs/keys" className="text-primary underline">/api-docs/keys</Link>. Envie <code>X-API-Key: emk_live_...</code> (ou <code>Authorization: Bearer/ApiKey emk_live_...</code>).</p>
          </div>
          <div className="space-y-1">
            <Badge variant="outline" className="text-[10px]">Bearer JWT</Badge>
            <p className="text-muted-foreground">Token de sessão de utilizador autenticado. Headers: <code>Authorization: Bearer ...</code> + <code>apikey: ANON_KEY</code></p>
          </div>
          <div className="space-y-1">
            <Badge variant="outline" className="text-[10px]">Webhook Secret</Badge>
            <p className="text-muted-foreground">Validado por HMAC (Stripe) ou token (Asaas/Meta). Lido de <code>integration_credentials</code>.</p>
          </div>
          <div className="space-y-1">
            <Badge variant="outline" className="text-[10px]">Public</Badge>
            <p className="text-muted-foreground">Sem autenticação. Webhooks públicos, iframes e endpoints partilhados via token.</p>
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Pesquisar endpoints..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
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
              <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">Nenhum endpoint encontrado.</CardContent></Card>
            ) : (
              filtered.map((ep, i) => <EndpointCard key={i} ep={ep} />)
            )}
          </TabsContent>
        ))}
      </Tabs>

      <Separator className="my-8" />
      <p className="text-center text-xs text-muted-foreground">
        Emmely Cloud · Edge Functions hospedadas na infraestrutura Lovable Cloud · {endpoints.length} endpoints documentados
      </p>
    </div>
  );
}
