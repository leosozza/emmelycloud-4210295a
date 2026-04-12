/**
 * FlowNodeTypes.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Definição canônica de todos os tipos de nós do construtor de fluxos.
 *
 * REGRA FUNDAMENTAL: os valores de FlowNodeType devem ser IDÊNTICOS aos
 * `case` do switch em supabase/functions/flow-engine/index.ts.
 * Qualquer novo tipo adicionado aqui DEVE ser implementado no engine.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  MessageSquare, ListOrdered, Image, MapPin, Contact, Smile,
  Split, MessageCircle, Clock, TextCursorInput, Repeat,
  Globe, Zap, Bot, UserCog, Phone, ArrowLeftToLine, XCircle,
  Building2, Handshake, Boxes, Pencil, Search, Award,
  BrainCircuit, Cog, GitFork, MessageCircleMore, UserSearch,
  CalendarClock, FileText, Tag, StickyNote, ArrowRightLeft,
  Workflow,
  type LucideIcon,
} from "lucide-react";

// ─── Identificadores de tipo (devem espelhar os `case` do flow-engine) ───────

export type FlowNodeType =
  // ── Mensagens ──────────────────────────────────────────────────────────────
  | "message"           // Texto simples
  | "message_buttons"   // Texto + botões de resposta rápida (máx. 3)
  | "message_list"      // Lista de opções (até 10 itens)
  | "media"             // Imagem / vídeo / áudio / documento
  | "location"          // Enviar localização
  | "vcard"             // Enviar contato vCard
  | "sticker"           // Enviar sticker
  // ── Lógica ─────────────────────────────────────────────────────────────────
  | "condition"         // Ramificar por condição (true / false)
  | "switch"            // Múltiplas condições (case/default)
  | "wait_reply"        // Pausar e aguardar resposta do usuário
  | "delay"             // Aguardar N segundos antes de continuar
  | "input_capture"     // Capturar e validar resposta em variável
  | "loop"              // Repetir bloco N vezes
  // ── Integrações ────────────────────────────────────────────────────────────
  | "webhook_call"      // Chamar API externa (GET / POST / PUT / DELETE)
  | "set_variable"      // Definir ou calcular variável
  // ── IA Inteligente ─────────────────────────────────────────────────────────
  | "ai_response"       // Gerar resposta livre com IA
  | "ai_intention"      // IA coleta campos estruturados em conversa natural
  | "ai_action"         // IA executa ação (CRM, agenda, consulta)
  | "ai_router"         // IA decide qual rota seguir
  | "switch_persona"    // Alternar persona/agente ativo
  // ── Controle de Atendimento ────────────────────────────────────────────────
  | "transfer_to_human" // Transferir para atendente humano
  | "transfer_to_ai"    // Retornar atendimento para a IA
  | "end"               // Encerrar o fluxo
  // ── Bitrix24 — Lead ────────────────────────────────────────────────────────
  | "bitrix_create_lead"
  | "bitrix_update_lead"
  | "bitrix_get_lead"
  | "bitrix_search_lead"   // crm.lead.list com filtro por telefone/email
  // ── Bitrix24 — Deal ────────────────────────────────────────────────────────
  | "bitrix_create_deal"
  | "bitrix_update_deal"
  | "bitrix_get_deal"
  | "bitrix_move_deal"     // Mover deal para outro estágio/funil
  // ── Bitrix24 — Contact ─────────────────────────────────────────────────────
  | "bitrix_create_contact"
  | "bitrix_update_contact"
  | "bitrix_search_contact" // crm.contact.list por telefone/email
  // ── Bitrix24 — SPA (Smart Process) ─────────────────────────────────────────
  | "bitrix_create_spa"
  | "bitrix_update_spa"
  | "bitrix_get_spa"
  // ── Bitrix24 — Atividades e Timeline ───────────────────────────────────────
  | "bitrix_add_comment"   // crm.timeline.comment.add
  | "bitrix_add_activity"  // crm.activity.todo.add
  | "bitrix_assign_user"   // Alterar responsável (ASSIGNED_BY_ID)
  // ── Bitrix24 — Badge ───────────────────────────────────────────────────────
  | "bitrix_create_badge"
  // ── Composição ──────────────────────────────────────────────────────────────
  | "call_flow";          // Chamar outro flow como sub-rotina

// ─── Categorias da paleta ────────────────────────────────────────────────────

export interface FlowNodeCategory {
  id: string;
  label: string;
  color: string;
  types: FlowNodeType[];
}

export const NODE_CATEGORIES: FlowNodeCategory[] = [
  {
    id: "messages",
    label: "Mensagens",
    color: "#3b82f6",
    types: ["message", "message_buttons", "message_list", "media", "location", "vcard", "sticker"],
  },
  {
    id: "logic",
    label: "Lógica",
    color: "#f59e0b",
    types: ["condition", "switch", "wait_reply", "delay", "input_capture", "loop", "call_flow"],
  },
  {
    id: "integrations",
    label: "Integrações",
    color: "#ef4444",
    types: ["webhook_call", "set_variable"],
  },
  {
    id: "ai_smart",
    label: "IA Inteligente",
    color: "#8b5cf6",
    types: ["ai_response", "ai_intention", "ai_action", "ai_router", "switch_persona"],
  },
  {
    id: "control",
    label: "Controle",
    color: "#10b981",
    types: ["transfer_to_human", "transfer_to_ai", "end"],
  },
  {
    id: "bitrix_crm",
    label: "Bitrix24 — CRM",
    color: "#22c55e",
    types: [
      "bitrix_create_lead", "bitrix_update_lead", "bitrix_get_lead", "bitrix_search_lead",
      "bitrix_create_deal", "bitrix_update_deal", "bitrix_get_deal", "bitrix_move_deal",
      "bitrix_create_contact", "bitrix_update_contact", "bitrix_search_contact",
      "bitrix_create_spa", "bitrix_update_spa", "bitrix_get_spa",
    ],
  },
  {
    id: "bitrix_activity",
    label: "Bitrix24 — Atividades",
    color: "#f97316",
    types: [
      "bitrix_add_comment", "bitrix_add_activity", "bitrix_assign_user", "bitrix_create_badge",
    ],
  },
];

// ─── Metadados visuais de cada tipo ──────────────────────────────────────────

export interface NodeTypeMeta {
  label: string;
  icon: LucideIcon;
  color: string;
  description: string;
  /** Número de handles de saída fixos (além do handle padrão) */
  outputHandles?: number;
}

