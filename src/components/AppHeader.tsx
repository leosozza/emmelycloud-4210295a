import { Search, LogOut } from "lucide-react";
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

export function AppHeader({ onSearchClick, children }: { onSearchClick?: () => void; children?: React.ReactNode }) {
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
    <header className="sticky top-0 z-30 glass border-b shadow-sm safe-top">
      <div className="flex h-12 sm:h-14 items-center gap-1.5 sm:gap-3 px-2 sm:px-4">
        {children}

        {/* Search — full button on ≥sm, icon-only on mobile */}
        <button
          onClick={onSearchClick}
          aria-label="Pesquisar"
          className="hidden sm:flex relative flex-1 max-w-md items-center gap-2 h-9 px-3.5 bg-muted rounded-lg text-muted-foreground text-sm hover:bg-muted/80 transition-colors border border-border/50"
        >
          <Search className="h-4 w-4" strokeWidth={1.5} />
          <span>Pesquisar...</span>
          <kbd className="ml-auto hidden md:inline-flex h-5 items-center gap-0.5 rounded border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            ⌘K
          </kbd>
        </button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Pesquisar"
          onClick={onSearchClick}
          className="sm:hidden h-9 w-9 rounded-full"
        >
          <Search className="h-4 w-4" strokeWidth={1.5} />
        </Button>

        {/* Actions */}
        <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="text-base sm:text-lg rounded-full h-9 w-9 hidden xs:inline-flex sm:inline-flex"
            title={locale === "pt-BR" ? "Português (Brasil) — R$" : "Português (Portugal) — €"}
            onClick={() => setLocale(locale === "pt-BR" ? "pt-PT" : "pt-BR")}
          >
            {locale === "pt-BR" ? "🇧🇷" : "🇵🇹"}
          </Button>

          <NotificationCenter />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full h-9 w-9">
                <Avatar className="h-7 w-7 sm:h-8 sm:w-8">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 z-50">
              <div className="px-2 py-1.5">
                <div className="flex flex-col">
                  <span className="text-sm font-medium truncate">{user?.user_metadata?.full_name || "Utilizador"}</span>
                  <span className="text-xs text-muted-foreground truncate">{user?.email}</span>
                </div>
              </div>
              <DropdownMenuItem
                className="sm:hidden"
                onClick={() => setLocale(locale === "pt-BR" ? "pt-PT" : "pt-BR")}
              >
                <span className="mr-2 text-base">{locale === "pt-BR" ? "🇧🇷" : "🇵🇹"}</span>
                {locale === "pt-BR" ? "Português (BR)" : "Português (PT)"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/configuracoes")}>Perfil</DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/configuracoes")}>Configurações</DropdownMenuItem>
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" strokeWidth={1.5} />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
