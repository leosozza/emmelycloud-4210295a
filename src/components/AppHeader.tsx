import { useState } from "react";
import { Search, Bell, LogOut, Scale, Menu, X } from "lucide-react";
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
} from "lucide-react";
import { useNavigate } from "react-router-dom";
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

const navItems = [
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
  { title: "Roadmap", url: "/roadmap", icon: Map },
];

export function AppHeader() {
  const { user } = useAuth();
  const { locale, setLocale } = useLocale();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Sessão encerrada");
    navigate("/auth");
  };

  const initials = user?.user_metadata?.full_name
    ? user.user_metadata.full_name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() ?? "U";

  return (
    <header className="sticky top-0 z-30 bg-foreground text-primary-foreground shadow-md">
      {/* Top bar */}
      <div className="flex h-14 items-center gap-4 px-4">
        {/* Logo */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Scale className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="hidden sm:flex flex-col leading-none">
            <span className="text-sm font-extrabold tracking-tight">Emmely Cloud</span>
            <span className="text-[10px] font-medium opacity-60">CRM Jurídico</span>
          </div>
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-primary-foreground/50" />
          <Input
            placeholder="Pesquisar leads, casos, propostas..."
            className="pl-9 h-9 bg-white/10 border-0 text-primary-foreground placeholder:text-primary-foreground/40 focus-visible:ring-1 focus-visible:ring-white/30"
          />
        </div>

        {/* Right actions */}
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="text-lg text-primary-foreground hover:bg-white/10"
            title={locale === "pt-BR" ? "Português (Brasil) — R$" : "Português (Portugal) — €"}
            onClick={() => setLocale(locale === "pt-BR" ? "pt-PT" : "pt-BR")}
          >
            {locale === "pt-BR" ? "🇧🇷" : "🇵🇹"}
          </Button>

          <Button variant="ghost" size="icon" className="relative text-primary-foreground hover:bg-white/10">
            <Bell className="h-4 w-4" />
            <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px] bg-success text-success-foreground">
              3
            </Badge>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full hover:bg-white/10">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{user?.user_metadata?.full_name || "Utilizador"}</span>
                  <span className="text-xs text-muted-foreground">{user?.email}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Perfil</DropdownMenuItem>
              <DropdownMenuItem>Configurações</DropdownMenuItem>
              <DropdownMenuSeparator />
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
            className="lg:hidden text-primary-foreground hover:bg-white/10"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Desktop navigation */}
      <nav className="hidden lg:flex items-center gap-1 px-4 py-1.5 overflow-x-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.url}
            to={item.url}
            end={item.url === "/"}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-foreground/70 rounded-md hover:bg-white/10 hover:text-primary-foreground transition-colors whitespace-nowrap"
            activeClassName="bg-primary text-primary-foreground font-bold shadow-sm"
          >
            <item.icon className="h-3.5 w-3.5" />
            {item.title}
          </NavLink>
        ))}
      </nav>

      {/* Mobile navigation */}
      {mobileMenuOpen && (
        <nav className="lg:hidden border-t border-white/10 px-4 py-2 grid grid-cols-3 gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.url}
              to={item.url}
              end={item.url === "/"}
              className="flex flex-col items-center gap-1 px-2 py-2 text-[11px] font-medium text-primary-foreground/70 rounded-md hover:bg-white/10 hover:text-primary-foreground transition-colors"
              activeClassName="bg-primary text-primary-foreground font-bold"
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
