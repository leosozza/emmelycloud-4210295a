import {
  MessageSquare, ListOrdered, Image, MapPin, Contact, Smile,
  Split, MessageCircle, Clock, TextCursorInput, Repeat,
  Globe, Zap,
  Bot, UserCog, Phone, ArrowLeftToLine, XCircle,
  Building2, Handshake, Boxes, Plus, Pencil, Search, Trash2,
  BrainCircuit, Cog, GitFork,
  Award,
  type LucideIcon,
} from "lucide-react";

// ── Node type identifiers ──
export type FlowNodeType =
  // Mensagens
  | "message"
  | "message_buttons"
  | "media"
  | "location"
  | "vcard"
  | "sticker"
  // Lógica
  | "condition"
  | "wait_reply"
  | "delay"
  | "input_capture"
  | "loop"
  // Integrações
  | "webhook"
  | "set_variable"
  // Controle
  | "ai_response"
  | "switch_persona"
  | "transfer"
  | "back_to_ai"
  | "end_flow"
  // IA Inteligente
  | "ai_intention"
  | "ai_action"
  | "ai_router"
  // Bitrix24 CRM
  | "bitrix_create_lead"
  | "bitrix_update_lead"
  | "bitrix_get_lead"
  | "bitrix_delete_lead"
  | "bitrix_create_deal"
  | "bitrix_update_deal"
  | "bitrix_get_deal"
  | "bitrix_delete_deal"
  | "bitrix_create_spa"
  | "bitrix_update_spa"
  | "bitrix_get_spa"
  | "bitrix_delete_spa"
  | "bitrix_create_badge";

export interface FlowNodeCategory {
  id: string;
  label: string;
  types: FlowNodeType[];
}

export const NODE_CATEGORIES: FlowNodeCategory[] = [
  {
    id: "messages",
    label: "Mensagens",
    types: ["message", "message_buttons", "media", "location", "vcard", "sticker"],
  },
  {
    id: "logic",
    label: "Lógica",
    types: ["condition", "wait_reply", "delay", "input_capture", "loop"],
  },
  {
    id: "integrations",
    label: "Integrações",
    types: ["webhook", "set_variable"],
  },
  {
    id: "control",
    label: "Controle",
    types: ["ai_response", "switch_persona", "transfer", "back_to_ai", "end_flow"],
  },
  {
    id: "ai_smart",
    label: "IA Inteligente",
    types: ["ai_intention", "ai_action", "ai_router"],
  },
  {
    id: "bitrix24",
    label: "Bitrix24",
    types: [
      "bitrix_create_lead", "bitrix_update_lead", "bitrix_get_lead", "bitrix_delete_lead",
      "bitrix_create_deal", "bitrix_update_deal", "bitrix_get_deal", "bitrix_delete_deal",
      "bitrix_create_spa", "bitrix_update_spa", "bitrix_get_spa", "bitrix_delete_spa",
      "bitrix_create_badge",
    ],
  },
];

export interface NodeTypeMeta {
  label: string;
  icon: LucideIcon;
  color: string;
  description: string;
  defaultHandles?: number;
}

