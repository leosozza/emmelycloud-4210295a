import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChannelIcon } from "./ChannelIcon";
import { Phone, Mail, Instagram, Link2, User, UserPlus, ChevronDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

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
  } | null;
}

function CollapsibleSection({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-b last:border-b-0">
      <CollapsibleTrigger className="flex items-center justify-between w-full py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors">
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
      </div>

      <div className="flex-1 overflow-y-auto px-4 space-y-0">
        <CollapsibleSection title="Contacto">
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
          <Button
            variant="default"
            size="sm"
            className="w-full text-xs"
            onClick={handleCreateLead}
          >
            <UserPlus className="h-3 w-3 mr-1" /> Criar Lead a partir desta conversa
          </Button>
        </CollapsibleSection>
      </div>
    </div>
  );
}
