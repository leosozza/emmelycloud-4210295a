import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Users, Briefcase, FileText, MessageCircle, Search,
  LayoutDashboard, DollarSign, Zap, BarChart3, Bot, Map, Plug,
} from "lucide-react";

const pageLinks = [
  { label: "Dashboard", url: "/", icon: LayoutDashboard, keywords: "home inicio" },
  { label: "Leads & Funil", url: "/leads", icon: Users, keywords: "leads funil vendas" },
  { label: "Triagem IA", url: "/triagem", icon: Search, keywords: "triagem classificação ia" },
  { label: "Casos", url: "/casos", icon: Briefcase, keywords: "casos juridico" },
  { label: "Propostas", url: "/propostas", icon: FileText, keywords: "propostas orçamento" },
  { label: "Contratos", url: "/contratos", icon: FileText, keywords: "contratos assinatura" },
  { label: "Financeiro", url: "/financeiro", icon: DollarSign, keywords: "financeiro pagamentos" },
  { label: "Atendimento", url: "/atendimento", icon: MessageCircle, keywords: "atendimento chat conversas" },
  { label: "Automações", url: "/automacoes", icon: Zap, keywords: "automações regras" },
  { label: "Relatórios", url: "/relatorios", icon: BarChart3, keywords: "relatorios analytics" },
  { label: "Agentes IA", url: "/agentes", icon: Bot, keywords: "agentes ia bot" },
  { label: "Integrações", url: "/integracoes", icon: Plug, keywords: "integracoes api" },
  { label: "Roadmap", url: "/roadmap", icon: Map, keywords: "roadmap plano" },
];

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  // Register Ctrl+K / Cmd+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, onOpenChange]);

  // Reset search when closing
  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const hasSearch = search.trim().length >= 2;

  // Search leads
  const { data: leads = [] } = useQuery({
    queryKey: ["cmd-leads", search],
    enabled: hasSearch,
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("id, name, email, phone, funnel_stage")
        .or(`name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`)
        .limit(5);
      return data || [];
    },
    staleTime: 5000,
  });

  // Search clients
  const { data: clients = [] } = useQuery({
    queryKey: ["cmd-clients", search],
    enabled: hasSearch,
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, name, document_number")
        .or(`name.ilike.%${search}%,document_number.ilike.%${search}%`)
        .limit(5);
      return data || [];
    },
    staleTime: 5000,
  });

  // Search cases
  const { data: cases = [] } = useQuery({
    queryKey: ["cmd-cases", search],
    enabled: hasSearch,
    queryFn: async () => {
      const { data } = await supabase
        .from("cases")
        .select("id, title, status, legal_area")
        .ilike("title", `%${search}%`)
        .limit(5);
      return data || [];
    },
    staleTime: 5000,
  });

  // Search conversations
  const { data: conversations = [] } = useQuery({
    queryKey: ["cmd-conversations", search],
    enabled: hasSearch,
    queryFn: async () => {
      const { data } = await supabase
        .from("conversations")
        .select("id, contact_name, channel, last_message_preview")
        .or(`contact_name.ilike.%${search}%,contact_phone.ilike.%${search}%,last_message_preview.ilike.%${search}%`)
        .limit(5);
      return data || [];
    },
    staleTime: 5000,
  });

  const go = useCallback((url: string) => {
    onOpenChange(false);
    navigate(url);
  }, [navigate, onOpenChange]);

  const stageLabels: Record<string, string> = {
    lead: "Lead", triagem: "Triagem", proposta: "Proposta", analise: "Análise",
    contrato: "Contrato", financeiro: "Financeiro", fechado: "Fechado",
  };

  const totalResults = leads.length + clients.length + cases.length + conversations.length;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Pesquisar leads, clientes, casos, conversas..."
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>
          {hasSearch ? "Nenhum resultado encontrado." : "Digite para pesquisar..."}
        </CommandEmpty>

        {/* Pages - always show when no search or matching */}
        {!hasSearch && (
          <CommandGroup heading="Páginas">
            {pageLinks.map((page) => (
              <CommandItem
                key={page.url}
                value={`page-${page.label} ${page.keywords}`}
                onSelect={() => go(page.url)}
              >
                <page.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                {page.label}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Leads */}
        {leads.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Leads">
              {leads.map((lead) => (
                <CommandItem
                  key={lead.id}
                  value={`lead-${lead.name}-${lead.email}-${lead.phone}`}
                  onSelect={() => go(`/leads`)}
                >
                  <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span>{lead.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {lead.email} · {stageLabels[lead.funnel_stage] || lead.funnel_stage}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* Clients */}
        {clients.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Clientes">
              {clients.map((client) => (
                <CommandItem
                  key={client.id}
                  value={`client-${client.name}-${client.document_number}`}
                  onSelect={() => go(`/carteira`)}
                >
                  <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span>{client.name}</span>
                    {client.document_number && (
                      <span className="text-xs text-muted-foreground">{client.document_number}</span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* Cases */}
        {cases.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Casos">
              {cases.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`case-${c.title}`}
                  onSelect={() => go(`/casos`)}
                >
                  <Briefcase className="mr-2 h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span>{c.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {c.status} · {c.legal_area}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* Conversations */}
        {conversations.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Conversas">
              {conversations.map((conv) => (
                <CommandItem
                  key={conv.id}
                  value={`conv-${conv.contact_name}-${conv.last_message_preview}`}
                  onSelect={() => go(`/atendimento`)}
                >
                  <MessageCircle className="mr-2 h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span>{conv.contact_name}</span>
                    {conv.last_message_preview && (
                      <span className="text-xs text-muted-foreground truncate max-w-[300px]">
                        {conv.last_message_preview}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
