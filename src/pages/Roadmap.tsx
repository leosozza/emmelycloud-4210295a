import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, Calendar, Rocket } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";

type ModuleStatus = "concluido" | "em_progresso" | "por_iniciar";

interface RoadmapModule {
  name: string;
  description: string;
  progress: number;
  status: ModuleStatus;
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
      // Core
      { name: "Design System", description: "Cores, fontes, tokens semânticos, dark/light mode", progress: 100, status: "concluido" },
      { name: "Layout & Navegação", description: "Sidebar colapsável, header, rotas, breadcrumbs", progress: 100, status: "concluido" },
      { name: "Autenticação & Perfis", description: "Login, registo, logout, perfil automático, auto-role admin", progress: 100, status: "concluido" },
      { name: "Roles & Segurança", description: "Admin, advogado, comercial, financeiro com RLS", progress: 100, status: "concluido" },
      { name: "Backend & BD", description: "20+ tabelas com RLS, triggers, funções DB", progress: 100, status: "concluido" },
      { name: "Internacionalização PT/BR", description: "Seletor de idioma e moeda (R$/€)", progress: 100, status: "concluido" },
      // CRM
      { name: "Dashboard", description: "KPIs, gráficos com dados reais, período, customizável", progress: 100, status: "concluido" },
      { name: "Funil Kanban", description: "Drag & drop leads por estágio com auto-criação de caso", progress: 100, status: "concluido" },
      { name: "Leads (CRUD completo)", description: "Formulário, ficha detalhada, lista e kanban", progress: 100, status: "concluido" },
      { name: "Casos Jurídicos", description: "CRUD com vínculo a leads e advogados", progress: 100, status: "concluido" },
      { name: "Propostas", description: "Criação, envio, aceite automático → gera contrato", progress: 100, status: "concluido" },
      { name: "Contratos", description: "Geração automática, assinatura → atualiza lead e caso", progress: 100, status: "concluido" },
      { name: "Clientes & Contactos", description: "Ficha completa, contactos múltiplos, moradas", progress: 100, status: "concluido" },
      { name: "Serviços & Tabela de Preços", description: "CRUD de serviços com valores e detalhes contratuais", progress: 100, status: "concluido" },
      { name: "SLA Automático", description: "SLA 24h nos leads com trigger automático", progress: 100, status: "concluido" },
      // Atendimento
      { name: "Central de Atendimento", description: "Chat multicanal (WA, IG, Email, Webchat)", progress: 100, status: "concluido" },
      { name: "Respostas Rápidas", description: "Templates categorizados para atendimento", progress: 100, status: "concluido" },
      // Integrações
      { name: "Integração Callbell", description: "Webhook bidirecional, envio/receção WA e IG", progress: 100, status: "concluido" },
      { name: "Integração Instagram/Meta", description: "Webhook, envio DM, teste de conexão", progress: 100, status: "concluido" },
      { name: "Central de Integrações", description: "Gestão de credenciais dinâmicas por provedor", progress: 100, status: "concluido" },
      { name: "Central de Credenciais", description: "Edge function manage-credentials, valores mascarados", progress: 100, status: "concluido" },
      // IA
      { name: "Motor IA Multi-Provedor", description: "8 provedores (Lovable, OpenAI, DeepSeek, Groq, Gemini, Qwen, ElevenLabs, OpenAI TTS)", progress: 100, status: "concluido" },
      { name: "Agentes IA (Personas)", description: "CRUD de agentes com prompt, modelo, temperatura, tipo texto/voz/hybrid", progress: 100, status: "concluido" },
      { name: "Playground IA", description: "Simulador de chat com métricas (tempo, tokens)", progress: 100, status: "concluido" },
      { name: "Base de Conhecimento (RAG)", description: "Documentos texto, URL, FAQ com auto-chunking", progress: 100, status: "concluido" },
      { name: "Upload de Ficheiros (Training)", description: "Upload TXT, MD, CSV, JSON, XML para treino", progress: 100, status: "concluido" },
      { name: "Treino por Conversas", description: "Importação de conversas por período para RAG", progress: 100, status: "concluido" },
      { name: "Vinculação Agente-Conhecimento", description: "Agentes vinculados a documentos específicos da base", progress: 100, status: "concluido" },
      // Automação
      { name: "Editor Visual de Fluxos", description: "ReactFlow com 8 tipos de nós (msg, condição, IA, delay, etc.)", progress: 100, status: "concluido" },
      { name: "Triggers Avançados", description: "Keyword, webhook, Bitrix24 events, timeout, CRON, tags", progress: 100, status: "concluido" },
      { name: "Nós IA Inteligentes", description: "IA-Intenção, IA-Ação, IA-Roteador nos fluxos", progress: 100, status: "concluido" },
      { name: "Templates de Fluxos", description: "Templates pré-definidos para automações comuns", progress: 100, status: "concluido" },
      { name: "Histórico de Fluxos", description: "Versionamento de alterações nos fluxos", progress: 100, status: "concluido" },
      // Bitrix24
      { name: "Bitrix24 OAuth & Install", description: "Instalação OAuth, refresh automático de tokens", progress: 100, status: "concluido" },
      { name: "Bitrix24 Conector Messaging", description: "Conector oficial, canais WA/IG, mapeamento", progress: 100, status: "concluido" },
      { name: "Bitrix24 Robot Handler", description: "Robots de automação para workflows Bitrix24", progress: 100, status: "concluido" },
      // Pagamentos
      { name: "Emmely Pay (Stripe + Asaas)", description: "Pagamentos unificados EUR/BRL, webhook, status", progress: 100, status: "concluido" },
      { name: "Config Gateway Pagamentos", description: "Configuração por ambiente (teste/produção)", progress: 100, status: "concluido" },
      // Financeiro
      { name: "Módulo Financeiro", description: "Parcelas, receitas, métodos de pagamento, status", progress: 100, status: "concluido" },
      { name: "SEF / Localizações AIMA", description: "Base de dados de postos e direções regionais", progress: 100, status: "concluido" },
    ],
  },
  {
    title: "🔧 Em Progresso",
    icon: <Clock className="h-5 w-5 text-primary" />,
    modules: [
      { name: "Gestão de Roles (Admin)", description: "Admin atribui/remove roles à equipa", progress: 60, status: "em_progresso" },
      { name: "Bitrix24 Sync Bidirecional", description: "Leads, deals, contactos sincronizados", progress: 40, status: "em_progresso" },
      { name: "Bitrix24 Prevenção Loops", description: "Anti-loop e deduplicação de mensagens", progress: 30, status: "em_progresso" },
      { name: "Agentes IA para Atendimento", description: "Agentes que atendem clientes nos canais (WA, IG, Webchat) com RAG e fluxos", progress: 40, status: "em_progresso" },
      { name: "Agentes IA para Automações", description: "Agentes internos para ações do sistema (classificar leads, criar tarefas, notificar)", progress: 20, status: "em_progresso" },
      { name: "Processamento PDF/DOCX", description: "Extração de texto de ficheiros binários para base de conhecimento", progress: 20, status: "em_progresso" },
    ],
  },
  {
    title: "📅 Próximas Etapas",
    icon: <Calendar className="h-5 w-5 text-warning" />,
    modules: [
      // Voz & Telefonia
      { name: "Agente de Voz (ElevenLabs)", description: "Atender e efetuar chamadas telefónicas com IA conversacional", progress: 0, status: "por_iniciar" },
      { name: "Integração Telefonia VoIP", description: "SIP trunking para receber/fazer chamadas reais", progress: 0, status: "por_iniciar" },
      { name: "Gravação & Transcrição", description: "Gravar chamadas e transcrever com ElevenLabs STT", progress: 0, status: "por_iniciar" },
      // Pagamentos & Financeiro
      { name: "Gestão de Recebimentos", description: "Controlo de recebimentos, conciliação, relatórios", progress: 0, status: "por_iniciar" },
      { name: "Cobranças Automáticas", description: "Envio automático de links de pagamento e lembretes", progress: 0, status: "por_iniciar" },
      { name: "Dashboard Financeiro", description: "Faturamento, inadimplência, previsões, gráficos", progress: 0, status: "por_iniciar" },
      // Monitoramento
      { name: "Monitor de Integrações", description: "Dashboard de saúde: gateways, Bitrix24, provedores IA, Callbell", progress: 0, status: "por_iniciar" },
      { name: "Alertas de Falhas", description: "Notificações automáticas quando uma integração falha", progress: 0, status: "por_iniciar" },
      { name: "Logs & Auditoria", description: "Histórico de ações, erros e eventos de todas as integrações", progress: 0, status: "por_iniciar" },
      // IA avançada
      { name: "Triagem com IA", description: "Classificação automática de leads + score de viabilidade", progress: 0, status: "por_iniciar" },
      { name: "IA Resumo de Conversas", description: "Resumo automático de chats para ficha do lead", progress: 0, status: "por_iniciar" },
      { name: "IA Análise Documental", description: "Extração inteligente de dados de documentos", progress: 0, status: "por_iniciar" },
    ],
  },
  {
    title: "🚀 Futuro",
    icon: <Rocket className="h-5 w-5 text-accent" />,
    modules: [
      // Documentação
      { name: "Documentação API Completa", description: "Referência completa de todos os endpoints, webhooks e edge functions", progress: 0, status: "por_iniciar" },
      { name: "Portal de Desenvolvedor", description: "Página com docs interativas, exemplos, SDK e playground", progress: 0, status: "por_iniciar" },
      // IA avançada
      { name: "IA Previsão Inadimplência", description: "Score de risco financeiro baseado em histórico", progress: 0, status: "por_iniciar" },
      { name: "IA Sugestão Honorários", description: "Valores sugeridos baseados em histórico e mercado", progress: 0, status: "por_iniciar" },
      { name: "IA Multi-Agente Orquestrado", description: "Routing automático entre agentes especializados", progress: 0, status: "por_iniciar" },
      // Integrações futuras
      { name: "Bitrix24 Multi-Portal", description: "Suporte a múltiplos portais Bitrix24 simultâneos", progress: 0, status: "por_iniciar" },
      { name: "Bitrix24 Auto-Reparo", description: "Reconexão automática e health checks do conector", progress: 0, status: "por_iniciar" },
      { name: "App Marketplace Bitrix24", description: "Aplicativo publicado no marketplace oficial", progress: 0, status: "por_iniciar" },
      // Documentos & Contratos
      { name: "PDF Propostas/Contratos", description: "Geração automática de PDFs personalizados", progress: 0, status: "por_iniciar" },
      { name: "Assinatura Digital", description: "Contratos assinados digitalmente com certificado", progress: 0, status: "por_iniciar" },
      // Platform
      { name: "Relatórios Avançados", description: "Benchmarks, previsão de faturamento, exportações", progress: 0, status: "por_iniciar" },
      { name: "Busca Global", description: "Pesquisa unificada em todos os módulos", progress: 0, status: "por_iniciar" },
      { name: "Notificações em Tempo Real", description: "Push notifications, alertas in-app, email", progress: 0, status: "por_iniciar" },
      { name: "Multi-escritórios (SaaS)", description: "Suporte multi-tenant para vários escritórios", progress: 0, status: "por_iniciar" },
      { name: "App Mobile (PWA)", description: "Acesso mobile progressivo com offline", progress: 0, status: "por_iniciar" },
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
  return (
    <div className="space-y-8">
      <PageHeader title="Roadmap" description="Progresso de desenvolvimento do Emmely Cloud" />

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
              return (
                <Card key={mod.name} className="hover:shadow-md transition-shadow">
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
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
