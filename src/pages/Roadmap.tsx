import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle2, Clock, Calendar, Rocket, Copy, Check } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { toast } from "sonner";

type ModuleStatus = "concluido" | "em_progresso" | "por_iniciar";

interface RoadmapModule {
  name: string;
  description: string;
  progress: number;
  status: ModuleStatus;
  details?: string;
  prompt?: string;
}

interface RoadmapPhase {
  title: string;
  icon: React.ReactNode;
  modules: RoadmapModule[];
}

const phases: RoadmapPhase[] = [
  {
    title: "✅ Concluído",
    icon: <CheckCircle2 className="h-5 w-5 text-success" />,
    modules: [
      { name: "Design System", description: "Cores, fontes, tokens semânticos, dark/light mode", progress: 100, status: "concluido",
        details: "Sistema de design completo com tokens semânticos em HSL, suporte a dark/light mode, fontes personalizadas e componentes shadcn/ui customizados.",
        prompt: "Revisar e otimizar o design system existente: verificar consistência dos tokens semânticos em index.css e tailwind.config.ts, garantir que todos os componentes usam tokens e não cores diretas, e melhorar a acessibilidade (contraste WCAG AA)."
      },
      { name: "Layout & Navegação", description: "Sidebar colapsável, header, rotas, breadcrumbs", progress: 100, status: "concluido" },
      { name: "Autenticação & Perfis", description: "Login, registo, logout, perfil automático, auto-role admin", progress: 100, status: "concluido" },
      { name: "Roles & Segurança", description: "Admin, advogado, comercial, financeiro com RLS", progress: 100, status: "concluido" },
      { name: "Backend & BD", description: "20+ tabelas com RLS, triggers, funções DB", progress: 100, status: "concluido" },
      { name: "Internacionalização PT/BR", description: "Seletor de idioma e moeda (R$/€)", progress: 100, status: "concluido" },
      { name: "Dashboard", description: "KPIs, gráficos com dados reais, período, customizável", progress: 100, status: "concluido" },
      { name: "Funil Kanban", description: "Drag & drop leads por estágio com auto-criação de caso", progress: 100, status: "concluido" },
      { name: "Leads (CRUD completo)", description: "Formulário, ficha detalhada, lista e kanban", progress: 100, status: "concluido" },
      { name: "Casos Jurídicos", description: "CRUD com vínculo a leads e advogados", progress: 100, status: "concluido" },
      { name: "Propostas", description: "Criação, envio, aceite automático → gera contrato", progress: 100, status: "concluido" },
      { name: "Contratos", description: "Geração automática, assinatura → atualiza lead e caso", progress: 100, status: "concluido" },
      { name: "Clientes & Contactos", description: "Ficha completa, contactos múltiplos, moradas", progress: 100, status: "concluido" },
      { name: "Serviços & Tabela de Preços", description: "CRUD de serviços com valores e detalhes contratuais", progress: 100, status: "concluido" },
      { name: "SLA Automático", description: "SLA 24h nos leads com trigger automático", progress: 100, status: "concluido" },
      { name: "Central de Atendimento", description: "Chat multicanal (WA, IG, Email, Webchat)", progress: 100, status: "concluido" },
      { name: "Respostas Rápidas", description: "Templates categorizados para atendimento", progress: 100, status: "concluido" },
      { name: "Integração Callbell", description: "Webhook bidirecional, envio/receção WA e IG", progress: 100, status: "concluido" },
      { name: "Integração Instagram/Meta", description: "Webhook, envio DM, teste de conexão", progress: 100, status: "concluido" },
      { name: "Central de Integrações", description: "Gestão de credenciais dinâmicas por provedor", progress: 100, status: "concluido" },
      { name: "Central de Credenciais", description: "Edge function manage-credentials, valores mascarados", progress: 100, status: "concluido" },
      { name: "Motor IA Multi-Provedor", description: "8 provedores (Lovable, OpenAI, DeepSeek, Groq, Gemini, Qwen, ElevenLabs, OpenAI TTS)", progress: 100, status: "concluido" },
      { name: "Agentes IA (Personas)", description: "CRUD de agentes com prompt, modelo, temperatura, tipo texto/voz/hybrid", progress: 100, status: "concluido" },
      { name: "Playground IA", description: "Simulador de chat com métricas (tempo, tokens)", progress: 100, status: "concluido" },
      { name: "Base de Conhecimento (RAG)", description: "Documentos texto, URL, FAQ com auto-chunking", progress: 100, status: "concluido" },
      { name: "Upload de Ficheiros (Training)", description: "Upload TXT, MD, CSV, JSON, XML para treino", progress: 100, status: "concluido" },
      { name: "Treino por Conversas", description: "Importação de conversas por período para RAG", progress: 100, status: "concluido" },
      { name: "Vinculação Agente-Conhecimento", description: "Agentes vinculados a documentos específicos da base", progress: 100, status: "concluido" },
      { name: "Editor Visual de Fluxos", description: "ReactFlow com 8 tipos de nós (msg, condição, IA, delay, etc.)", progress: 100, status: "concluido" },
      { name: "Triggers Avançados", description: "Keyword, webhook, Bitrix24 events, timeout, CRON, tags", progress: 100, status: "concluido" },
      { name: "Nós IA Inteligentes", description: "IA-Intenção, IA-Ação, IA-Roteador nos fluxos", progress: 100, status: "concluido" },
      { name: "Templates de Fluxos", description: "Templates pré-definidos para automações comuns", progress: 100, status: "concluido" },
      { name: "Histórico de Fluxos", description: "Versionamento de alterações nos fluxos", progress: 100, status: "concluido" },
      { name: "Bitrix24 OAuth & Install", description: "Instalação OAuth, refresh automático de tokens", progress: 100, status: "concluido" },
      { name: "Bitrix24 Conector Messaging", description: "Conector oficial, canais WA/IG, mapeamento", progress: 100, status: "concluido" },
      { name: "Bitrix24 Robot Handler", description: "Robots de automação para workflows Bitrix24", progress: 100, status: "concluido" },
      { name: "Emmely Pay (Stripe + Asaas)", description: "Pagamentos unificados EUR/BRL, webhook, status", progress: 100, status: "concluido" },
      { name: "Config Gateway Pagamentos", description: "Configuração por ambiente (teste/produção)", progress: 100, status: "concluido" },
      { name: "Módulo Financeiro", description: "Parcelas, receitas, métodos de pagamento, status", progress: 100, status: "concluido" },
      { name: "SEF / Localizações AIMA", description: "Base de dados de postos e direções regionais", progress: 100, status: "concluido" },
    ],
  },
  {
    title: "🔧 Em Progresso",
    icon: <Clock className="h-5 w-5 text-primary" />,
    modules: [
      { name: "Gestão de Roles (Admin)", description: "Admin atribui/remove roles à equipa", progress: 60, status: "em_progresso",
        details: "Painel administrativo para gerir roles dos utilizadores. O admin deve poder ver todos os utilizadores registados, atribuir e remover roles (admin, advogado, comercial, financeiro). Já existe a tabela user_roles e as funções de verificação.",
        prompt: "Criar uma página /admin/roles completa para gestão de roles de utilizadores. O admin deve ver uma tabela com todos os utilizadores (da tabela profiles) com as suas roles atuais (da tabela user_roles). Deve poder adicionar ou remover roles (admin, advogado, comercial, financeiro) para cada utilizador através de checkboxes ou toggles. Incluir busca por nome/email, e feedback visual ao alterar roles. Usar os tipos existentes app_role do enum e as funções is_admin() para proteger o acesso."
      },
      { name: "Bitrix24 Sync Bidirecional", description: "Leads, deals, contactos sincronizados", progress: 40, status: "em_progresso",
        details: "Sincronização bidirecional de dados entre Emmely e Bitrix24 CRM. Quando um lead é criado/atualizado no Emmely, reflete no Bitrix24 e vice-versa. Abrange leads, deals e contactos.",
        prompt: "Implementar a sincronização bidirecional Emmely <-> Bitrix24 para leads, deals e contactos. Criar uma edge function 'bitrix24-sync' que: 1) Ao criar/atualizar um lead no Emmely, cria/atualiza o lead correspondente no Bitrix24 via REST API (crm.lead.add/update). 2) Ao receber eventos do Bitrix24 (ONCRMLEAD*, ONCRMDEAL*) via a edge function bitrix24-events existente, cria/atualiza os dados no Emmely. 3) Mapear campos: nome→TITLE, telefone→PHONE, email→EMAIL, legal_area→UF_LEGAL_AREA, funnel_stage→STATUS_ID. 4) Adicionar um campo 'bitrix24_id' na tabela leads para tracking. 5) Prevenir loops de sincronização usando um campo 'sync_source' temporário. Usar a integração Bitrix24 existente (tabela bitrix24_integrations) para tokens de acesso."
      },
      { name: "Bitrix24 Prevenção Loops", description: "Anti-loop e deduplicação de mensagens", progress: 30, status: "em_progresso",
        details: "Sistema para prevenir loops infinitos quando mensagens são enviadas/recebidas entre Emmely e Bitrix24. Inclui deduplicação por external_id e controlo de origem.",
        prompt: "Implementar sistema anti-loop para a integração Bitrix24. 1) Adicionar campo 'sync_source' (text, nullable) nas tabelas messages e leads para identificar a origem da alteração ('emmely' ou 'bitrix24'). 2) Na edge function callbell-webhook e bitrix24-events, verificar se a mensagem já existe pelo external_id antes de inserir. 3) Criar uma tabela 'sync_dedup_cache' com colunas (id, entity_type, entity_id, external_id, source, created_at) com TTL de 5 minutos para cache de deduplicação. 4) Nas edge functions de envio (bitrix24-send, callbell-send), marcar mensagens enviadas no cache para ignorar o webhook de retorno. 5) Adicionar RLS para service role na tabela de cache."
      },
      { name: "Agentes IA para Atendimento", description: "Agentes que atendem clientes nos canais (WA, IG, Webchat) com RAG e fluxos", progress: 40, status: "em_progresso",
        details: "Agentes de IA que respondem automaticamente a mensagens dos clientes nos canais de atendimento. O agente usa o system_prompt configurado, a base de conhecimento vinculada (RAG), e pode executar fluxos de automação. O agente default é ativado automaticamente em novas conversas.",
        prompt: "Implementar agentes IA para atendimento automático de clientes. 1) Criar uma edge function 'ai-auto-reply' que é chamada pelo callbell-webhook quando uma mensagem inbound é recebida. 2) A função deve: buscar o agente default (is_default=true) ou o agente vinculado à conversa, carregar os documentos de conhecimento vinculados (agent_knowledge_documents → knowledge_chunks), montar o contexto com o histórico das últimas 10 mensagens da conversa, chamar a API do provedor configurado no agente (usando a mesma lógica do ai-playground), e enviar a resposta via callbell-send. 3) Adicionar campo 'ai_enabled' (boolean, default true) na tabela conversations para permitir desativar a IA por conversa. 4) Na UI do Atendimento, adicionar toggle para ativar/desativar IA por conversa. 5) Quando um atendente humano envia uma mensagem, desativar a IA automaticamente naquela conversa. 6) Respeitar o fallback_message do agente em caso de erro."
      },
      { name: "Agentes IA para Automações", description: "Agentes internos para ações do sistema (classificar leads, criar tarefas, notificar)", progress: 20, status: "em_progresso",
        details: "Agentes de IA que executam ações internas do sistema automaticamente: classificar leads por viabilidade, extrair dados de conversas, gerar resumos, sugerir próximos passos, e disparar automações.",
        prompt: "Implementar agentes IA para automações internas do sistema. 1) Criar uma edge function 'ai-automation-agent' que executa ações do sistema usando IA. Ações suportadas: a) 'classify_lead': recebe lead_id, analisa notas e conversas, retorna ai_score (0-100) e ai_viability (viável/inviável/inconclusivo) e atualiza o lead. b) 'summarize_conversation': recebe conversation_id, gera resumo da conversa e salva nas notas do lead vinculado. c) 'suggest_next_action': recebe lead_id, analisa o estado atual e sugere próxima ação (ligar, enviar proposta, etc.). d) 'extract_lead_data': recebe conversation_id, extrai nome, telefone, email, área jurídica da conversa e atualiza/cria o lead. 2) Usar o provedor Lovable AI (google/gemini-3-flash-preview) sem necessidade de API key. 3) Na página de Leads, adicionar botão 'Classificar com IA' que chama classify_lead. 4) Na Central de Atendimento, adicionar botão 'Resumir Conversa' no painel do contacto."
      },
      { name: "Processamento PDF/DOCX", description: "Extração de texto de ficheiros binários para base de conhecimento", progress: 20, status: "em_progresso",
        details: "Edge function para extrair texto de ficheiros PDF e DOCX enviados para a base de conhecimento, gerando chunks de treino automaticamente.",
        prompt: "Criar uma edge function 'process-document' para extrair texto de ficheiros PDF e DOCX enviados ao storage bucket 'knowledge-files'. 1) A função recebe o document_id, busca o file_path na tabela knowledge_documents, faz download do ficheiro do storage bucket. 2) Para PDF: usar uma biblioteca como pdf-parse ou chamar uma API de extração. 3) Para DOCX: extrair o XML interno (document.xml) e limpar as tags para obter texto puro. 4) Após extração, fazer o chunking do texto (máximo 1000 caracteres por chunk, cortando em frases), inserir os chunks em knowledge_chunks, e atualizar o status do documento para 'ready' com o chunks_count. 5) Na página de Training, ao fazer upload de PDF/DOCX, chamar esta edge function automaticamente após o upload. 6) Mostrar indicador de progresso ('Processando...') enquanto a extração decorre."
      },
    ],
  },
  {
    title: "📅 Próximas Etapas",
    icon: <Calendar className="h-5 w-5 text-warning" />,
    modules: [
      { name: "Agente de Voz (ElevenLabs)", description: "Atender e efetuar chamadas telefónicas com IA conversacional", progress: 0, status: "por_iniciar",
        details: "Agente de voz que usa ElevenLabs Conversational AI para atender chamadas telefónicas em tempo real. O agente usa o mesmo system_prompt e base de conhecimento dos agentes de texto, mas responde por voz. Suporta WebRTC para baixa latência.",
        prompt: "Implementar agente de voz com ElevenLabs Conversational AI. 1) Instalar @elevenlabs/react. 2) Criar edge function 'elevenlabs-conversation-token' que gera um token de conversação chamando https://api.elevenlabs.io/v1/convai/conversation/token com a ELEVENLABS_API_KEY (já configurada como secret) e o agent_id do ElevenLabs. 3) Criar componente VoiceAgent.tsx usando o hook useConversation do @elevenlabs/react: botão para iniciar/parar conversa, indicador visual de status (conectado/desconectado), indicador de quem está a falar (agente/utilizador), visualização de volume com getInputVolume/getOutputVolume. 4) Adicionar página /voice-agent com selector de agente IA (filtrar por agent_type='voice' ou 'hybrid'), painel de controlo da chamada, e log de transcrições em tempo real usando onMessage. 5) Configurar clientTools para permitir ao agente executar ações: 'create_lead' (cria lead no sistema), 'search_knowledge' (busca na base de conhecimento). 6) Na página de Agentes, quando o tipo é 'voice', mostrar campo para configurar o ElevenLabs Agent ID."
      },
      { name: "Integração Telefonia VoIP", description: "SIP trunking para receber/fazer chamadas reais", progress: 0, status: "por_iniciar",
        details: "Integração com provedor VoIP (Twilio ou similar) para receber e efetuar chamadas telefónicas reais que são roteadas para o agente de voz ElevenLabs.",
        prompt: "Implementar integração VoIP para chamadas telefónicas reais. 1) Criar edge function 'voip-incoming' que recebe chamadas Twilio via webhook (TwiML), conecta a chamada ao agente de voz ElevenLabs via WebSocket streaming. 2) Criar edge function 'voip-outgoing' que inicia uma chamada para um número de telefone, conectando ao agente de voz. 3) Na Central de Integrações, adicionar secção 'Telefonia VoIP' com campos para Twilio Account SID, Auth Token, e Phone Number (usar integration_credentials). 4) Na ficha do Lead, adicionar botão 'Ligar' que inicia chamada outbound via voip-outgoing. 5) Criar tabela 'call_logs' com colunas: id, conversation_id, lead_id, direction (inbound/outbound), phone_number, duration_seconds, recording_url, transcript, status, started_at, ended_at. 6) Adicionar RLS para admins e comerciais."
      },
      { name: "Gravação & Transcrição", description: "Gravar chamadas e transcrever com ElevenLabs STT", progress: 0, status: "por_iniciar",
        details: "Gravação automática de chamadas e transcrição usando ElevenLabs Speech-to-Text (scribe_v2) para arquivo e análise posterior.",
        prompt: "Implementar gravação e transcrição de chamadas. 1) Criar edge function 'elevenlabs-transcribe' que recebe um ficheiro de áudio e usa a API ElevenLabs STT (POST https://api.elevenlabs.io/v1/speech-to-text, model_id='scribe_v2', diarize=true) para transcrever. 2) Após cada chamada VoIP, enviar a gravação para transcrição automática. 3) Salvar a transcrição na tabela call_logs (campo transcript) e opcionalmente criar um documento na base de conhecimento (knowledge_documents) com o conteúdo transcrito. 4) Na UI, adicionar player de áudio e visualização da transcrição com timestamps na ficha da chamada. 5) Criar componente RealtimeTranscription.tsx usando useScribe do @elevenlabs/react para transcrição em tempo real durante chamadas ativas, com edge function 'elevenlabs-scribe-token' para gerar tokens."
      },
      { name: "Gestão de Recebimentos", description: "Controlo de recebimentos, conciliação, relatórios", progress: 0, status: "por_iniciar",
        details: "Módulo para controlar recebimentos de pagamentos, conciliar com registos financeiros, e gerar relatórios de receitas por período, cliente e serviço.",
        prompt: "Implementar módulo de gestão de recebimentos na página /financeiro. 1) Adicionar aba 'Recebimentos' que mostra todas as payment_transactions com status 'paid', agrupadas por mês. 2) Para cada recebimento mostrar: cliente, contrato, valor, data de pagamento, gateway, método. 3) Adicionar filtros por período (data início/fim), gateway (Stripe/Asaas), status. 4) Criar cards de resumo: total recebido no mês, total pendente, total atrasado, previsão do mês. 5) Adicionar funcionalidade de conciliação: marcar manualmente transferências bancárias como recebidas (atualizar financial_records.status para 'paga' e paid_at). 6) Gráfico de receitas mensais (últimos 12 meses) usando recharts. 7) Botão de exportar CSV com os dados filtrados."
      },
      { name: "Cobranças Automáticas", description: "Envio automático de links de pagamento e lembretes", progress: 0, status: "por_iniciar",
        details: "Sistema para enviar automaticamente links de pagamento e lembretes de vencimento para clientes via WhatsApp/Email.",
        prompt: "Implementar sistema de cobranças automáticas. 1) Criar edge function 'payment-reminder' que: busca financial_records com status 'pendente' e due_date próximo (3 dias, 1 dia, no dia), gera link de pagamento via payment-create se não existir, envia mensagem ao cliente via callbell-send com o link de pagamento. 2) Criar edge function 'payment-overdue-check' que: busca parcelas vencidas (due_date < hoje e status='pendente'), atualiza status para 'atrasada', envia notificação de atraso ao cliente. 3) Na página /financeiro, adicionar botão 'Enviar Cobrança' em cada parcela pendente para envio manual. 4) Criar configuração de templates de mensagem de cobrança na tabela quick_replies com categoria 'cobranca'. 5) Na Central de Integrações, adicionar configuração de dias de antecedência para lembrete automático."
      },
      { name: "Dashboard Financeiro", description: "Faturamento, inadimplência, previsões, gráficos", progress: 0, status: "por_iniciar",
        details: "Dashboard financeiro com visão completa de faturamento, inadimplência, previsões de receita e gráficos analíticos.",
        prompt: "Criar dashboard financeiro completo na página /financeiro com aba 'Dashboard'. 1) KPIs: receita total do mês, receita acumulada do ano, taxa de inadimplência (%), valor em atraso total, ticket médio por contrato. 2) Gráficos (recharts): receita mensal (bar chart, últimos 12 meses), receita por área jurídica (pie chart), evolução da inadimplência (line chart), previsão de receita dos próximos 3 meses (baseada em parcelas futuras). 3) Tabela 'Top 10 Devedores' com nome do cliente, valor em atraso, dias de atraso. 4) Filtro de período (PeriodFilter existente). 5) Buscar dados das tabelas financial_records, contracts, proposals, cases, clients via joins. 6) Calcular previsão somando installment_value de financial_records com due_date futura e status='pendente'."
      },
      { name: "Monitor de Integrações", description: "Dashboard de saúde: gateways, Bitrix24, provedores IA, Callbell", progress: 0, status: "por_iniciar",
        details: "Dashboard centralizado para monitorar o estado de saúde de todas as integrações externas: gateways de pagamento, Bitrix24, provedores de IA e Callbell. Com indicadores visuais de status e alertas.",
        prompt: "Criar página /monitoramento com dashboard de saúde das integrações. 1) Card por integração mostrando: nome, status (online/offline/degradado), último check, latência média. Integrações a monitorar: a) Callbell: verificar via edge function 'callbell-status' existente. b) Bitrix24: verificar token válido em bitrix24_integrations (expires_at > now()). c) Stripe: verificar via API /v1/balance. d) Asaas: verificar via API /api/v3/finance/balance. e) Provedores IA: fazer health check chamando cada provedor com uma mensagem simples. 2) Criar edge function 'integration-health-check' que testa cada integração e retorna o status. 3) Tabela com os últimos 50 erros de bitrix24_debug_logs. 4) Gráfico de uptime das últimas 24h por integração. 5) Botão 'Testar Agora' para cada integração. 6) Badge de status na sidebar (verde/amarelo/vermelho) com contagem de integrações com problemas."
      },
      { name: "Alertas de Falhas", description: "Notificações automáticas quando uma integração falha", progress: 0, status: "por_iniciar",
        details: "Sistema de alertas que notifica administradores quando uma integração falha ou fica degradada.",
        prompt: "Implementar sistema de alertas de falhas de integrações. 1) Criar tabela 'integration_alerts' com: id, integration_name, alert_type (error/warning/recovery), message, details (jsonb), acknowledged_at, created_at. RLS para admins. 2) Na edge function 'integration-health-check', ao detectar falha, inserir alerta na tabela. 3) Criar componente NotificationBell.tsx no AppHeader que mostra badge com contagem de alertas não reconhecidos, e dropdown com a lista de alertas recentes. 4) Ao clicar num alerta, marcar como reconhecido (acknowledged_at = now()). 5) Opcionalmente enviar email ao admin quando há falha crítica (usando uma edge function 'send-alert-email'). 6) Na página /monitoramento, mostrar timeline de alertas com filtro por integração e tipo."
      },
      { name: "Logs & Auditoria", description: "Histórico de ações, erros e eventos de todas as integrações", progress: 0, status: "por_iniciar",
        details: "Sistema centralizado de logs e auditoria para todas as ações do sistema, integrações e erros, com busca e filtros avançados.",
        prompt: "Implementar sistema de logs e auditoria centralizado. 1) Criar tabela 'audit_logs' com: id, user_id, action (text), entity_type (text), entity_id (uuid), old_values (jsonb), new_values (jsonb), ip_address (text), created_at. RLS para admins. 2) Criar edge function 'audit-log' que insere registos de auditoria. 3) Nos principais endpoints (ai-playground, callbell-webhook, bitrix24-events, payment-create), adicionar logging automático. 4) Na página /monitoramento, adicionar aba 'Logs' com: tabela paginada de logs, filtros por ação/entidade/utilizador/período, busca por texto, exportação CSV. 5) Agregar logs existentes da bitrix24_debug_logs na mesma visualização. 6) Adicionar contagem de erros por hora nas últimas 24h (sparkline chart)."
      },
      { name: "Triagem com IA", description: "Classificação automática de leads + score de viabilidade", progress: 0, status: "por_iniciar",
        details: "Sistema de triagem automática que usa IA para classificar leads por viabilidade jurídica, urgência e score, baseado nas notas, conversas e dados do lead.",
        prompt: "Implementar triagem automática de leads com IA. 1) Criar edge function 'ai-triage' que recebe lead_id, busca todos os dados do lead (notas, conversas, área jurídica, país), monta um prompt pedindo ao LLM para classificar: ai_score (0-100), ai_viability (viável/inviável/inconclusivo), urgency (alta/média/baixa), e uma justificação. Usar Lovable AI (google/gemini-3-flash-preview). 2) Atualizar os campos ai_score, ai_viability e urgency do lead com o resultado. 3) Na página /triagem, mostrar todos os leads com funnel_stage='triagem', ordenados por ai_score (desc), com badges coloridas para viabilidade e urgência. 4) Botão 'Triar com IA' individual e 'Triar Todos' para processar em lote. 5) Na ficha do Lead, mostrar secção 'Análise IA' com o score, viabilidade, urgência e justificação. 6) Adicionar coluna 'ai_justification' (text) na tabela leads via migração."
      },
      { name: "IA Resumo de Conversas", description: "Resumo automático de chats para ficha do lead", progress: 0, status: "por_iniciar",
        details: "Gerar resumos automáticos de conversas usando IA para incluir na ficha do lead e facilitar o acompanhamento.",
        prompt: "Implementar resumo automático de conversas com IA. 1) Criar edge function 'ai-summarize-conversation' que recebe conversation_id, busca todas as mensagens da conversa, envia ao LLM (Lovable AI - google/gemini-3-flash-preview) com prompt: 'Resuma esta conversa de atendimento jurídico em 3-5 pontos principais. Identifique: assunto principal, dados do cliente mencionados, área jurídica, próximos passos sugeridos.' 2) Retornar o resumo estruturado. 3) Na Central de Atendimento (ChatPanel), adicionar botão 'Resumir' no header da conversa que chama a função e mostra o resumo num dialog. 4) Opção de salvar o resumo nas notas do lead vinculado à conversa. 5) Na ficha do Lead (LeadSheet), mostrar resumos das conversas vinculadas. 6) Adicionar campo 'ai_summary' (text) na tabela conversations via migração."
      },
      { name: "IA Análise Documental", description: "Extração inteligente de dados de documentos", progress: 0, status: "por_iniciar",
        details: "Análise inteligente de documentos enviados pelos clientes para extrair dados relevantes (nomes, datas, números de processo, etc.).",
        prompt: "Implementar análise documental com IA. 1) Criar edge function 'ai-analyze-document' que recebe document_id (da base de conhecimento), busca o conteúdo do documento, e usa IA (Lovable AI) para extrair: dados pessoais (nome, NIF, data nascimento), datas relevantes, valores monetários, referências de processos, área jurídica identificada, e resumo do documento. 2) Retornar resultado estruturado em JSON. 3) Na página /training, adicionar botão 'Analisar com IA' em cada documento que mostra os dados extraídos num dialog. 4) Opção de criar lead automaticamente com os dados extraídos. 5) Salvar a análise no campo metadata do knowledge_documents."
      },
    ],
  },
  {
    title: "🚀 Futuro",
    icon: <Rocket className="h-5 w-5 text-accent" />,
    modules: [
      { name: "Documentação API Completa", description: "Referência completa de todos os endpoints, webhooks e edge functions", progress: 0, status: "por_iniciar",
        details: "Documentação técnica completa de todas as APIs do sistema: edge functions, webhooks, esquema da base de dados, autenticação, e exemplos de integração.",
        prompt: "Criar documentação API completa do sistema Emmely Cloud. 1) Criar página /docs/api com layout de documentação (sidebar com índice, conteúdo principal). 2) Documentar cada edge function: URL, método, headers necessários, body (com exemplos JSON), respostas possíveis (200, 400, 401, 500), e exemplos curl. Edge functions a documentar: ai-playground, callbell-webhook, callbell-send, callbell-status, bitrix24-install, bitrix24-events, bitrix24-send, bitrix24-robot-handler, bitrix24-test-connection, bitrix24-connector-settings, instagram-webhook, instagram-send, instagram-publish, instagram-test-connection, manage-credentials, payment-create, payment-status, payment-webhook-stripe, payment-webhook-asaas. 3) Documentar o esquema da BD: todas as tabelas com colunas, tipos, relações FK, e políticas RLS. 4) Secção de Autenticação: como obter token, headers necessários. 5) Secção de Webhooks: payloads recebidos do Callbell, Bitrix24, Stripe, Asaas. 6) Adicionar botão de copiar em cada exemplo de código. 7) Suporte a busca na documentação."
      },
      { name: "Portal de Desenvolvedor", description: "Página com docs interativas, exemplos, SDK e playground", progress: 0, status: "por_iniciar",
        details: "Portal completo para desenvolvedores com documentação interativa, playground para testar APIs, exemplos de código e SDK.",
        prompt: "Criar portal de desenvolvedor com documentação interativa. 1) Página /developer com: aba 'API Reference' (documentação gerada), aba 'Playground' (formulário para testar endpoints com resposta em tempo real), aba 'Webhooks' (logs de webhooks recebidos em tempo real), aba 'SDK' (exemplos de código em JavaScript, Python, curl). 2) No Playground: selector de endpoint, editor de body JSON, botão enviar, visualização da resposta formatada. 3) Na aba Webhooks: streaming de eventos usando Supabase Realtime na tabela bitrix24_debug_logs. 4) Gerar API keys para acesso externo (tabela 'api_keys' com: id, name, key_hash, permissions, created_by, expires_at, last_used_at). 5) Rate limiting info por endpoint."
      },
      { name: "IA Previsão Inadimplência", description: "Score de risco financeiro baseado em histórico", progress: 0, status: "por_iniciar",
        details: "Modelo de IA para prever risco de inadimplência baseado no histórico de pagamentos, perfil do cliente e padrões comportamentais.",
        prompt: "Implementar previsão de inadimplência com IA. 1) Criar edge function 'ai-risk-score' que recebe client_id, busca histórico de pagamentos (financial_records), contratos, e perfil do cliente, e usa IA (Lovable AI) para calcular: risk_score (0-100, onde 100=alto risco), risk_factors (lista de fatores), recommendation (ação sugerida). 2) Na ficha do Cliente, mostrar badge de risco com cor (verde <30, amarelo 30-70, vermelho >70). 3) No dashboard financeiro, mostrar lista de clientes de alto risco. 4) Adicionar campo 'risk_score' (numeric) na tabela clients via migração."
      },
      { name: "IA Sugestão Honorários", description: "Valores sugeridos baseados em histórico e mercado", progress: 0, status: "por_iniciar",
        details: "IA que sugere valores de honorários baseado no histórico de propostas aceites, tipo de serviço, complexidade do caso e perfil do cliente.",
        prompt: "Implementar sugestão de honorários com IA. 1) Criar edge function 'ai-fee-suggestion' que recebe: legal_area, service_id (opcional), case_complexity (simples/médio/complexo), client_country. 2) Busca histórico de propostas aceites (proposals com status='aceita') para casos similares. 3) Usa IA para sugerir: valor_minimo, valor_sugerido, valor_maximo, justificação, e comparação com o histórico. 4) No formulário de Propostas (PropostaForm), adicionar botão 'Sugerir Valor com IA' que preenche o campo de valor automaticamente com tooltip mostrando a faixa e justificação."
      },
      { name: "IA Multi-Agente Orquestrado", description: "Routing automático entre agentes especializados", progress: 0, status: "por_iniciar",
        details: "Sistema de orquestração que roteia automaticamente conversas entre agentes especializados (cidadania, previdência, trabalhista, etc.) baseado na intenção detectada.",
        prompt: "Implementar orquestração multi-agente. 1) Criar edge function 'ai-agent-router' que recebe a mensagem do cliente e o histórico, usa IA para detectar a intenção/área jurídica, e seleciona o agente especializado mais adequado usando os routing_rules e sub_agent_ids configurados no agente principal. 2) Se nenhum sub-agente for adequado, manter no agente default. 3) Na tabela conversations, adicionar campo 'current_agent_id' para tracking. 4) Ao trocar de agente, inserir mensagem de sistema na conversa ('Transferido para agente de Cidadania'). 5) Na UI do Atendimento, mostrar qual agente está ativo na conversa com opção de trocar manualmente. 6) Configuração dos routing_rules no formulário de Agentes: condições (área jurídica, palavras-chave, idioma) → agente destino."
      },
      { name: "Bitrix24 Multi-Portal", description: "Suporte a múltiplos portais Bitrix24 simultâneos", progress: 0, status: "por_iniciar",
        details: "Suporte para conectar e gerir múltiplos portais Bitrix24 simultaneamente, com routing de mensagens por portal.",
        prompt: "Implementar suporte multi-portal Bitrix24. 1) A tabela bitrix24_integrations já suporta múltiplos registos (por member_id). 2) Adicionar selector de portal ativo na Central de Integrações. 3) Nas edge functions de Bitrix24, resolver o portal correto baseado no member_id do evento. 4) No mapeamento de canais (bitrix24_channel_mappings), filtrar por integration_id. 5) Na UI de configuração, mostrar lista de portais conectados com status de cada um. 6) Adicionar campo 'portal_name' na tabela bitrix24_integrations para identificação visual."
      },
      { name: "Bitrix24 Auto-Reparo", description: "Reconexão automática e health checks do conector", progress: 0, status: "por_iniciar",
        details: "Sistema de auto-reparo que deteta quando o conector Bitrix24 está desconectado ou com token expirado e tenta reconectar automaticamente.",
        prompt: "Implementar auto-reparo do conector Bitrix24. 1) Criar edge function 'bitrix24-health-check' que verifica: token não expirado, conector registado e ativo, endpoint acessível. 2) Se o token está expirado, tentar refresh automático usando refresh_token. 3) Se o conector está inativo, tentar re-registar. 4) Criar cron job (pg_cron ou edge function scheduled) que executa o health check a cada 15 minutos. 5) Se falhar após 3 tentativas, criar alerta na tabela integration_alerts. 6) Na página de monitoramento, mostrar histórico de health checks e reconexões."
      },
      { name: "App Marketplace Bitrix24", description: "Aplicativo publicado no marketplace oficial", progress: 0, status: "por_iniciar",
        details: "Preparar e publicar o Emmely Cloud como aplicativo oficial no marketplace do Bitrix24.",
        prompt: "Preparar o Emmely Cloud para publicação no marketplace Bitrix24. 1) Criar landing page /bitrix24 com: descrição do app, funcionalidades, screenshots, botão de instalação. 2) Implementar fluxo de instalação OAuth completo conforme requisitos do marketplace (já parcialmente implementado em bitrix24-install). 3) Criar página de configuração embutida (iframe) em /bitrix24-app (já existe Bitrix24App.tsx). 4) Adicionar suporte a desinstalação (evento ONAPPUNINSTALL). 5) Gerar documentação de integração para submissão ao marketplace. 6) Implementar sandbox/teste mode para review do Bitrix24."
      },
      { name: "PDF Propostas/Contratos", description: "Geração automática de PDFs personalizados", progress: 0, status: "por_iniciar",
        details: "Geração automática de PDFs de propostas e contratos com dados preenchidos, logo do escritório e layout profissional.",
        prompt: "Implementar geração de PDF para propostas e contratos. 1) Criar edge function 'generate-pdf' que recebe entity_type ('proposal' ou 'contract') e entity_id. 2) Buscar todos os dados relacionados (proposta/contrato + caso + lead/cliente + serviço). 3) Usar uma biblioteca como jsPDF ou html-pdf para gerar o PDF com: cabeçalho com logo e dados do escritório, dados do cliente, descrição do serviço, valores e condições de pagamento, campo para assinatura, rodapé com avisos legais. 4) Fazer upload do PDF para o storage bucket. 5) Na ficha da Proposta e do Contrato, adicionar botão 'Gerar PDF' e 'Download PDF'. 6) Usar os campos contract_intro, contract_details e budget_details da tabela services como templates."
      },
      { name: "Assinatura Digital", description: "Contratos assinados digitalmente com certificado", progress: 0, status: "por_iniciar",
        details: "Sistema de assinatura digital de contratos usando certificado digital qualificado ou assinatura simplificada por email/SMS.",
        prompt: "Implementar assinatura digital de contratos. 1) Criar fluxo de assinatura simplificada: gerar link único de assinatura para o cliente, página pública /sign/:token com visualização do contrato PDF e botão 'Assinar', capturar IP, user-agent e timestamp como prova. 2) Criar tabela 'digital_signatures' com: id, contract_id, signer_name, signer_email, signer_phone, ip_address, user_agent, signature_data (jsonb), signed_at. RLS: service role full access + authenticated read. 3) Ao assinar, atualizar contract.status='assinado' e contract.signed_at. 4) Enviar link de assinatura ao cliente via callbell-send. 5) Gerar certificado de assinatura em PDF como comprovativo. 6) Na ficha do Contrato, mostrar status da assinatura e histórico."
      },
      { name: "Relatórios Avançados", description: "Benchmarks, previsão de faturamento, exportações", progress: 0, status: "por_iniciar",
        details: "Módulo de relatórios avançados com análises de performance, benchmarks e exportação de dados.",
        prompt: "Implementar módulo de relatórios avançados na página /relatorios. 1) Relatório de Leads: funil de conversão (leads → triagem → proposta → contrato → fechado) com taxas de conversão por etapa, tempo médio em cada etapa, origem dos leads (pie chart). 2) Relatório Financeiro: receita por área jurídica, por advogado, por mês; comparação período anterior; projeção. 3) Relatório de Atendimento: volume de conversas por canal, tempo médio de resposta, conversas por agente, satisfação. 4) Relatório de Performance: leads por comercial, casos por advogado, valores por período. 5) Filtros globais: período, área jurídica, responsável. 6) Exportação CSV e PDF para cada relatório. 7) Usar recharts para gráficos interativos."
      },
      { name: "Busca Global", description: "Pesquisa unificada em todos os módulos", progress: 0, status: "por_iniciar",
        details: "Barra de pesquisa global que busca em leads, clientes, casos, contratos, conversas e documentos simultaneamente.",
        prompt: "Implementar busca global no sistema. 1) Adicionar Command Palette (Ctrl+K / Cmd+K) usando o componente cmdk já instalado. 2) Buscar simultaneamente em: leads (nome, email, telefone), clients (nome, documento), cases (título, descrição), contracts (via proposal.title), conversations (contact_name, last_message_preview), knowledge_documents (título). 3) Mostrar resultados agrupados por tipo com ícone, título e preview. 4) Ao clicar, navegar para a ficha do item. 5) Limitar a 5 resultados por tipo. 6) Adicionar atalho no AppHeader. 7) Debounce de 300ms na busca."
      },
      { name: "Notificações em Tempo Real", description: "Push notifications, alertas in-app, email", progress: 0, status: "por_iniciar",
        details: "Sistema de notificações em tempo real para novos leads, mensagens, pagamentos e alertas do sistema.",
        prompt: "Implementar sistema de notificações em tempo real. 1) Criar tabela 'notifications' com: id, user_id, type (text), title, message, entity_type, entity_id, read_at, created_at. RLS: users read own. 2) Usar Supabase Realtime (ALTER PUBLICATION supabase_realtime ADD TABLE notifications) para push em tempo real. 3) Criar componente NotificationCenter no AppHeader: ícone de sino com badge de contagem, dropdown com lista de notificações, marcar como lida ao clicar. 4) Criar triggers/funções que inserem notificações para: novo lead (notifica comerciais), nova mensagem (notifica atendente), pagamento recebido (notifica financeiro), SLA expirando (notifica responsável). 5) Toasts sonner para notificações em tempo real quando o utilizador está online."
      },
      { name: "Multi-escritórios (SaaS)", description: "Suporte multi-tenant para vários escritórios", progress: 0, status: "por_iniciar",
        details: "Transformar o Emmely Cloud em SaaS multi-tenant, permitindo que múltiplos escritórios usem a plataforma de forma isolada.",
        prompt: "Implementar suporte multi-tenant para SaaS. 1) Criar tabela 'organizations' com: id, name, slug, logo_url, settings (jsonb), plan, created_at. 2) Adicionar campo 'organization_id' em todas as tabelas principais (leads, clients, cases, etc.). 3) Atualizar todas as políticas RLS para filtrar por organization_id do utilizador autenticado. 4) Criar tabela 'organization_members' com: id, organization_id, user_id, role, invited_at, accepted_at. 5) Criar fluxo de onboarding: registo → criar organização → convidar equipa. 6) Isolar dados completamente entre organizações. 7) Página /settings/organization para configurações do escritório (nome, logo, dados fiscais). NOTA: Esta é uma alteração estrutural significativa que afeta toda a base de dados."
      },
      { name: "App Mobile (PWA)", description: "Acesso mobile progressivo com offline", progress: 0, status: "por_iniciar",
        details: "Progressive Web App com suporte offline, notificações push e instalação no dispositivo móvel.",
        prompt: "Implementar PWA (Progressive Web App). 1) Criar manifest.json com: name, short_name, icons (192x192, 512x512), start_url, display: standalone, theme_color, background_color. 2) Criar service worker para cache de assets estáticos e páginas visitadas. 3) Implementar offline-first para dados já carregados usando IndexedDB. 4) Adicionar meta tags para iOS (apple-touch-icon, apple-mobile-web-app-capable). 5) Banner de instalação customizado ('Adicionar ao ecrã inicial'). 6) Otimizar layout mobile existente para touch (tamanhos de toque mínimos 44px). 7) Push notifications via Web Push API integradas com o sistema de notificações."
      },
    ],
  },
];

