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
    title: "Concluído",
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
      { name: "Treino de Persona via Chat", description: "Chat natural para treinar agentes com preview/confirmar/reverter", progress: 100, status: "concluido" },
      { name: "Chatbot Toggle por Canal", description: "Ativar/desativar chatbot por canal (WA, IG) com agente selecionado", progress: 100, status: "concluido" },
      { name: "Chat IA Interno", description: "Chat com agentes IA, sessões persistentes, markdown, áudio", progress: 100, status: "concluido" },
      { name: "Manual do Utilizador", description: "Guia completo /manual com FAQ, quick-start, dicas", progress: 100, status: "concluido" },
      { name: "Busca Global (Command Palette)", description: "Ctrl+K pesquisa em leads, clientes, casos, conversas", progress: 100, status: "concluido" },
      { name: "Proposta Pública (Aceite Online)", description: "Link público para cliente aceitar proposta e gerar contrato", progress: 100, status: "concluido" },
      { name: "Triagem IA", description: "Classificação automática de leads com IA", progress: 100, status: "concluido" },
      { name: "Integração Callbell (Instagram)", description: "Envio/recepção de mensagens Instagram via Callbell API", progress: 100, status: "concluido" },
      { name: "Ollama Self-Hosted", description: "Provedor IA local via Ollama com webhook de URL dinâmico", progress: 100, status: "concluido" },
      { name: "Importador PowerBot", description: "Importação de fluxos de outras plataformas", progress: 100, status: "concluido" },
      { name: "Gravação de Áudio & Speech Recognition", description: "Botão de gravar áudio e reconhecimento de fala no chat", progress: 100, status: "concluido" },
      { name: "Bitrix24 Field Mapping", description: "Mapeamento visual de campos entre Emmely e Bitrix24", progress: 100, status: "concluido" },
      { name: "Dashboard Customizável", description: "Arrastar/reorganizar widgets do dashboard", progress: 100, status: "concluido" },
      { name: "Bitrix24 App Embeddable", description: "Interface embeddida para uso dentro do Bitrix24", progress: 100, status: "concluido" },
      { name: "Redesenho UI (Tema Vermelho/Dourado)", description: "Novo design system com paleta vermelha/dourada e Poppins", progress: 100, status: "concluido" },
      { name: "Assinatura Digital de Contratos", description: "Assinatura eletrónica com captura de IP, selfie, geolocalização e certificado PDF", progress: 100, status: "concluido" },
      { name: "Cobranças Automáticas", description: "Envio automático de links de pagamento via WhatsApp com CRON diário e botão manual", progress: 100, status: "concluido" },
      { name: "Processamento PDF/DOCX", description: "Extração de texto de ficheiros PDF/DOCX para base de conhecimento via parse-document", progress: 100, status: "concluido" },
      { name: "Notificações em Tempo Real", description: "Alertas in-app com realtime, triggers para leads, mensagens, pagamentos e SLA", progress: 100, status: "concluido" },
      { name: "Emmely Pay Stripe (Validado)", description: "Pagamentos Stripe validados e integrados com automações de status e webhooks", progress: 100, status: "concluido" },
      { name: "Agendamentos Bitrix24", description: "Placement interativo no CRM (Deal/Lead/Contact) com calendário, slots disponíveis e criação de eventos com link de reunião online", progress: 100, status: "concluido" },
    ],
  },
  {
    title: "Em Progresso",
    icon: <Clock className="h-5 w-5 text-primary" />,
    modules: [
      { name: "Reestruturação Leads → Negócios", description: "Eliminar etapa Lead no Bitrix, migrar para Negócios sem perda de dados, histórico e automações", progress: 10, status: "em_progresso", priority: "critica",
        details: "Eliminar por completo a etapa de Lead no Bitrix24. Transformar a entrada inicial em processo dentro de Negócios ou estrutura mais adequada no CRM. Garantir que não haja perda de dados, histórico, observações, atividades, responsáveis ou registos já existentes.",
        prompt: "Implementar migração de Leads para Negócios no Bitrix24. 1) Criar edge function 'bitrix24-migrate-leads' que: a) Lista todos os leads via crm.lead.list, b) Para cada lead cria um deal correspondente via crm.deal.add preservando todos os campos, c) Move atividades e histórico via crm.activity.list + crm.timeline.comment.list, d) Marca o lead original como convertido. 2) Criar backup antes da migração. 3) Desativar criação de novos leads no Bitrix. 4) Atualizar robots e automações para trabalhar com deals em vez de leads."
      },
      { name: "Transformação Pipelines → SPA", description: "Migrar Nacionalidade, AR, Visto, Ação Judicial, Outros Serviços, Avulsos e Oficiosos para Smart Process", progress: 5, status: "em_progresso", priority: "critica",
        details: "Transformar 7 pipelines de Negócios em Smart Process Automation (SPA) para libertar pipelines no plano profissional (limite de 20). Itens: Nacionalidade, Autorização de Residência, Visto, Ação Judicial, Outros Serviços, Serviços Avulsos, Oficiosos. Não perder dados, histórico nem automações úteis.",
        prompt: "Implementar migração de pipelines para SPA no Bitrix24. 1) Criar edge function 'bitrix24-migrate-to-spa' que: a) Para cada pipeline, cria um SPA correspondente via crm.type.add, b) Define campos e etapas do SPA via crm.status.add, c) Migra deals existentes para o SPA via crm.item.add preservando campos e histórico, d) Move automações úteis. 2) Criar de forma incremental (uma pipeline por vez). 3) Validar dados antes e depois da migração. 4) Libertar as pipelines originais após confirmação."
      },
      { name: "Fluxos Automáticos entre Pipelines/SPA", description: "Parar movimentação manual, criar validações de avanço e padronizar progressão de processos", progress: 10, status: "em_progresso", priority: "critica",
        details: "Atualmente a equipa move cards manualmente de uma pipeline para outra. Esse processo deve ser automatizado com fluxos que incluem validações antes de permitir avanço, impedindo saltos indevidos de etapa e padronizando a progressão dos processos.",
        prompt: "Implementar fluxos automáticos entre estruturas no Bitrix24. 1) Criar robots de validação nas etapas-chave que verificam campos obrigatórios antes de permitir avanço. 2) Criar robots de transição que movem automaticamente deals/items entre pipelines/SPAs quando condições são cumpridas. 3) Bloquear movimentação manual não autorizada. 4) Criar regras de negócio na tabela business_rules para definir condições de avanço por etapa."
      },
      { name: "Gestão de Roles (Admin)", description: "Admin atribui/remove roles à equipa", progress: 60, status: "em_progresso", priority: "alta",
        details: "Painel administrativo para gerir roles dos utilizadores. O admin deve poder ver todos os utilizadores registados, atribuir e remover roles (admin, advogado, comercial, financeiro). Já existe a tabela user_roles e as funções de verificação.",
        prompt: "Criar uma página /admin/roles completa para gestão de roles de utilizadores."
      },
      { name: "Bitrix24 Sync Bidirecional", description: "Leads, deals, contactos sincronizados + eliminação de leads + transformação pipelines→SPA", progress: 40, status: "em_progresso", priority: "alta",
        details: "Sincronização bidirecional de dados entre Emmely e Bitrix24 CRM, incluindo a reestruturação de leads para negócios e a transformação de pipelines em SPA.",
        prompt: "Implementar a sincronização bidirecional Emmely <-> Bitrix24 para leads, deals e contactos, com suporte a SPAs."
      },
      { name: "Bitrix24 Prevenção Loops", description: "Anti-loop e deduplicação de mensagens", progress: 30, status: "em_progresso", priority: "alta",
        details: "Sistema para prevenir loops infinitos quando mensagens são enviadas/recebidas entre Emmely e Bitrix24.",
        prompt: "Implementar sistema anti-loop para a integração Bitrix24."
      },
      { name: "Agentes IA para Atendimento", description: "Agentes que atendem clientes nos canais com RAG, fluxos, resumos automáticos e análise de conversas", progress: 40, status: "em_progresso", priority: "alta",
        details: "Agentes de IA que respondem automaticamente a mensagens dos clientes nos canais de atendimento. Inclui também: gerar resumos automáticos de conversas, análise do conteúdo trocado no chat, e envio de informações resumidas para a equipa.",
        prompt: "Implementar agentes IA para atendimento automático com capacidades de resumo e análise de conversas."
      },
      { name: "Agentes IA para Automações", description: "Agentes internos para ações do sistema (classificar leads, criar tarefas, notificar)", progress: 20, status: "em_progresso", priority: "alta",
        details: "Agentes de IA que executam ações internas do sistema automaticamente.",
        prompt: "Implementar agentes IA para automações internas do sistema."
      },
      { name: "Envio Automatizado de Orçamento", description: "Robot + fluxo para envio padronizado de orçamento ao cliente", progress: 0, status: "em_progresso", priority: "alta",
        details: "Implementar envio automatizado de orçamento ao cliente. Verificar melhor formato de envio (PDF, link, WhatsApp). Garantir padronização do processo comercial.",
        prompt: "Criar robot Bitrix24 + edge function para envio automático de orçamento. 1) Gerar PDF/link da proposta automaticamente ao atingir etapa X do pipeline. 2) Enviar via WhatsApp/email ao cliente. 3) Registar envio e tracking de abertura."
      },
      { name: "Comprovativo de Pagamento", description: "Enviar confirmação + controle de pagamento ao cliente após pagamento confirmado", progress: 0, status: "em_progresso", priority: "alta",
        details: "Quando o pagamento for confirmado, não enviar apenas fatura. Enviar ao cliente um comprovativo de recebimento / confirmação de pagamento, incluindo controle de pagamento claro.",
        prompt: "Criar edge function 'payment-receipt' que ao detectar pagamento confirmado: 1) Gera comprovativo PDF com dados do pagamento. 2) Envia ao cliente via WhatsApp/email. 3) Inclui resumo do controle de pagamentos (parcelas pagas/pendentes)."
      },
      { name: "Relatório Clientes em Atraso", description: "Dashboard de fácil visualização de clientes com pagamentos atrasados", progress: 0, status: "em_progresso", priority: "alta",
        details: "Criar relatório de clientes com pagamentos atrasados. O relatório deve ser de fácil visualização e acompanhamento.",
        prompt: "Criar componente InadimplenciaReport na página /financeiro ou /relatorios com: lista de clientes em atraso, valor total em atraso, dias de atraso por cliente, filtros por período e área jurídica."
      },
      { name: "Regras Operacionais Automáticas", description: "Verificação periódica (60 dias), follow-ups automáticos e alertas de inactividade", progress: 0, status: "em_progresso", priority: "alta",
        details: "A cada 60 dias, verificar determinada etapa do processo. Se não houver movimentação, gerar nova ação interna (novo requerimento, follow-up ou verificação). Objetivo: reduzir esquecimento, garantir acompanhamento processual, padronizar rotinas.",
        prompt: "Criar sistema de heartbeats/regras operacionais: 1) Usar agent_heartbeats com cron_expression para verificação periódica. 2) Criar edge function que verifica deals/items sem movimentação há X dias. 3) Gerar notificações, tarefas ou follow-ups automáticos. 4) Configuração flexível por etapa e pipeline."
      },
      { name: "Correção Follow-ups de Etapas", description: "Revisar e corrigir todas as mensagens automáticas de follow-up das etapas", progress: 0, status: "em_progresso", priority: "alta",
        details: "Revisar todas as mensagens automáticas de follow-up configuradas nas etapas. Corrigir textos com erros, inconsistências ou abordagens inadequadas. Ajustar linguagem ao padrão do escritório. Validar etapa, intervalos de envio e eliminar duplicados.",
        prompt: "Criar interface para revisão de follow-ups: 1) Listar todos os robots de follow-up por pipeline/SPA. 2) Mostrar mensagem actual, etapa, intervalo. 3) Permitir edição inline. 4) Validação de duplicados e inconsistências."
      },
    ],
  },
  {
    title: "Próximas Etapas",
    icon: <Calendar className="h-5 w-5 text-warning" />,
    modules: [
      { name: "Dashboard BI Operacional", description: "Leads recebidos, clientes respondidos, mensagens, ranking equipa, indicadores comerciais", progress: 0, status: "por_iniciar", priority: "alta",
        details: "Criar dashboard operacional para acompanhamento da equipa. Indicadores: leads recebidos, clientes respondidos, quem está respondendo/não respondendo, quantidade de mensagens enviadas, visão geral da operação, indicadores comerciais e de atendimento.",
        prompt: "Criar dashboard BI no Bitrix24 via placement ou na app Emmely com: 1) KPIs em cards (leads recebidos, respondidos, não respondidos). 2) Ranking de atendentes por mensagens e respostas. 3) Gráfico de mensagens por dia/semana. 4) Filtros por período e responsável. 5) Dados via edge function que consulta Bitrix24 + tabelas Emmely."
      },
      { name: "Controlo de Caixa Interno", description: "Caixa Brasil (Érica), acesso restrito, lançamentos, saldo e histórico", progress: 0, status: "por_iniciar", priority: "alta",
        details: "Criar controlo de caixa interno da empresa dentro do sistema. Existe um caixa no Brasil que fica com a Érica. O acesso deve ser restrito apenas ao admin e à Érica. Estrutura com segurança de acesso, lançamentos, saldo e histórico.",
        prompt: "Criar módulo de caixa interno: 1) Tabela cash_entries (id, description, amount, type entrada/saida, category, responsible_id, created_at). 2) RLS restritivo (apenas admin + utilizador específico). 3) Página /financeiro/caixa com lançamentos, saldo actual, filtros por período. 4) Gráfico de entradas/saídas por mês."
      },
      { name: "Higienização da Base de Contactos", description: "Limpeza gradual de contactos com critérios de segurança e sem exclusão por engano", progress: 0, status: "por_iniciar", priority: "media",
        details: "Iniciar processo de limpeza de contactos. Existem muitos contactos que não deveriam estar no sistema. Fazer limpeza gradual, por etapas, com critérios de identificação antes da exclusão. Não excluir clientes por engano.",
        prompt: "Criar ferramenta de higienização: 1) Edge function que identifica contactos sem actividade há X meses, sem deals/leads associados, duplicados. 2) Interface de revisão com preview antes de excluir. 3) Soft-delete com possibilidade de restaurar. 4) Processo por lotes com confirmação."
      },
      { name: "Controlo de Ativos em SPA", description: "SPA dedicado para controlo de ativos com campos, responsáveis e relatórios", progress: 0, status: "por_iniciar", priority: "media",
        details: "Criar um SPA no Bitrix24 para controlo de ativos. Definir o que será controlado, campos necessários, responsáveis e relatórios.",
        prompt: "Criar SPA de controlo de ativos no Bitrix24 via crm.type.add: 1) Definir campos (nome do ativo, tipo, valor, responsável, estado, data aquisição). 2) Criar etapas (ativo, em manutenção, desativado). 3) Relatório de ativos por tipo e estado."
      },
      { name: "Integração Telefonia VoIP", description: "SIP trunking para receber/fazer chamadas reais", progress: 0, status: "por_iniciar",
        details: "Integração com provedor VoIP (Twilio ou similar) para receber e efetuar chamadas telefónicas reais que são roteadas para o agente de voz ElevenLabs.",
        prompt: "Implementar integração VoIP para chamadas telefónicas reais."
      },
      { name: "Gravação & Transcrição", description: "Gravar chamadas e transcrever com ElevenLabs STT", progress: 0, status: "por_iniciar",
        details: "Gravação automática de chamadas e transcrição usando ElevenLabs Speech-to-Text.",
        prompt: "Implementar gravação e transcrição de chamadas."
      },
      { name: "Gestão de Recebimentos", description: "Controlo de recebimentos, conciliação, relatórios", progress: 0, status: "por_iniciar",
        details: "Módulo para controlar recebimentos de pagamentos, conciliar com registos financeiros.",
        prompt: "Implementar módulo de gestão de recebimentos na página /financeiro."
      },
      { name: "WhatsApp Templates (HSM)", description: "Templates oficiais para mensagens proativas", progress: 0, status: "por_iniciar",
        details: "Gestão de templates HSM do WhatsApp Business para envio de mensagens proativas.",
        prompt: "Implementar gestão de templates HSM do WhatsApp Business."
      },
      { name: "Webchat Widget Embeddable", description: "Widget de chat para websites com customização", progress: 0, status: "por_iniciar",
        details: "Widget de chat embeddable que pode ser instalado em qualquer website.",
        prompt: "Implementar widget de webchat embeddable."
      },
      { name: "Relatórios Avançados", description: "Benchmarks, previsão de faturamento, exportações", progress: 0, status: "por_iniciar",
        details: "Módulo de relatórios avançados com análises de performance.",
        prompt: "Implementar módulo de relatórios avançados."
      },
      { name: "Multi-escritórios (SaaS)", description: "Suporte multi-tenant para vários escritórios", progress: 0, status: "por_iniciar",
        details: "Transformar o Emmely Cloud em SaaS multi-tenant.",
        prompt: "Implementar suporte multi-tenant para SaaS."
      },
      { name: "App Mobile (PWA)", description: "Acesso mobile progressivo com offline", progress: 0, status: "por_iniciar",
        details: "Progressive Web App com suporte offline, notificações push.",
        prompt: "Implementar PWA (Progressive Web App)."
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
  { value: "Concluído", label: "Concluído" },
  { value: "Em Progresso", label: "Em Progresso" },
  { value: "Próximas Etapas", label: "Próximas Etapas" },
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
    phase: "Próximas Etapas",
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
    setNewModule({ name: "", description: "", details: "", prompt: "", status: "por_iniciar", priority: "media", progress: 0, phase: "Próximas Etapas" });
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
