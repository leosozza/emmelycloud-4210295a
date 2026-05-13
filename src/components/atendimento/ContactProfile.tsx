import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChannelIcon } from "./ChannelIcon";
import { Phone, Mail, Instagram, Link2, User, ChevronDown, Sparkles, Loader2, FileSearch, ExternalLink, Save, Briefcase, Layers, X, Pencil, RefreshCw, Brain, AlertTriangle, Target } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSummarizeConversation, useExtractLeadData } from "@/hooks/useAiAutomation";
import { toast } from "sonner";

type Channel = "whatsapp" | "instagram" | "email" | "webchat";

interface ContactProfileProps {
  conversation: {
    id: string;
    contact_name: string;
    contact_avatar_url?: string | null;
    contact_phone?: string | null;
    contact_lid?: string | null;
    contact_email?: string | null;
    contact_instagram?: string | null;
    channel: Channel;
    department?: string | null;
    assigned_to?: string | null;
    client_id?: string | null;
    bot_state?: Record<string, any> | null;
  } | null;
  onClose?: () => void;
}

function CollapsibleSection({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-b last:border-b-0">
      <CollapsibleTrigger className="flex items-center justify-between w-full py-2.5 px-1 -mx-1 rounded text-xs font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer">
        {title}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="pb-3">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ContactProfile({ conversation, onClose }: ContactProfileProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const summarize = useSummarizeConversation();
  const extractData = useExtractLeadData();
  const [summary, setSummary] = useState<string | null>(null);
  const [savingCrm, setSavingCrm] = useState<null | "lead" | "deal" | "spa">(null);
  const [manualDealId, setManualDealId] = useState("");
  const [savingManual, setSavingManual] = useState(false);
  const [refreshingLedger, setRefreshingLedger] = useState(false);

  // Conversation Ledger (estado consolidado por IA)
  const { data: ledger, refetch: refetchLedger } = useQuery({
    queryKey: ["conversation-ledger", conversation?.id],
    enabled: !!conversation?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("conversation_ledger")
        .select("summary, open_intents, collected_facts, blockers, next_action, updated_at, message_count_at_summary")
        .eq("conversation_id", conversation!.id)
        .maybeSingle();
      return data;
    },
    staleTime: 30_000,
  });

  const handleRefreshLedger = async () => {
    if (!conversation) return;
    setRefreshingLedger(true);
    try {
      const { data, error } = await supabase.functions.invoke("ledger-update", {
        body: { conversation_id: conversation.id, force: true },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      await refetchLedger();
      toast.success("Estado da conversa atualizado");
    } catch (err: any) {
      toast.error(err?.message || "Falha ao atualizar ledger");
    } finally {
      setRefreshingLedger(false);
    }
  };

  const handleManualLink = async () => {
    const id = manualDealId.trim();
    if (!/^\d+$/.test(id)) {
      toast.error("ID do deal deve ser numérico");
      return;
    }
    if (!conversation) return;
    setSavingManual(true);
    try {
      const newBotState = { ...(conversation.bot_state || {}), bitrix_deal_id: id, bitrix_entity_id: `2:${id}` };
      const { error } = await supabase
        .from("conversations")
        .update({ bot_state: newBotState } as any)
        .eq("id", conversation.id);
      if (error) throw error;
      toast.success(`Vinculado ao deal ${id}`);
      setManualDealId("");
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    } catch (err: any) {
      toast.error(err?.message || "Falha ao vincular");
    } finally {
      setSavingManual(false);
    }
  };

  // Check if a lead already exists for this conversation (local DB)
  const { data: existingLead } = useQuery({
    queryKey: ["lead-by-conversation", conversation?.id],
    enabled: !!conversation?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("id, name, bitrix24_id, funnel_stage")
        .eq("conversation_id", conversation!.id)
        .maybeSingle();
      return data;
    },
    staleTime: 60_000,
  });

  if (!conversation) {
    return (
      <div className="w-72 xl:w-80 border-l bg-card hidden lg:flex items-center justify-center shrink-0">
        <p className="text-sm text-muted-foreground">Selecione uma conversa</p>
      </div>
    );
  }

  const initials = conversation.contact_name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  // Extract Bitrix24 IDs from bot_state
  const bs = conversation.bot_state || {};
  const bitrixDealId = bs.bitrix_deal_id;
  const bitrixLeadId = bs.bitrix_lead_id;
  const bitrixEntityId = bs.bitrix_entity_id;

  // Build deep link + label for existing CRM entity
  let bitrixEntityLabel = "";
  let bitrixDeepPath = "";
  if (bitrixDealId) {
    bitrixEntityLabel = `Negócio #${bitrixDealId}`;
    bitrixDeepPath = `crm/deal/details/${bitrixDealId}/`;
  } else if (bitrixLeadId) {
    bitrixEntityLabel = `Lead #${bitrixLeadId}`;
    bitrixDeepPath = `crm/lead/details/${bitrixLeadId}/`;
  } else if (bitrixEntityId) {
    const parts = String(bitrixEntityId).split(":");
    if (parts.length === 2) {
      const typeLabels: Record<string, string> = { "1": "Lead", "2": "Negócio", "3": "Contacto" };
      bitrixEntityLabel = `${typeLabels[parts[0]] || "Entidade"} #${parts[1]}`;
      if (parts[0] === "1") bitrixDeepPath = `crm/lead/details/${parts[1]}/`;
      else if (parts[0] === "2") bitrixDeepPath = `crm/deal/details/${parts[1]}/`;
      else bitrixDeepPath = `crm/type/${parts[0]}/details/${parts[1]}/`;
    } else {
      bitrixEntityLabel = `#${bitrixEntityId}`;
    }
  }

  const isLinkedToCrm = !!(bitrixDealId || bitrixLeadId || bitrixEntityId) || !!existingLead?.bitrix24_id;

  const handleSaveToCrm = async (entityType: "lead" | "deal" | "spa") => {
    setSavingCrm(entityType);
    try {
      const { data, error } = await supabase.functions.invoke("crm-save-from-conversation", {
        body: { conversation_id: conversation.id, entity_type: entityType },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Salvo no CRM: ${data?.entity_label ?? entityType}`);
      // Invalidate to refresh existingLead query and conversation bot_state
      queryClient.invalidateQueries({ queryKey: ["lead-by-conversation", conversation.id] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      if (data?.deep_link) {
        window.open(data.deep_link, "_blank", "noopener,noreferrer");
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro ao salvar no CRM");
    } finally {
      setSavingCrm(null);
    }
  };

  return (
    <div className="w-72 xl:w-80 border-l bg-card hidden lg:flex flex-col shrink-0">
      <div className="p-4 flex flex-col items-center text-center border-b relative">
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 h-7 w-7"
            onClick={onClose}
            aria-label="Fechar painel"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
        <Avatar className="h-16 w-16 mb-3">
          <AvatarImage src={conversation.contact_avatar_url ?? undefined} />
          <AvatarFallback className="text-lg">{initials}</AvatarFallback>
        </Avatar>
        <h3 className="font-semibold text-sm">{conversation.contact_name}</h3>
        <div className="mt-1">
          <ChannelIcon channel={conversation.channel} showLabel />
        </div>
        {bitrixEntityLabel && (
          <Badge variant="outline" className="mt-1.5 text-[10px] gap-1">
            <ExternalLink className="h-2.5 w-2.5" />
            Bitrix24: {bitrixEntityLabel}
          </Badge>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 space-y-0">
        <CollapsibleSection title="Contacto" defaultOpen>
          <div className="space-y-2">
            {conversation.contact_phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{conversation.contact_phone}</span>
              </div>
            )}
            {!conversation.contact_phone && conversation.contact_lid && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                <span>LID {conversation.contact_lid}</span>
              </div>
            )}
            {conversation.contact_email && (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="truncate">{conversation.contact_email}</span>
              </div>
            )}
            {conversation.contact_instagram && (
              <div className="flex items-center gap-2 text-sm">
                <Instagram className="h-3.5 w-3.5 text-muted-foreground" />
                <span>@{conversation.contact_instagram}</span>
              </div>
            )}
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Atribuição">
          <div className="space-y-2">
            {conversation.assigned_to && (
              <div className="flex items-center gap-2 text-sm">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{conversation.assigned_to}</span>
              </div>
            )}
            {conversation.department && (
              <Badge variant="outline" className="text-xs">{conversation.department}</Badge>
            )}
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="Cliente">
          {conversation.client_id ? (
            <Button variant="outline" size="sm" className="w-full text-xs" asChild>
              <a href={`/clientes`}>
                <Link2 className="h-3 w-3 mr-1" /> Ver ficha do cliente
              </a>
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="w-full text-xs">
              <Link2 className="h-3 w-3 mr-1" /> Vincular a cliente
            </Button>
          )}
        </CollapsibleSection>

        <CollapsibleSection title="CRM Bitrix24" defaultOpen>
          {isLinkedToCrm ? (
            <div className="space-y-2">
              {existingLead && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <User className="h-3 w-3" />
                  <span>Lead local: <strong className="text-foreground">{existingLead.name}</strong></span>
                </div>
              )}
              {bitrixEntityLabel && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ExternalLink className="h-3 w-3" />
                  <span>{bitrixEntityLabel}</span>
                </div>
              )}
              {existingLead?.funnel_stage && (
                <Badge variant="secondary" className="text-[10px]">
                  {existingLead.funnel_stage}
                </Badge>
              )}
              {bitrixDeepPath && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => {
                    // Best-effort: extract portal from any known integration via window? Just rely on backend deep_link previously returned. As fallback, open Bitrix24 search.
                    toast.info("Use o botão 'Salvar no CRM' para receber o link directo na próxima criação.");
                  }}
                >
                  <ExternalLink className="h-3 w-3 mr-1" /> Abrir no Bitrix24
                </Button>
              )}
              {existingLead && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => navigate(`/leads`)}
                >
                  <User className="h-3 w-3 mr-1" /> Ver Lead local
                </Button>
              )}
            </div>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="default"
                  size="sm"
                  className="w-full text-xs"
                  disabled={savingCrm !== null}
                >
                  {savingCrm ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Save className="h-3 w-3 mr-1" />
                  )}
                  Salvar no CRM
                  <ChevronDown className="h-3 w-3 ml-auto" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuItem onClick={() => handleSaveToCrm("lead")}>
                  <User className="h-3.5 w-3.5 mr-2" /> Lead
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSaveToCrm("deal")}>
                  <Briefcase className="h-3.5 w-3.5 mr-2" /> Negócio (Deal)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSaveToCrm("spa")}>
                  <Layers className="h-3.5 w-3.5 mr-2" /> SPA (Smart Process)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <div className="mt-3 pt-3 border-t space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Pencil className="h-2.5 w-2.5" />
              {bitrixDealId ? "Alterar deal vinculado" : "Vincular deal manualmente"}
            </p>
            <div className="flex gap-1">
              <Input
                value={manualDealId}
                onChange={(e) => setManualDealId(e.target.value.replace(/\D/g, ""))}
                placeholder={bitrixDealId ? `Atual: ${bitrixDealId}` : "ID do deal"}
                className="h-7 text-xs"
                maxLength={10}
                onKeyDown={(e) => e.key === "Enter" && handleManualLink()}
              />
              <Button
                size="sm"
                variant="secondary"
                className="h-7 text-xs px-2"
                disabled={savingManual || !manualDealId}
                onClick={handleManualLink}
              >
                {savingManual ? <Loader2 className="h-3 w-3 animate-spin" /> : "OK"}
              </Button>
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection title="IA">
          <div className="space-y-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs"
              disabled={summarize.isPending}
              onClick={async () => {
                const result = await summarize.mutateAsync(conversation.id);
                if (result?.summary) setSummary(result.summary);
              }}
            >
              {summarize.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
              Resumir Conversa
            </Button>
            {summary && (
              <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2">{summary}</p>
            )}
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs"
              disabled={extractData.isPending}
              onClick={() => extractData.mutate(conversation.id)}
            >
              {extractData.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <FileSearch className="h-3 w-3 mr-1" />}
              Extrair Dados do Lead
            </Button>
          </div>
        </CollapsibleSection>
      </div>
    </div>
  );
}
