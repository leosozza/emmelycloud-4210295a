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
      leads: {
        Row: {
          ai_score: number | null
          ai_viability: string | null
          assigned_attorney_id: string | null
          assigned_commercial_id: string | null
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
      contract_status: "pendente" | "assinado" | "cancelado"
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
      contract_status: ["pendente", "assinado", "cancelado"],
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
