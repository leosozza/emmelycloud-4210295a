import { Search, LogOut, Scale } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useLocale } from "@/contexts/LocaleContext";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { NotificationCenter } from "@/components/NotificationCenter";

export function AppHeader({ onSearchClick }: { onSearchClick?: () => void }) {
  const { user } = useAuth();
  const { locale, setLocale } = useLocale();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Sessão encerrada");
    navigate("/auth");
  };

  const initials = user?.user_metadata?.full_name
    ? user.user_metadata.full_name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() ?? "U";

  return (
    <header className="sticky top-0 z-30 glass border-b shadow-sm">
      <div className="flex h-14 items-center gap-4 px-4">
        {/* Logo */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary shadow-md">
            <Scale className="h-5 w-5 text-primary-foreground" strokeWidth={1.5} />
          </div>
          <div className="hidden sm:flex flex-col leading-none">
            <span className="text-sm font-extrabold tracking-tight text-foreground">Emmely Cloud</span>
            <span className="text-[10px] font-medium text-muted-foreground">CRM Jurídico</span>
          </div>
        </div>

        {/* Search */}
        <button
          onClick={onSearchClick}
          className="relative flex-1 max-w-md flex items-center gap-2 h-9 px-3.5 bg-muted rounded-lg text-muted-foreground text-sm hover:bg-muted/80 transition-colors border border-border/50"
        >
          <Search className="h-4 w-4" />
          <span>Pesquisar...</span>
          <kbd className="ml-auto hidden sm:inline-flex h-5 items-center gap-0.5 rounded border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            ⌘K
          </kbd>
        </button>

        {/* Actions */}
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="text-lg rounded-full"
            title={locale === "pt-BR" ? "Português (Brasil) — R$" : "Português (Portugal) — €"}
            onClick={() => setLocale(locale === "pt-BR" ? "pt-PT" : "pt-BR")}
          >
            {locale === "pt-BR" ? "🇧🇷" : "🇵🇹"}
          </Button>

          <NotificationCenter />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 z-50">
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
        </div>
      </div>
    </header>
  );
}
