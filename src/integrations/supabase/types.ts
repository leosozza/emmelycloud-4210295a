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
      agent_knowledge_documents: {
        Row: {
          agent_id: string
          created_at: string | null
          document_id: string
          id: string
        }
        Insert: {
          agent_id: string
          created_at?: string | null
          document_id: string
          id?: string
        }
        Update: {
          agent_id?: string
          created_at?: string | null
          document_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_knowledge_documents_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_knowledge_documents_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_tools: {
        Row: {
          agent_id: string
          created_at: string | null
          id: string
          is_active: boolean | null
          tool_description: string | null
          tool_name: string
          tool_parameters: Json | null
        }
        Insert: {
          agent_id: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          tool_description?: string | null
          tool_name: string
          tool_parameters?: Json | null
        }
        Update: {
          agent_id?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          tool_description?: string | null
          tool_name?: string
          tool_parameters?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_tools_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_training_history: {
        Row: {
          agent_id: string
          applied_at: string | null
          generated_rule: string
          id: string
          instruction: string
          previous_prompt: string | null
          reverted_at: string | null
          trained_by: string | null
        }
        Insert: {
          agent_id: string
          applied_at?: string | null
          generated_rule: string
          id?: string
          instruction: string
          previous_prompt?: string | null
          reverted_at?: string | null
          trained_by?: string | null
        }
        Update: {
          agent_id?: string
          applied_at?: string | null
          generated_rule?: string
          id?: string
          instruction?: string
          previous_prompt?: string | null
          reverted_at?: string | null
          trained_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_training_history_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agents: {
        Row: {
          agent_type: string
          ai_api_key_credential: string | null
          ai_base_url: string | null
          ai_model: string
          ai_provider: string
          avatar_url: string | null
          communication_tone: string | null
          created_at: string
          default_flow_id: string | null
          description: string | null
          enable_self_eval: boolean | null
          fallback_message: string | null
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          personality_style: string | null
          routing_rules: Json | null
          strategic_objective: string | null
          sub_agent_ids: string[] | null
          system_prompt: string
          temperature: number
          training_collection_ids: string[] | null
          updated_at: string
          voice_id: string | null
          voice_model: string | null
          voice_provider: string | null
          welcome_message: string | null
        }
        Insert: {
          agent_type?: string
          ai_api_key_credential?: string | null
          ai_base_url?: string | null
          ai_model?: string
          ai_provider?: string
          avatar_url?: string | null
          communication_tone?: string | null
          created_at?: string
          default_flow_id?: string | null
          description?: string | null
          enable_self_eval?: boolean | null
          fallback_message?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          personality_style?: string | null
          routing_rules?: Json | null
          strategic_objective?: string | null
          sub_agent_ids?: string[] | null
          system_prompt?: string
          temperature?: number
          training_collection_ids?: string[] | null
          updated_at?: string
          voice_id?: string | null
          voice_model?: string | null
          voice_provider?: string | null
          welcome_message?: string | null
        }
        Update: {
          agent_type?: string
          ai_api_key_credential?: string | null
          ai_base_url?: string | null
          ai_model?: string
          ai_provider?: string
          avatar_url?: string | null
          communication_tone?: string | null
          created_at?: string
          default_flow_id?: string | null
          description?: string | null
          enable_self_eval?: boolean | null
          fallback_message?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          personality_style?: string | null
          routing_rules?: Json | null
          strategic_objective?: string | null
          sub_agent_ids?: string[] | null
          system_prompt?: string
          temperature?: number
          training_collection_ids?: string[] | null
          updated_at?: string
          voice_id?: string | null
          voice_model?: string | null
          voice_provider?: string | null
          welcome_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agents_default_flow_id_fkey"
            columns: ["default_flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_providers: {
        Row: {
          auth_header: string | null
          auth_prefix: string | null
          available_models: Json | null
          base_url: string
          created_at: string
          credential_key: string | null
          id: string
          is_active: boolean
          is_native: boolean
          name: string
          provider_type: string
          slug: string
          updated_at: string
        }
        Insert: {
          auth_header?: string | null
          auth_prefix?: string | null
          available_models?: Json | null
          base_url: string
          created_at?: string
          credential_key?: string | null
          id?: string
          is_active?: boolean
          is_native?: boolean
          name: string
          provider_type?: string
          slug: string
          updated_at?: string
        }
        Update: {
          auth_header?: string | null
          auth_prefix?: string | null
          available_models?: Json | null
          base_url?: string
          created_at?: string
          credential_key?: string | null
          id?: string
          is_active?: boolean
          is_native?: boolean
          name?: string
          provider_type?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_usage_logs: {
        Row: {
          agent_id: string | null
          completion_tokens: number | null
          conversation_id: string | null
          cost_estimate: number | null
          created_at: string | null
          error: string | null
          id: string
          latency_ms: number | null
          model: string | null
          prompt_tokens: number | null
          provider: string | null
          total_tokens: number | null
          was_fallback: boolean | null
        }
        Insert: {
          agent_id?: string | null
          completion_tokens?: number | null
          conversation_id?: string | null
          cost_estimate?: number | null
          created_at?: string | null
          error?: string | null
          id?: string
          latency_ms?: number | null
          model?: string | null
          prompt_tokens?: number | null
          provider?: string | null
          total_tokens?: number | null
          was_fallback?: boolean | null
        }
        Update: {
          agent_id?: string | null
          completion_tokens?: number | null
          conversation_id?: string | null
          cost_estimate?: number | null
          created_at?: string | null
          error?: string | null
          id?: string
          latency_ms?: number | null
          model?: string | null
          prompt_tokens?: number | null
          provider?: string | null
          total_tokens?: number | null
          was_fallback?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_logs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_logs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      bitrix_event_queue: {
        Row: {
          attempts: number
          created_at: string
          event_type: string
          id: string
          last_error: string | null
          max_attempts: number
          member_id: string | null
          payload: Json
          processed_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          event_type: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          member_id?: string | null
          payload?: Json
          processed_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          event_type?: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          member_id?: string | null
          payload?: Json
          processed_at?: string | null
          status?: string
        }
        Relationships: []
      }
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
      bitrix24_field_mappings: {
        Row: {
          bitrix_entity: string
          bitrix_field_key: string
          bitrix_field_title: string | null
          created_at: string
          id: string
          integration_id: string | null
          is_active: boolean
          supabase_column: string
          supabase_table: string
          sync_direction: string
          transform_rule: string | null
          updated_at: string
        }
        Insert: {
          bitrix_entity?: string
          bitrix_field_key: string
          bitrix_field_title?: string | null
          created_at?: string
          id?: string
          integration_id?: string | null
          is_active?: boolean
          supabase_column: string
          supabase_table?: string
          sync_direction?: string
          transform_rule?: string | null
          updated_at?: string
        }
        Update: {
          bitrix_entity?: string
          bitrix_field_key?: string
          bitrix_field_title?: string | null
          created_at?: string
          id?: string
          integration_id?: string | null
          is_active?: boolean
          supabase_column?: string
          supabase_table?: string
          sync_direction?: string
          transform_rule?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bitrix24_field_mappings_integration_id_fkey"
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
          bitrix_agent_id: string | null
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
          bitrix_agent_id?: string | null
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
          bitrix_agent_id?: string | null
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
        Relationships: [
          {
            foreignKeyName: "bitrix24_integrations_bitrix_agent_id_fkey"
            columns: ["bitrix_agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      business_rules: {
        Row: {
          action_config: Json | null
          action_type: string
          created_at: string | null
          description: string | null
          field: string
          id: string
          is_active: boolean | null
          name: string
          operator: string
          priority: number | null
          updated_at: string | null
          value: string
        }
        Insert: {
          action_config?: Json | null
          action_type?: string
          created_at?: string | null
          description?: string | null
          field: string
          id?: string
          is_active?: boolean | null
          name: string
          operator?: string
          priority?: number | null
          updated_at?: string | null
          value: string
        }
        Update: {
          action_config?: Json | null
          action_type?: string
          created_at?: string | null
          description?: string | null
          field?: string
          id?: string
          is_active?: boolean | null
          name?: string
          operator?: string
          priority?: number | null
          updated_at?: string | null
          value?: string
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
      channel_instances: {
        Row: {
          channel_type: string
          config: Json
          created_at: string
          id: string
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          channel_type: string
          config?: Json
          created_at?: string
          id?: string
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          channel_type?: string
          config?: Json
          created_at?: string
          id?: string
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      chat_sessions: {
        Row: {
          agent_id: string | null
          created_at: string
          id: string
          messages: Json
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          id?: string
          messages?: Json
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          id?: string
          messages?: Json
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_sessions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_channel_settings: {
        Row: {
          agent_id: string | null
          channel: string
          enabled: boolean
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          channel: string
          enabled?: boolean
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          channel?: string
          enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_channel_settings_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
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
      commission_entries: {
        Row: {
          base_amount: number
          commission_amount: number
          created_at: string | null
          currency: string
          id: string
          paid_at: string | null
          percentage: number
          profile_id: string
          proposal_id: string | null
          rule_id: string | null
          status: string
          transaction_id: string | null
        }
        Insert: {
          base_amount?: number
          commission_amount?: number
          created_at?: string | null
          currency?: string
          id?: string
          paid_at?: string | null
          percentage?: number
          profile_id: string
          proposal_id?: string | null
          rule_id?: string | null
          status?: string
          transaction_id?: string | null
        }
        Update: {
          base_amount?: number
          commission_amount?: number
          created_at?: string | null
          currency?: string
          id?: string
          paid_at?: string | null
          percentage?: number
          profile_id?: string
          proposal_id?: string | null
          rule_id?: string | null
          status?: string
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_entries_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_entries_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_entries_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "commission_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_entries_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_rules: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          legal_area: Database["public"]["Enums"]["legal_area"] | null
          max_value: number | null
          min_value: number | null
          percentage: number
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          legal_area?: Database["public"]["Enums"]["legal_area"] | null
          max_value?: number | null
          min_value?: number | null
          percentage?: number
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          legal_area?: Database["public"]["Enums"]["legal_area"] | null
          max_value?: number | null
          min_value?: number | null
          percentage?: number
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string | null
        }
        Relationships: []
      }
      companies: {
        Row: {
          address: string | null
          asaas_credential_key: string | null
          city: string | null
          country: string | null
          created_at: string | null
          currency: string | null
          default_gateway: string | null
          document_number: string | null
          email: string | null
          id: string
          is_active: boolean | null
          legal_name: string | null
          logo_url: string | null
          name: string
          phone: string | null
          postal_code: string | null
          state: string | null
          stripe_credential_key: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          asaas_credential_key?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          currency?: string | null
          default_gateway?: string | null
          document_number?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          legal_name?: string | null
          logo_url?: string | null
          name: string
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          stripe_credential_key?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          asaas_credential_key?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          currency?: string | null
          default_gateway?: string | null
          document_number?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          legal_name?: string | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          stripe_credential_key?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      contracts: {
        Row: {
          cancel_reason: string | null
          cancelled_at: string | null
          case_id: string | null
          created_at: string
          expires_at: string | null
          file_url: string | null
          id: string
          notes: string | null
          proposal_id: string
          refund_amount: number | null
          sign_token: string | null
          signed_at: string | null
          signer_email: string | null
          signer_name: string | null
          signer_phone: string | null
          starts_at: string | null
          status: Database["public"]["Enums"]["contract_status"]
          updated_at: string
        }
        Insert: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          case_id?: string | null
          created_at?: string
          expires_at?: string | null
          file_url?: string | null
          id?: string
          notes?: string | null
          proposal_id: string
          refund_amount?: number | null
          sign_token?: string | null
          signed_at?: string | null
          signer_email?: string | null
          signer_name?: string | null
          signer_phone?: string | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          updated_at?: string
        }
        Update: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          case_id?: string | null
          created_at?: string
          expires_at?: string | null
          file_url?: string | null
          id?: string
          notes?: string | null
          proposal_id?: string
          refund_amount?: number | null
          sign_token?: string | null
          signed_at?: string | null
          signer_email?: string | null
          signer_name?: string | null
          signer_phone?: string | null
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
      conversation_feedback: {
        Row: {
          comment: string | null
          conversation_id: string
          created_at: string | null
          created_by: string | null
          id: string
          issue_type: string | null
          message_id: string | null
          rating: number | null
          resolved: boolean | null
        }
        Insert: {
          comment?: string | null
          conversation_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          issue_type?: string | null
          message_id?: string | null
          rating?: number | null
          resolved?: boolean | null
        }
        Update: {
          comment?: string | null
          conversation_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          issue_type?: string | null
          message_id?: string | null
          rating?: number | null
          resolved?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_feedback_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_feedback_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          assigned_to: string | null
          attendance_mode: string | null
          bot_state: Json | null
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
          last_customer_message_at: string | null
          last_message_at: string | null
          last_message_preview: string | null
          processing_lock_at: string | null
          status: Database["public"]["Enums"]["conversation_status"]
          unread_count: number
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          attendance_mode?: string | null
          bot_state?: Json | null
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
          last_customer_message_at?: string | null
          last_message_at?: string | null
          last_message_preview?: string | null
          processing_lock_at?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          unread_count?: number
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          attendance_mode?: string | null
          bot_state?: Json | null
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
          last_customer_message_at?: string | null
          last_message_at?: string | null
          last_message_preview?: string | null
          processing_lock_at?: string | null
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
      digital_signatures: {
        Row: {
          contract_id: string
          created_at: string
          device_info: Json | null
          evidence_hash: string | null
          geolocation: Json | null
          id: string
          ip_address: string | null
          signature_image_url: string | null
          signature_method: string
          signed_at: string
          signer_document: string | null
          signer_email: string | null
          signer_name: string
          signer_phone: string | null
          user_agent: string | null
        }
        Insert: {
          contract_id: string
          created_at?: string
          device_info?: Json | null
          evidence_hash?: string | null
          geolocation?: Json | null
          id?: string
          ip_address?: string | null
          signature_image_url?: string | null
          signature_method?: string
          signed_at?: string
          signer_document?: string | null
          signer_email?: string | null
          signer_name: string
          signer_phone?: string | null
          user_agent?: string | null
        }
        Update: {
          contract_id?: string
          created_at?: string
          device_info?: Json | null
          evidence_hash?: string | null
          geolocation?: Json | null
          id?: string
          ip_address?: string | null
          signature_image_url?: string | null
          signature_method?: string
          signed_at?: string
          signer_document?: string | null
          signer_email?: string | null
          signer_name?: string
          signer_phone?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "digital_signatures_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
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
      flow_history: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          edges: Json
          flow_id: string
          id: string
          nodes: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          edges?: Json
          flow_id: string
          id?: string
          nodes?: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          edges?: Json
          flow_id?: string
          id?: string
          nodes?: Json
        }
        Relationships: [
          {
            foreignKeyName: "flow_history_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
        ]
      }
      flows: {
        Row: {
          created_at: string
          description: string | null
          edges: Json
          flow_type: string
          id: string
          is_active: boolean
          keywords: string[] | null
          name: string
          nodes: Json
          priority: number | null
          trigger_config: Json | null
          trigger_type: string
          trigger_value: string | null
          updated_at: string
          variables: Json | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          edges?: Json
          flow_type?: string
          id?: string
          is_active?: boolean
          keywords?: string[] | null
          name: string
          nodes?: Json
          priority?: number | null
          trigger_config?: Json | null
          trigger_type?: string
          trigger_value?: string | null
          updated_at?: string
          variables?: Json | null
        }
        Update: {
          created_at?: string
          description?: string | null
          edges?: Json
          flow_type?: string
          id?: string
          is_active?: boolean
          keywords?: string[] | null
          name?: string
          nodes?: Json
          priority?: number | null
          trigger_config?: Json | null
          trigger_type?: string
          trigger_value?: string | null
          updated_at?: string
          variables?: Json | null
        }
        Relationships: []
      }
      import_sessions: {
        Row: {
          created_at: string | null
          file_path: string | null
          filter_config: Json | null
          id: string
          logs: Json | null
          phase: string
          processed_items: number | null
          status: string
          total_items: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          file_path?: string | null
          filter_config?: Json | null
          id?: string
          logs?: Json | null
          phase: string
          processed_items?: number | null
          status?: string
          total_items?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          file_path?: string | null
          filter_config?: Json | null
          id?: string
          logs?: Json | null
          phase?: string
          processed_items?: number | null
          status?: string
          total_items?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
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
      knowledge_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          document_id: string
          embedding: string | null
          id: string
          metadata: Json | null
          tokens_count: number | null
        }
        Insert: {
          chunk_index?: number
          content: string
          created_at?: string
          document_id: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
          tokens_count?: number | null
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          document_id?: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
          tokens_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_documents: {
        Row: {
          chunks_count: number | null
          collection_id: string | null
          collection_name: string | null
          content: string | null
          created_at: string
          file_path: string | null
          file_type: string | null
          id: string
          metadata: Json | null
          source_type: string
          source_url: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          chunks_count?: number | null
          collection_id?: string | null
          collection_name?: string | null
          content?: string | null
          created_at?: string
          file_path?: string | null
          file_type?: string | null
          id?: string
          metadata?: Json | null
          source_type?: string
          source_url?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          chunks_count?: number | null
          collection_id?: string | null
          collection_name?: string | null
          content?: string | null
          created_at?: string
          file_path?: string | null
          file_type?: string | null
          id?: string
          metadata?: Json | null
          source_type?: string
          source_url?: string | null
          status?: string
          title?: string
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
          bitrix24_id: string | null
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
          sync_source: string | null
          updated_at: string
          urgency: string | null
        }
        Insert: {
          ai_score?: number | null
          ai_viability?: string | null
          assigned_attorney_id?: string | null
          assigned_commercial_id?: string | null
          bitrix24_id?: string | null
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
          sync_source?: string | null
          updated_at?: string
          urgency?: string | null
        }
        Update: {
          ai_score?: number | null
          ai_viability?: string | null
          assigned_attorney_id?: string | null
          assigned_commercial_id?: string | null
          bitrix24_id?: string | null
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
          sync_source?: string | null
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
      message_queue: {
        Row: {
          attempts: number | null
          completed_at: string | null
          conversation_id: string
          created_at: string | null
          id: string
          instance_id: string | null
          interactive_response: Json | null
          last_error: string | null
          max_attempts: number | null
          message_text: string
          message_type: string | null
          priority: number | null
          processing_at: string | null
          status: string | null
        }
        Insert: {
          attempts?: number | null
          completed_at?: string | null
          conversation_id: string
          created_at?: string | null
          id?: string
          instance_id?: string | null
          interactive_response?: Json | null
          last_error?: string | null
          max_attempts?: number | null
          message_text: string
          message_type?: string | null
          priority?: number | null
          processing_at?: string | null
          status?: string | null
        }
        Update: {
          attempts?: number | null
          completed_at?: string | null
          conversation_id?: string
          created_at?: string | null
          id?: string
          instance_id?: string | null
          interactive_response?: Json | null
          last_error?: string | null
          max_attempts?: number | null
          message_text?: string
          message_type?: string | null
          priority?: number | null
          processing_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_queue_conversation_id_fkey"
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
          sync_source: string | null
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
          sync_source?: string | null
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
          sync_source?: string | null
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
      notifications: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          message: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          message?: string
          read_at?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          message?: string
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      ollama_url_audit: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          previous_url: string | null
          raw_payload: Json | null
          received_url: string | null
          secret_valid: boolean | null
          source_ip: string | null
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          previous_url?: string | null
          raw_payload?: Json | null
          received_url?: string | null
          secret_valid?: boolean | null
          source_ip?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          previous_url?: string | null
          raw_payload?: Json | null
          received_url?: string | null
          secret_valid?: boolean | null
          source_ip?: string | null
          status?: string
        }
        Relationships: []
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
          company_id: string | null
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
          company_id?: string | null
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
          company_id?: string | null
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
            foreignKeyName: "payment_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
      proposal_templates: {
        Row: {
          conditions: string | null
          created_at: string
          description: string | null
          id: string
          installments: number
          is_default: boolean
          name: string
          payment_type: Database["public"]["Enums"]["payment_type"]
          service_id: string | null
          title: string | null
          updated_at: string
          value: number
        }
        Insert: {
          conditions?: string | null
          created_at?: string
          description?: string | null
          id?: string
          installments?: number
          is_default?: boolean
          name: string
          payment_type?: Database["public"]["Enums"]["payment_type"]
          service_id?: string | null
          title?: string | null
          updated_at?: string
          value?: number
        }
        Update: {
          conditions?: string | null
          created_at?: string
          description?: string | null
          id?: string
          installments?: number
          is_default?: boolean
          name?: string
          payment_type?: Database["public"]["Enums"]["payment_type"]
          service_id?: string | null
          title?: string | null
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposal_templates_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      proposals: {
        Row: {
          accept_token: string | null
          accepted_at: string | null
          accepted_ip: string | null
          accepted_user_agent: string | null
          case_id: string
          client_address: string | null
          client_document: string | null
          client_email: string | null
          client_name: string | null
          client_phone: string | null
          conditions: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          installments: number | null
          payment_type: Database["public"]["Enums"]["payment_type"]
          pdf_url: string | null
          service_id: string | null
          status: Database["public"]["Enums"]["proposal_status"]
          title: string
          updated_at: string
          valid_until: string | null
          value: number
        }
        Insert: {
          accept_token?: string | null
          accepted_at?: string | null
          accepted_ip?: string | null
          accepted_user_agent?: string | null
          case_id: string
          client_address?: string | null
          client_document?: string | null
          client_email?: string | null
          client_name?: string | null
          client_phone?: string | null
          conditions?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          installments?: number | null
          payment_type?: Database["public"]["Enums"]["payment_type"]
          pdf_url?: string | null
          service_id?: string | null
          status?: Database["public"]["Enums"]["proposal_status"]
          title: string
          updated_at?: string
          valid_until?: string | null
          value?: number
        }
        Update: {
          accept_token?: string | null
          accepted_at?: string | null
          accepted_ip?: string | null
          accepted_user_agent?: string | null
          case_id?: string
          client_address?: string | null
          client_document?: string | null
          client_email?: string | null
          client_name?: string | null
          client_phone?: string | null
          conditions?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          installments?: number | null
          payment_type?: Database["public"]["Enums"]["payment_type"]
          pdf_url?: string | null
          service_id?: string | null
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
          {
            foreignKeyName: "proposals_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
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
      report_snapshots: {
        Row: {
          created_at: string
          created_by: string | null
          data: Json
          expires_at: string
          filters: Json
          id: string
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data?: Json
          expires_at?: string
          filters?: Json
          id?: string
          title?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: Json
          expires_at?: string
          filters?: Json
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
      sync_dedup_cache: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          external_id: string
          id: string
          source: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          external_id: string
          id?: string
          source: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          external_id?: string
          id?: string
          source?: string
        }
        Relationships: []
      }
      user_memory: {
        Row: {
          contact_email: string | null
          contact_instagram: string | null
          contact_phone: string | null
          created_at: string | null
          id: string
          key: string
          source: string | null
          updated_at: string | null
          value: string
        }
        Insert: {
          contact_email?: string | null
          contact_instagram?: string | null
          contact_phone?: string | null
          created_at?: string | null
          id?: string
          key: string
          source?: string | null
          updated_at?: string | null
          value: string
        }
        Update: {
          contact_email?: string | null
          contact_instagram?: string | null
          contact_phone?: string | null
          created_at?: string | null
          id?: string
          key?: string
          source?: string | null
          updated_at?: string | null
          value?: string
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
      match_chunks: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          chunk_index: number
          content: string
          document_id: string
          id: string
          similarity: number
        }[]
      }
      search_chunks_fts: {
        Args: { doc_ids: string[]; max_results?: number; search_query: string }
        Returns: {
          chunk_index: number
          content: string
          document_id: string
          id: string
          rank: number
        }[]
      }
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
