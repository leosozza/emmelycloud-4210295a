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
import { Dock, DockCard, DockDivider } from "@/components/ui/dock";

const dockItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Atendimento", url: "/atendimento", icon: MessageCircle },
  { title: "Leads", url: "/leads", icon: Users },
  { title: "Propostas", url: "/propostas", icon: FileText },
  { title: "Contratos", url: "/contratos", icon: FileSignature },
  { title: "Casos", url: "/casos", icon: Briefcase },
  null, // divider
  { title: "Carteira", url: "/carteira", icon: Contact },
  { title: "Financeiro", url: "/financeiro", icon: DollarSign },
  { title: "Automações", url: "/automacoes", icon: Zap },
  { title: "Relatórios", url: "/relatorios", icon: BarChart3 },
  null, // divider
  { title: "Integrações", url: "/integracoes", icon: Plug },
  { title: "Agentes", url: "/agentes", icon: Bot },
  { title: "Fluxos", url: "/flows", icon: Workflow },
  { title: "Roadmap", url: "/roadmap", icon: Map },
];

function AppDock() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <Dock>
      {dockItems.map((item, index) => {
        if (!item) return <DockDivider key={`div-${index}`} />;
        const isActive =
          item.url === "/"
            ? location.pathname === "/"
            : location.pathname.startsWith(item.url);
        return (
          <DockCard
            key={item.url}
            id={String(index)}
            onClick={() => navigate(item.url)}
            isActive={isActive}
            label={item.title}
          >
            <item.icon
              className={`h-full w-full ${isActive ? "text-primary" : "text-muted-foreground"}`}
            />
          </DockCard>
        );
      })}
    </Dock>
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
          <span className="absolute text-6xl md:text-8xl font-bold text-foreground/[0.03] rotate-[-30deg] whitespace-nowrap pointer-events-none select-none">
            Emmely Fernandes
          </span>
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
      <main className="flex-1 p-6 pb-24 bg-background">
        <Outlet />
      </main>
      <AppDock />
      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
    </div>
  );
}
