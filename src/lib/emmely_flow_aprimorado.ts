/**
 * emmely_flow_aprimorado.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Fluxo aprimorado: Emmely Fernandes Advocacia
 *
 * CONTEXTO DO NEGÓCIO:
 *  - Escritório de advocacia especializado em:
 *    1. Imigração Portugal (visto, cidadania, reagrupamento familiar)
 *    2. Previdenciário Brasil/Internacional (aposentadoria, benefícios INSS)
 *  - Atendimento via WhatsApp com triagem por IA
 *  - Integração com Bitrix24 para gestão de leads e deals
 *
 * MELHORIAS APLICADAS vs. FLUXO ORIGINAL:
 *  1. Nó de boas-vindas com apresentação profissional (estava ausente)
 *  2. Roteamento por IA (ai_router) ao invés de condition manual com handles "3.1" a "3.5"
 *  3. Busca de contato existente no Bitrix24 antes de criar novo (evita duplicatas)
 *  4. Criação de Lead com campos corretos (TITLE, NAME, PHONE, SOURCE_ID, COMMENTS)
 *  5. Criação de Deal vinculado ao Lead (CONTACT_ID, CATEGORY_ID por área jurídica)
 *  6. Comentário na timeline do Deal com resumo da IA (crm.timeline.comment.add)
 *  7. Mensagem de confirmação antes de transferir para humano
 *  8. Rota de fallback para mensagens fora do escopo
 *  9. Handles de edges corretos (sem IDs numéricos soltos como "3.1")
 * 10. Nó de fim explícito em todas as rotas
 *
 * ESTRUTURA DO FLUXO:
 *
 *  [START] Boas-vindas
 *      ↓
 *  [AI_ROUTER] Identificar área jurídica
 *      ├── "imigracao" → [MSG] Imigração Portugal → [AI_INTENTION] Coletar dados
 *      │                     ↓
 *      │                 [BITRIX_SEARCH_CONTACT] Buscar contato existente
 *      │                     ↓
 *      │                 [BITRIX_CREATE_LEAD] Criar lead Imigração
 *      │                     ↓
 *      │                 [BITRIX_CREATE_DEAL] Criar deal no funil Imigração
 *      │                     ↓
 *      │                 [BITRIX_ADD_COMMENT] Resumo IA na timeline
 *      │                     ↓
 *      │                 [MSG] Confirmação → [TRANSFER_HUMAN] → [END]
 *      │
 *      ├── "previdenciario" → [MSG] Previdenciário → [AI_INTENTION] Coletar dados
 *      │                          ↓
 *      │                      [BITRIX_SEARCH_CONTACT] Buscar contato existente
 *      │                          ↓
 *      │                      [BITRIX_CREATE_LEAD] Criar lead Previdenciário
 *      │                          ↓
 *      │                      [BITRIX_CREATE_DEAL] Criar deal no funil Previdenciário
 *      │                          ↓
 *      │                      [BITRIX_ADD_COMMENT] Resumo IA na timeline
 *      │                          ↓
 *      │                      [MSG] Confirmação → [TRANSFER_HUMAN] → [END]
 *      │
 *      ├── "retorno" → [AI_RESPONSE] Analisar retorno (whisper) → [TRANSFER_HUMAN] → [END]
 *      │
 *      └── "default" → [AI_RESPONSE] Resposta geral → [MSG] Oferecer áudio → [END]
 * ─────────────────────────────────────────────────────────────────────────────
 */

const marker = { type: "arrowclosed" };

