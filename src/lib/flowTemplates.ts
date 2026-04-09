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
      { id: "n2", type: "custom", position: { x: 100, y: 220 }, data: { nodeType: "transfer_to_human" as const, label: "→ Suporte", department: "suporte", transferMessage: "Vou transferir para o suporte técnico..." } },
      { id: "n3", type: "custom", position: { x: 300, y: 220 }, data: { nodeType: "transfer_to_human" as const, label: "→ Financeiro", department: "financeiro", transferMessage: "Transferindo para o setor financeiro..." } },
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

  // ─── TEMPLATE: EMMELY FERNANDES ADVOCACIA ───────────────────────────────────
  {
    id: "emmely_advocacia",
    name: "Emmely Fernandes Advocacia",
    description: "Triagem jurídica por IA → Imigração PT ou Previdenciário → CRM Bitrix24 → Consultor humano",
    icon: "⚖️",
    category: "Advocacia",
    flowType: "hybrid",
    triggerType: "all_messages",
    nodes: [
      { id: "start",  type: "custom", position: { x: 400, y: 0 },    data: { nodeType: "message",     label: "Boas-vindas",                  message: "Olá! 👋 Seja bem-vindo ao *Escritório Emmely Fernandes Advocacia*.\n\nSomos especializados em:\n⚖️ *Imigração para Portugal* — vistos, cidadania e reagrupamento familiar\n🇧🇷 *Previdenciário* — aposentadoria e benefícios INSS no Brasil e no exterior\n\nComo posso ajudá-lo hoje?" } },
      { id: "router", type: "custom", position: { x: 400, y: 160 },  data: { nodeType: "ai_router",   label: "Triagem Jurídica (IA)",         aiRouter: { analysisPrompt: "Analise a mensagem e classifique: 'imigracao' (Portugal, visto, cidadania), 'previdenciario' (INSS, aposentadoria, pensão, BPC), 'retorno' (cliente antigo retornando), 'default' (outros).", defaultHandleId: "default", routes: [{ handleId: "imigracao", label: "Imigração Portugal", description: "Visto, cidadania, reagrupamento" }, { handleId: "previdenciario", label: "Previdenciário", description: "INSS, aposentadoria, pensão" }, { handleId: "retorno", label: "Retorno de cliente", description: "Cliente já atendido" }, { handleId: "default", label: "Fora do escopo", description: "Outros assuntos" }] } } },
      { id: "msg_imig",   type: "custom", position: { x: 0,    y: 340 }, data: { nodeType: "message",       label: "Apresentação Imigração",       message: "Ótimo! Nossa equipe de *Imigração Portugal* pode ajudá-lo com vistos, cidadania e reagrupamento familiar.\n\nPara analisarmos seu caso, preciso de algumas informações. Pode me dizer seu nome completo?" } },
      { id: "col_imig",   type: "custom", position: { x: 0,    y: 500 }, data: { nodeType: "ai_intention",  label: "Coletar Dados — Imigração",    aiIntention: { intentions: [{ fieldName: "nome_cliente", description: "Nome completo do cliente", validation: "text", required: true }, { fieldName: "email_cliente", description: "E-mail de contato", validation: "email", required: false }, { fieldName: "tipo_servico_imigracao", description: "Qual serviço de imigração: visto, cidadania, reagrupamento ou outro", validation: "text", required: true }, { fieldName: "descricao_caso", description: "Breve descrição da situação atual", validation: "text", required: true }], maxTurns: 8, successMessage: "Perfeito, {{nome_cliente}}! ✅ Vou encaminhar para nossa equipe de Imigração Portugal.", failureMessage: "Não consegui coletar as informações. Vou transferir para um consultor.", failureHandleId: "failure" } } },
      { id: "lead_imig",  type: "custom", position: { x: 0,    y: 700 }, data: { nodeType: "bitrix_create_lead",  label: "Criar Lead — Imigração",      bitrixCrm: { entity: "lead", operation: "create", entityId: "", spaEntityTypeId: "", fields: [{ key: "TITLE", value: "Imigração PT — {{nome_cliente}}" }, { key: "NAME", value: "{{nome_cliente}}" }, { key: "PHONE", value: "{{telefone}}" }, { key: "EMAIL", value: "{{email_cliente}}" }, { key: "SOURCE_ID", value: "WEBFORM" }, { key: "COMMENTS", value: "Serviço: {{tipo_servico_imigracao}}\nCaso: {{descricao_caso}}" }, { key: "UTM_CAMPAIGN", value: "imigracao_portugal" }], resultVar: "lead_id", onErrorContinue: true, pipeline: "", stageId: "" } } },
      { id: "deal_imig",  type: "custom", position: { x: 0,    y: 880 }, data: { nodeType: "bitrix_create_deal",  label: "Criar Deal — Funil Imigração", bitrixCrm: { entity: "deal", operation: "create", entityId: "", spaEntityTypeId: "", fields: [{ key: "TITLE", value: "Imigração PT — {{nome_cliente}}" }, { key: "STAGE_ID", value: "NEW" }, { key: "SOURCE_ID", value: "WEBFORM" }, { key: "COMMENTS", value: "Serviço: {{tipo_servico_imigracao}}\n\n{{descricao_caso}}" }, { key: "UTM_CAMPAIGN", value: "imigracao_portugal" }], resultVar: "deal_id", onErrorContinue: true, pipeline: "", stageId: "" } } },
      { id: "cmnt_imig",  type: "custom", position: { x: 0,    y: 1060 }, data: { nodeType: "bitrix_add_comment", label: "Comentário Timeline",          bitrixComment: { entityType: "deal", entityId: "{{deal_id}}", comment: "📱 Lead via WhatsApp Bot\n👤 {{nome_cliente}} | 📞 {{telefone}}\n⚖️ {{tipo_servico_imigracao}}\n\n{{descricao_caso}}\n\n🤖 {{data_hoje}} {{hora_atual}}" } } },
      { id: "cfm_imig",   type: "custom", position: { x: 0,    y: 1220 }, data: { nodeType: "message",       label: "Confirmação Imigração",        message: "✅ *Caso registrado!*\n• Nome: {{nome_cliente}}\n• Serviço: {{tipo_servico_imigracao}}\n\nUm consultor de Imigração Portugal entrará em contato em breve. 🕐" } },
      { id: "trf_imig",   type: "custom", position: { x: 0,    y: 1380 }, data: { nodeType: "transfer_to_human", label: "→ Equipe Imigração",           transferMessage: "", department: "imigracao" } },
      { id: "end_imig",   type: "custom", position: { x: 0,    y: 1520 }, data: { nodeType: "end",          label: "Fim — Imigração" } },
      { id: "msg_prev",   type: "custom", position: { x: 500,  y: 340 }, data: { nodeType: "message",       label: "Apresentação Previdenciário",  message: "Ótimo! Nossa equipe de *Direito Previdenciário* pode ajudá-lo com aposentadoria, BPC/LOAS, pensão por morte e benefícios no exterior.\n\nPode me dizer seu nome completo?" } },
      { id: "col_prev",   type: "custom", position: { x: 500,  y: 500 }, data: { nodeType: "ai_intention",  label: "Coletar Dados — Previdenciário", aiIntention: { intentions: [{ fieldName: "nome_cliente", description: "Nome completo do cliente", validation: "text", required: true }, { fieldName: "email_cliente", description: "E-mail de contato", validation: "email", required: false }, { fieldName: "tipo_beneficio", description: "Qual benefício: aposentadoria, pensão por morte, BPC/LOAS, revisão ou outro", validation: "text", required: true }, { fieldName: "descricao_caso", description: "Breve descrição da situação (anos de contribuição, benefício negado, etc.)", validation: "text", required: true }], maxTurns: 8, successMessage: "Perfeito, {{nome_cliente}}! ✅ Vou encaminhar para nossa equipe Previdenciária.", failureMessage: "Não consegui coletar as informações. Vou transferir para um consultor.", failureHandleId: "failure" } } },
      { id: "lead_prev",  type: "custom", position: { x: 500,  y: 700 }, data: { nodeType: "bitrix_create_lead",  label: "Criar Lead — Previdenciário",  bitrixCrm: { entity: "lead", operation: "create", entityId: "", spaEntityTypeId: "", fields: [{ key: "TITLE", value: "Previdenciário — {{nome_cliente}}" }, { key: "NAME", value: "{{nome_cliente}}" }, { key: "PHONE", value: "{{telefone}}" }, { key: "EMAIL", value: "{{email_cliente}}" }, { key: "SOURCE_ID", value: "WEBFORM" }, { key: "COMMENTS", value: "Benefício: {{tipo_beneficio}}\nCaso: {{descricao_caso}}" }, { key: "UTM_CAMPAIGN", value: "previdenciario" }], resultVar: "lead_id", onErrorContinue: true } } },
      { id: "deal_prev",  type: "custom", position: { x: 500,  y: 880 }, data: { nodeType: "bitrix_create_deal",  label: "Criar Deal — Funil Prev.",     bitrixCrm: { entity: "deal", operation: "create", entityId: "", spaEntityTypeId: "", fields: [{ key: "TITLE", value: "Previdenciário — {{nome_cliente}}" }, { key: "STAGE_ID", value: "NEW" }, { key: "SOURCE_ID", value: "WEBFORM" }, { key: "COMMENTS", value: "Benefício: {{tipo_beneficio}}\n\n{{descricao_caso}}" }, { key: "UTM_CAMPAIGN", value: "previdenciario" }], resultVar: "deal_id", onErrorContinue: true } } },
      { id: "cmnt_prev",  type: "custom", position: { x: 500,  y: 1060 }, data: { nodeType: "bitrix_add_comment", label: "Comentário Timeline",          bitrixComment: { entityType: "deal", entityId: "{{deal_id}}", comment: "📱 Lead via WhatsApp Bot\n👤 {{nome_cliente}} | 📞 {{telefone}}\n⚖️ {{tipo_beneficio}}\n\n{{descricao_caso}}\n\n🤖 {{data_hoje}} {{hora_atual}}" } } },
      { id: "cfm_prev",   type: "custom", position: { x: 500,  y: 1220 }, data: { nodeType: "message",       label: "Confirmação Previdenciário",   message: "✅ *Caso registrado!*\n• Nome: {{nome_cliente}}\n• Benefício: {{tipo_beneficio}}\n\nUm advogado especializado em Previdenciário entrará em contato em breve. 🕐" } },
      { id: "trf_prev",   type: "custom", position: { x: 500,  y: 1380 }, data: { nodeType: "transfer_to_human", label: "→ Equipe Previdenciário",       transferMessage: "", department: "previdenciario" } },
      { id: "end_prev",   type: "custom", position: { x: 500,  y: 1520 }, data: { nodeType: "end",          label: "Fim — Previdenciário" } },
      { id: "ai_ret",     type: "custom", position: { x: 900,  y: 340 }, data: { nodeType: "ai_response",  label: "Analisar Retorno (Whisper)",   prompt: "Você é assistente jurídico do Escritório Emmely Fernandes. Analise a mensagem do cliente que está retornando. Gere: #Resumo, #Tipo de solicitação, #Sugestão. NÃO envie mensagens ao cliente.", sendAsWhisper: true } },
      { id: "msg_ret",    type: "custom", position: { x: 900,  y: 500 }, data: { nodeType: "message",       label: "Mensagem ao Cliente — Retorno", message: "Olá! 👋 Que bom ter você de volta! Estou encaminhando para o consultor responsável pelo seu caso. Em instantes alguém entrará em contato. 🕐" } },
      { id: "trf_ret",    type: "custom", position: { x: 900,  y: 660 }, data: { nodeType: "transfer_to_human", label: "→ Consultor",                  transferMessage: "", department: "" } },
      { id: "end_ret",    type: "custom", position: { x: 900,  y: 820 }, data: { nodeType: "end",          label: "Fim — Retorno" } },
      { id: "ai_def",     type: "custom", position: { x: 1300, y: 340 }, data: { nodeType: "ai_response",  label: "Resposta Geral (IA)",          prompt: "Você é assistente do Escritório Emmely Fernandes Advocacia, especializado em Imigração Portugal e Previdenciário Brasil. Responda cordialmente, explique as áreas de atuação e pergunte se o cliente quer ser atendido por um consultor. Máx. 3 parágrafos.", sendAsWhisper: false } },
      { id: "msg_aud",    type: "custom", position: { x: 1300, y: 500 }, data: { nodeType: "message",       label: "Oferecer Áudio",               message: "Se preferir, pode enviar um áudio explicando melhor sua situação. Nossa equipe analisará e retornará em breve. 🎙️" } },
      { id: "end_def",    type: "custom", position: { x: 1300, y: 660 }, data: { nodeType: "end",          label: "Fim — Default" } },
    ],
    edges: [
      { id: "e0",  source: "start",    target: "router",    markerEnd: marker },
      { id: "e1",  source: "router",   target: "msg_imig",  sourceHandle: "imigracao",      markerEnd: marker },
      { id: "e2",  source: "router",   target: "msg_prev",  sourceHandle: "previdenciario", markerEnd: marker },
      { id: "e3",  source: "router",   target: "ai_ret",    sourceHandle: "retorno",        markerEnd: marker },
      { id: "e4",  source: "router",   target: "ai_def",    sourceHandle: "default",        markerEnd: marker },
      { id: "e5",  source: "msg_imig", target: "col_imig",  markerEnd: marker },
      { id: "e6",  source: "col_imig", target: "lead_imig", markerEnd: marker },
      { id: "e6f", source: "col_imig", target: "trf_imig",  sourceHandle: "failure",        markerEnd: marker },
      { id: "e7",  source: "lead_imig", target: "deal_imig", markerEnd: marker },
      { id: "e8",  source: "deal_imig", target: "cmnt_imig", markerEnd: marker },
      { id: "e9",  source: "cmnt_imig", target: "cfm_imig",  markerEnd: marker },
      { id: "e10", source: "cfm_imig",  target: "trf_imig",  markerEnd: marker },
      { id: "e11", source: "trf_imig",  target: "end_imig",  markerEnd: marker },
      { id: "e12", source: "msg_prev",  target: "col_prev",  markerEnd: marker },
      { id: "e13", source: "col_prev",  target: "lead_prev", markerEnd: marker },
      { id: "e13f",source: "col_prev",  target: "trf_prev",  sourceHandle: "failure",        markerEnd: marker },
      { id: "e14", source: "lead_prev", target: "deal_prev", markerEnd: marker },
      { id: "e15", source: "deal_prev", target: "cmnt_prev", markerEnd: marker },
      { id: "e16", source: "cmnt_prev", target: "cfm_prev",  markerEnd: marker },
      { id: "e17", source: "cfm_prev",  target: "trf_prev",  markerEnd: marker },
      { id: "e18", source: "trf_prev",  target: "end_prev",  markerEnd: marker },
      { id: "e19", source: "ai_ret",    target: "msg_ret",   markerEnd: marker },
      { id: "e20", source: "msg_ret",   target: "trf_ret",   markerEnd: marker },
      { id: "e21", source: "trf_ret",   target: "end_ret",   markerEnd: marker },
      { id: "e22", source: "ai_def",    target: "msg_aud",   markerEnd: marker },
      { id: "e23", source: "msg_aud",   target: "end_def",   markerEnd: marker },
    ],
  },
];
