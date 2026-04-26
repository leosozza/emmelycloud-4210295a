import { 
  LayoutDashboard, 
  Users, 
  Briefcase,
  FileText, 
  FileSignature, 
  DollarSign, 
  Zap, 
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Scale,
  Contact,
  MessageCircle,
  Map,
  Bot,
  Brain,
  GitBranch,
  Sparkles,
  Phone,
  MessageSquare,
  FileCode,
  BookOpen,
  Activity,
  Settings,
  Plug,
  FlaskConical,
  FileBarChart,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

const mainNav = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Atendimento", url: "/atendimento", icon: MessageCircle },
  { title: "Leads", url: "/leads", icon: Users },
  { title: "Propostas", url: "/propostas", icon: FileText },
  { title: "Contratos", url: "/contratos", icon: FileSignature },
  { title: "Casos", url: "/casos", icon: Briefcase },
];

const carteiraNav = [
  { title: "Carteira", url: "/carteira", icon: Contact },
];

const aiNav = [
  { title: "Agentes IA", url: "/agentes", icon: Bot },
  { title: "Voz", url: "/voice-agents", icon: Phone },
  { title: "Treino", url: "/training", icon: Brain },
  { title: "Fluxos", url: "/flows", icon: GitBranch },
  { title: "Playground", url: "/playground", icon: Sparkles },
  { title: "Chat IA", url: "/chat", icon: MessageSquare },
  { title: "Observabilidade", url: "/observabilidade-ia", icon: Activity },
  { title: "Simulação Swarm", url: "/simulation", icon: FlaskConical },
  { title: "Relatórios Swarm", url: "/swarm-reports", icon: FileBarChart },
];

const secondaryNav = [
  { title: "Financeiro", url: "/financeiro", icon: DollarSign },
  { title: "Integrações", url: "/integracoes", icon: Plug },
  { title: "Automações", url: "/automacoes", icon: Zap },
  { title: "Relatórios", url: "/relatorios", icon: BarChart3 },
  { title: "API Docs", url: "/api-docs", icon: FileCode },
  { title: "Manual", url: "/manual", icon: BookOpen },
  { title: "Roadmap", url: "/roadmap", icon: Map },
  { title: "Configurações", url: "/configuracoes", icon: Settings },
];

export function AppSidebar() {
  const { state, toggleSidebar, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";

  const handleNavClick = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary">
            <Scale className="h-5 w-5 text-primary-foreground" strokeWidth={1.5} />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-bold text-sidebar-foreground">
                Emmely Cloud
              </span>
              <span className="text-[11px] text-sidebar-muted-foreground">
                CRM Jurídico
              </span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-muted-foreground text-[11px] uppercase tracking-widest font-semibold">
            Principal
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-lg transition-all"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                    >
                      <item.icon className="h-[18px] w-[18px]" strokeWidth={1.5} />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-muted-foreground text-[11px] uppercase tracking-widest font-semibold">
            Inteligência Artificial
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {aiNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <NavLink
                      to={item.url}
                      className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-lg transition-all"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                    >
                      <item.icon className="h-[18px] w-[18px]" strokeWidth={1.5} />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-muted-foreground text-[11px] uppercase tracking-widest font-semibold">
            Gestão
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {secondaryNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <NavLink
                      to={item.url}
                      className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-lg transition-all"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                    >
                      <item.icon className="h-[18px] w-[18px]" strokeWidth={1.5} />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-muted-foreground text-[11px] uppercase tracking-widest font-semibold">
            Carteira
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {carteiraNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <NavLink
                      to={item.url}
                      className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-lg transition-all"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                    >
                      <item.icon className="h-[18px] w-[18px]" strokeWidth={1.5} />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className="w-full text-sidebar-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
