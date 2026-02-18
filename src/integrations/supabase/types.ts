export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      bitrix24_channel_mappings: {
        Row: {
          channel: string
          created_at: string
          id: string
          integration_id: string
          is_active: boolean
          line_id: number | null
          line_name: string | null
          updated_at: string
        }
        Insert: {
          channel: string
          created_at?: string
          id?: string
          integration_id: string
          is_active?: boolean
          line_id?: number | null
          line_name?: string | null
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          integration_id?: string
          is_active?: boolean
          line_id?: number | null
          line_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bitrix24_channel_mappings_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "bitrix24_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      bitrix24_debug_logs: {
        Row: {
          created_at: string
          direction: string | null
          error: string | null
          event_type: string
          id: string
          integration_id: string | null
          payload: Json | null
        }
        Insert: {
          created_at?: string
          direction?: string | null
          error?: string | null
          event_type: string
          id?: string
          integration_id?: string | null
          payload?: Json | null
        }
        Update: {
          created_at?: string
          direction?: string | null
          error?: string | null
          event_type?: string
          id?: string
          integration_id?: string | null
          payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "bitrix24_debug_logs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "bitrix24_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      bitrix24_integrations: {
        Row: {
          access_token: string | null
          application_token: string | null
          client_endpoint: string | null
          config: Json | null
          connector_active: boolean
          connector_registered: boolean
          created_at: string
          domain: string | null
          expires_at: string | null
          id: string
          member_id: string
          refresh_token: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          application_token?: string | null
          client_endpoint?: string | null
          config?: Json | null
          connector_active?: boolean
          connector_registered?: boolean
          created_at?: string
          domain?: string | null
          expires_at?: string | null
          id?: string
          member_id: string
          refresh_token?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          application_token?: string | null
          client_endpoint?: string | null
          config?: Json | null
          connector_active?: boolean
          connector_registered?: boolean
          created_at?: string
          domain?: string | null
          expires_at?: string | null
          id?: string
          member_id?: string
          refresh_token?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cases: {
        Row: {
          assigned_attorney_id: string | null
          created_at: string
          description: string | null
          id: string
          internal_notes: string | null
          lead_id: string | null
          legal_area: Database["public"]["Enums"]["legal_area"]
          status: Database["public"]["Enums"]["case_status"]
          title: string
          updated_at: string
          viability: string | null
        }
        Insert: {
          assigned_attorney_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          internal_notes?: string | null
          lead_id?: string | null
          legal_area?: Database["public"]["Enums"]["legal_area"]
          status?: Database["public"]["Enums"]["case_status"]
          title: string
          updated_at?: string
          viability?: string | null
        }
        Update: {
          assigned_attorney_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          internal_notes?: string | null
          lead_id?: string | null
          legal_area?: Database["public"]["Enums"]["legal_area"]
          status?: Database["public"]["Enums"]["case_status"]
          title?: string
          updated_at?: string
          viability?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cases_assigned_attorney_id_fkey"
            columns: ["assigned_attorney_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contacts: {
        Row: {
          client_id: string
          email: string | null
          id: string
          mobile: string | null
          name: string
          phone: string | null
        }
        Insert: {
          client_id: string
          email?: string | null
          id?: string
          mobile?: string | null
          name: string
          phone?: string | null
        }
        Update: {
          client_id?: string
          email?: string | null
          id?: string
          mobile?: string | null
          name?: string
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          birth_date: string | null
          concelho: string | null
          country: string | null
          created_at: string
          distrito: string | null
          document_number: string | null
          document_type: string | null
          freguesia: string | null
          has_active_contract: boolean
          id: string
          name: string
          nationality: string | null
          nib: string | null
          notes: string | null
          postal_code: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          birth_date?: string | null
          concelho?: string | null
          country?: string | null
          created_at?: string
          distrito?: string | null
          document_number?: string | null
          document_type?: string | null
          freguesia?: string | null
          has_active_contract?: boolean
          id?: string
          name: string
          nationality?: string | null
          nib?: string | null
          notes?: string | null
          postal_code?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          birth_date?: string | null
          concelho?: string | null
          country?: string | null
          created_at?: string
          distrito?: string | null
          document_number?: string | null
          document_type?: string | null
          freguesia?: string | null
          has_active_contract?: boolean
          id?: string
          name?: string
          nationality?: string | null
          nib?: string | null
          notes?: string | null
          postal_code?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      contracts: {
        Row: {
          case_id: string | null
          created_at: string
          expires_at: string | null
          file_url: string | null
          id: string
          notes: string | null
          proposal_id: string
          signed_at: string | null
          starts_at: string | null
          status: Database["public"]["Enums"]["contract_status"]
          updated_at: string
        }
        Insert: {
          case_id?: string | null
          created_at?: string
          expires_at?: string | null
          file_url?: string | null
          id?: string
          notes?: string | null
          proposal_id: string
          signed_at?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          updated_at?: string
        }
        Update: {
          case_id?: string | null
          created_at?: string
          expires_at?: string | null
          file_url?: string | null
          id?: string
          notes?: string | null
          proposal_id?: string
          signed_at?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          assigned_to: string | null
          channel: Database["public"]["Enums"]["channel_type"]
          client_id: string | null
          contact_avatar_url: string | null
          contact_email: string | null
          contact_instagram: string | null
          contact_name: string
          contact_phone: string | null
          created_at: string
          department: string | null
          id: string
          last_message_at: string | null
          last_message_preview: string | null
          status: Database["public"]["Enums"]["conversation_status"]
          unread_count: number
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          channel: Database["public"]["Enums"]["channel_type"]
          client_id?: string | null
          contact_avatar_url?: string | null
          contact_email?: string | null
          contact_instagram?: string | null
          contact_name: string
          contact_phone?: string | null
          created_at?: string
          department?: string | null
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          unread_count?: number
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          channel?: Database["public"]["Enums"]["channel_type"]
          client_id?: string | null
          contact_avatar_url?: string | null
          contact_email?: string | null
          contact_instagram?: string | null
          contact_name?: string
          contact_phone?: string | null
          created_at?: string
          department?: string | null
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_records: {
        Row: {
          contract_id: string
          created_at: string
          description: string
          due_date: string | null
          id: string
          installment_number: number | null
          installment_value: number | null
          paid_at: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          receipt_url: string | null
          status: Database["public"]["Enums"]["installment_status"]
          stripe_payment_id: string | null
          total_installments: number | null
          total_value: number
          updated_at: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          description?: string
          due_date?: string | null
          id?: string
          installment_number?: number | null
          installment_value?: number | null
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          receipt_url?: string | null
          status?: Database["public"]["Enums"]["installment_status"]
          stripe_payment_id?: string | null
          total_installments?: number | null
          total_value?: number
          updated_at?: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          description?: string
          due_date?: string | null
          id?: string
          installment_number?: number | null
          installment_value?: number | null
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          receipt_url?: string | null
          status?: Database["public"]["Enums"]["installment_status"]
          stripe_payment_id?: string | null
          total_installments?: number | null
          total_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_records_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_credentials: {
        Row: {
          created_at: string
          credential_key: string
          credential_value: string
          id: string
          provider: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credential_key: string
          credential_value?: string
          id?: string
          provider: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credential_key?: string
          credential_value?: string
          id?: string
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          ai_score: number | null
          ai_viability: string | null
          assigned_attorney_id: string | null
          assigned_commercial_id: string | null
          client_id: string | null
          conversation_id: string | null
          country: string | null
          created_at: string
          created_by: string | null
          email: string | null
          funnel_stage: Database["public"]["Enums"]["funnel_stage"]
          id: string
          legal_area: Database["public"]["Enums"]["legal_area"] | null
          name: string
          notes: string | null
          origin: Database["public"]["Enums"]["lead_origin"]
          phone: string | null
          sla_expires_at: string | null
          updated_at: string
          urgency: string | null
        }
        Insert: {
          ai_score?: number | null
          ai_viability?: string | null
          assigned_attorney_id?: string | null
          assigned_commercial_id?: string | null
          client_id?: string | null
          conversation_id?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          funnel_stage?: Database["public"]["Enums"]["funnel_stage"]
          id?: string
          legal_area?: Database["public"]["Enums"]["legal_area"] | null
          name: string
          notes?: string | null
          origin?: Database["public"]["Enums"]["lead_origin"]
          phone?: string | null
          sla_expires_at?: string | null
          updated_at?: string
          urgency?: string | null
        }
        Update: {
          ai_score?: number | null
          ai_viability?: string | null
          assigned_attorney_id?: string | null
          assigned_commercial_id?: string | null
          client_id?: string | null
          conversation_id?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          funnel_stage?: Database["public"]["Enums"]["funnel_stage"]
          id?: string
          legal_area?: Database["public"]["Enums"]["legal_area"] | null
          name?: string
          notes?: string | null
          origin?: Database["public"]["Enums"]["lead_origin"]
          phone?: string | null
          sla_expires_at?: string | null
          updated_at?: string
          urgency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_attorney_id_fkey"
            columns: ["assigned_attorney_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_assigned_commercial_id_fkey"
            columns: ["assigned_commercial_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          delivery_status: string | null
          direction: Database["public"]["Enums"]["message_direction"]
          external_id: string | null
          id: string
          media_type: string | null
          media_url: string | null
          read_at: string | null
          sender_name: string | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          delivery_status?: string | null
          direction: Database["public"]["Enums"]["message_direction"]
          external_id?: string | null
          id?: string
          media_type?: string | null
          media_url?: string | null
          read_at?: string | null
          sender_name?: string | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          delivery_status?: string | null
          direction?: Database["public"]["Enums"]["message_direction"]
          external_id?: string | null
          id?: string
          media_type?: string | null
          media_url?: string | null
          read_at?: string | null
          sender_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_gateway_config: {
        Row: {
          config: Json | null
          created_at: string
          environment: string
          gateway: string
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          config?: Json | null
          created_at?: string
          environment?: string
          gateway: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          config?: Json | null
          created_at?: string
          environment?: string
          gateway?: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      payment_transactions: {
        Row: {
          amount: number
          client_id: string | null
          contract_id: string | null
          created_at: string
          currency: string
          financial_record_id: string | null
          gateway: string
          gateway_customer_id: string | null
          gateway_payment_id: string | null
          id: string
          metadata: Json | null
          payment_method: string
          payment_url: string | null
          pix_code: string | null
          pix_qr_code: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          client_id?: string | null
          contract_id?: string | null
          created_at?: string
          currency?: string
          financial_record_id?: string | null
          gateway: string
          gateway_customer_id?: string | null
          gateway_payment_id?: string | null
          id?: string
          metadata?: Json | null
          payment_method?: string
          payment_url?: string | null
          pix_code?: string | null
          pix_qr_code?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          client_id?: string | null
          contract_id?: string | null
          created_at?: string
          currency?: string
          financial_record_id?: string | null
          gateway?: string
          gateway_customer_id?: string | null
          gateway_payment_id?: string | null
          id?: string
          metadata?: Json | null
          payment_method?: string
          payment_url?: string | null
          pix_code?: string | null
          pix_qr_code?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_financial_record_id_fkey"
            columns: ["financial_record_id"]
            isOneToOne: false
            referencedRelation: "financial_records"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      proposals: {
        Row: {
          case_id: string
          conditions: string | null
          created_at: string
          created_by: string | null
          id: string
          installments: number | null
          payment_type: Database["public"]["Enums"]["payment_type"]
          status: Database["public"]["Enums"]["proposal_status"]
          title: string
          updated_at: string
          valid_until: string | null
          value: number
        }
        Insert: {
          case_id: string
          conditions?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          installments?: number | null
          payment_type?: Database["public"]["Enums"]["payment_type"]
          status?: Database["public"]["Enums"]["proposal_status"]
          title: string
          updated_at?: string
          valid_until?: string | null
          value?: number
        }
        Update: {
          case_id?: string
          conditions?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          installments?: number | null
          payment_type?: Database["public"]["Enums"]["payment_type"]
          status?: Database["public"]["Enums"]["proposal_status"]
          title?: string
          updated_at?: string
          valid_until?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposals_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      quick_replies: {
        Row: {
          category: string | null
          content: string
          created_at: string
          id: string
          title: string
        }
        Insert: {
          category?: string | null
          content: string
          created_at?: string
          id?: string
          title: string
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string
          id?: string
          title?: string
        }
        Relationships: []
      }
      sef_locations: {
        Row: {
          created_at: string
          details: string | null
          id: string
          name: string
          regional_direction: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          name: string
          regional_direction: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          name?: string
          regional_direction?: string
          updated_at?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          budget_details: string | null
          contract_details: string | null
          contract_intro: string | null
          created_at: string
          currency: string
          id: string
          name: string
          updated_at: string
          value: number
        }
        Insert: {
          budget_details?: string | null
          contract_details?: string | null
          contract_intro?: string | null
          created_at?: string
          currency?: string
          id?: string
          name: string
          updated_at?: string
          value?: number
        }
        Update: {
          budget_details?: string | null
          contract_details?: string | null
          contract_intro?: string | null
          created_at?: string
          currency?: string
          id?: string
          name?: string
          updated_at?: string
          value?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_advogado: { Args: never; Returns: boolean }
      is_comercial: { Args: never; Returns: boolean }
      is_financeiro: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "advogado" | "comercial" | "financeiro"
      case_status:
        | "aberto"
        | "em_andamento"
        | "pendente_docs"
        | "concluido"
        | "arquivado"
      channel_type: "whatsapp" | "instagram" | "email" | "webchat"
      contract_status: "pendente" | "assinado" | "cancelado"
      conversation_status:
        | "aberta"
        | "em_atendimento"
        | "aguardando"
        | "fechada"
      funnel_stage:
        | "lead"
        | "triagem"
        | "proposta"
        | "analise"
        | "contrato"
        | "financeiro"
        | "fechado"
      installment_status: "pendente" | "paga" | "atrasada" | "vencendo"
      lead_origin: "whatsapp" | "instagram" | "email" | "landing_page" | "outro"
      legal_area:
        | "previdencia"
        | "cidadania"
        | "vistos"
        | "trabalhista"
        | "familia"
        | "empresarial"
        | "tributario"
        | "outro"
      message_direction: "inbound" | "outbound"
      payment_method: "stripe" | "transferencia" | "parcelado_direto"
      payment_type: "fixo" | "exito" | "hibrido" | "parcelado"
      proposal_status:
        | "rascunho"
        | "enviada"
        | "aceita"
        | "recusada"
        | "expirada"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "advogado", "comercial", "financeiro"],
      case_status: [
        "aberto",
        "em_andamento",
        "pendente_docs",
        "concluido",
        "arquivado",
      ],
      channel_type: ["whatsapp", "instagram", "email", "webchat"],
      contract_status: ["pendente", "assinado", "cancelado"],
      conversation_status: [
        "aberta",
        "em_atendimento",
        "aguardando",
        "fechada",
      ],
      funnel_stage: [
        "lead",
        "triagem",
        "proposta",
        "analise",
        "contrato",
        "financeiro",
        "fechado",
      ],
      installment_status: ["pendente", "paga", "atrasada", "vencendo"],
      lead_origin: ["whatsapp", "instagram", "email", "landing_page", "outro"],
      legal_area: [
        "previdencia",
        "cidadania",
        "vistos",
        "trabalhista",
        "familia",
        "empresarial",
        "tributario",
        "outro",
      ],
      message_direction: ["inbound", "outbound"],
      payment_method: ["stripe", "transferencia", "parcelado_direto"],
      payment_type: ["fixo", "exito", "hibrido", "parcelado"],
      proposal_status: [
        "rascunho",
        "enviada",
        "aceita",
        "recusada",
        "expirada",
      ],
    },
  },
} as const