export const NODE_TYPE_META: Record<FlowNodeType, NodeTypeMeta> = {
  // Mensagens
  message:         { label: "Mensagem",           icon: MessageSquare,     color: "#3b82f6", description: "Enviar texto simples" },
  message_buttons: { label: "Mensagem c/ Botões", icon: ListOrdered,       color: "#2563eb", description: "Texto + botões de resposta" },
  media:           { label: "Media",              icon: Image,             color: "#0ea5e9", description: "Imagem, vídeo, áudio ou doc" },
  location:        { label: "Localização",        icon: MapPin,            color: "#14b8a6", description: "Enviar localização" },
  vcard:           { label: "Contato vCard",       icon: Contact,           color: "#06b6d4", description: "Enviar cartão de contato" },
  sticker:         { label: "Sticker",            icon: Smile,             color: "#8b5cf6", description: "Enviar sticker" },
  // Lógica
  condition:       { label: "Condição",           icon: Split,             color: "#f59e0b", description: "Ramificar por condição" },
  wait_reply:      { label: "Aguardar Resposta",  icon: MessageCircle,     color: "#eab308", description: "Pausar até resposta do utilizador" },
  delay:           { label: "Delay",              icon: Clock,             color: "#6b7280", description: "Aguardar X segundos" },
  input_capture:   { label: "Capturar Resposta",  icon: TextCursorInput,   color: "#d97706", description: "Guardar resposta em variável" },
  loop:            { label: "Loop",               icon: Repeat,            color: "#a855f7", description: "Repetir bloco N vezes", defaultHandles: 2 },
  // Integrações
  webhook:         { label: "Webhook",            icon: Globe,             color: "#ef4444", description: "Chamar API externa" },
  set_variable:    { label: "Definir Variável",   icon: Zap,               color: "#06b6d4", description: "Definir ou atualizar variável" },
  // Controle
  ai_response:     { label: "Resposta IA",        icon: Bot,               color: "#8b5cf6", description: "Gerar resposta com IA" },
  switch_persona:  { label: "Alternar Persona",   icon: UserCog,           color: "#7c3aed", description: "Mudar persona do agente" },
  transfer:        { label: "Transferir Humano",  icon: Phone,             color: "#10b981", description: "Transferir para atendente" },
  back_to_ai:      { label: "Voltar para IA",     icon: ArrowLeftToLine,   color: "#059669", description: "Retomar atendimento IA" },
  end_flow:        { label: "Encerrar Fluxo",     icon: XCircle,           color: "#dc2626", description: "Terminar execução do fluxo" },
  // IA Inteligente
  ai_intention:    { label: "IA - Intenção",      icon: BrainCircuit,      color: "#ec4899", description: "IA conversa e coleta dados estruturados" },
  ai_action:       { label: "IA - Ação",          icon: Cog,               color: "#f97316", description: "IA executa ações inteligentes (CRM, agenda...)" },
  ai_router:       { label: "IA - Roteador",      icon: GitFork,           color: "#14b8a6", description: "IA decide qual caminho seguir" },
  // Bitrix24 – Lead
  bitrix_create_lead: { label: "Criar Lead",        icon: Building2,  color: "#22c55e", description: "Criar lead no Bitrix24" },
  bitrix_update_lead: { label: "Atualizar Lead",    icon: Building2,  color: "#16a34a", description: "Atualizar lead existente" },
  bitrix_get_lead:    { label: "Buscar Lead",       icon: Building2,  color: "#15803d", description: "Obter lead por ID" },
  bitrix_delete_lead: { label: "Excluir Lead",      icon: Building2,  color: "#166534", description: "Excluir lead do Bitrix24" },
  // Bitrix24 – Deal
  bitrix_create_deal: { label: "Criar Deal",        icon: Handshake,  color: "#3b82f6", description: "Criar deal no Bitrix24" },
  bitrix_update_deal: { label: "Atualizar Deal",    icon: Handshake,  color: "#2563eb", description: "Atualizar deal existente" },
  bitrix_get_deal:    { label: "Buscar Deal",       icon: Handshake,  color: "#1d4ed8", description: "Obter deal por ID" },
  bitrix_delete_deal: { label: "Excluir Deal",      icon: Handshake,  color: "#1e40af", description: "Excluir deal do Bitrix24" },
  // Bitrix24 – SPA
  bitrix_create_spa:  { label: "Criar SPA",         icon: Boxes,      color: "#a855f7", description: "Criar item SPA no Bitrix24" },
  bitrix_update_spa:  { label: "Atualizar SPA",     icon: Boxes,      color: "#9333ea", description: "Atualizar item SPA existente" },
  bitrix_get_spa:     { label: "Buscar SPA",        icon: Boxes,      color: "#7e22ce", description: "Obter item SPA por ID" },
  bitrix_delete_spa:  { label: "Excluir SPA",       icon: Boxes,      color: "#6b21a8", description: "Excluir item SPA do Bitrix24" },
  // Bitrix24 – Badge
  bitrix_create_badge: { label: "Criar Badge",      icon: Award,      color: "#f59e0b", description: "Criar badge personalizada no CRM" },
};

// ── Data interfaces ──

export interface FlowButtonItem {
  id: string;
  label: string;
}

export interface FlowCondition {
  type: "equals" | "contains" | "starts_with" | "regex" | "exists";
  field: string;
  value: string;
}

export interface FlowInputCapture {
  question: string;
  variableName: string;
  validation: "text" | "email" | "phone" | "number" | "cpf";
  timeout: number;
}

export interface FlowWebhook {
  url: string;
  method: "GET" | "POST" | "PUT";
  headers: Record<string, string>;
  body: string;
  responseVar: string;
}

export interface FlowVariable {
  name: string;
  value: string;
  scope: "conversation" | "contact";
}

