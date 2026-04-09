import { Node, Edge, MarkerType } from "@xyflow/react";
import { 
  MessageSquare, 
  UserPlus, 
  Headphones, 
  Star, 
  Calendar, 
  ShoppingCart,
  Heart,
  LucideIcon 
} from "lucide-react";

export interface FlowTemplate {
  id: string;
  name: string;
  description: string;
  category: "atendimento" | "vendas" | "suporte";
  icon: LucideIcon;
  nodes: Node[];
  edges: Edge[];
}

const createEdge = (source: string, target: string, sourceHandle?: string): Edge => ({
  id: `e-${source}-${target}${sourceHandle ? `-${sourceHandle}` : ""}`,
  source,
  target,
  sourceHandle,
  markerEnd: { type: MarkerType.ArrowClosed },
  style: { strokeWidth: 2 },
});

export const flowTemplates: FlowTemplate[] = [
  {
    id: "atendimento_inicial",
    name: "Atendimento Inicial",
    description: "Boas-vindas com menu de opções e direcionamento por departamento",
    category: "atendimento",
    icon: MessageSquare,
    nodes: [
      {
        id: "trigger",
        type: "custom",
        position: { x: 250, y: 0 },
        data: { label: "Gatilho", nodeType: "trigger" },
      },
      {
        id: "welcome",
        type: "custom",
        position: { x: 250, y: 100 },
        data: { 
          label: "Boas-vindas", 
          nodeType: "message_buttons",
          message: "Olá {{contact.name}}! 👋\n\nBem-vindo ao nosso atendimento.\nComo posso ajudá-lo hoje?",
          buttons: [
            { id: "btn-vendas", text: "💰 Vendas", type: "reply" },
            { id: "btn-suporte", text: "🔧 Suporte", type: "reply" },
            { id: "btn-financeiro", text: "📊 Financeiro", type: "reply" },
          ]
        },
      },
      {
        id: "transfer-vendas",
        type: "custom",
        position: { x: 50, y: 250 },
        data: { 
          label: "Transferir Vendas", 
          nodeType: "transfer_to_human",
          department: "Vendas",
          transferMessage: "Vou transferir você para nossa equipe de vendas. Um momento! 🚀"
        },
      },
      {
        id: "transfer-suporte",
        type: "custom",
        position: { x: 250, y: 250 },
        data: { 
          label: "Transferir Suporte", 
          nodeType: "transfer_to_human",
          department: "Suporte",
          transferMessage: "Conectando você com nosso suporte técnico. Por favor, aguarde! 🔧"
        },
      },
      {
        id: "transfer-financeiro",
        type: "custom",
        position: { x: 450, y: 250 },
        data: { 
          label: "Transferir Financeiro", 
          nodeType: "transfer_to_human",
          department: "Financeiro",
          transferMessage: "Transferindo para o setor financeiro. Logo você será atendido! 📊"
        },
      },
    ],
    edges: [
      createEdge("trigger", "welcome"),
      createEdge("welcome", "transfer-vendas", "btn-vendas"),
      createEdge("welcome", "transfer-suporte", "btn-suporte"),
      createEdge("welcome", "transfer-financeiro", "btn-financeiro"),
    ],
  },
  {
    id: "qualificacao_lead",
    name: "Qualificação de Lead",
    description: "Coleta dados do cliente e cria lead no Bitrix24 automaticamente",
    category: "vendas",
    icon: UserPlus,
    nodes: [
      {
        id: "trigger",
        type: "custom",
        position: { x: 250, y: 0 },
        data: { label: "Gatilho", nodeType: "trigger" },
      },
      {
        id: "ask-name",
        type: "custom",
        position: { x: 250, y: 100 },
        data: { 
          label: "Perguntar Nome", 
          nodeType: "message",
          message: "Olá! 👋 Que bom ter você aqui!\nPara começar, qual é o seu nome completo?"
        },
      },
      {
        id: "wait-name",
        type: "custom",
        position: { x: 250, y: 200 },
        data: { label: "Aguardar Nome", nodeType: "wait_response" },
      },
      {
        id: "save-name",
        type: "custom",
        position: { x: 250, y: 300 },
        data: { 
          label: "Salvar Nome", 
          nodeType: "set_variable",
          variable: { name: "lead_name", value: "{{last_response}}", scope: "conversation" }
        },
      },
      {
        id: "ask-email",
        type: "custom",
        position: { x: 250, y: 400 },
        data: { 
          label: "Perguntar Email", 
          nodeType: "message",
          message: "Prazer, {{lead_name}}! 😊\nQual é o seu e-mail para contato?"
        },
      },
      {
        id: "wait-email",
        type: "custom",
        position: { x: 250, y: 500 },
        data: { label: "Aguardar Email", nodeType: "wait_response" },
      },
      {
        id: "save-email",
        type: "custom",
        position: { x: 250, y: 600 },
        data: { 
          label: "Salvar Email", 
          nodeType: "set_variable",
          variable: { name: "lead_email", value: "{{last_response}}", scope: "conversation" }
        },
      },
      {
        id: "ask-interest",
        type: "custom",
        position: { x: 250, y: 700 },
        data: { 
          label: "Interesse", 
          nodeType: "message_buttons",
          message: "Perfeito! Em qual produto você tem interesse?",
          buttons: [
            { id: "btn-produto-a", text: "Produto A", type: "reply" },
            { id: "btn-produto-b", text: "Produto B", type: "reply" },
            { id: "btn-produto-c", text: "Produto C", type: "reply" },
          ]
        },
      },
      {
        id: "create-lead",
        type: "custom",
        position: { x: 250, y: 850 },
        data: { 
          label: "Criar Lead Bitrix", 
          nodeType: "bitrix_create_lead",
          bitrixAction: {
            entity: "lead",
            action: "create",
            fields: {
              TITLE: "Lead WhatsApp - {{lead_name}}",
              NAME: "{{lead_name}}",
              EMAIL: "{{lead_email}}",
            }
          }
        },
      },
      {
        id: "thanks",
        type: "custom",
        position: { x: 250, y: 950 },
        data: { 
          label: "Agradecimento", 
          nodeType: "message",
          message: "Obrigado, {{lead_name}}! 🎉\nNossa equipe entrará em contato em breve.\n\nSe precisar de algo, é só chamar! 💬"
        },
      },
    ],
    edges: [
      createEdge("trigger", "ask-name"),
      createEdge("ask-name", "wait-name"),
      createEdge("wait-name", "save-name"),
      createEdge("save-name", "ask-email"),
      createEdge("ask-email", "wait-email"),
      createEdge("wait-email", "save-email"),
      createEdge("save-email", "ask-interest"),
      createEdge("ask-interest", "create-lead"),
      createEdge("create-lead", "thanks"),
    ],
  },
  {
    id: "suporte_tecnico",
    name: "Suporte Técnico",
    description: "FAQ automático com IA e opção de escalonamento para humano",
    category: "suporte",
    icon: Headphones,
    nodes: [
      {
        id: "trigger",
        type: "custom",
        position: { x: 250, y: 0 },
        data: { label: "Gatilho", nodeType: "trigger" },
      },
      {
        id: "welcome",
        type: "custom",
        position: { x: 250, y: 100 },
        data: { 
          label: "Boas-vindas Suporte", 
          nodeType: "message_buttons",
          message: "Olá! 🔧 Sou o assistente de suporte.\n\nComo posso ajudar?",
          buttons: [
            { id: "btn-problema", text: "🐛 Tenho um problema", type: "reply" },
            { id: "btn-duvida", text: "❓ Tenho uma dúvida", type: "reply" },
            { id: "btn-humano", text: "👤 Falar com humano", type: "reply" },
          ]
        },
      },
      {
        id: "ask-problem",
        type: "custom",
        position: { x: 50, y: 250 },
        data: { 
          label: "Descreva o Problema", 
          nodeType: "message",
          message: "Entendo! Por favor, descreva o problema que você está enfrentando. Quanto mais detalhes, melhor poderei ajudar! 🔍"
        },
      },
      {
        id: "wait-problem",
        type: "custom",
        position: { x: 50, y: 350 },
        data: { label: "Aguardar Descrição", nodeType: "wait_response" },
      },
      {
        id: "ai-response",
        type: "custom",
        position: { x: 50, y: 450 },
        data: { 
          label: "IA Responde", 
          nodeType: "ai_response",
          prompt: "O usuário está enfrentando um problema técnico. Tente ajudar com base na base de conhecimento."
        },
      },
      {
        id: "resolved-check",
        type: "custom",
        position: { x: 50, y: 550 },
        data: { 
          label: "Resolvido?", 
          nodeType: "message_buttons",
          message: "Isso resolveu seu problema?",
          buttons: [
            { id: "btn-sim", text: "✅ Sim, resolvido!", type: "reply" },
            { id: "btn-nao", text: "❌ Não, ainda preciso de ajuda", type: "reply" },
          ]
        },
      },
      {
        id: "thanks-resolved",
        type: "custom",
        position: { x: -100, y: 700 },
        data: { 
          label: "Agradecimento", 
          nodeType: "message",
          message: "Que ótimo! 🎉 Fico feliz em ter ajudado!\nSe precisar de mais alguma coisa, é só chamar. 👋"
        },
      },
      {
        id: "transfer-support",
        type: "custom",
        position: { x: 450, y: 350 },
        data: { 
          label: "Transferir Suporte", 
          nodeType: "transfer_to_human",
          department: "Suporte",
          transferMessage: "Vou conectar você com um de nossos especialistas. Por favor, aguarde um momento! 👨‍💻"
        },
      },
    ],
    edges: [
      createEdge("trigger", "welcome"),
      createEdge("welcome", "ask-problem", "btn-problema"),
      createEdge("welcome", "ask-problem", "btn-duvida"),
      createEdge("welcome", "transfer-support", "btn-humano"),
      createEdge("ask-problem", "wait-problem"),
      createEdge("wait-problem", "ai-response"),
      createEdge("ai-response", "resolved-check"),
      createEdge("resolved-check", "thanks-resolved", "btn-sim"),
      createEdge("resolved-check", "transfer-support", "btn-nao"),
    ],
  },
  {
    id: "pesquisa_satisfacao",
    name: "Pesquisa de Satisfação",
    description: "Coleta NPS e feedback do cliente após atendimento",
    category: "atendimento",
    icon: Star,
    nodes: [
      {
        id: "trigger",
        type: "custom",
        position: { x: 250, y: 0 },
        data: { label: "Gatilho", nodeType: "trigger" },
      },
      {
        id: "intro",
        type: "custom",
        position: { x: 250, y: 100 },
        data: { 
          label: "Introdução", 
          nodeType: "message",
          message: "Olá {{contact.name}}! 👋\n\nGostaríamos de saber como foi seu atendimento. Pode nos ajudar com uma rápida pesquisa? Leva menos de 1 minuto!"
        },
      },
      {
        id: "nps-question",
        type: "custom",
        position: { x: 250, y: 200 },
        data: { 
          label: "NPS", 
          nodeType: "message_buttons",
          message: "De 0 a 10, qual a probabilidade de você nos recomendar a um amigo?",
          buttons: [
            { id: "btn-0-6", text: "0 a 6", type: "reply" },
            { id: "btn-7-8", text: "7 ou 8", type: "reply" },
            { id: "btn-9-10", text: "9 ou 10", type: "reply" },
          ]
        },
      },
      {
        id: "detractor",
        type: "custom",
        position: { x: 50, y: 350 },
        data: { 
          label: "Detrator", 
          nodeType: "message",
          message: "Sentimos muito que sua experiência não foi a melhor. 😔\nPoderia nos contar o que podemos melhorar?"
        },
      },
      {
        id: "passive",
        type: "custom",
        position: { x: 250, y: 350 },
        data: { 
          label: "Neutro", 
          nodeType: "message",
          message: "Obrigado pelo feedback! 🙂\nO que poderíamos fazer para transformar sua experiência em excelente?"
        },
      },
      {
        id: "promoter",
        type: "custom",
        position: { x: 450, y: 350 },
        data: { 
          label: "Promotor", 
          nodeType: "message",
          message: "Que maravilha! 🎉 Ficamos muito felizes!\nO que você mais gostou no nosso atendimento?"
        },
      },
      {
        id: "wait-feedback",
        type: "custom",
        position: { x: 250, y: 450 },
        data: { label: "Aguardar Feedback", nodeType: "wait_response" },
      },
      {
        id: "thanks",
        type: "custom",
        position: { x: 250, y: 550 },
        data: { 
          label: "Agradecimento", 
          nodeType: "message",
          message: "Muito obrigado pelo seu feedback! 💙\nSua opinião é muito importante para nós.\n\nTenha um ótimo dia! 🌟"
        },
      },
    ],
    edges: [
      createEdge("trigger", "intro"),
      createEdge("intro", "nps-question"),
      createEdge("nps-question", "detractor", "btn-0-6"),
      createEdge("nps-question", "passive", "btn-7-8"),
      createEdge("nps-question", "promoter", "btn-9-10"),
      createEdge("detractor", "wait-feedback"),
      createEdge("passive", "wait-feedback"),
      createEdge("promoter", "wait-feedback"),
      createEdge("wait-feedback", "thanks"),
    ],
  },
  {
    id: "agendamento",
    name: "Agendamento de Reunião",
    description: "Coleta preferências e cria atividade no Bitrix24",
    category: "vendas",
    icon: Calendar,
    nodes: [
      {
        id: "trigger",
        type: "custom",
        position: { x: 250, y: 0 },
        data: { label: "Gatilho", nodeType: "trigger" },
      },
      {
        id: "intro",
        type: "custom",
        position: { x: 250, y: 100 },
        data: { 
          label: "Introdução", 
          nodeType: "message",
          message: "Olá! 📅 Vamos agendar sua reunião.\nEm qual período você prefere?"
        },
      },
      {
        id: "period",
        type: "custom",
        position: { x: 250, y: 200 },
        data: { 
          label: "Período", 
          nodeType: "message_buttons",
          message: "Escolha o melhor período:",
          buttons: [
            { id: "btn-manha", text: "🌅 Manhã (9h-12h)", type: "reply" },
            { id: "btn-tarde", text: "☀️ Tarde (14h-18h)", type: "reply" },
          ]
        },
      },
      {
        id: "save-period",
        type: "custom",
        position: { x: 250, y: 300 },
        data: { 
          label: "Salvar Período", 
          nodeType: "set_variable",
          variable: { name: "meeting_period", value: "{{last_response}}", scope: "conversation" }
        },
      },
      {
        id: "ask-date",
        type: "custom",
        position: { x: 250, y: 400 },
        data: { 
          label: "Perguntar Data", 
          nodeType: "message",
          message: "Ótimo! Para qual data você gostaria de agendar?\nPor favor, informe no formato DD/MM (ex: 15/01)"
        },
      },
      {
        id: "wait-date",
        type: "custom",
        position: { x: 250, y: 500 },
        data: { label: "Aguardar Data", nodeType: "wait_response" },
      },
      {
        id: "create-activity",
        type: "custom",
        position: { x: 250, y: 600 },
        data: { 
          label: "Criar Atividade", 
          nodeType: "bitrix_add_activity",
          bitrixAction: {
            entity: "deal",
            action: "add_activity",
            fields: {
              SUBJECT: "Reunião agendada via WhatsApp",
              DESCRIPTION: "Período: {{meeting_period}}\nData: {{last_response}}",
            }
          }
        },
      },
      {
        id: "confirm",
        type: "custom",
        position: { x: 250, y: 700 },
        data: { 
          label: "Confirmação", 
          nodeType: "message",
          message: "Perfeito! ✅\n\n📅 Reunião agendada:\n• Data: {{last_response}}\n• Período: {{meeting_period}}\n\nNossa equipe entrará em contato para confirmar o horário exato. Até lá! 👋"
        },
      },
    ],
    edges: [
      createEdge("trigger", "intro"),
      createEdge("intro", "period"),
      createEdge("period", "save-period"),
      createEdge("save-period", "ask-date"),
      createEdge("ask-date", "wait-date"),
      createEdge("wait-date", "create-activity"),
      createEdge("create-activity", "confirm"),
    ],
  },
  {
    id: "carrinho_abandonado",
    name: "Recuperação de Carrinho",
    description: "Follow-up automático para carrinhos abandonados",
    category: "vendas",
    icon: ShoppingCart,
    nodes: [
      {
        id: "trigger",
        type: "custom",
        position: { x: 250, y: 0 },
        data: { label: "Gatilho", nodeType: "trigger" },
      },
      {
        id: "reminder",
        type: "custom",
        position: { x: 250, y: 100 },
        data: { 
          label: "Lembrete", 
          nodeType: "message_buttons",
          message: "Olá {{contact.name}}! 👋\n\nNotamos que você deixou alguns itens no carrinho. 🛒\n\nPosso ajudar a finalizar sua compra?",
          buttons: [
            { id: "btn-sim", text: "✅ Sim, quero finalizar", type: "reply" },
            { id: "btn-duvida", text: "❓ Tenho uma dúvida", type: "reply" },
            { id: "btn-nao", text: "❌ Não, obrigado", type: "reply" },
          ]
        },
      },
      {
        id: "offer",
        type: "custom",
        position: { x: 50, y: 250 },
        data: { 
          label: "Oferta Especial", 
          nodeType: "message",
          message: "Ótimo! 🎉\n\nTemos uma oferta especial para você:\n💰 *10% OFF* usando o cupom: VOLTAR10\n\nAcesse seu carrinho e finalize a compra! 🛍️"
        },
      },
      {
        id: "question",
        type: "custom",
        position: { x: 250, y: 250 },
        data: { 
          label: "Tirar Dúvida", 
          nodeType: "message",
          message: "Claro! 😊 Qual é a sua dúvida sobre os produtos ou a compra?"
        },
      },
      {
        id: "wait-question",
        type: "custom",
        position: { x: 250, y: 350 },
        data: { label: "Aguardar Dúvida", nodeType: "wait_response" },
      },
      {
        id: "ai-answer",
        type: "custom",
        position: { x: 250, y: 450 },
        data: { 
          label: "IA Responde", 
          nodeType: "ai_response",
          prompt: "O cliente tem uma dúvida sobre produtos ou compra. Responda de forma útil e convide-o a finalizar a compra."
        },
      },
      {
        id: "goodbye",
        type: "custom",
        position: { x: 450, y: 250 },
        data: { 
          label: "Despedida", 
          nodeType: "message",
          message: "Tudo bem! 😊\n\nSe mudar de ideia, estaremos aqui.\n\nTenha um ótimo dia! 👋"
        },
      },
    ],
    edges: [
      createEdge("trigger", "reminder"),
      createEdge("reminder", "offer", "btn-sim"),
      createEdge("reminder", "question", "btn-duvida"),
      createEdge("reminder", "goodbye", "btn-nao"),
      createEdge("question", "wait-question"),
      createEdge("wait-question", "ai-answer"),
    ],
  },
  // HYBRID TEMPLATE - Based on PowerBot flow
  {
    id: "atendimento_hibrido",
    name: "Atendimento Híbrido (IA + Fluxo)",
    description: "Triagem inicial com menu + transição automática para IA especializada por setor",
    category: "atendimento",
    icon: MessageSquare,
    nodes: [
      {
        id: "trigger",
        type: "custom",
        position: { x: 300, y: 0 },
        data: { label: "Gatilho", nodeType: "trigger" },
      },
      {
        id: "welcome",
        type: "custom",
        position: { x: 300, y: 100 },
        data: { 
          label: "Boas-vindas", 
          nodeType: "message_buttons",
          message: "Olá {{contact.name}}! 👋\n\nSeja bem-vindo(a)!\nSou a assistente virtual e estou aqui para te ajudar.\n\nComo posso te atender hoje?",
          buttons: [
            { id: "btn-vendas", text: "💰 Comprar/Orçamento", type: "reply" },
            { id: "btn-suporte", text: "🔧 Suporte Técnico", type: "reply" },
            { id: "btn-financeiro", text: "📊 Financeiro", type: "reply" },
          ]
        },
      },
      {
        id: "switch-vendas",
        type: "custom",
        position: { x: 50, y: 250 },
        data: { 
          label: "IA Vendas", 
          nodeType: "switch_persona",
          personaId: "", // Will be configured by user
          transitionMessage: "Ótimo! Vou te conectar com nosso especialista em vendas... 🚀",
          sendWelcome: true,
          keepHistory: true
        },
      },
      {
        id: "switch-suporte",
        type: "custom",
        position: { x: 300, y: 250 },
        data: { 
          label: "IA Suporte", 
          nodeType: "switch_persona",
          personaId: "", // Will be configured by user
          transitionMessage: "Entendi! Vou conectar você com nossa IA especializada em suporte técnico... 🔧",
          sendWelcome: true,
          keepHistory: true
        },
      },
      {
        id: "switch-financeiro",
        type: "custom",
        position: { x: 550, y: 250 },
        data: { 
          label: "IA Financeiro", 
          nodeType: "switch_persona",
          personaId: "", // Will be configured by user
          transitionMessage: "Perfeito! Vou te transferir para nossa IA especializada em assuntos financeiros... 📊",
          sendWelcome: true,
          keepHistory: true
        },
      },
    ],
    edges: [
      createEdge("trigger", "welcome"),
      createEdge("welcome", "switch-vendas", "btn-vendas"),
      createEdge("welcome", "switch-suporte", "btn-suporte"),
      createEdge("welcome", "switch-financeiro", "btn-financeiro"),
    ],
  },
  // ============================================================
  // SDR CARTÃO ATENDE - 5 Fluxos de Cadência
  // ============================================================
  {
    id: "sdr_cartao_atende_lead",
    name: "SDR Cartão Atende - Lead (Meta Ads)",
    description: "Qualificação de lead novo via Meta Ads: template oficial, captura cidade/idade, individual vs família, preventivo vs urgência, transfere para IA SDR",
    category: "vendas",
    icon: Heart,
    nodes: [
      {
        id: "trigger",
        type: "custom",
        position: { x: 300, y: 0 },
        data: { label: "Gatilho", nodeType: "trigger" },
      },
      {
        id: "template_oficial",
        type: "custom",
        position: { x: 300, y: 100 },
        data: {
          label: "Template Oficial",
          nodeType: "message",
          message: "Oi, {{contact.name}}! Tudo bem? 😊\n\nVi que você demonstrou interesse em cuidar da sua saúde com mais economia.\n\nSou da *Dr Atende* e quero te apresentar o *Cartão Atende* 💳\n\n✅ 16 especialidades médicas SEM custo de consulta\n✅ 58 exames laboratoriais GRATUITOS\n✅ Odontologia completa inclusa\n✅ ZERO carência - uso IMEDIATO\n✅ Sem coparticipação\n\nTudo isso por menos de R$2,00 por dia! 🤩\n\nPosso te contar mais detalhes?",
        },
      },
      {
        id: "captura_cidade_idade",
        type: "custom",
        position: { x: 300, y: 250 },
        data: {
          label: "Capturar Cidade/Idade",
          nodeType: "input_capture",
          inputCapture: {
            question: "Para eu personalizar melhor as informações, me conta: *qual a sua cidade e a sua idade?* 🏙️",
            variableName: "cidade_idade",
            validationType: "text",
            validationMessage: "Por favor, me informe sua cidade e idade para que eu possa te ajudar melhor.",
            timeout: 300,
          },
        },
      },
      {
        id: "individual_familia",
        type: "custom",
        position: { x: 300, y: 400 },
        data: {
          label: "Individual ou Família?",
          nodeType: "message_buttons",
          message: "Legal, {{captured.cidade_idade}}! 😄\n\nVocê busca o Cartão Atende para *você* ou para *toda a família*?",
          buttons: [
            { id: "btn-individual", text: "👤 Para mim", type: "reply" },
            { id: "btn-familia", text: "👨‍👩‍👧‍👦 Para a família", type: "reply" },
          ],
        },
      },
      {
        id: "set_tipo_plano",
        type: "custom",
        position: { x: 300, y: 550 },
        data: {
          label: "Salvar Tipo Plano",
          nodeType: "set_variable",
          variable: { name: "tipo_plano", value: "{{last_button_text}}", scope: "conversation" },
        },
      },
      {
        id: "preventivo_urgencia",
        type: "custom",
        position: { x: 300, y: 680 },
        data: {
          label: "Preventivo ou Urgência?",
          nodeType: "message_buttons",
          message: "Entendi! E me conta: você está buscando *cuidar da saúde de forma preventiva* ou tem alguma *necessidade mais imediata*? 🩺",
          buttons: [
            { id: "btn-preventivo", text: "🛡️ Preventivo", type: "reply" },
            { id: "btn-urgencia", text: "🏥 Necessidade imediata", type: "reply" },
          ],
        },
      },
      {
        id: "set_necessidade",
        type: "custom",
        position: { x: 300, y: 830 },
        data: {
          label: "Salvar Necessidade",
          nodeType: "set_variable",
          variable: { name: "necessidade", value: "{{last_button_text}}", scope: "conversation" },
        },
      },
      {
        id: "transferir_ia",
        type: "custom",
        position: { x: 300, y: 960 },
        data: {
          label: "IA SDR Assume",
          nodeType: "ai_response",
          prompt: "O lead informou cidade/idade: {{captured.cidade_idade}}, tipo de plano: {{tipo_plano}}, necessidade: {{necessidade}}. Continue a conversa de vendas consultiva do Cartão Atende conforme o treinamento de cadência.",
        },
      },
    ],
    edges: [
      createEdge("trigger", "template_oficial"),
      createEdge("template_oficial", "captura_cidade_idade"),
      createEdge("captura_cidade_idade", "individual_familia"),
      createEdge("individual_familia", "set_tipo_plano"),
      createEdge("set_tipo_plano", "preventivo_urgencia"),
      createEdge("preventivo_urgencia", "set_necessidade"),
      createEdge("set_necessidade", "transferir_ia"),
    ],
  },
  {
    id: "sdr_cartao_atende_cisamusep",
    name: "SDR Cartão Atende - CISAMUSEP",
    description: "Cadência para pacientes atendidos via CISAMUSEP: apresenta benefícios do Cartão vs consórcio e transfere para IA SDR",
    category: "vendas",
    icon: Heart,
    nodes: [
      {
        id: "trigger",
        type: "custom",
        position: { x: 300, y: 0 },
        data: { label: "Gatilho", nodeType: "trigger" },
      },
      {
        id: "template_cisamusep",
        type: "custom",
        position: { x: 300, y: 100 },
        data: {
          label: "Template CISAMUSEP",
          nodeType: "message",
          message: "Oi, {{contact.name}}! Tudo bem? 😊\n\nVi que você esteve em atendimento na *Dr Atende* pelo *CISAMUSEP*.\n\nEspero que tenha gostado do nosso atendimento! Sabia que você pode ter acesso a *16 especialidades médicas, 58 exames e odontologia completa* SEM depender do consórcio?\n\nCom o *Cartão Atende* você agenda quando quiser, sem fila de espera! 💳\n\nPosso te explicar como funciona?",
        },
      },
      {
        id: "interesse_cisamusep",
        type: "custom",
        position: { x: 300, y: 280 },
        data: {
          label: "Interesse?",
          nodeType: "message_buttons",
          message: "O que achou da ideia de ter acesso direto, sem depender do CISAMUSEP? 🤔",
          buttons: [
            { id: "btn-quero", text: "✅ Quero saber mais", type: "reply" },
            { id: "btn-tenho-plano", text: "🏥 Já tenho plano", type: "reply" },
            { id: "btn-nao", text: "❌ Não tenho interesse", type: "reply" },
          ],
        },
      },
      {
        id: "transferir_ia",
        type: "custom",
        position: { x: 300, y: 450 },
        data: {
          label: "IA SDR Assume",
          nodeType: "ai_response",
          prompt: "Paciente CISAMUSEP respondeu ao interesse. Contexto: atendido pelo consórcio público, já conhece a clínica. Use as objeções específicas de CISAMUSEP do treinamento. Destaque a autonomia de agendar sem depender do consórcio, zero carência e custo menor que R$2/dia.",
        },
      },
    ],
    edges: [
      createEdge("trigger", "template_cisamusep"),
      createEdge("template_cisamusep", "interesse_cisamusep"),
      createEdge("interesse_cisamusep", "transferir_ia", "btn-quero"),
      createEdge("interesse_cisamusep", "transferir_ia", "btn-tenho-plano"),
      createEdge("interesse_cisamusep", "transferir_ia", "btn-nao"),
    ],
  },
  {
    id: "sdr_cartao_atende_particular",
    name: "SDR Cartão Atende - Particular",
    description: "Cadência para pacientes que pagaram consulta particular: mostra economia com o Cartão e transfere para IA SDR",
    category: "vendas",
    icon: Heart,
    nodes: [
      {
        id: "trigger",
        type: "custom",
        position: { x: 300, y: 0 },
        data: { label: "Gatilho", nodeType: "trigger" },
      },
      {
        id: "template_particular",
        type: "custom",
        position: { x: 300, y: 100 },
        data: {
          label: "Template Particular",
          nodeType: "message",
          message: "Oi, {{contact.name}}! Tudo bem? 😊\n\nVi que você esteve em atendimento *particular* na *Dr Atende*.\n\nSabia que com o *Cartão Atende* por apenas *R$49,50/mês* você teria acesso a *16 especialidades SEM pagar consulta*? 💳\n\nAlém disso, inclui *58 exames laboratoriais gratuitos* e *odontologia completa*!\n\nSó na consulta que você fez, já teria economizado. Quer saber como funciona?",
        },
      },
      {
        id: "interesse_particular",
        type: "custom",
        position: { x: 300, y: 300 },
        data: {
          label: "Economia?",
          nodeType: "message_buttons",
          message: "Pensando em *economia*, o que faz mais sentido pra você? 💰",
          buttons: [
            { id: "btn-economia", text: "💰 Quero economizar", type: "reply" },
            { id: "btn-cobertura", text: "📋 Ver coberturas", type: "reply" },
            { id: "btn-nao", text: "❌ Não agora", type: "reply" },
          ],
        },
      },
      {
        id: "transferir_ia",
        type: "custom",
        position: { x: 300, y: 470 },
        data: {
          label: "IA SDR Assume",
          nodeType: "ai_response",
          prompt: "Paciente particular respondeu sobre economia. Contexto: já pagou consulta avulsa na clínica. Use objeções de Particular do treinamento. Foque na comparação de custo: consulta avulsa vs R$49,50/mês com tudo incluso. Destaque que zero carência permite uso imediato.",
        },
      },
    ],
    edges: [
      createEdge("trigger", "template_particular"),
      createEdge("template_particular", "interesse_particular"),
      createEdge("interesse_particular", "transferir_ia", "btn-economia"),
      createEdge("interesse_particular", "transferir_ia", "btn-cobertura"),
      createEdge("interesse_particular", "transferir_ia", "btn-nao"),
    ],
  },
  {
    id: "sdr_cartao_atende_vencer",
    name: "SDR Cartão Atende - À Vencer",
    description: "Cadência para clientes com contrato próximo do vencimento: incentiva renovação com clareamento e transfere para IA SDR",
    category: "vendas",
    icon: Heart,
    nodes: [
      {
        id: "trigger",
        type: "custom",
        position: { x: 300, y: 0 },
        data: { label: "Gatilho", nodeType: "trigger" },
      },
      {
        id: "template_vencer",
        type: "custom",
        position: { x: 300, y: 100 },
        data: {
          label: "Template Renovação",
          nodeType: "message",
          message: "Oi, {{contact.name}}! Tudo bem? 😊\n\nVi que seu contrato do *Cartão Atende* vence em breve e tenho uma *notícia boa* pra você! 🎉\n\nAo renovar agora, você garante:\n✅ Mesmo valor SEM reajuste por mais 24 meses\n✅ Todas as coberturas que você já usa\n✅ *BÔNUS: Clareamento dental GRÁTIS!* 🦷✨\n\nO que acha de renovar e ainda ganhar o clareamento?",
        },
      },
      {
        id: "interesse_vencer",
        type: "custom",
        position: { x: 300, y: 320 },
        data: {
          label: "Renovar?",
          nodeType: "message_buttons",
          message: "Posso te ajudar com a renovação agora? 📝",
          buttons: [
            { id: "btn-renovar", text: "✅ Quero renovar", type: "reply" },
            { id: "btn-duvida", text: "❓ Tenho dúvidas", type: "reply" },
            { id: "btn-pensar", text: "🤔 Vou pensar", type: "reply" },
          ],
        },
      },
      {
        id: "transferir_ia",
        type: "custom",
        position: { x: 300, y: 490 },
        data: {
          label: "IA SDR Assume",
          nodeType: "ai_response",
          prompt: "Cliente ativo com contrato próximo do vencimento. Contexto: já usa o Cartão, conhece os benefícios. Use objeções de Renovação do treinamento. Destaque o bônus do clareamento dental gratuito na renovação e o congelamento do valor por mais 24 meses.",
        },
      },
    ],
    edges: [
      createEdge("trigger", "template_vencer"),
      createEdge("template_vencer", "interesse_vencer"),
      createEdge("interesse_vencer", "transferir_ia", "btn-renovar"),
      createEdge("interesse_vencer", "transferir_ia", "btn-duvida"),
      createEdge("interesse_vencer", "transferir_ia", "btn-pensar"),
    ],
  },
  {
    id: "sdr_cartao_atende_vencidos",
    name: "SDR Cartão Atende - Vencidos",
    description: "Cadência para ex-clientes com contrato vencido: reativação com benefícios e transfere para IA SDR",
    category: "vendas",
    icon: Heart,
    nodes: [
      {
        id: "trigger",
        type: "custom",
        position: { x: 300, y: 0 },
        data: { label: "Gatilho", nodeType: "trigger" },
      },
      {
        id: "template_vencidos",
        type: "custom",
        position: { x: 300, y: 100 },
        data: {
          label: "Template Reativação",
          nodeType: "message",
          message: "Oi, {{contact.name}}! Tudo bem? 😊\n\nEstava revisando nossos registros e vi que seu contrato do *Cartão Atende* encerrou há um tempo.\n\nSentimos sua falta! 💙\n\nDesde então, *ampliamos nossas coberturas*:\n✅ Agora são 16 especialidades (antes eram menos)\n✅ 58 exames laboratoriais gratuitos\n✅ Odontologia completa inclusa\n✅ Zero carência na reativação!\n\nQuer voltar a cuidar da saúde com a gente?",
        },
      },
      {
        id: "interesse_vencidos",
        type: "custom",
        position: { x: 300, y: 320 },
        data: {
          label: "Reativar?",
          nodeType: "message_buttons",
          message: "Como você tem cuidado da sua saúde ultimamente? 🩺",
          buttons: [
            { id: "btn-quero-voltar", text: "✅ Quero voltar", type: "reply" },
            { id: "btn-outro-plano", text: "🏥 Tenho outro plano", type: "reply" },
            { id: "btn-nao-agora", text: "❌ Não agora", type: "reply" },
          ],
        },
      },
      {
        id: "transferir_ia",
        type: "custom",
        position: { x: 300, y: 490 },
        data: {
          label: "IA SDR Assume",
          nodeType: "ai_response",
          prompt: "Ex-cliente com contrato vencido. Contexto: já conhece a Dr Atende, usou o Cartão antes. Use objeções de Reativação do treinamento. Destaque as novas coberturas ampliadas, zero carência na reativação e pergunte como tem cuidado da saúde desde que saiu.",
        },
      },
    ],
    edges: [
      createEdge("trigger", "template_vencidos"),
      createEdge("template_vencidos", "interesse_vencidos"),
      createEdge("interesse_vencidos", "transferir_ia", "btn-quero-voltar"),
      createEdge("interesse_vencidos", "transferir_ia", "btn-outro-plano"),
      createEdge("interesse_vencidos", "transferir_ia", "btn-nao-agora"),
    ],
  },
  // ============================================================
  // SDR CARTÃO ATENDE - Fluxo Humanizado (Botão)
  // ============================================================
  {
    id: "sdr_cartao_atende_botao",
    name: "SDR Tráfego Pago - Cartão Atende (Botão)",
    description: "Fluxo humanizado acionado pelo botão do template oficial. Qualificação conversacional natural com microtransições e transferência orgânica para IA SDR",
    category: "vendas",
    icon: Heart,
    nodes: [
      {
        id: "trigger",
        type: "custom",
        position: { x: 300, y: 0 },
        data: { label: "Gatilho (Botão Template)", nodeType: "trigger" },
      },
      {
        id: "quebra_gelo",
        type: "custom",
        position: { x: 300, y: 120 },
        data: {
          label: "Quebra de Gelo",
          nodeType: "message",
          message: "Que bom que você chamou 😊\nMe conta uma coisa rápida pra eu te orientar certinho…",
        },
      },
      {
        id: "capturar_cidade",
        type: "custom",
        position: { x: 300, y: 240 },
        data: {
          label: "Capturar Cidade",
          nodeType: "input_capture",
          inputCapture: {
            question: "Você está em qual cidade?",
            variableName: "cidade",
            validationType: "text",
            validationMessage: "Me conta sua cidade pra eu ver certinho as opções pra você 😊",
            timeout: 300,
          },
        },
      },
      {
        id: "transicao_cidade",
        type: "custom",
        position: { x: 300, y: 360 },
        data: {
          label: "Transição Cidade",
          nodeType: "message",
          message: "Perfeito! Atendemos bastante gente aí 🙌",
        },
      },
      {
        id: "capturar_idade",
        type: "custom",
        position: { x: 300, y: 480 },
        data: {
          label: "Capturar Idade",
          nodeType: "input_capture",
          inputCapture: {
            question: "E você tem quantos anos?\n(é só pra eu ver as opções que fazem mais sentido pra sua faixa)",
            variableName: "idade",
            validationType: "number",
            validationMessage: "Me passa sua idade em números, por favor 😊",
            timeout: 300,
          },
        },
      },
      {
        id: "tipo_plano",
        type: "custom",
        position: { x: 300, y: 600 },
        data: {
          label: "Tipo de Plano",
          nodeType: "message_buttons",
          message: "Você está buscando algo só pra você ou pra família também?",
          buttons: [
            { id: "btn-individual", text: "Só pra mim", type: "reply" },
            { id: "btn-familia", text: "Pra família", type: "reply" },
          ],
        },
      },
      {
        id: "set_tipo_plano",
        type: "custom",
        position: { x: 300, y: 720 },
        data: {
          label: "Salvar tipo_plano",
          nodeType: "set_variable",
          variable: { name: "tipo_plano", value: "{{last_button_text}}", scope: "conversation" },
        },
      },
      {
        id: "momento",
        type: "custom",
        position: { x: 300, y: 840 },
        data: {
          label: "Momento da Decisão",
          nodeType: "message_buttons",
          message: "Hoje é mais prevenção mesmo ou você já está precisando usar em algo específico?",
          buttons: [
            { id: "btn-prevenir", text: "Quero prevenir", type: "reply" },
            { id: "btn-precisando", text: "Já preciso usar", type: "reply" },
          ],
        },
      },
      {
        id: "set_necessidade",
        type: "custom",
        position: { x: 300, y: 960 },
        data: {
          label: "Salvar necessidade",
          nodeType: "set_variable",
          variable: { name: "necessidade", value: "{{last_button_text}}", scope: "conversation" },
        },
      },
      {
        id: "foco_saude",
        type: "custom",
        position: { x: 300, y: 1080 },
        data: {
          label: "Foco de Saúde",
          nodeType: "message_buttons",
          message: "E normalmente, você costuma precisar mais de:",
          buttons: [
            { id: "btn-dentista", text: "🦷 Dentista", type: "reply" },
            { id: "btn-medico", text: "👩‍⚕️ Médico", type: "reply" },
            { id: "btn-completa", text: "🔄 Cobertura completa", type: "reply" },
          ],
        },
      },
      {
        id: "set_foco_saude",
        type: "custom",
        position: { x: 300, y: 1200 },
        data: {
          label: "Salvar foco_saude",
          nodeType: "set_variable",
          variable: { name: "foco_saude", value: "{{last_button_text}}", scope: "conversation" },
        },
      },
      {
        id: "resumo_humanizado",
        type: "custom",
        position: { x: 300, y: 1320 },
        data: {
          label: "Resumo Humanizado",
          nodeType: "message",
          message: "Perfeito, deixa eu organizar aqui 😊\nVocê é de {{captured.cidade}}, tem {{captured.idade}} anos, está buscando {{tipo_plano}} e seu foco principal é {{foco_saude}}.\n\nCom base nisso já consigo te indicar a melhor opção 👇",
        },
      },
      {
        id: "ia_sdr_assume",
        type: "custom",
        position: { x: 300, y: 1440 },
        data: {
          label: "IA SDR Assume",
          nodeType: "ai_response",
          prompt: `Você é um SDR consultivo do Cartão Atende / Dr Atende. O lead acabou de ser qualificado com as seguintes informações:

- Cidade: {{captured.cidade}}
- Idade: {{captured.idade}} anos
- Tipo de plano: {{tipo_plano}}
- Necessidade: {{necessidade}}
- Foco principal: {{foco_saude}}

INSTRUÇÕES:
1. Continue a conversa de forma NATURAL e consultiva, como se fosse um WhatsApp humano
2. Comece apresentando o benefício mais relevante com base no foco_saude do lead
3. Use prova social contextualizada com a cidade do lead
4. Faça perguntas de avanço para conduzir ao fechamento
5. Trate objeções conforme o treinamento da cadência (preço, carência, SUS, convênio empresa, etc.)
6. No fechamento, colete: Nome Completo, CPF, Data de Nascimento, Endereço, E-mail, Telefone e foto do documento
7. Tom: amigável, direto, use no máximo 1 emoji por mensagem
8. NUNCA envie blocos longos — quebre em mensagens curtas como WhatsApp real`,
        },
      },
    ],
    edges: [
      createEdge("trigger", "quebra_gelo"),
      createEdge("quebra_gelo", "capturar_cidade"),
      createEdge("capturar_cidade", "transicao_cidade"),
      createEdge("transicao_cidade", "capturar_idade"),
      createEdge("capturar_idade", "tipo_plano"),
      createEdge("tipo_plano", "set_tipo_plano"),
      createEdge("set_tipo_plano", "momento"),
      createEdge("momento", "set_necessidade"),
      createEdge("set_necessidade", "foco_saude"),
      createEdge("foco_saude", "set_foco_saude"),
      createEdge("set_foco_saude", "resumo_humanizado"),
      createEdge("resumo_humanizado", "ia_sdr_assume"),
    ],
  },
];

export const templateCategories = [
  { id: "atendimento", label: "Atendimento", color: "#10b981" },
  { id: "vendas", label: "Vendas", color: "#3b82f6" },
  { id: "suporte", label: "Suporte", color: "#f59e0b" },
];

export function getTemplatesByCategory(category: string): FlowTemplate[] {
  return flowTemplates.filter(t => t.category === category);
}

export function getTemplateById(id: string): FlowTemplate | undefined {
  return flowTemplates.find(t => t.id === id);
}
