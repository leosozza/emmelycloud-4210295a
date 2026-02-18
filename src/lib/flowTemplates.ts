import type { FlowNodeData } from "@/components/flows/FlowNodeTypes";

export interface FlowTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  flowType: "flow" | "ai" | "hybrid";
  triggerType: string;
  nodes: Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    data: FlowNodeData;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    markerEnd?: any;
  }>;
}

const marker = { type: "arrowclosed" as const };

export const FLOW_TEMPLATES: FlowTemplate[] = [
  {
    id: "lead_qualification",
    name: "Qualificação de Leads",
    description: "Boas-vindas → Coleta nome/telefone/segmento → Criar Lead no Bitrix",
    icon: "🎯",
    category: "Vendas",
    flowType: "hybrid",
    triggerType: "first_message",
    nodes: [
      { id: "n1", type: "custom", position: { x: 250, y: 50 }, data: { nodeType: "message", label: "Boas-vindas", message: "Olá! 👋 Seja bem-vindo! Vou ajudá-lo a encontrar a melhor solução." } },
      { id: "n2", type: "custom", position: { x: 250, y: 180 }, data: { nodeType: "ai_intention", label: "Coletar Dados", aiIntention: { intentions: [{ fieldName: "nome_cliente", description: "Identifique o nome completo do cliente", validation: "text", required: true }, { fieldName: "telefone", description: "Peça o número de telefone com DDD", validation: "phone", required: true }, { fieldName: "segmento", description: "Pergunte qual o segmento de atuação ou interesse", validation: "text", required: false }], maxTurns: 6, successMessage: "Perfeito! Tenho todos os dados. Vou encaminhar para nossa equipe.", failureMessage: "Não consegui coletar todas as informações. Vou transferir para um atendente." } } },
      { id: "n3", type: "custom", position: { x: 250, y: 340 }, data: { nodeType: "bitrix_create_lead", label: "Criar Lead", bitrixCrm: { entity: "lead", operation: "create", entityId: "", spaEntityTypeId: "", fields: [{ key: "TITLE", value: "Lead via Bot - {{nome_cliente}}" }, { key: "NAME", value: "{{nome_cliente}}" }, { key: "PHONE", value: "{{telefone}}" }], resultVar: "lead_id", pipeline: "", stageId: "" } } },
      { id: "n4", type: "custom", position: { x: 250, y: 470 }, data: { nodeType: "message", label: "Confirmação", message: "✅ Pronto! Seu cadastro foi realizado com sucesso. Em breve nossa equipe entrará em contato!" } },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2", markerEnd: marker },
      { id: "e2", source: "n2", target: "n3", markerEnd: marker },
      { id: "e3", source: "n3", target: "n4", markerEnd: marker },
    ],
  },
  {
    id: "support_triage",
    name: "Triagem de Suporte",
    description: "Menu de opções → Roteamento por IA → Transferir ou responder",
    icon: "🛟",
    category: "Suporte",
    flowType: "hybrid",
    triggerType: "keyword",
    nodes: [
      { id: "n1", type: "custom", position: { x: 250, y: 50 }, data: { nodeType: "message_buttons", label: "Menu Principal", message: "Olá! Como posso ajudá-lo?", buttons: [{ id: "btn_1", label: "Suporte Técnico" }, { id: "btn_2", label: "Financeiro" }, { id: "btn_3", label: "Outros" }] } },
      { id: "n2", type: "custom", position: { x: 100, y: 220 }, data: { nodeType: "transfer", label: "→ Suporte", department: "suporte", transferMessage: "Vou transferir para o suporte técnico..." } },
      { id: "n3", type: "custom", position: { x: 300, y: 220 }, data: { nodeType: "transfer", label: "→ Financeiro", department: "financeiro", transferMessage: "Transferindo para o setor financeiro..." } },
      { id: "n4", type: "custom", position: { x: 500, y: 220 }, data: { nodeType: "ai_response", label: "IA Responde", prompt: "Responda de forma empática e tente resolver a dúvida do cliente." } },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2", sourceHandle: "btn_btn_1", markerEnd: marker },
      { id: "e2", source: "n1", target: "n3", sourceHandle: "btn_btn_2", markerEnd: marker },
      { id: "e3", source: "n1", target: "n4", sourceHandle: "btn_btn_3", markerEnd: marker },
    ],
  },
  {
    id: "smart_scheduling",
    name: "Agendamento Inteligente",
    description: "IA coleta dados → Consulta agenda Bitrix → Agenda automaticamente",
    icon: "📅",
    category: "Agendamento",
    flowType: "ai",
    triggerType: "keyword",
    nodes: [
      { id: "n1", type: "custom", position: { x: 250, y: 50 }, data: { nodeType: "message", label: "Início", message: "Vou ajudá-lo a agendar um atendimento! 📅" } },
      { id: "n2", type: "custom", position: { x: 250, y: 180 }, data: { nodeType: "ai_intention", label: "Coletar Info", aiIntention: { intentions: [{ fieldName: "nome", description: "Identifique o nome do cliente", validation: "text", required: true }, { fieldName: "data_preferencia", description: "Pergunte a data de preferência para agendamento", validation: "text", required: true }, { fieldName: "horario", description: "Pergunte o horário de preferência", validation: "text", required: true }], maxTurns: 5, successMessage: "Vou verificar a disponibilidade...", failureMessage: "Não consegui coletar as informações necessárias." } } },
      { id: "n3", type: "custom", position: { x: 250, y: 340 }, data: { nodeType: "ai_action", label: "Verificar Agenda", aiAction: { actionType: "query_crm", actionDescription: "Consulte a agenda do Bitrix24 para verificar disponibilidade na data e horário solicitados", toolConfig: { entity: "calendar", operation: "check_availability" }, resultVar: "agenda_disponivel" } } },
      { id: "n4", type: "custom", position: { x: 250, y: 470 }, data: { nodeType: "message", label: "Confirmação", message: "✅ Agendamento confirmado para {{data_preferencia}} às {{horario}}. Até lá!" } },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2", markerEnd: marker },
      { id: "e2", source: "n2", target: "n3", markerEnd: marker },
      { id: "e3", source: "n3", target: "n4", markerEnd: marker },
    ],
  },
  {
    id: "data_collection",
    name: "Coleta de Dados",
    description: "IA coleta nome, telefone, cidade → Atualiza CRM automaticamente",
    icon: "📋",
    category: "CRM",
    flowType: "ai",
    triggerType: "first_message",
    nodes: [
      { id: "n1", type: "custom", position: { x: 250, y: 50 }, data: { nodeType: "ai_intention", label: "Coletar Dados", aiIntention: { intentions: [{ fieldName: "nome_completo", description: "Identifique o nome completo", validation: "text", required: true }, { fieldName: "telefone", description: "Peça o número de telefone", validation: "phone", required: true }, { fieldName: "cidade", description: "Pergunte a cidade onde mora", validation: "city", required: true }, { fieldName: "email", description: "Solicite o email de contato", validation: "email", required: false }], maxTurns: 8, successMessage: "Obrigado! Registrei todas as informações.", failureMessage: "Não foi possível completar o cadastro." } } },
      { id: "n2", type: "custom", position: { x: 250, y: 220 }, data: { nodeType: "bitrix_create_lead", label: "Salvar no CRM", bitrixCrm: { entity: "lead", operation: "create", entityId: "", spaEntityTypeId: "", fields: [{ key: "TITLE", value: "{{nome_completo}} - {{cidade}}" }, { key: "NAME", value: "{{nome_completo}}" }, { key: "PHONE", value: "{{telefone}}" }, { key: "EMAIL", value: "{{email}}" }], resultVar: "crm_result", pipeline: "", stageId: "" } } },
      { id: "n3", type: "custom", position: { x: 250, y: 370 }, data: { nodeType: "message", label: "Finalizar", message: "✅ Cadastro concluído! Obrigado, {{nome_completo}}!" } },
    ],
    edges: [
      { id: "e1", source: "n1", target: "n2", markerEnd: marker },
      { id: "e2", source: "n2", target: "n3", markerEnd: marker },
    ],
  },
];
