// Shared types for conversation-related components
// EmmelyCloud — adapted from ThothAI with EmmelyCloud-specific fields

export interface Contact {
  id: string;
  name: string | null;
  push_name: string | null;
  phone_number: string;
  profile_picture_url: string | null;
  is_group?: boolean;
  tags?: string[] | null;
}

export interface Instance {
  id: string;
  name: string;
  status: string;
  provider_type?: string | null;
  channel_type?: string | null;
}

export type ConversationChannel = "whatsapp" | "instagram" | "email" | "webchat";
export type ConversationStatus = "aberta" | "em_atendimento" | "aguardando" | "fechada";

export interface Conversation {
  id: string;
  // EmmelyCloud native fields
  channel: ConversationChannel;
  contact_name: string;
  contact_phone?: string | null;
  contact_email?: string | null;
  contact_instagram?: string | null;
  contact_avatar_url?: string | null;
  client_id?: string | null;
  status: ConversationStatus;
  assigned_to?: string | null;
  department?: string | null;
  last_message_at?: string | null;
  last_message_preview?: string | null;
  unread_count: number;
  attendance_mode?: string;
  bot_state?: Record<string, any> | null;
  // ThothAI-compatible optional fields
  instance_id?: string;
  contact_id?: string;
  assigned_operator_id?: string | null;
  contact?: Contact;
  instance?: Instance;
  last_message_content?: string | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  direction: string;
  // EmmelyCloud uses media_type, ThothAI uses message_type — support both
  message_type?: string | null;
  media_type?: string | null;
  content: string | null;
  status?: string | null;
  delivery_status?: string | null;
  is_from_bot?: boolean;
  sender_name?: string | null;
  read_at?: string | null;
  created_at: string;
  media_url?: string | null;
  metadata?: MessageMetadata;
}

export interface MessageMetadata {
  source?: "thoth_app" | "emmely_app" | "bitrix24_operator" | "whatsapp_manual" | string;
  reaction?: string;
  quoted_message_id?: string;
  [key: string]: unknown;
}

export interface QuickReply {
  id: string;
  title: string;
  content: string;
  category?: string | null;
}