export const NODE_TYPE_META: Record<FlowNodeType, NodeTypeMeta> = {
  // Mensagens
  message:              { label: "Mensagem",             icon: MessageSquare,    color: "#3b82f6", description: "Enviar texto simples" },
  message_buttons:      { label: "Botões de Resposta",   icon: ListOrdered,      color: "#2563eb", description: "Texto + até 3 botões de resposta rápida" },
  message_list:         { label: "Lista de Opções",      icon: MessageCircleMore,color: "#1d4ed8", description: "Menu com até 10 opções em lista" },
  media:                { label: "Mídia",                icon: Image,            color: "#0ea5e9", description: "Imagem, vídeo, áudio ou documento" },
  location:             { label: "Localização",          icon: MapPin,           color: "#14b8a6", description: "Enviar coordenadas de localização" },
  vcard:                { label: "Contato vCard",        icon: Contact,          color: "#06b6d4", description: "Enviar cartão de contato" },
  sticker:              { label: "Sticker",              icon: Smile,            color: "#8b5cf6", description: "Enviar sticker/emoji animado" },
  // Lógica
  condition:            { label: "Condição",             icon: Split,            color: "#f59e0b", description: "Bifurcar fluxo: Verdadeiro / Falso", outputHandles: 2 },
  switch:               { label: "Switch / Casos",       icon: ArrowRightLeft,   color: "#d97706", description: "Múltiplos caminhos por valor de variável" },
  wait_reply:           { label: "Aguardar Resposta",    icon: MessageCircle,    color: "#eab308", description: "Pausar até o usuário responder" },
  delay:                { label: "Delay",                icon: Clock,            color: "#6b7280", description: "Aguardar N segundos antes de continuar" },
  input_capture:        { label: "Capturar Resposta",    icon: TextCursorInput,  color: "#d97706", description: "Salvar resposta validada em variável" },
  loop:                 { label: "Loop",                 icon: Repeat,           color: "#a855f7", description: "Repetir bloco N vezes", outputHandles: 2 },
  // Integrações
  webhook_call:         { label: "Webhook / API",        icon: Globe,            color: "#ef4444", description: "Chamar API externa (GET/POST/PUT/DELETE)" },
  set_variable:         { label: "Definir Variável",     icon: Zap,              color: "#06b6d4", description: "Definir, calcular ou limpar variável" },
  // IA Inteligente
  ai_response:          { label: "Resposta IA",          icon: Bot,              color: "#8b5cf6", description: "Gerar resposta livre com IA" },
  ai_intention:         { label: "IA — Coletar Dados",   icon: BrainCircuit,     color: "#ec4899", description: "IA conversa e coleta campos estruturados" },
  ai_action:            { label: "IA — Executar Ação",   icon: Cog,              color: "#f97316", description: "IA executa ação (CRM, agenda, consulta)" },
  ai_router:            { label: "IA — Roteador",        icon: GitFork,          color: "#14b8a6", description: "IA decide qual caminho seguir" },
  switch_persona:       { label: "Alternar Persona",     icon: UserCog,          color: "#7c3aed", description: "Mudar persona/agente ativo no atendimento" },
  // Controle
  transfer_to_human:    { label: "Transferir p/ Humano", icon: Phone,            color: "#10b981", description: "Transferir conversa para atendente humano" },
  transfer_to_ai:       { label: "Retornar p/ IA",       icon: ArrowLeftToLine,  color: "#059669", description: "Devolver atendimento para a IA" },
  end:                  { label: "Encerrar Fluxo",       icon: XCircle,          color: "#dc2626", description: "Finalizar execução do fluxo" },
  // Bitrix24 — Lead
  bitrix_create_lead:   { label: "Criar Lead",           icon: Building2,        color: "#22c55e", description: "crm.lead.add — Criar novo lead no CRM" },
  bitrix_update_lead:   { label: "Atualizar Lead",       icon: Pencil,           color: "#16a34a", description: "crm.lead.update — Atualizar lead existente" },
  bitrix_get_lead:      { label: "Buscar Lead por ID",   icon: Building2,        color: "#15803d", description: "crm.lead.get — Obter lead por ID" },
  bitrix_search_lead:   { label: "Pesquisar Lead",       icon: Search,           color: "#166534", description: "crm.lead.list — Buscar lead por telefone/email" },
  // Bitrix24 — Deal
  bitrix_create_deal:   { label: "Criar Deal",           icon: Handshake,        color: "#3b82f6", description: "crm.deal.add — Criar nova negociação" },
  bitrix_update_deal:   { label: "Atualizar Deal",       icon: Pencil,           color: "#2563eb", description: "crm.deal.update — Atualizar negociação" },
  bitrix_get_deal:      { label: "Buscar Deal por ID",   icon: Handshake,        color: "#1d4ed8", description: "crm.deal.get — Obter negociação por ID" },
  bitrix_move_deal:     { label: "Mover Deal no Funil",  icon: ArrowRightLeft,   color: "#1e40af", description: "Mover deal para outro estágio ou funil" },
  // Bitrix24 — Contact
  bitrix_create_contact:{ label: "Criar Contato",        icon: Contact,          color: "#0891b2", description: "crm.contact.add — Criar contato no CRM" },
  bitrix_update_contact:{ label: "Atualizar Contato",    icon: Pencil,           color: "#0e7490", description: "crm.contact.update — Atualizar contato" },
  bitrix_search_contact:{ label: "Pesquisar Contato",    icon: UserSearch,       color: "#155e75", description: "crm.contact.list — Buscar por telefone/email" },
  // Bitrix24 — SPA
  bitrix_create_spa:    { label: "Criar SPA",            icon: Boxes,            color: "#a855f7", description: "crm.item.add — Criar item de Smarts Process" },
  bitrix_update_spa:    { label: "Atualizar SPA",        icon: Pencil,           color: "#9333ea", description: "crm.item.update — Atualizar item SPA" },
  bitrix_get_spa:       { label: "Buscar SPA",           icon: Boxes,            color: "#7e22ce", description: "crm.item.get — Obter item SPA por ID" },
  // Bitrix24 — Atividades e Timeline
  bitrix_add_comment:   { label: "Comentário no CRM",    icon: StickyNote,       color: "#f97316", description: "crm.timeline.comment.add — Adicionar comentário na timeline" },
  bitrix_add_activity:  { label: "Criar Atividade",      icon: CalendarClock,    color: "#ea580c", description: "crm.activity.todo.add — Criar tarefa/atividade no CRM" },
  bitrix_assign_user:   { label: "Atribuir Responsável", icon: UserCog,          color: "#c2410c", description: "Alterar responsável (ASSIGNED_BY_ID) do elemento" },
  bitrix_create_badge:  { label: "Criar Badge",          icon: Award,            color: "#f59e0b", description: "Criar badge visual na timeline do CRM" },
  // Composição
  call_flow:            { label: "Chamar Flow",          icon: Workflow,         color: "#6366f1", description: "Executar outro flow como sub-rotina" },
};