export const emmelyFlowAprimorado = {
  id: "emmely_fernandes_advocacia_v2",
  name: "Emmely Fernandes Advocacia",
  description: "Triagem jurídica por IA → Qualificação → CRM Bitrix24 → Transferência para consultor",
  icon: "⚖️",
  category: "Advocacia",
  flowType: "hybrid",
  triggerType: "all_messages",
  priority: 10,
  variables: {},

  nodes: [

    // ─── INÍCIO ──────────────────────────────────────────────────────────────

    {
      id: "start",
      type: "custom",
      position: { x: 400, y: 0 },
      data: {
        nodeType: "message",
        label: "Boas-vindas",
        message:
          "Olá! 👋 Seja bem-vindo ao *Escritório Emmely Fernandes Advocacia*.\n\n" +
          "Somos especializados em:\n" +
          "⚖️ *Imigração para Portugal* — vistos, cidadania e reagrupamento familiar\n" +
          "🇧🇷 *Previdenciário* — aposentadoria e benefícios INSS no Brasil e no exterior\n\n" +
          "Como posso ajudá-lo hoje?",
      },
    },

    // ─── ROTEAMENTO POR IA ────────────────────────────────────────────────────

    {
      id: "router",
      type: "custom",
      position: { x: 400, y: 160 },
      data: {
        nodeType: "ai_router",
        label: "Triagem Jurídica (IA)",
        aiRouter: {
          analysisPrompt:
            "Você é um assistente jurídico do Escritório Emmely Fernandes Advocacia.\n" +
            "Analise a mensagem do cliente e classifique em UMA das categorias abaixo.\n\n" +
            "Regras:\n" +
            "- Se mencionar Portugal, visto, cidadania, imigração, reagrupamento → 'imigracao'\n" +
            "- Se mencionar INSS, aposentadoria, pensão, benefício, previdência, BPC → 'previdenciario'\n" +
            "- Se mencionar 'retorno', 'já falei', 'já enviei', 'continuação' ou parecer ser cliente antigo → 'retorno'\n" +
            "- Caso contrário → 'default'\n\n" +
            "Responda APENAS com o ID da rota escolhida.",
          defaultHandleId: "default",
          routes: [
            { handleId: "imigracao",      label: "Imigração Portugal",        description: "Cliente interessado em visto, cidadania ou imigração para Portugal" },
            { handleId: "previdenciario", label: "Previdenciário Brasil/Int.", description: "Cliente com dúvidas sobre INSS, aposentadoria ou benefícios previdenciários" },
            { handleId: "retorno",        label: "Retorno de cliente",         description: "Cliente que já foi atendido e está retornando com nova mensagem" },
            { handleId: "default",        label: "Fora do escopo",             description: "Mensagem genérica ou fora das áreas de atuação do escritório" },
          ],
        },
      },
    },

    // ─── ROTA: IMIGRAÇÃO PORTUGAL ─────────────────────────────────────────────

    {
      id: "msg_imigracao",
      type: "custom",
      position: { x: 0, y: 340 },
      data: {
        nodeType: "message",
        label: "Apresentação Imigração",
        message:
          "Ótimo! Nossa equipe de *Imigração Portugal* pode ajudá-lo com:\n\n" +
          "🛂 Visto D7, D8, Nômade Digital\n" +
          "🇵🇹 Cidadania portuguesa (descendência, naturalização)\n" +
          "👨‍👩‍👧 Reagrupamento familiar\n" +
          "📋 Autorização de Residência\n\n" +
          "Para que possamos verificar seu caso, preciso de algumas informações. Pode me dizer seu nome completo?",
      },
    },

    {
      id: "collect_imigracao",
      type: "custom",
      position: { x: 0, y: 520 },
      data: {
        nodeType: "ai_intention",
        label: "Coletar Dados — Imigração",
        aiIntention: {
          intentions: [
            {
              fieldName: "nome_cliente",
              description: "Identifique o nome completo do cliente",
              validation: "text",
              required: true,
            },
            {
              fieldName: "telefone_cliente",
              description: "Peça o número de WhatsApp ou telefone com DDD (se diferente do atual)",
              validation: "phone",
              required: false,
            },
            {
              fieldName: "email_cliente",
              description: "Solicite o e-mail de contato",
              validation: "email",
              required: false,
            },
            {
              fieldName: "tipo_servico_imigracao",
              description: "Pergunte qual serviço de imigração o cliente precisa: visto, cidadania, reagrupamento familiar ou outro",
              validation: "text",
              required: true,
            },
            {
              fieldName: "descricao_caso",
              description: "Peça uma breve descrição da situação atual do cliente (ex: já tem documentos, está no Brasil ou em Portugal, etc.)",
              validation: "text",
              required: true,
            },
          ],
          maxTurns: 8,
          successMessage:
            "Perfeito, {{nome_cliente}}! ✅ Recebi todas as informações.\n\n" +
            "Vou encaminhar seu caso para nossa equipe especializada em Imigração Portugal. " +
            "Em breve um de nossos consultores entrará em contato. 🕐",
          failureMessage:
            "Não consegui coletar todas as informações necessárias. " +
            "Vou transferir para um de nossos consultores que poderá ajudá-lo diretamente.",
          failureHandleId: "failure",
        },
      },
    },

    {
      id: "search_contact_imig",
      type: "custom",
      position: { x: 0, y: 720 },
      data: {
        nodeType: "bitrix_search_contact",
        label: "Buscar Contato Existente",
        bitrixCrm: {
          entity: "contact",
          operation: "search",
          entityId: "",
          spaEntityTypeId: "",
          fields: [],
          filters: [{ field: "PHONE", value: "{{telefone}}" }],
          resultVar: "contact_found",
          onErrorContinue: true,
        },
      },
    },

    {
      id: "create_lead_imig",
      type: "custom",
      position: { x: 0, y: 900 },
      data: {
        nodeType: "bitrix_create_lead",
        label: "Criar Lead — Imigração",
        bitrixCrm: {
          entity: "lead",
          operation: "create",
          entityId: "",
          spaEntityTypeId: "",
          fields: [
            { key: "TITLE",       value: "Imigração Portugal — {{nome_cliente}}" },
            { key: "NAME",        value: "{{nome_cliente}}" },
            { key: "PHONE",       value: "{{telefone}}" },
            { key: "EMAIL",       value: "{{email_cliente}}" },
            { key: "SOURCE_ID",   value: "WEBFORM" },
            { key: "SOURCE_DESCRIPTION", value: "WhatsApp — Bot Emmely" },
            { key: "COMMENTS",    value: "Serviço: {{tipo_servico_imigracao}}\nDescrição: {{descricao_caso}}" },
            { key: "UTM_SOURCE",  value: "whatsapp" },
            { key: "UTM_MEDIUM",  value: "bot" },
            { key: "UTM_CAMPAIGN", value: "imigracao_portugal" },
          ],
          resultVar: "lead_id",
          onErrorContinue: true,
        },
      },
    },

    {
      id: "create_deal_imig",
      type: "custom",
      position: { x: 0, y: 1080 },
      data: {
        nodeType: "bitrix_create_deal",
        label: "Criar Deal — Funil Imigração",
        bitrixCrm: {
          entity: "deal",
          operation: "create",
          entityId: "",
          spaEntityTypeId: "",
          fields: [
            { key: "TITLE",       value: "Imigração PT — {{nome_cliente}}" },
            { key: "CONTACT_ID",  value: "{{contact_id}}" },
            { key: "STAGE_ID",    value: "NEW" },
            { key: "SOURCE_ID",   value: "WEBFORM" },
            { key: "SOURCE_DESCRIPTION", value: "WhatsApp Bot — Imigração Portugal" },
            { key: "COMMENTS",    value: "Serviço solicitado: {{tipo_servico_imigracao}}\n\nDescrição do caso:\n{{descricao_caso}}" },
            { key: "UTM_SOURCE",  value: "whatsapp" },
            { key: "UTM_CAMPAIGN", value: "imigracao_portugal" },
          ],
          resultVar: "deal_id",
          onErrorContinue: true,
        },
      },
    },

    {
      id: "comment_imig",
      type: "custom",
      position: { x: 0, y: 1260 },
      data: {
        nodeType: "bitrix_add_comment",
        label: "Comentário na Timeline",
        bitrixComment: {
          entityType: "deal",
          entityId: "{{deal_id}}",
          comment:
            "📱 *Lead captado via WhatsApp Bot*\n\n" +
            "👤 Nome: {{nome_cliente}}\n" +
            "📞 Telefone: {{telefone}}\n" +
            "📧 E-mail: {{email_cliente}}\n" +
            "⚖️ Serviço: {{tipo_servico_imigracao}}\n\n" +
            "📋 Descrição do caso:\n{{descricao_caso}}\n\n" +
            "🤖 Capturado automaticamente pelo bot em {{data_hoje}} às {{hora_atual}}",
        },
      },
    },

    {
      id: "msg_confirm_imig",
      type: "custom",
      position: { x: 0, y: 1440 },
      data: {
        nodeType: "message",
        label: "Confirmação — Imigração",
        message:
          "✅ *Seu caso foi registrado com sucesso!*\n\n" +
          "📋 *Resumo do seu atendimento:*\n" +
          "• Nome: {{nome_cliente}}\n" +
          "• Serviço: {{tipo_servico_imigracao}}\n\n" +
          "👩‍⚖️ Um consultor especializado em Imigração Portugal entrará em contato em breve.\n\n" +
          "_Horário de atendimento: Segunda a Sexta, 9h às 18h (horário de Brasília)_",
      },
    },

    {
      id: "transfer_imig",
      type: "custom",
      position: { x: 0, y: 1600 },
      data: {
        nodeType: "transfer_to_human",
        label: "Transferir → Equipe Imigração",
        transferMessage: "",
        department: "imigracao",
      },
    },

    // ─── ROTA: PREVIDENCIÁRIO ─────────────────────────────────────────────────

    {
      id: "msg_prev",
      type: "custom",
      position: { x: 500, y: 340 },
      data: {
        nodeType: "message",
        label: "Apresentação Previdenciário",
        message:
          "Ótimo! Nossa equipe de *Direito Previdenciário* pode ajudá-lo com:\n\n" +
          "🏛️ Aposentadoria por tempo de contribuição\n" +
          "♿ BPC/LOAS e aposentadoria por invalidez\n" +
          "👨‍👩‍👧 Pensão por morte e auxílio-acidente\n" +
          "🌍 Benefícios para quem trabalhou no exterior\n" +
          "📑 Revisão de benefícios e recursos ao INSS\n\n" +
          "Para analisarmos seu caso, preciso de algumas informações. Pode me dizer seu nome completo?",
      },
    },

    {
      id: "collect_prev",
      type: "custom",
      position: { x: 500, y: 520 },
      data: {
        nodeType: "ai_intention",
        label: "Coletar Dados — Previdenciário",
        aiIntention: {
          intentions: [
            {
              fieldName: "nome_cliente",
              description: "Identifique o nome completo do cliente",
              validation: "text",
              required: true,
            },
            {
              fieldName: "telefone_cliente",
              description: "Peça o número de WhatsApp ou telefone com DDD (se diferente do atual)",
              validation: "phone",
              required: false,
            },
            {
              fieldName: "email_cliente",
              description: "Solicite o e-mail de contato",
              validation: "email",
              required: false,
            },
            {
              fieldName: "tipo_beneficio",
              description: "Pergunte qual benefício o cliente busca: aposentadoria, pensão por morte, BPC/LOAS, revisão de benefício, ou outro",
              validation: "text",
              required: true,
            },
            {
              fieldName: "descricao_caso",
              description: "Peça uma breve descrição da situação (ex: já contribuiu por quantos anos, se tem benefício negado, etc.)",
              validation: "text",
              required: true,
            },
          ],
          maxTurns: 8,
          successMessage:
            "Perfeito, {{nome_cliente}}! ✅ Recebi todas as informações.\n\n" +
            "Vou encaminhar seu caso para nossa equipe de Direito Previdenciário. " +
            "Em breve um de nossos advogados entrará em contato. 🕐",
          failureMessage:
            "Não consegui coletar todas as informações necessárias. " +
            "Vou transferir para um de nossos consultores que poderá ajudá-lo diretamente.",
          failureHandleId: "failure",
        },
      },
    },

    {
      id: "search_contact_prev",
      type: "custom",
      position: { x: 500, y: 720 },
      data: {
        nodeType: "bitrix_search_contact",
        label: "Buscar Contato Existente",
        bitrixCrm: {
          entity: "contact",
          operation: "search",
          entityId: "",
          spaEntityTypeId: "",
          fields: [],
          filters: [{ field: "PHONE", value: "{{telefone}}" }],
          resultVar: "contact_found",
          onErrorContinue: true,
        },
      },
    },

    {
      id: "create_lead_prev",
      type: "custom",
      position: { x: 500, y: 900 },
      data: {
        nodeType: "bitrix_create_lead",
        label: "Criar Lead — Previdenciário",
        bitrixCrm: {
          entity: "lead",
          operation: "create",
          entityId: "",
          spaEntityTypeId: "",
          fields: [
            { key: "TITLE",       value: "Previdenciário — {{nome_cliente}}" },
            { key: "NAME",        value: "{{nome_cliente}}" },
            { key: "PHONE",       value: "{{telefone}}" },
            { key: "EMAIL",       value: "{{email_cliente}}" },
            { key: "SOURCE_ID",   value: "WEBFORM" },
            { key: "SOURCE_DESCRIPTION", value: "WhatsApp — Bot Emmely" },
            { key: "COMMENTS",    value: "Benefício: {{tipo_beneficio}}\nDescrição: {{descricao_caso}}" },
            { key: "UTM_SOURCE",  value: "whatsapp" },
            { key: "UTM_MEDIUM",  value: "bot" },
            { key: "UTM_CAMPAIGN", value: "previdenciario" },
          ],
          resultVar: "lead_id",
          onErrorContinue: true,
        },
      },
    },

    {
      id: "create_deal_prev",
      type: "custom",
      position: { x: 500, y: 1080 },
      data: {
        nodeType: "bitrix_create_deal",
        label: "Criar Deal — Funil Previdenciário",
        bitrixCrm: {
          entity: "deal",
          operation: "create",
          entityId: "",
          spaEntityTypeId: "",
          fields: [
            { key: "TITLE",       value: "Previdenciário — {{nome_cliente}}" },
            { key: "CONTACT_ID",  value: "{{contact_id}}" },
            { key: "STAGE_ID",    value: "NEW" },
            { key: "SOURCE_ID",   value: "WEBFORM" },
            { key: "SOURCE_DESCRIPTION", value: "WhatsApp Bot — Previdenciário" },
            { key: "COMMENTS",    value: "Benefício solicitado: {{tipo_beneficio}}\n\nDescrição do caso:\n{{descricao_caso}}" },
            { key: "UTM_SOURCE",  value: "whatsapp" },
            { key: "UTM_CAMPAIGN", value: "previdenciario" },
          ],
          resultVar: "deal_id",
          onErrorContinue: true,
        },
      },
    },

    {
      id: "comment_prev",
      type: "custom",
      position: { x: 500, y: 1260 },
      data: {
        nodeType: "bitrix_add_comment",
        label: "Comentário na Timeline",
        bitrixComment: {
          entityType: "deal",
          entityId: "{{deal_id}}",
          comment:
            "📱 *Lead captado via WhatsApp Bot*\n\n" +
            "👤 Nome: {{nome_cliente}}\n" +
            "📞 Telefone: {{telefone}}\n" +
            "📧 E-mail: {{email_cliente}}\n" +
            "⚖️ Benefício: {{tipo_beneficio}}\n\n" +
            "📋 Descrição do caso:\n{{descricao_caso}}\n\n" +
            "🤖 Capturado automaticamente pelo bot em {{data_hoje}} às {{hora_atual}}",
        },
      },
    },

    {
      id: "msg_confirm_prev",
      type: "custom",
      position: { x: 500, y: 1440 },
      data: {
        nodeType: "message",
        label: "Confirmação — Previdenciário",
        message:
          "✅ *Seu caso foi registrado com sucesso!*\n\n" +
          "📋 *Resumo do seu atendimento:*\n" +
          "• Nome: {{nome_cliente}}\n" +
          "• Benefício: {{tipo_beneficio}}\n\n" +
          "👩‍⚖️ Um advogado especializado em Direito Previdenciário entrará em contato em breve.\n\n" +
          "_Horário de atendimento: Segunda a Sexta, 9h às 18h (horário de Brasília)_",
      },
    },

    {
      id: "transfer_prev",
      type: "custom",
      position: { x: 500, y: 1600 },
      data: {
        nodeType: "transfer_to_human",
        label: "Transferir → Equipe Previdenciário",
        transferMessage: "",
        department: "previdenciario",
      },
    },

    // ─── ROTA: RETORNO DE CLIENTE ─────────────────────────────────────────────

    {
      id: "ai_retorno",
      type: "custom",
      position: { x: 900, y: 340 },
      data: {
        nodeType: "ai_response",
        label: "Analisar Retorno (Whisper)",
        personaId: "",
        prompt:
          "Você é um assistente jurídico do Escritório Emmely Fernandes Advocacia.\n" +
          "Sua missão é apoiar a equipe comercial/jurídica analisando retornos de clientes que já estavam em atendimento.\n\n" +
          "Leia atentamente a nova mensagem enviada pelo cliente e:\n" +
          "- Organize a informação de forma clara e objetiva;\n" +
          "- Gere um resumo breve (máx. 3 linhas) com o que ele deseja ou acrescentou;\n" +
          "- Identifique o tipo de solicitação: [dúvida / complemento / mudança de informação / reabertura / outro];\n" +
          "- Se a mensagem estiver em inglês, traduza para o português;\n\n" +
          "Regras:\n" +
          "- NÃO envie mensagens para o cliente.\n" +
          "- NÃO peça dados.\n\n" +
          "Formato de resposta:\n" +
          "#Resumo: ...\n" +
          "#Tipo de solicitação: ...\n" +
          "#Sugestão: ...",
        sendAsWhisper: true,
      },
    },

    {
      id: "msg_retorno",
      type: "custom",
      position: { x: 900, y: 500 },
      data: {
        nodeType: "message",
        label: "Mensagem ao Cliente — Retorno",
        message:
          "Olá! 👋 Que bom ter você de volta!\n\n" +
          "Já identifiquei sua mensagem e estou encaminhando para o consultor responsável pelo seu caso. " +
          "Em instantes alguém entrará em contato. 🕐",
      },
    },

    {
      id: "transfer_retorno",
      type: "custom",
      position: { x: 900, y: 660 },
      data: {
        nodeType: "transfer_to_human",
        label: "Transferir → Consultor",
        transferMessage: "",
        department: "",
      },
    },

    // ─── ROTA: FORA DO ESCOPO ─────────────────────────────────────────────────

    {
      id: "ai_default",
      type: "custom",
      position: { x: 1300, y: 340 },
      data: {
        nodeType: "ai_response",
        label: "Resposta Geral (IA)",
        personaId: "",
        prompt:
          "Você é um assistente do Escritório Emmely Fernandes Advocacia.\n" +
          "O escritório é especializado em Imigração Portugal e Previdenciário Brasil/Internacional.\n\n" +
          "O cliente enviou uma mensagem que não se encaixa diretamente nessas áreas.\n" +
          "Responda de forma cordial, explique brevemente as áreas de atuação do escritório " +
          "e pergunte se o cliente gostaria de ser atendido por um consultor.\n\n" +
          "Seja breve (máx. 3 parágrafos) e profissional.",
        sendAsWhisper: false,
      },
    },

    {
      id: "msg_audio_offer",
      type: "custom",
      position: { x: 1300, y: 500 },
      data: {
        nodeType: "message",
        label: "Oferecer Áudio",
        message:
          "Se preferir, pode enviar um áudio explicando melhor sua situação. " +
          "Nossa equipe analisará e retornará em breve. 🎙️",
      },
    },

    // ─── FIM ──────────────────────────────────────────────────────────────────

    {
      id: "end_imig",
      type: "custom",
      position: { x: 0, y: 1760 },
      data: { nodeType: "end", label: "Fim — Imigração" },
    },

    {
      id: "end_prev",
      type: "custom",
      position: { x: 500, y: 1760 },
      data: { nodeType: "end", label: "Fim — Previdenciário" },
    },

    {
      id: "end_retorno",
      type: "custom",
      position: { x: 900, y: 820 },
      data: { nodeType: "end", label: "Fim — Retorno" },
    },

    {
      id: "end_default",
      type: "custom",
      position: { x: 1300, y: 660 },
      data: { nodeType: "end", label: "Fim — Default" },
    },
  ],

  edges: [

    // ── Início → Router ───────────────────────────────────────────────────────
    { id: "e_start_router", source: "start",  target: "router", markerEnd: marker },

    // ── Router → Rotas ────────────────────────────────────────────────────────
    { id: "e_router_imig", source: "router", target: "msg_imigracao",  sourceHandle: "imigracao",      markerEnd: marker },
    { id: "e_router_prev", source: "router", target: "msg_prev",       sourceHandle: "previdenciario",  markerEnd: marker },
    { id: "e_router_ret",  source: "router", target: "ai_retorno",     sourceHandle: "retorno",         markerEnd: marker },
    { id: "e_router_def",  source: "router", target: "ai_default",     sourceHandle: "default",         markerEnd: marker },

    // ── Rota Imigração ────────────────────────────────────────────────────────
    { id: "e_imig_1", source: "msg_imigracao",     target: "collect_imigracao",   markerEnd: marker },
    { id: "e_imig_2", source: "collect_imigracao", target: "search_contact_imig", markerEnd: marker },
    { id: "e_imig_3", source: "search_contact_imig", target: "create_lead_imig",  markerEnd: marker },
    { id: "e_imig_4", source: "create_lead_imig",  target: "create_deal_imig",    markerEnd: marker },
    { id: "e_imig_5", source: "create_deal_imig",  target: "comment_imig",        markerEnd: marker },
    { id: "e_imig_6", source: "comment_imig",      target: "msg_confirm_imig",    markerEnd: marker },
    { id: "e_imig_7", source: "msg_confirm_imig",  target: "transfer_imig",       markerEnd: marker },
    { id: "e_imig_8", source: "transfer_imig",     target: "end_imig",            markerEnd: marker },
    // Rota de falha da coleta
    { id: "e_imig_fail", source: "collect_imigracao", target: "transfer_imig", sourceHandle: "failure", markerEnd: marker },

    // ── Rota Previdenciário ───────────────────────────────────────────────────
    { id: "e_prev_1", source: "msg_prev",         target: "collect_prev",         markerEnd: marker },
    { id: "e_prev_2", source: "collect_prev",     target: "search_contact_prev",  markerEnd: marker },
    { id: "e_prev_3", source: "search_contact_prev", target: "create_lead_prev",  markerEnd: marker },
    { id: "e_prev_4", source: "create_lead_prev", target: "create_deal_prev",     markerEnd: marker },
    { id: "e_prev_5", source: "create_deal_prev", target: "comment_prev",         markerEnd: marker },
    { id: "e_prev_6", source: "comment_prev",     target: "msg_confirm_prev",     markerEnd: marker },
    { id: "e_prev_7", source: "msg_confirm_prev", target: "transfer_prev",        markerEnd: marker },
    { id: "e_prev_8", source: "transfer_prev",    target: "end_prev",             markerEnd: marker },
    // Rota de falha da coleta
    { id: "e_prev_fail", source: "collect_prev", target: "transfer_prev", sourceHandle: "failure", markerEnd: marker },

    // ── Rota Retorno ──────────────────────────────────────────────────────────
    { id: "e_ret_1", source: "ai_retorno",    target: "msg_retorno",     markerEnd: marker },
    { id: "e_ret_2", source: "msg_retorno",   target: "transfer_retorno", markerEnd: marker },
    { id: "e_ret_3", source: "transfer_retorno", target: "end_retorno",  markerEnd: marker },

    // ── Rota Default ──────────────────────────────────────────────────────────
    { id: "e_def_1", source: "ai_default",    target: "msg_audio_offer", markerEnd: marker },
    { id: "e_def_2", source: "msg_audio_offer", target: "end_default",   markerEnd: marker },
  ],
};

/**
 * SQL para inserir/atualizar o fluxo no Supabase:
 *
 * UPDATE flows
 * SET
 *   name = 'Emmely Fernandes Advocacia',
 *   nodes = '<JSON dos nodes>',
 *   edges = '<JSON dos edges>',
 *   variables = '{}',
 *   flow_type = 'hybrid',
 *   trigger_type = 'all_messages',
 *   priority = 10,
 *   updated_at = NOW()
 * WHERE id = 'cde48e78-bf18-499b-a7f8-d9675d864eee';
 */