const allModules = phases.flatMap((p) => p.modules);
const overallProgress = Math.round(
  allModules.reduce((sum, m) => sum + m.progress, 0) / allModules.length
);

const statusConfig: Record<ModuleStatus, { label: string; variant: "default" | "secondary" | "outline"; className: string }> = {
  concluido: { label: "Concluído", variant: "default", className: "bg-success text-success-foreground" },
  em_progresso: { label: "Em progresso", variant: "default", className: "bg-primary text-primary-foreground" },
  por_iniciar: { label: "Por iniciar", variant: "secondary", className: "" },
};

export default function RoadmapPage() {
  const [selectedModule, setSelectedModule] = useState<RoadmapModule | null>(null);
  const [copied, setCopied] = useState(false);

  const copyPrompt = (prompt: string) => {
    navigator.clipboard.writeText(prompt);
    setCopied(true);
    toast.success("Prompt copiado! Cole no chat do Lovable para implementar.");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-8">
      <PageHeader title="Roadmap" description="Progresso de desenvolvimento do Emmely Cloud — clique num módulo para ver detalhes e copiar o prompt" />

      {/* Overall progress */}
      <Card>
        <CardContent className="py-5 px-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-foreground">Progresso Geral</span>
            <span className="text-sm font-bold text-primary">{overallProgress}%</span>
          </div>
          <Progress value={overallProgress} className="h-3" />
          <div className="flex items-center justify-between mt-2">
            <p className="text-xs text-muted-foreground">
              {allModules.filter((m) => m.status === "concluido").length} de {allModules.length} módulos concluídos
            </p>
            <p className="text-xs text-muted-foreground">
              {allModules.filter((m) => m.status === "em_progresso").length} em progresso • {allModules.filter((m) => m.status === "por_iniciar").length} por iniciar
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Phases */}
      {phases.map((phase) => (
        <section key={phase.title} className="space-y-4">
          <div className="flex items-center gap-2">
            {phase.icon}
            <h2 className="text-lg font-bold text-foreground">{phase.title}</h2>
            <Badge variant="secondary" className="ml-2 text-xs">
              {phase.modules.filter((m) => m.status === "concluido").length}/{phase.modules.length}
            </Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {phase.modules.map((mod) => {
              const cfg = statusConfig[mod.status];
              const hasPrompt = !!mod.prompt;
              return (
                <Card
                  key={mod.name}
                  className={`transition-shadow ${hasPrompt ? "hover:shadow-md cursor-pointer hover:ring-1 hover:ring-primary/30" : "hover:shadow-sm"}`}
                  onClick={() => hasPrompt && setSelectedModule(mod)}
                >
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-semibold text-foreground leading-tight">{mod.name}</span>
                      <Badge variant={cfg.variant} className={`shrink-0 text-[10px] ${cfg.className}`}>
                        {cfg.label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{mod.description}</p>
                    <div className="flex items-center gap-2">
                      <Progress value={mod.progress} className="h-1.5 flex-1" />
                      <span className="text-[10px] font-medium text-muted-foreground w-8 text-right">{mod.progress}%</span>
                    </div>
                    {hasPrompt && (
                      <p className="text-[10px] text-primary font-medium">Clique para ver prompt →</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      ))}

      {/* Module Detail Dialog */}
      <Dialog open={!!selectedModule} onOpenChange={() => setSelectedModule(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {selectedModule && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <DialogTitle>{selectedModule.name}</DialogTitle>
                  <Badge variant={statusConfig[selectedModule.status].variant} className={`text-[10px] ${statusConfig[selectedModule.status].className}`}>
                    {statusConfig[selectedModule.status].label}
                  </Badge>
                </div>
                <DialogDescription>{selectedModule.description}</DialogDescription>
              </DialogHeader>

              {selectedModule.details && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-foreground">📋 Descrição</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">{selectedModule.details}</p>
                </div>
              )}

              {selectedModule.prompt && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-foreground">🤖 Prompt para Implementação</h4>
                    <Button
                      size="sm"
                      variant={copied ? "default" : "outline"}
                      onClick={() => copyPrompt(selectedModule.prompt!)}
                      className="gap-1.5"
                    >
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? "Copiado!" : "Copiar Prompt"}
                    </Button>
                  </div>
                  <div className="bg-muted rounded-lg p-4 text-sm font-mono leading-relaxed whitespace-pre-wrap border">
                    {selectedModule.prompt}
                  </div>
                  <p className="text-[11px] text-muted-foreground italic">
                    💡 Copie o prompt acima e cole diretamente no chat do Lovable para implementar esta funcionalidade.
                  </p>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <Progress value={selectedModule.progress} className="h-2 flex-1" />
                <span className="text-xs font-medium text-muted-foreground">{selectedModule.progress}%</span>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
