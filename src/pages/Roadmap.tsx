import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CheckCircle2, Clock, Calendar, Rocket, Copy, Check, Plus, Trash2, ArrowUp, ArrowRight, ArrowDown, Flame } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { toast } from "sonner";

type ModuleStatus = "concluido" | "em_progresso" | "por_iniciar";
type ModulePriority = "critica" | "alta" | "media" | "baixa";

const priorityConfig: Record<ModulePriority, { label: string; icon: React.ReactNode; className: string; order: number }> = {
  critica: { label: "Crítica", icon: <Flame className="h-3 w-3" />, className: "border-destructive/60 text-destructive bg-destructive/10", order: 0 },
  alta: { label: "Alta", icon: <ArrowUp className="h-3 w-3" />, className: "border-orange-500/60 text-orange-600 bg-orange-500/10", order: 1 },
  media: { label: "Média", icon: <ArrowRight className="h-3 w-3" />, className: "border-primary/40 text-primary bg-primary/10", order: 2 },
  baixa: { label: "Baixa", icon: <ArrowDown className="h-3 w-3" />, className: "border-muted-foreground/40 text-muted-foreground bg-muted", order: 3 },
};

interface RoadmapModule {
  name: string;
  description: string;
  progress: number;
  status: ModuleStatus;
  priority?: ModulePriority;
  details?: string;
  prompt?: string;
  isCustom?: boolean;
}

interface RoadmapPhase {
  title: string;
  icon: React.ReactNode;
  modules: RoadmapModule[];
}

const STORAGE_KEY = "emmely_roadmap_custom_modules";

function loadCustomModules(): RoadmapModule[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch { return []; }
}

function saveCustomModules(modules: RoadmapModule[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(modules));
}