// ─── Interfaces de dados dos nós ──────────────────────────────────────────────

export interface FlowButtonItem {
  id: string;
  label: string;
}

export interface FlowListItem {
  id: string;
  title: string;
  description?: string;
}

export interface FlowCondition {
  field: string;
  operator: "equals" | "not_equals" | "contains" | "not_contains" | "starts_with" | "ends_with" | "greater_than" | "less_than" | "exists" | "not_exists" | "regex";
  value: string;
}

export interface FlowSwitchCase {
  id: string;
  label: string;
  field: string;
  operator: FlowCondition["operator"];
  value: string;
  handleId: string;
}

export interface FlowInputCapture {
  question: string;
  variableName: string;
  validation: "text" | "email" | "phone" | "number" | "cpf" | "date" | "any";
  errorMessage?: string;
  maxRetries?: number;
  timeout: number;
}

export interface FlowWebhook {
  url: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers: Record<string, string>;
  body: string;
  responseVar: string;
  timeoutMs?: number;
  onErrorContinue?: boolean;
}

export interface FlowVariable {
  name: string;
  value: string;
  operation: "set" | "append" | "increment" | "decrement" | "clear";
  scope: "conversation" | "contact";
}

// ── Bitrix24 CRM ──────────────────────────────────────────────────────────────