export interface FlowBitrixField {
  key: string;
  value: string;
}

export interface FlowBitrixBadge {
  badgeCode: string;
  headerTitle: string;
  messagePreview: string;
  entityType: "deal" | "lead" | "contact";
  entityId: string;
  badgeType: "success" | "failure" | "warning" | "primary" | "secondary";
}

export interface FlowBitrixCRM {
  entity: "lead" | "deal" | "spa";
  operation: "create" | "update" | "get" | "delete";
  entityId: string;
  spaEntityTypeId: string;
  fields: FlowBitrixField[];
  resultVar: string;
  pipeline: string;
  stageId: string;
}

// IA Inteligente
export interface FlowAIIntentionField {
  fieldName: string;
  description: string;
  validation: "text" | "phone" | "email" | "cpf" | "city" | "number";
  required: boolean;
}

export interface FlowAIIntention {
  intentions: FlowAIIntentionField[];
  maxTurns: number;
  successMessage: string;
  failureMessage: string;
}

export interface FlowAIAction {
  actionType: "schedule" | "query_crm" | "update_crm" | "custom";
  actionDescription: string;
  toolConfig: Record<string, any>;
  resultVar: string;
}

export interface FlowAIRouterRoute {
  label: string;
  description: string;
  handleId: string;
}

export interface FlowAIRouter {
  routes: FlowAIRouterRoute[];
  analysisPrompt: string;
}

export interface FlowNodeData {
  nodeType: FlowNodeType;
  label?: string;
  // Mensagens
  message?: string;
  buttons?: FlowButtonItem[];
  mediaUrl?: string;
  mediaType?: "image" | "video" | "audio" | "document";
  // Lógica
  condition?: FlowCondition;
  delay?: number;
  inputCapture?: FlowInputCapture;
  loopCount?: number;
  // Integrações
  webhook?: FlowWebhook;
  variable?: FlowVariable;
  // Bitrix24 CRM
  bitrixCrm?: FlowBitrixCRM;
  // Bitrix24 Badge
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
  // Extra
  config?: Record<string, any>;
  originalType?: string;
}

export function getDefaultData(nodeType: FlowNodeType): FlowNodeData {
  const base: FlowNodeData = { nodeType };
  switch (nodeType) {
    case "message":
    case "message_buttons":
      base.message = "";
      if (nodeType === "message_buttons") base.buttons = [];
      break;
    case "media":
      base.mediaUrl = "";
      base.mediaType = "image";
      break;
    case "condition":
      base.condition = { type: "equals", field: "", value: "" };
      break;
    case "delay":
      base.delay = 5;
      break;
    case "input_capture":
      base.inputCapture = { question: "", variableName: "", validation: "text", timeout: 60 };
      break;
    case "loop":
      base.loopCount = 3;
      break;
    case "webhook":
      base.webhook = { url: "", method: "POST", headers: {}, body: "", responseVar: "" };
      break;
    case "set_variable":
      base.variable = { name: "", value: "", scope: "conversation" };
      break;
    case "ai_response":
      base.prompt = "";
      break;
    case "transfer":
      base.department = "";
      base.transferMessage = "";
      break;
    case "ai_intention":
      base.aiIntention = {
        intentions: [{ fieldName: "", description: "", validation: "text", required: true }],
        maxTurns: 5,
        successMessage: "Obrigado! Coletei todas as informações.",
        failureMessage: "Não consegui coletar as informações necessárias.",
      };
      break;
    case "ai_action":
      base.aiAction = {
        actionType: "custom",
        actionDescription: "",
        toolConfig: {},
        resultVar: "",
      };
      break;
    case "ai_router":
      base.aiRouter = {
        routes: [
          { label: "Rota 1", description: "", handleId: "route_0" },
          { label: "Rota 2", description: "", handleId: "route_1" },
        ],
        analysisPrompt: "",
      };
      break;
    default:
      if (nodeType.startsWith("bitrix_")) {
        const parts = nodeType.replace("bitrix_", "").split("_");
        const operation = parts[0] as FlowBitrixCRM["operation"];
        const entity = parts.slice(1).join("_") as FlowBitrixCRM["entity"];
        base.bitrixCrm = {
          entity,
          operation,
          entityId: "",
          spaEntityTypeId: "",
          fields: [],
          resultVar: "",
          pipeline: "",
          stageId: "",
        };
      }
      break;
  }
  return base;
}