const defaultPhases: RoadmapPhase[] = [
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
      { name: "Integração WhatsApp/Instagram Direta", description: "Meta Graph API e WhatsApp Business API (sem intermediários)", progress: 100, status: "concluido" },
      { name: "Integração Meta Webhooks", description: "Webhooks diretos para Instagram e WhatsApp Business", progress: 100, status: "concluido" },
      { name: "Central de Integrações", description: "Gestão de credenciais dinâmicas por provedor", progress: 100, status: "concluido" },
      { name: "Central de Credenciais", description: "Edge function manage-credentials, valores mascarados", progress: 100, status: "concluido" },
      { name: "Motor IA Multi-Provedor", description: "8 provedores (Emmely AI, OpenAI, DeepSeek, Groq, Gemini, Qwen, ElevenLabs, OpenAI TTS)", progress: 100, status: "concluido" },
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
      { name: "Agente de Voz (ElevenLabs)", description: "WebRTC, transcrição em tempo real, integração com agentes IA", progress: 100, status: "concluido" },
      { name: "Documentação API Completa", description: "19 endpoints documentados com exemplos, cURL e autenticação", progress: 100, status: "concluido" },
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
        prompt: "Implementar agentes IA para automações internas do sistema. 1) Criar uma edge function 'ai-automation-agent' que executa ações do sistema usando IA. Ações suportadas: a) 'classify_lead': recebe lead_id, analisa notas e conversas, retorna ai_score (0-100) e ai_viability (viável/inviável/inconclusivo) e atualiza o lead. b) 'summarize_conversation': recebe conversation_id, gera resumo da conversa e salva nas notas do lead vinculado. c) 'suggest_next_action': recebe lead_id, analisa o estado atual e sugere próxima ação (ligar, enviar proposta, etc.). d) 'extract_lead_data': recebe conversation_id, extrai nome, telefone, email, área jurídica da conversa e atualiza/cria o lead. 2) Usar o provedor Emmely AI (google/gemini-3-flash-preview) sem necessidade de API key. 3) Na página de Leads, adicionar botão 'Classificar com IA' que chama classify_lead. 4) Na Central de Atendimento, adicionar botão 'Resumir Conversa' no painel do contacto."
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
        prompt: "Implementar cobranças automáticas. 1) Criar edge function 'payment-reminder' que: busca financial_records com status 'pendente' ou 'vencendo' e due_date próximo (3 dias, 1 dia, no dia), gera link de pagamento via payment-create, envia mensagem com link ao cliente via callbell-send (WhatsApp). 2) Criar um CRON trigger no fluxo (trigger_type='cron', trigger_value='0 9 * * *') que executa diariamente às 9h. 3) Personalizar a mensagem com: nome do cliente, valor, data de vencimento, link de pagamento. 4) Na página Financeiro, adicionar botão 'Enviar Cobrança' manual por parcela. 5) Registar cada envio na tabela messages vinculada à conversa do cliente. 6) Dashboard: card com total de cobranças enviadas no mês."
      },
      { name: "WhatsApp Templates (HSM)", description: "Templates oficiais para mensagens proativas", progress: 0, status: "por_iniciar",
        details: "Gestão de templates HSM do WhatsApp Business para envio de mensagens proativas (notificações, cobranças, confirmações).",
        prompt: "Implementar gestão de templates HSM do WhatsApp Business. 1) Criar tabela 'whatsapp_templates' com: id, name, language, category (MARKETING/UTILITY/AUTHENTICATION), status (PENDING/APPROVED/REJECTED), components (jsonb - header, body, footer, buttons), meta_template_id, created_at. RLS: authenticated full access. 2) Criar página /integracoes/whatsapp-templates com CRUD de templates. 3) Criar edge function 'whatsapp-template-submit' que submete o template para aprovação via Meta API (POST /{WABA_ID}/message_templates). 4) Criar edge function 'whatsapp-template-send' que envia uma mensagem usando template aprovado a um contacto. 5) Na Central de Atendimento, adicionar botão 'Enviar Template' que abre selector de templates com preview e preenchimento de variáveis."
      },
      { name: "Webchat Widget Embeddable", description: "Widget de chat para websites com customização", progress: 0, status: "por_iniciar",
        details: "Widget de chat embeddable que pode ser instalado em qualquer website para atendimento via Emmely AI.",
        prompt: "Implementar widget de webchat embeddable. 1) Criar componente WebchatWidget.tsx standalone (React) com: botão flutuante, janela de chat expansível, input de mensagem, lista de mensagens, indicador de digitação. 2) Criar edge function 'webchat-init' que cria uma conversa (channel='webchat') e retorna conversation_id + token. 3) Criar edge function 'webchat-message' que recebe mensagens do widget, salva em messages, e dispara a resposta do agente IA. 4) Usar SSE (Server-Sent Events) ou polling para receber respostas em tempo real. 5) Gerar snippet de embed: <script src='https://emmely.app/widget.js' data-key='...'></script>. 6) Customização via data attributes: cor primária, posição, mensagem de boas-vindas, avatar. 7) Página de configuração em /integracoes/webchat com preview e código de embed."
      },
      { name: "Assinatura Digital de Contratos", description: "Assinatura eletrónica com validade jurídica", progress: 0, status: "por_iniciar",
        details: "Sistema de assinatura digital de contratos com captura de IP, timestamp e dados do signatário para validade jurídica.",
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

const statusConfig: Record<ModuleStatus, { label: string; variant: "default" | "secondary" | "outline"; className: string }> = {
  concluido: { label: "Concluído", variant: "default", className: "bg-success text-success-foreground" },
  em_progresso: { label: "Em progresso", variant: "default", className: "bg-primary text-primary-foreground" },
  por_iniciar: { label: "Por iniciar", variant: "secondary", className: "" },
};

const phaseOptions: { value: string; label: string }[] = [
  { value: "✅ Concluído", label: "✅ Concluído" },
  { value: "🔧 Em Progresso", label: "🔧 Em Progresso" },
  { value: "📅 Próximas Etapas", label: "📅 Próximas Etapas" },
];

export default function RoadmapPage() {
  const [selectedModule, setSelectedModule] = useState<RoadmapModule | null>(null);
  const [copied, setCopied] = useState(false);
  const [customModules, setCustomModules] = useState<(RoadmapModule & { phase: string })[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newModule, setNewModule] = useState({
    name: "",
    description: "",
    details: "",
    prompt: "",
    status: "por_iniciar" as ModuleStatus,
    priority: "media" as ModulePriority,
    progress: 0,
    phase: "📅 Próximas Etapas",
  });

  const saveAndSetCustom = (modules: (RoadmapModule & { phase: string })[]) => {
    setCustomModules(modules);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(modules));
  };

  // Merge default phases with custom modules
  const phases: RoadmapPhase[] = defaultPhases.map((phase) => ({
    ...phase,
    modules: [
      ...phase.modules,
      ...customModules
        .filter((m) => m.phase === phase.title)
        .map(({ phase: _, ...mod }) => ({ ...mod, isCustom: true })),
    ],
  }));

  const allModules = phases.flatMap((p) => p.modules);
  const overallProgress = Math.round(
    allModules.reduce((sum, m) => sum + m.progress, 0) / allModules.length
  );

  const copyPrompt = (prompt: string) => {
    navigator.clipboard.writeText(prompt);
    setCopied(true);
    toast.success("Prompt copiado! Cole no chat para implementar.");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAddModule = () => {
    if (!newModule.name.trim()) {
      toast.error("O nome do módulo é obrigatório.");
      return;
    }
    const entry = {
      ...newModule,
      isCustom: true,
    };
    saveAndSetCustom([...customModules, entry]);
    setShowAddDialog(false);
    setNewModule({ name: "", description: "", details: "", prompt: "", status: "por_iniciar", priority: "media", progress: 0, phase: "📅 Próximas Etapas" });
    toast.success(`Módulo "${entry.name}" adicionado ao roadmap.`);
  };

  const handleDeleteModule = (moduleName: string) => {
    saveAndSetCustom(customModules.filter((m) => m.name !== moduleName));
    setSelectedModule(null);
    toast.success("Módulo removido do roadmap.");
  };

  return (
    <div className="space-y-8">
      <PageHeader title="Roadmap" description="Progresso de desenvolvimento do Emmely Cloud — clique num módulo para ver detalhes e copiar o prompt">
        <Button onClick={() => setShowAddDialog(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Módulo
        </Button>
      </PageHeader>

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
                  className={`transition-shadow ${hasPrompt || mod.isCustom ? "hover:shadow-md cursor-pointer hover:ring-1 hover:ring-primary/30" : "hover:shadow-sm"}`}
                  onClick={() => (hasPrompt || mod.isCustom) && setSelectedModule(mod)}
                >
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-semibold text-foreground leading-tight">{mod.name}</span>
                      <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                        {mod.priority && priorityConfig[mod.priority] && (
                          <Badge variant="outline" className={`text-[10px] gap-0.5 ${priorityConfig[mod.priority].className}`}>
                            {priorityConfig[mod.priority].icon}
                            {priorityConfig[mod.priority].label}
                          </Badge>
                        )}
                        {mod.isCustom && (
                          <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">Personalizado</Badge>
                        )}
                        <Badge variant={cfg.variant} className={`text-[10px] ${cfg.className}`}>
                          {cfg.label}
                        </Badge>
                      </div>
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
                  {selectedModule.isCustom && (
                    <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">Personalizado</Badge>
                  )}
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
                    💡 Copie o prompt acima e cole diretamente no chat para implementar esta funcionalidade.
                  </p>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <Progress value={selectedModule.progress} className="h-2 flex-1" />
                <span className="text-xs font-medium text-muted-foreground">{selectedModule.progress}%</span>
              </div>

              {selectedModule.isCustom && (
                <div className="pt-2 border-t">
                  <Button
                    variant="destructive"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => handleDeleteModule(selectedModule.name)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remover Módulo
                  </Button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Module Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo Módulo</DialogTitle>
            <DialogDescription>Adicione um novo módulo ao roadmap de desenvolvimento.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mod-name">Nome *</Label>
              <Input id="mod-name" placeholder="Ex: Integração Slack" value={newModule.name} onChange={(e) => setNewModule((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mod-desc">Descrição curta</Label>
              <Input id="mod-desc" placeholder="Ex: Notificações e comandos via Slack" value={newModule.description} onChange={(e) => setNewModule((p) => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fase</Label>
                <Select value={newModule.phase} onValueChange={(v) => setNewModule((p) => ({ ...p, phase: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {phaseOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Estado</Label>
                <Select value={newModule.status} onValueChange={(v) => setNewModule((p) => ({ ...p, status: v as ModuleStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="por_iniciar">Por iniciar</SelectItem>
                    <SelectItem value="em_progresso">Em progresso</SelectItem>
                    <SelectItem value="concluido">Concluído</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Prioridade</Label>
              <Select value={newModule.priority} onValueChange={(v) => setNewModule((p) => ({ ...p, priority: v as ModulePriority }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="critica">🔥 Crítica</SelectItem>
                  <SelectItem value="alta">🔴 Alta</SelectItem>
                  <SelectItem value="media">🟡 Média</SelectItem>
                  <SelectItem value="baixa">🟢 Baixa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="mod-progress">Progresso (%)</Label>
              <Input id="mod-progress" type="number" min={0} max={100} value={newModule.progress} onChange={(e) => setNewModule((p) => ({ ...p, progress: Number(e.target.value) }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mod-details">Detalhes (opcional)</Label>
              <Textarea id="mod-details" placeholder="Descrição detalhada do módulo..." value={newModule.details} onChange={(e) => setNewModule((p) => ({ ...p, details: e.target.value }))} rows={3} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mod-prompt">Prompt de implementação (opcional)</Label>
              <Textarea id="mod-prompt" placeholder="Prompt técnico para implementar este módulo..." value={newModule.prompt} onChange={(e) => setNewModule((p) => ({ ...p, prompt: e.target.value }))} rows={4} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancelar</Button>
              <Button onClick={handleAddModule} className="gap-2">
                <Plus className="h-4 w-4" />
                Adicionar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