export interface FlowBitrixField {
  key: string;
  value: string;
}

export interface FlowBitrixFilter {
  field: string;
  value: string;
}

export interface FlowBitrixCRM {
  /** Entidade alvo: lead | deal | contact | spa */
  entity: "lead" | "deal" | "contact" | "spa";
  /** Operação: create | update | get | search | move */
  operation: "create" | "update" | "get" | "search" | "move";
  /** ID do elemento (suporta variáveis {{var}}) */
  entityId: string;
  /** ID do tipo de entidade SPA (entityTypeId) */
  spaEntityTypeId: string;
  /** Campos a definir/atualizar */
  fields: FlowBitrixField[];
  /** Filtros para busca (search) */
  filters?: FlowBitrixFilter[];
  /** Variável onde o resultado será salvo */
  resultVar: string;
  /** ID do funil (pipeline) para criação de deal */
  pipeline: string;
  /** ID do estágio para criação/movimentação */
  stageId: string;
  /** Ao mover deal: ID do funil de destino */
  targetPipelineId?: string;
  /** Ao mover deal: ID do estágio de destino */
  targetStageId?: string;
  /** Continuar fluxo mesmo em caso de erro */
  onErrorContinue?: boolean;
}

export interface FlowBitrixComment {
  entityType: "deal" | "lead" | "contact" | "spa";
  entityId: string;
  comment: string;
  spaEntityTypeId?: string;
}

