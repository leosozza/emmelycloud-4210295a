-- Biblioteca reutilizável de skills
CREATE TABLE public.skill_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  vertical text NOT NULL,
  description text,
  intent_keywords text[] NOT NULL DEFAULT '{}',
  intent_description text,
  prompt_fragment text NOT NULL DEFAULT '',
  allowed_tools text[] NOT NULL DEFAULT '{}',
  required_knowledge_collection_ids uuid[] DEFAULT '{}',
  output_schema jsonb,
  is_global boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_skill_definitions_active ON public.skill_definitions(is_active) WHERE is_active = true;
CREATE INDEX idx_skill_definitions_keywords ON public.skill_definitions USING GIN(intent_keywords);

ALTER TABLE public.skill_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read skill_definitions"
  ON public.skill_definitions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage skill_definitions"
  ON public.skill_definitions FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Service role full access skill_definitions"
  ON public.skill_definitions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER trg_skill_definitions_updated
  BEFORE UPDATE ON public.skill_definitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Vínculo agente <-> skill
CREATE TABLE public.agent_skill_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  skill_definition_id uuid NOT NULL REFERENCES public.skill_definitions(id) ON DELETE CASCADE,
  priority integer NOT NULL DEFAULT 100,
  is_enabled boolean NOT NULL DEFAULT true,
  config_overrides jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(agent_id, skill_definition_id)
);

CREATE INDEX idx_agent_skill_links_agent ON public.agent_skill_links(agent_id) WHERE is_enabled = true;

ALTER TABLE public.agent_skill_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read agent_skill_links"
  ON public.agent_skill_links FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage agent_skill_links"
  ON public.agent_skill_links FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "Service role full access agent_skill_links"
  ON public.agent_skill_links FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Seed de skills iniciais (verticais reais Emmely)
INSERT INTO public.skill_definitions (slug, name, vertical, description, intent_keywords, intent_description, prompt_fragment, allowed_tools) VALUES

('triagem_juridica', 'Triagem Jurídica', 'legal_triage',
 'Classifica área jurídica e viabilidade do caso',
 ARRAY['caso','problema','situação','ajuda jurídica','preciso de advogado','dúvida jurídica','questão legal'],
 'Cliente apresenta problema jurídico ainda não classificado',
 E'Você está em modo TRIAGEM JURÍDICA. Sua tarefa:\n1. Identificar a área do direito (família, trabalho, civil, criminal, consumidor, imobiliário).\n2. Avaliar urgência (alta/média/baixa) e viabilidade preliminar.\n3. Coletar 3 factos mínimos: o que aconteceu, quando, valor/impacto envolvido.\n4. NÃO dê parecer jurídico definitivo — encaminhe para o especialista correcto.',
 ARRAY['crm','search_knowledge']),

('direito_familia', 'Direito de Família', 'legal_family',
 'Especialista em divórcio, pensão, guarda e partilhas',
 ARRAY['divórcio','divorcio','pensão','pensao','guarda','filhos','partilha','casamento','separação','separacao','alimentos'],
 'Cliente trata de questão de família/sucessões',
 E'Você é especialista em DIREITO DE FAMÍLIA pt-PT/pt-BR. Foque em:\n- Tipos de divórcio (mútuo consentimento vs litigioso) e prazos.\n- Pensão de alimentos (cálculo proporcional aos rendimentos).\n- Regulação de responsabilidades parentais.\n- Partilha de bens (comunhão geral, adquiridos, separação).\nUse tom empático. Se cliente menciona violência, escale prioridade alta imediatamente.',
 ARRAY['crm','search_knowledge','services']),

