import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ChannelIcon } from "./ChannelIcon";
import { Phone, Mail, Instagram, Link2, User } from "lucide-react";

type Channel = "whatsapp" | "instagram" | "email" | "webchat";

interface ContactProfileProps {
  conversation: {
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

export function ContactProfile({ conversation }: ContactProfileProps) {
  if (!conversation) {
    return (
      <div className="w-72 border-l bg-card hidden lg:flex items-center justify-center">
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

  return (
    <div className="w-72 border-l bg-card hidden lg:flex flex-col">
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

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Contacto</p>
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
        </div>

        <Separator />

        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Atribuição</p>
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
        </div>

        <Separator />

        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Cliente</p>
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
        </div>
      </div>
    </div>
  );
}