export interface FlowBitrixActivity {
  entityType: "deal" | "lead" | "contact";
  entityId: string;
  subject: string;
  description?: string;
  deadline?: string;
  responsibleId?: string;
}

export interface FlowBitrixAssign {
  entityType: "deal" | "lead" | "contact" | "spa";
  entityId: string;
  userId: string;
  spaEntityTypeId?: string;
}

export interface FlowBitrixBadge {
  badgeCode: string;
  headerTitle: string;
  messagePreview: string;
  entityType: "deal" | "lead" | "contact";
  entityId: string;
  badgeType: "success" | "failure" | "warning" | "primary" | "secondary";
}

// ── IA Inteligente ────────────────────────────────────────────────────────────

export interface FlowAIIntentionField {
  fieldName: string;
  description: string;
  validation: "text" | "phone" | "email" | "cpf" | "city" | "number" | "date";
  required: boolean;
  exampleValue?: string;
}

export interface FlowAIIntention {
  intentions: FlowAIIntentionField[];
  maxTurns: number;
  successMessage: string;
  failureMessage: string;
  /** Handle de saída em caso de falha (se não definido, usa o handle padrão) */
  failureHandleId?: string;
}

export interface FlowAIAction {
  actionType: "schedule" | "query_crm" | "update_crm" | "search_knowledge" | "custom";
  actionDescription: string;
  toolConfig: Record<string, unknown>;
  resultVar: string;
  onErrorContinue?: boolean;
}

export interface FlowAIRouterRoute {
  label: string;
  description: string;
  handleId: string;
}

export interface FlowAIRouter {
  routes: FlowAIRouterRoute[];
  analysisPrompt: string;
  defaultHandleId?: string;
}

// ── Dados consolidados do nó ──────────────────────────────────────────────────

export interface FlowNodeData {
  nodeType: FlowNodeType;
  label?: string;
  // Mensagens
  message?: string;
  buttons?: FlowButtonItem[];
  listItems?: FlowListItem[];
  listTitle?: string;
  mediaUrl?: string;
  mediaType?: "image" | "video" | "audio" | "document";
  mediaCaption?: string;
  locationLat?: string;
  locationLng?: string;
  locationName?: string;
  vcardName?: string;
  vcardPhone?: string;
  stickerUrl?: string;
  // Lógica
  condition?: FlowCondition;
  switchCases?: FlowSwitchCase[];
  delay?: number;
  inputCapture?: FlowInputCapture;
  loopCount?: number;
  // Integrações
  webhook?: FlowWebhook;
  variable?: FlowVariable;
  // Bitrix24 CRM
  bitrixCrm?: FlowBitrixCRM;
  bitrixComment?: FlowBitrixComment;
  bitrixActivity?: FlowBitrixActivity;
  bitrixAssign?: FlowBitrixAssign;
  bitrixBadge?: FlowBitrixBadge;
  // IA Inteligente
  aiIntention?: FlowAIIntention;
  aiAction?: FlowAIAction;
  aiRouter?: FlowAIRouter;
  // Controle
  personaId?: string;
  prompt?: string;
  department?: string;
  transferMessage?: string;
  // Composição
  callFlowId?: string;
  callFlowPassVariables?: boolean;
  // Extra
  config?: Record<string, unknown>;
  // Validação
  error?: string;
}

