import { cn } from "@/lib/utils";
import { Instagram, Mail, MessageCircle, Globe } from "lucide-react";

type Channel = "whatsapp" | "instagram" | "email" | "webchat";

const channelConfig: Record<Channel, { icon: React.ElementType; color: string; label: string }> = {
  whatsapp: { icon: MessageCircle, color: "text-green-500", label: "WhatsApp" },
  instagram: { icon: Instagram, color: "text-pink-500", label: "Instagram" },
  email: { icon: Mail, color: "text-blue-500", label: "Email" },
  webchat: { icon: Globe, color: "text-muted-foreground", label: "Webchat" },
};

interface ChannelIconProps {
  channel: Channel;
  className?: string;
  showLabel?: boolean;
}

export function ChannelIcon({ channel, className, showLabel }: ChannelIconProps) {
  const config = channelConfig[channel];
  const Icon = config.icon;

  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <Icon className={cn("h-4 w-4", config.color)} />
      {showLabel && <span className="text-xs">{config.label}</span>}
    </span>
  );
}
