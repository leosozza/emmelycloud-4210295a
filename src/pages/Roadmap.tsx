import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, Calendar, Rocket } from "lucide-react";

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
    title: "Concluído",
    icon: <CheckCircle2 className="h-5 w-5 text-success" />,
    modules: [
      { name: "Design System", description: "Cores, fontes, tokens semânticos", progress: 100, status: "concluido" },
      { name: "Layout", description: "Sidebar colapsável, header, rotas", progress: 100, status: "concluido" },
      { name: "Dashboard", description: "4 cards de métricas, 3 gráficos mock", progress: 100, status: "concluido" },
      { name: "Backend", description: "8 tabelas com RLS, roles, triggers", progress: 100, status: "concluido" },
      { name: "Autenticação", description: "Login, registo, logout, perfil automático", progress: 100, status: "concluido" },
      { name: "Roles & Segurança", description: "Admin, advogado, comercial, financeiro", progress: 100, status: "concluido" },
      { name: "SLA Automático", description: "SLA 24h nos leads com triggers", progress: 100, status: "concluido" },
      { name: "Central de Atendimento", description: "Chat multicanal, conversas, mensagens", progress: 100, status: "concluido" },
    ],
  },
  {
    title: "Próximas Etapas",
    icon: <Clock className="h-5 w-5 text-primary" />,
    modules: [
      { name: "Gestão de Roles", description: "Admin atribui roles à equipa", progress: 50, status: "em_progresso" },
      { name: "Funil Kanban", description: "Drag & drop leads por estágio", progress: 100, status: "concluido" },
      { name: "Formulário de Leads", description: "Cadastro completo de leads", progress: 100, status: "concluido" },
      { name: "Ficha do Lead", description: "Visualização detalhada do lead", progress: 100, status: "concluido" },
      { name: "Triagem com IA", description: "Classificação automática + score", progress: 0, status: "por_iniciar" },
      { name: "Casos Jurídicos", description: "CRUD de casos com fichas", progress: 100, status: "concluido" },
      { name: "Propostas", description: "Criação, envio e status", progress: 100, status: "concluido" },
      { name: "Contratos", description: "Upload e assinatura", progress: 100, status: "concluido" },
    ],
  },
  {
    title: "Futuro Próximo",
    icon: <Calendar className="h-5 w-5 text-warning" />,
    modules: [
      { name: "Financeiro", description: "Stripe, transferências, parcelas", progress: 0, status: "por_iniciar" },
      { name: "Dashboard Dinâmico", description: "Dados reais do banco de dados", progress: 0, status: "por_iniciar" },
      { name: "Automações & SLA", description: "Alertas e follow-up automático", progress: 0, status: "por_iniciar" },
      { name: "Relatórios", description: "Benchmarks e previsão de faturamento", progress: 0, status: "por_iniciar" },
      { name: "Busca Global", description: "Pesquisa em todos os módulos", progress: 0, status: "por_iniciar" },
      { name: "Notificações", description: "Alertas em tempo real", progress: 0, status: "por_iniciar" },
    ],
  },
  {
    title: "Futuro",
    icon: <Rocket className="h-5 w-5 text-accent" />,
    modules: [
      { name: "IA Resumo de Conversas", description: "Resumo automático de chats", progress: 0, status: "por_iniciar" },
      { name: "IA Análise Documental", description: "Extração de dados de documentos", progress: 0, status: "por_iniciar" },
      { name: "IA Previsão Inadimplência", description: "Score de risco financeiro", progress: 0, status: "por_iniciar" },
      { name: "IA Sugestão Honorários", description: "Valores baseados em histórico", progress: 0, status: "por_iniciar" },
      { name: "App Vendors Bitrix24", description: "Aplicativo publicado no marketplace Bitrix24", progress: 0, status: "por_iniciar" },
      { name: "OAuth & Token Refresh", description: "Instalação OAuth, refresh automático de tokens", progress: 0, status: "por_iniciar" },
      { name: "Conector WhatsApp Oficial", description: "WhatsApp Cloud API via Open Lines do Bitrix24", progress: 0, status: "por_iniciar" },
      { name: "Conector Instagram DM", description: "Mensagens diretas Instagram via Open Lines", progress: 0, status: "por_iniciar" },
      { name: "Mapeamento de Canais", description: "Binding canais WhatsApp/IG para Open Lines", progress: 0, status: "por_iniciar" },
      { name: "Fluxo Bidirecional Mensagens", description: "Envio/receção mensagens Emmely <-> Bitrix24", progress: 0, status: "por_iniciar" },
      { name: "Prevenção Loops/Duplicações", description: "Sistema anti-loop e deduplicação de mensagens", progress: 0, status: "por_iniciar" },
      { name: "Auto-Reparo Conector", description: "Reconexão automática e health checks", progress: 0, status: "por_iniciar" },
      { name: "Robots BizProc", description: "Robots de automação para workflows Bitrix24", progress: 0, status: "por_iniciar" },
      { name: "Sync CRM Bidirecional", description: "Leads, Deals, Contactos sincronizados", progress: 0, status: "por_iniciar" },
      { name: "Conector Stripe/Pagamentos", description: "Pagamentos Stripe integrados com Faturas Bitrix24", progress: 0, status: "por_iniciar" },
      { name: "Multi-Binding CRM", description: "Suporte a múltiplos portais Bitrix24", progress: 0, status: "por_iniciar" },
      { name: "PDF Propostas", description: "Geração automática de PDFs", progress: 0, status: "por_iniciar" },
      { name: "Assinatura Digital", description: "Contratos assinados digitalmente", progress: 0, status: "por_iniciar" },
      { name: "Multi-escritórios", description: "Suporte SaaS multi-tenant", progress: 0, status: "por_iniciar" },
      { name: "App Mobile (PWA)", description: "Acesso mobile progressivo", progress: 0, status: "por_iniciar" },
    ],
  },
];

const allModules = phases.flatMap((p) => p.modules);
const overallProgress = Math.round(
  allModules.reduce((sum, m) => sum + m.progress, 0) / allModules.length
);

const statusConfig: Record<ModuleStatus, { label: string; variant: "default" | "secondary" | "outline" ; className: string }> = {
  concluido: { label: "Concluído", variant: "default", className: "bg-success text-success-foreground" },
  em_progresso: { label: "Em progresso", variant: "default", className: "bg-primary text-primary-foreground" },
  por_iniciar: { label: "Por iniciar", variant: "secondary", className: "" },
};

export default function RoadmapPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Roadmap</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Progresso de desenvolvimento do Emmely Cloud
        </p>
      </div>

      {/* Overall progress */}
      <Card>
        <CardContent className="py-5 px-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-foreground">Progresso Geral</span>
            <span className="text-sm font-bold text-primary">{overallProgress}%</span>
          </div>
          <Progress value={overallProgress} className="h-3" />
          <p className="text-xs text-muted-foreground mt-2">
            {allModules.filter((m) => m.status === "concluido").length} de {allModules.length} módulos concluídos
          </p>
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