// ─── Dados padrão ao criar novo nó ───────────────────────────────────────────

export function getDefaultData(nodeType: FlowNodeType): FlowNodeData {
  const base: FlowNodeData = { nodeType };

  switch (nodeType) {
    case "message":
      base.message = "";
      break;

    case "message_buttons":
      base.message = "";
      base.buttons = [
        { id: `btn_${Date.now()}_1`, label: "" },
        { id: `btn_${Date.now()}_2`, label: "" },
      ];
      break;

    case "message_list":
      base.message = "";
      base.listTitle = "Escolha uma opção";
      base.listItems = [
        { id: `item_${Date.now()}_1`, title: "", description: "" },
        { id: `item_${Date.now()}_2`, title: "", description: "" },
      ];
      break;

    case "media":
      base.mediaUrl = "";
      base.mediaType = "image";
      base.mediaCaption = "";
      break;

    case "location":
      base.locationLat = "";
      base.locationLng = "";
      base.locationName = "";
      break;

    case "vcard":
      base.vcardName = "";
      base.vcardPhone = "";
      break;

    case "sticker":
      base.stickerUrl = "";
      break;

    case "condition":
      base.condition = { field: "", operator: "equals", value: "" };
      break;

    case "switch":
      base.switchCases = [
        { id: `case_${Date.now()}_1`, label: "Caso 1", field: "", operator: "equals", value: "", handleId: "case_0" },
        { id: `case_${Date.now()}_2`, label: "Caso 2", field: "", operator: "equals", value: "", handleId: "case_1" },
      ];
      break;

    case "delay":
      base.delay = 3;
      break;

    case "input_capture":
      base.inputCapture = {
        question: "",
        variableName: "",
        validation: "text",
        errorMessage: "Resposta inválida. Por favor, tente novamente.",
        maxRetries: 3,
        timeout: 120,
      };
      break;

    case "loop":
      base.loopCount = 3;
      break;

    case "webhook_call":
      base.webhook = {
        url: "",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "",
        responseVar: "webhook_result",
        timeoutMs: 10000,
        onErrorContinue: true,
      };
      break;

    case "set_variable":
      base.variable = { name: "", value: "", operation: "set", scope: "conversation" };
      break;

    case "ai_response":
      base.prompt = "";
      break;

    case "ai_intention":
      base.aiIntention = {
        intentions: [
          { fieldName: "nome_cliente", description: "Identifique o nome completo do cliente", validation: "text", required: true },
          { fieldName: "telefone", description: "Peça o número de telefone com DDD", validation: "phone", required: true },
        ],
        maxTurns: 6,
        successMessage: "Perfeito! Coletei todas as informações necessárias.",
        failureMessage: "Não consegui coletar as informações. Vou transferir para um atendente.",
      };
      break;

    case "ai_action":
      base.aiAction = {
        actionType: "custom",
        actionDescription: "",
        toolConfig: {},
        resultVar: "ai_action_result",
        onErrorContinue: true,
      };
      break;

    case "ai_router":
      base.aiRouter = {
        routes: [
          { label: "Vendas", description: "Cliente quer comprar ou saber preços", handleId: "route_0" },
          { label: "Suporte", description: "Cliente tem problema ou dúvida técnica", handleId: "route_1" },
          { label: "Outros", description: "Qualquer outro assunto", handleId: "route_2" },
        ],
        analysisPrompt: "Com base na mensagem do cliente, identifique a intenção e escolha a rota mais adequada.",
        defaultHandleId: "route_2",
      };
      break;

    case "switch_persona":
      base.personaId = "";
      break;

    case "transfer_to_human":
      base.department = "";
      base.transferMessage = "Aguarde um momento, vou transferir você para um de nossos atendentes. 👨‍💼";
      break;

    case "transfer_to_ai":
      break;

    case "end":
      break;

    // ── Bitrix24 — Lead ──────────────────────────────────────────────────────
    case "bitrix_create_lead":
      base.bitrixCrm = {
        entity: "lead", operation: "create", entityId: "", spaEntityTypeId: "",
        fields: [
          { key: "TITLE", value: "Lead via Bot - {{nome_cliente}}" },
          { key: "NAME", value: "{{nome_cliente}}" },
          { key: "PHONE", value: "{{telefone}}" },
          { key: "SOURCE_ID", value: "WEB" },
        ],
        resultVar: "lead_id", pipeline: "", stageId: "", onErrorContinue: true,
      };
      break;

    case "bitrix_update_lead":
      base.bitrixCrm = {
        entity: "lead", operation: "update", entityId: "{{lead_id}}", spaEntityTypeId: "",
        fields: [], resultVar: "lead_update_result", pipeline: "", stageId: "", onErrorContinue: true,
      };
      break;

    case "bitrix_get_lead":
      base.bitrixCrm = {
        entity: "lead", operation: "get", entityId: "{{lead_id}}", spaEntityTypeId: "",
        fields: [], resultVar: "lead_data", pipeline: "", stageId: "", onErrorContinue: true,
      };
      break;

    case "bitrix_search_lead":
      base.bitrixCrm = {
        entity: "lead", operation: "search", entityId: "", spaEntityTypeId: "",
        fields: [], filters: [{ field: "PHONE", value: "{{telefone}}" }],
        resultVar: "lead_found", pipeline: "", stageId: "", onErrorContinue: true,
      };
      break;

    // ── Bitrix24 — Deal ──────────────────────────────────────────────────────
    case "bitrix_create_deal":
      base.bitrixCrm = {
        entity: "deal", operation: "create", entityId: "", spaEntityTypeId: "",
        fields: [
          { key: "TITLE", value: "Negociação - {{nome_cliente}}" },
          { key: "CONTACT_ID", value: "{{contact_id}}" },
          { key: "CURRENCY_ID", value: "BRL" },
        ],
        resultVar: "deal_id", pipeline: "", stageId: "", onErrorContinue: true,
      };
      break;

    case "bitrix_update_deal":
      base.bitrixCrm = {
        entity: "deal", operation: "update", entityId: "{{deal_id}}", spaEntityTypeId: "",
        fields: [], resultVar: "deal_update_result", pipeline: "", stageId: "", onErrorContinue: true,
      };
      break;

    case "bitrix_get_deal":
      base.bitrixCrm = {
        entity: "deal", operation: "get", entityId: "{{deal_id}}", spaEntityTypeId: "",
        fields: [], resultVar: "deal_data", pipeline: "", stageId: "", onErrorContinue: true,
      };
      break;

    case "bitrix_move_deal":
      base.bitrixCrm = {
        entity: "deal", operation: "move", entityId: "{{deal_id}}", spaEntityTypeId: "",
        fields: [], resultVar: "move_result",
        pipeline: "", stageId: "",
        targetPipelineId: "", targetStageId: "",
        onErrorContinue: true,
      };
      break;

    // ── Bitrix24 — Contact ───────────────────────────────────────────────────
    case "bitrix_create_contact":
      base.bitrixCrm = {
        entity: "contact", operation: "create", entityId: "", spaEntityTypeId: "",
        fields: [
          { key: "NAME", value: "{{nome_cliente}}" },
          { key: "PHONE", value: "{{telefone}}" },
          { key: "SOURCE_ID", value: "WEB" },
        ],
        resultVar: "contact_id", pipeline: "", stageId: "", onErrorContinue: true,
      };
      break;

    case "bitrix_update_contact":
      base.bitrixCrm = {
        entity: "contact", operation: "update", entityId: "{{contact_id}}", spaEntityTypeId: "",
        fields: [], resultVar: "contact_update_result", pipeline: "", stageId: "", onErrorContinue: true,
      };
      break;

    case "bitrix_search_contact":
      base.bitrixCrm = {
        entity: "contact", operation: "search", entityId: "", spaEntityTypeId: "",
        fields: [], filters: [{ field: "PHONE", value: "{{telefone}}" }],
        resultVar: "contact_found", pipeline: "", stageId: "", onErrorContinue: true,
      };
      break;

    // ── Bitrix24 — SPA ───────────────────────────────────────────────────────
    case "bitrix_create_spa":
      base.bitrixCrm = {
        entity: "spa", operation: "create", entityId: "", spaEntityTypeId: "",
        fields: [{ key: "title", value: "{{nome_cliente}}" }],
        resultVar: "spa_id", pipeline: "", stageId: "", onErrorContinue: true,
      };
      break;

    case "bitrix_update_spa":
      base.bitrixCrm = {
        entity: "spa", operation: "update", entityId: "{{spa_id}}", spaEntityTypeId: "",
        fields: [], resultVar: "spa_update_result", pipeline: "", stageId: "", onErrorContinue: true,
      };
      break;

    case "bitrix_get_spa":
      base.bitrixCrm = {
        entity: "spa", operation: "get", entityId: "{{spa_id}}", spaEntityTypeId: "",
        fields: [], resultVar: "spa_data", pipeline: "", stageId: "", onErrorContinue: true,
      };
      break;

    // ── Bitrix24 — Atividades ────────────────────────────────────────────────
    case "bitrix_add_comment":
      base.bitrixComment = {
        entityType: "deal",
        entityId: "{{deal_id}}",
        comment: "💬 Mensagem via WhatsApp: {{ultima_mensagem}}",
      };
      break;

    case "bitrix_add_activity":
      base.bitrixActivity = {
        entityType: "deal",
        entityId: "{{deal_id}}",
        subject: "Retorno ao cliente",
        description: "Cliente solicitou contato. Telefone: {{telefone}}",
        deadline: "",
        responsibleId: "",
      };
      break;

    case "bitrix_assign_user":
      base.bitrixAssign = {
        entityType: "deal",
        entityId: "{{deal_id}}",
        userId: "",
      };
      break;

    case "bitrix_create_badge":
      base.bitrixBadge = {
        badgeCode: "",
        headerTitle: "",
        messagePreview: "",
        entityType: "deal",
        entityId: "{{deal_id}}",
        badgeType: "success",
      };
      break;

    // ── Composição ───────────────────────────────────────────────────────
    case "call_flow":
      base.callFlowId = "";
      base.callFlowPassVariables = true;
      break;
  }

  return base;
}

