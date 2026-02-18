import {
  MessageSquare, ListOrdered, Image, MapPin, Contact, Smile,
  Split, MessageCircle, Clock, TextCursorInput, Repeat,
  Globe, Zap,
  Bot, UserCog, Phone, ArrowLeftToLine, XCircle,
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
  | "end_flow";

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
];

export interface NodeTypeMeta {
  label: string;
  icon: LucideIcon;
  color: string;
  description: string;
  /** How many default source handles (besides dynamic ones) */
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
};

// ── Data stored inside each node ──
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
  // Controle
  personaId?: string;
  prompt?: string;
  department?: string;
  transferMessage?: string;
  // Extra – raw config from PowerBot imports
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
    default:
      break;
  }
  return base;
}
