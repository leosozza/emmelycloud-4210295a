import { useState } from "react";
import { Search, Bell, LogOut, Scale, Menu, X, ChevronDown } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  FileText,
  FileSignature,
  DollarSign,
  Zap,
  BarChart3,
  Contact,
  MessageCircle,
  Map,
  Plug,
  Bot,
  Workflow,
  GraduationCap,
  FlaskConical,
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useLocale } from "@/contexts/LocaleContext";
import { toast } from "sonner";
import { NavLink } from "@/components/NavLink";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

type NavDirect = { type: "link"; title: string; url: string; icon: React.ElementType };
type NavGroup = {
  type: "group";
  title: string;
  icon: React.ElementType;
  children: { title: string; url: string; icon: React.ElementType }[];
};
type NavItem = NavDirect | NavGroup;

const navItems: NavItem[] = [
  { type: "link", title: "Dashboard", url: "/", icon: LayoutDashboard },
  { type: "link", title: "Atendimento", url: "/atendimento", icon: MessageCircle },
  {
    type: "group",
    title: "Comercial",
    icon: Users,
    children: [
      { title: "Leads", url: "/leads", icon: Users },
      { title: "Propostas", url: "/propostas", icon: FileText },
      { title: "Contratos", url: "/contratos", icon: FileSignature },
    ],
  },
  {
    type: "group",
    title: "Jurídico",
    icon: Briefcase,
    children: [
      { title: "Casos", url: "/casos", icon: Briefcase },
      { title: "Carteira", url: "/carteira", icon: Contact },
    ],
  },
  {
    type: "group",
    title: "Gestão",
    icon: BarChart3,
    children: [
      { title: "Financeiro", url: "/financeiro", icon: DollarSign },
      { title: "Automações", url: "/automacoes", icon: Zap },
      { title: "Relatórios", url: "/relatorios", icon: BarChart3 },
      { title: "Integrações", url: "/integracoes", icon: Plug },
    ],
  },
  {
    type: "group",
    title: "IA",
    icon: Bot,
    children: [
      { title: "Agentes", url: "/agentes", icon: Bot },
      { title: "Fluxos", url: "/flows", icon: Workflow },
      { title: "Treinamento", url: "/training", icon: GraduationCap },
      { title: "Playground", url: "/playground-ia", icon: FlaskConical },
    ],
  },
  { type: "link", title: "Roadmap", url: "/roadmap", icon: Map },
];

// Flat list for mobile
const allLinks = navItems.flatMap((item) =>
  item.type === "link" ? [item] : item.children.map((c) => ({ ...c, type: "link" as const }))
);

export function AppHeader() {
  const { user } = useAuth();
  const { locale, setLocale } = useLocale();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Sessão encerrada");
    navigate("/auth");
  };

  const initials = user?.user_metadata?.full_name
    ? user.user_metadata.full_name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() ?? "U";

  const isGroupActive = (children: { url: string }[]) =>
    children.some((c) => location.pathname === c.url);

  const pillBase = "flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white/70 rounded-full hover:bg-white/15 hover:text-white transition-colors whitespace-nowrap";
  const pillActive = "bg-white/25 text-white font-bold backdrop-blur-sm shadow-sm";

  return (
    <header className="sticky top-0 z-30 bg-bitrix-gradient text-white shadow-lg">
      {/* Top bar */}
      <div className="flex h-14 items-center gap-4 px-4">
        {/* Logo */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
            <Scale className="h-4 w-4 text-white" />
          </div>
          <div className="hidden sm:flex flex-col leading-none">
            <span className="text-sm font-extrabold tracking-tight">Emmely Cloud</span>
            <span className="text-[10px] font-medium text-white/60">CRM Jurídico</span>
          </div>
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-white/50" />
          <Input
            placeholder="Pesquisar leads, casos, propostas..."
            className="pl-9 h-9 bg-white/15 border-0 text-white placeholder:text-white/40 focus-visible:ring-1 focus-visible:ring-white/30 rounded-full"
          />
        </div>

        {/* Right actions */}
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="text-lg text-white hover:bg-white/15 rounded-full"
            title={locale === "pt-BR" ? "Português (Brasil) — R$" : "Português (Portugal) — €"}
            onClick={() => setLocale(locale === "pt-BR" ? "pt-PT" : "pt-BR")}
          >
            {locale === "pt-BR" ? "🇧🇷" : "🇵🇹"}
          </Button>

          <Button variant="ghost" size="icon" className="relative text-white hover:bg-white/15 rounded-full">
            <Bell className="h-4 w-4" />
            <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px] bg-white text-primary">
              3
            </Badge>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full hover:bg-white/15">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-white/20 text-white text-xs font-medium">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-popover z-50">
              <div className="px-2 py-1.5">
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{user?.user_metadata?.full_name || "Utilizador"}</span>
                  <span className="text-xs text-muted-foreground">{user?.email}</span>
                </div>
              </div>
              <DropdownMenuItem>Perfil</DropdownMenuItem>
              <DropdownMenuItem>Configurações</DropdownMenuItem>
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Mobile menu toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden text-white hover:bg-white/15 rounded-full"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Desktop navigation */}
      <nav className="hidden md:flex items-center gap-1 px-4 py-1.5 overflow-x-auto">
        {navItems.map((item) =>
          item.type === "link" ? (
            <NavLink
              key={item.url}
              to={item.url}
              end={item.url === "/"}
              className={pillBase}
              activeClassName={pillActive}
            >
              <item.icon className="h-3.5 w-3.5" />
              {item.title}
            </NavLink>
          ) : (
            <DropdownMenu key={item.title}>
              <DropdownMenuTrigger asChild>
                <button
                  className={`${pillBase} ${isGroupActive(item.children) ? pillActive : ""}`}
                >
                  <item.icon className="h-3.5 w-3.5" />
                  {item.title}
                  <ChevronDown className="h-3 w-3 ml-0.5 opacity-70" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" sideOffset={8} className="bg-popover z-50 min-w-[160px]">
                {item.children.map((child) => (
                  <DropdownMenuItem
                    key={child.url}
                    className={location.pathname === child.url ? "bg-accent font-semibold" : ""}
                    onClick={() => navigate(child.url)}
                  >
                    <child.icon className="mr-2 h-4 w-4" />
                    {child.title}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        )}
      </nav>

      {/* Mobile navigation - flat grid */}
      {mobileMenuOpen && (
        <nav className="md:hidden border-t border-white/10 px-4 py-2 grid grid-cols-3 gap-1">
          {allLinks.map((item) => (
            <NavLink
              key={item.url}
              to={item.url}
              end={item.url === "/"}
              className="flex flex-col items-center gap-1 px-2 py-2 text-[11px] font-medium text-white/70 rounded-xl hover:bg-white/15 hover:text-white transition-colors"
              activeClassName="bg-white/25 text-white font-bold"
              onClick={() => setMobileMenuOpen(false)}
            >
              <item.icon className="h-4 w-4" />
              {item.title}
            </NavLink>
          ))}
        </nav>
      )}
    </header>
  );
}