// ─── Variáveis de sistema disponíveis no builder ──────────────────────────────

export const SYSTEM_VARIABLES = [
  { name: "{{telefone}}", description: "Número de telefone do contato (com DDI)" },
  { name: "{{nome_contato}}", description: "Nome do contato na conversa" },
  { name: "{{ultima_mensagem}}", description: "Última mensagem recebida" },
  { name: "{{conversation_id}}", description: "ID único da conversa" },
  { name: "{{channel}}", description: "Canal de origem (whatsapp, instagram, etc.)" },
  { name: "{{data_hoje}}", description: "Data atual (DD/MM/YYYY)" },
  { name: "{{hora_atual}}", description: "Hora atual (HH:MM)" },
  { name: "{{lead_id}}", description: "ID do lead criado/encontrado no Bitrix24" },
  { name: "{{deal_id}}", description: "ID do deal criado/encontrado no Bitrix24" },
  { name: "{{contact_id}}", description: "ID do contato criado/encontrado no Bitrix24" },
  { name: "{{spa_id}}", description: "ID do item SPA criado/encontrado no Bitrix24" },
  { name: "{{button_response}}", description: "ID do botão selecionado pelo usuário" },
  { name: "{{button_response_title}}", description: "Texto do botão selecionado" },
  { name: "{{webhook_result}}", description: "Resposta da última chamada de webhook" },
];
