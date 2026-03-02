import { useState } from "react";
import { Outlet, Navigate, useNavigate, useLocation } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { CommandPalette } from "@/components/CommandPalette";
import { useAuthContext } from "@/contexts/AuthContext";
import { LumaSpin } from "@/components/ui/luma-spin";
import {
  LayoutDashboard, Users, Briefcase, FileText, FileSignature,
  DollarSign, Zap, BarChart3, Contact, MessageCircle, Map, Plug, Bot, Workflow,
} from "lucide-react";
import { Dock, DockIcon, DockItem, DockLabel } from "@/components/ui/dock";
import { useIsMobile } from "@/hooks/use-mobile";

const dockItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Atendimento", url: "/atendimento", icon: MessageCircle },
  { title: "Leads", url: "/leads", icon: Users },
  { title: "Propostas", url: "/propostas", icon: FileText },
  { title: "Contratos", url: "/contratos", icon: FileSignature },
  { title: "Casos", url: "/casos", icon: Briefcase },
  { title: "Carteira", url: "/carteira", icon: Contact },
  { title: "Financeiro", url: "/financeiro", icon: DollarSign },
  { title: "Automações", url: "/automacoes", icon: Zap },
  { title: "Relatórios", url: "/relatorios", icon: BarChart3 },
  { title: "Integrações", url: "/integracoes", icon: Plug },
  { title: "Agentes", url: "/agentes", icon: Bot },
  { title: "Fluxos", url: "/flows", icon: Workflow },
  { title: "Roadmap", url: "/roadmap", icon: Map },
];

function AppDock() {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30">
      <Dock
        magnification={isMobile ? 52 : 68}
        panelHeight={isMobile ? 48 : 56}
        distance={isMobile ? 100 : 150}
      >
        {dockItems.map((item) => {
          const isActive =
            item.url === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(item.url);
          return (
            <DockItem key={item.url} onClick={() => navigate(item.url)}>
              <DockLabel>{item.title}</DockLabel>
              <DockIcon>
                <div className="relative flex items-center justify-center h-full w-full">
                  <item.icon
                    className={`h-full w-full ${isActive ? "text-primary" : "text-muted-foreground"}`}
                  />
                  {isActive && (
                    <div className="absolute -bottom-1.5 h-1 w-1 rounded-full bg-primary" />
                  )}
                </div>
              </DockIcon>
            </DockItem>
          );
        })}
      </Dock>
    </div>
  );
}

export function AppLayout() {
  const { session, loading } = useAuthContext();
  const [cmdOpen, setCmdOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <LumaSpin />
          <p className="text-sm text-muted-foreground">A carregar...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <div className="flex min-h-screen w-full flex-col">
      <AppHeader onSearchClick={() => setCmdOpen(true)} />
      <main className="flex-1 p-6 pb-24 bg-background relative">
        <Outlet />
      </main>
      <div className="fixed inset-0 z-0 flex items-center justify-center pointer-events-none select-none overflow-hidden">
        <span className="text-6xl md:text-8xl font-bold text-foreground/[0.03] rotate-[-30deg] whitespace-nowrap">
          Emmely Fernandes
        </span>
      </div>
      <AppDock />
      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
    </div>
  );
}
