import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChannelIcon } from "./ChannelIcon";
import { Phone, Mail, Instagram, Link2, User, UserPlus, ChevronDown, Sparkles, Loader2, FileSearch, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSummarizeConversation, useExtractLeadData } from "@/hooks/useAiAutomation";

type Channel = "whatsapp" | "instagram" | "email" | "webchat";

interface ContactProfileProps {
  conversation: {
    id: string;
    contact_name: string;
    contact_avatar_url?: string | null;
    contact_phone?: string | null;
    contact_email?: string | null;
    contact_instagram?: string | null;
    channel: Channel;
    department?: string | null;
    assigned_to?: string | null;
    client_id?: string | null;
    bot_state?: Record<string, any> | null;
  } | null;
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

export function ContactProfile({ conversation }: ContactProfileProps) {
  const navigate = useNavigate();
  const summarize = useSummarizeConversation();
  const extractData = useExtractLeadData();
  const [summary, setSummary] = useState<string | null>(null);

  // Check if a lead already exists for this conversation
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

  const channelToOrigin: Record<Channel, string> = {
    whatsapp: "whatsapp",
    instagram: "instagram",
    email: "email",
    webchat: "outro",
  };

  const handleCreateLead = () => {
    const params = new URLSearchParams();
    params.set("from_conversation", conversation.id);
    params.set("name", conversation.contact_name);
    if (conversation.contact_phone) params.set("phone", conversation.contact_phone);
    if (conversation.contact_email) params.set("email", conversation.contact_email);
    params.set("origin", channelToOrigin[conversation.channel]);
    if (conversation.client_id) params.set("client_id", conversation.client_id);
    navigate(`/leads?${params.toString()}`);
  };

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

  // Parse entity type from bitrix_entity_id (format "type:id")
  let bitrixEntityLabel = "";
  if (bitrixDealId) {
    bitrixEntityLabel = `Deal #${bitrixDealId}`;
  } else if (bitrixLeadId) {
    bitrixEntityLabel = `Lead #${bitrixLeadId}`;
  } else if (bitrixEntityId) {
    const parts = String(bitrixEntityId).split(":");
    if (parts.length === 2) {
      const typeLabels: Record<string, string> = { "1": "Lead", "2": "Deal", "3": "Contacto" };
      bitrixEntityLabel = `${typeLabels[parts[0]] || "Entidade"} #${parts[1]}`;
    } else {
      bitrixEntityLabel = `#${bitrixEntityId}`;
    }
  }

  const hasExistingLead = !!existingLead;

  return (
    <div className="w-72 xl:w-80 border-l bg-card hidden lg:flex flex-col shrink-0">
      <div className="p-4 flex flex-col items-center text-center border-b">
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

        <CollapsibleSection title="Comercial">
          {hasExistingLead ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <User className="h-3 w-3" />
                <span>Lead: <strong className="text-foreground">{existingLead.name}</strong></span>
              </div>
              {existingLead.bitrix24_id && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ExternalLink className="h-3 w-3" />
                  <span>Bitrix24 Lead #{existingLead.bitrix24_id}</span>
                </div>
              )}
              <Badge variant="secondary" className="text-[10px]">
                {existingLead.funnel_stage}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => navigate(`/leads`)}
              >
                <ExternalLink className="h-3 w-3 mr-1" /> Ver Lead
              </Button>
            </div>
          ) : (
            <Button
              variant="default"
              size="sm"
              className="w-full text-xs"
              onClick={handleCreateLead}
            >
              <UserPlus className="h-3 w-3 mr-1" /> Criar Lead a partir desta conversa
            </Button>
          )}
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