('direito_trabalho', 'Direito do Trabalho', 'legal_labor',
 'Especialista em rescisão, FGTS, horas extras, assédio',
 ARRAY['demissão','demissao','despedimento','rescisão','rescisao','fgts','horas extras','assédio','assedio','salário','salario','contrato de trabalho','indemnização','indemnizacao'],
 'Cliente trata de questão laboral',
 E'Você é especialista em DIREITO DO TRABALHO. Avalie:\n- Tipo de rescisão (sem justa causa, justa causa, acordo, pedido de demissão).\n- Verbas devidas (aviso prévio, férias proporcionais, 13º, FGTS+40%, seguro-desemprego).\n- Prazo prescricional (2 anos PT / 5 anos BR).\nPergunte sempre: data de admissão, data de saída, último salário, tipo de contrato.',
 ARRAY['crm','search_knowledge','services']),

('cobranca_amigavel', 'Cobrança Amigável', 'collection',
 'Negocia pagamentos em atraso com tom empático',
 ARRAY['atraso','não paguei','nao paguei','dívida','divida','parcela atrasada','não consigo pagar','nao consigo pagar','negociar','desconto','renegociação','renegociacao'],
 'Cliente em situação de inadimplência',
 E'Você está em modo COBRANÇA AMIGÁVEL. Regras inegociáveis:\n- Multa por atraso: 10% sobre o valor.\n- Juros moratórios: 1% ao mês, proporcionais aos dias.\n- NUNCA prometa desconto sem confirmar com humano.\n- Tom empático, sem ameaças.\n- Sempre ofereça gerar novo link de pagamento via /payments.\nPergunte motivo do atraso e proponha 1-2 alternativas (parcelar, prazo curto extra).',
 ARRAY['crm','payments']),

('agendamento_consulta', 'Agendamento de Consulta', 'booking',
 'Agenda consulta jurídica com advogado',
 ARRAY['agendar','marcar','consulta','reunião','reuniao','disponibilidade','horário','horario','quando posso','marcar consulta'],
 'Cliente quer agendar atendimento presencial ou online',
 E'Você está em modo AGENDAMENTO. Passos:\n1. Confirme área jurídica (use triagem_juridica antes se desconhecida).\n2. Pergunte preferência: presencial (qual cidade) ou online.\n3. Ofereça 2-3 horários da próxima semana.\n4. Use a skill webhook/booking para criar evento real no Bitrix24.\n5. Confirme com nome completo + email + telemóvel.',
 ARRAY['crm','webhook']),

('qualificacao_lead_24h', 'Qualificação Lead 24h', 'lead_qualification',
 'Resposta crítica nas primeiras 24h após captação do lead',
 ARRAY['primeiro contacto','novo lead','acabei de chegar','vim do site','vi o anúncio','vi o anuncio','quero informações','informacoes'],
 'Lead novo (<24h) ainda não qualificado — SLA crítico',
 E'Você está em modo QUALIFICAÇÃO 24H — SLA CRÍTICO.\n1. Saudação calorosa + apresentação curta (máx 2 frases).\n2. Em 3 perguntas máximo: nome completo, área de interesse, urgência.\n3. Se score alto (problema concreto + decisão imediata) → transfira para humano.\n4. Se score baixo → agende consulta gratuita inicial.\nNUNCA ultrapasse 5 mensagens sem qualificar ou escalar.',
 ARRAY['crm','services']),

('pos_venda_pagamento', 'Pós-Venda Pagamento', 'post_sale',
 'Confirma recebimento e envia comprovativo',
 ARRAY['paguei','já paguei','ja paguei','comprovativo','recibo','confirmação pagamento','confirmacao pagamento','recebeste','chegou o pagamento'],
 'Cliente confirma pagamento ou pede comprovativo',
 E'Você está em modo PÓS-VENDA PAGAMENTO.\n1. Verifique no CRM/Pagamentos se o pagamento entrou (use skill payments).\n2. Se confirmado: envie agradecimento + recibo (PDF ou link Stripe).\n3. Se pendente: explique que pode demorar até 24h e que avisa quando entrar.\n4. Nunca cobre novamente um pagamento já confirmado.',
 ARRAY['crm','payments']);
