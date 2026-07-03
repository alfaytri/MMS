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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          created_at: string | null
          details: string | null
          entity_id: string
          entity_type: string
          id: string
          ip_address: string | null
          module: string | null
          new_data: Json | null
          old_data: Json | null
          performer_name: string | null
          severity: string
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: string | null
          entity_id: string
          entity_type: string
          id?: string
          ip_address?: string | null
          module?: string | null
          new_data?: Json | null
          old_data?: Json | null
          performer_name?: string | null
          severity?: string
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          ip_address?: string | null
          module?: string | null
          new_data?: Json | null
          old_data?: Json | null
          performer_name?: string | null
          severity?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          created_at: string
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_workflow_groups: {
        Row: {
          created_at: string
          group_label: string
          group_order: number
          id: string
          is_active: boolean
          mode: string
          workflow: string
        }
        Insert: {
          created_at?: string
          group_label?: string
          group_order?: number
          id?: string
          is_active?: boolean
          mode?: string
          workflow: string
        }
        Update: {
          created_at?: string
          group_label?: string
          group_order?: number
          id?: string
          is_active?: boolean
          mode?: string
          workflow?: string
        }
        Relationships: []
      }
      approval_workflow_steps: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          condition_types: string[] | null
          created_at: string
          group_id: string | null
          id: string
          is_active: boolean
          is_conditional: boolean
          role_id: string
          step_key: string
          step_label: string
          step_order: number
          workflow: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          condition_types?: string[] | null
          created_at?: string
          group_id?: string | null
          id?: string
          is_active?: boolean
          is_conditional?: boolean
          role_id: string
          step_key: string
          step_label: string
          step_order: number
          workflow: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          condition_types?: string[] | null
          created_at?: string
          group_id?: string | null
          id?: string
          is_active?: boolean
          is_conditional?: boolean
          role_id?: string
          step_key?: string
          step_label?: string
          step_order?: number
          workflow?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_workflow_steps_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "approval_workflow_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_approval_steps_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_approval_steps_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "custom_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_group_members: {
        Row: {
          brand_id: string
          created_at: string
          created_by: string | null
          group_id: string
          id: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          created_by?: string | null
          group_id: string
          id?: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          created_by?: string | null
          group_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_group_members_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_group_members_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "brand_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_groups: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          name: string
          name_ar: string | null
          scope: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          name: string
          name_ar?: string | null
          scope: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          name?: string
          name_ar?: string | null
          scope?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          name_ar: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          name_ar?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          name_ar?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brands_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      call_records: {
        Row: {
          agent_extension: string | null
          agent_name: string | null
          call_id: string
          created_at: string
          customer_phone: string
          direction: string | null
          duration_seconds: number | null
          ended_at: string | null
          id: string
          initiated_by: string | null
          message_id: string
          recording_url: string | null
          started_at: string
          status: string | null
        }
        Insert: {
          agent_extension?: string | null
          agent_name?: string | null
          call_id: string
          created_at?: string
          customer_phone: string
          direction?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          initiated_by?: string | null
          message_id: string
          recording_url?: string | null
          started_at: string
          status?: string | null
        }
        Update: {
          agent_extension?: string | null
          agent_name?: string | null
          call_id?: string
          created_at?: string
          customer_phone?: string
          direction?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          initiated_by?: string | null
          message_id?: string
          recording_url?: string | null
          started_at?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_records_initiated_by_fkey"
            columns: ["initiated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_records_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_conversations: {
        Row: {
          assigned_agent: string | null
          channel: Database["public"]["Enums"]["message_source"] | null
          conversation_type: string
          created_at: string | null
          customer_id: string | null
          customer_id_v2: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          is_deleted: boolean
          is_opened: boolean
          last_message: string | null
          last_message_at: string | null
          last_message_from_type: string | null
          provider: string
          unanswered_dismissed_at: string | null
          unknown_phone: string | null
          unread_count: number | null
          updated_at: string | null
          wati_contact_name: string | null
          wati_phone: string | null
          wati_status: string
        }
        Insert: {
          assigned_agent?: string | null
          channel?: Database["public"]["Enums"]["message_source"] | null
          conversation_type?: string
          created_at?: string | null
          customer_id?: string | null
          customer_id_v2?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_deleted?: boolean
          is_opened?: boolean
          last_message?: string | null
          last_message_at?: string | null
          last_message_from_type?: string | null
          provider?: string
          unanswered_dismissed_at?: string | null
          unknown_phone?: string | null
          unread_count?: number | null
          updated_at?: string | null
          wati_contact_name?: string | null
          wati_phone?: string | null
          wati_status?: string
        }
        Update: {
          assigned_agent?: string | null
          channel?: Database["public"]["Enums"]["message_source"] | null
          conversation_type?: string
          created_at?: string | null
          customer_id?: string | null
          customer_id_v2?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_deleted?: boolean
          is_opened?: boolean
          last_message?: string | null
          last_message_at?: string | null
          last_message_from_type?: string | null
          provider?: string
          unanswered_dismissed_at?: string | null
          unknown_phone?: string | null
          unread_count?: number | null
          updated_at?: string | null
          wati_contact_name?: string | null
          wati_phone?: string | null
          wati_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "service_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversations_customer_id_v2_fkey"
            columns: ["customer_id_v2"]
            isOneToOne: false
            referencedRelation: "service_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversations_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          agent_name: string | null
          attachments: Json | null
          call_metadata: Json | null
          conversation_id: string
          created_at: string | null
          deleted_at: string | null
          deleted_by: string | null
          delivery_status: string | null
          external_id: string | null
          from_type: string
          id: string
          message_kind: string
          phone_id: string | null
          purge_batch_id: string | null
          reactions: Json
          reply_to_external_id: string | null
          revoked_at: string | null
          sent_by_profile_id: string | null
          source: Database["public"]["Enums"]["message_source"]
          text: string | null
          wamid: string | null
          wati_id: string | null
        }
        Insert: {
          agent_name?: string | null
          attachments?: Json | null
          call_metadata?: Json | null
          conversation_id: string
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          delivery_status?: string | null
          external_id?: string | null
          from_type: string
          id?: string
          message_kind?: string
          phone_id?: string | null
          purge_batch_id?: string | null
          reactions?: Json
          reply_to_external_id?: string | null
          revoked_at?: string | null
          sent_by_profile_id?: string | null
          source: Database["public"]["Enums"]["message_source"]
          text?: string | null
          wamid?: string | null
          wati_id?: string | null
        }
        Update: {
          agent_name?: string | null
          attachments?: Json | null
          call_metadata?: Json | null
          conversation_id?: string
          created_at?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          delivery_status?: string | null
          external_id?: string | null
          from_type?: string
          id?: string
          message_kind?: string
          phone_id?: string | null
          purge_batch_id?: string | null
          reactions?: Json
          reply_to_external_id?: string | null
          revoked_at?: string | null
          sent_by_profile_id?: string | null
          source?: Database["public"]["Enums"]["message_source"]
          text?: string | null
          wamid?: string | null
          wati_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_phone_id_fkey"
            columns: ["phone_id"]
            isOneToOne: false
            referencedRelation: "service_customer_phones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_purge_batch_id_fkey"
            columns: ["purge_batch_id"]
            isOneToOne: false
            referencedRelation: "purge_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_sent_by_profile_id_fkey"
            columns: ["sent_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cogs_entries: {
        Row: {
          brand_variant_id: string
          created_at: string
          date: string
          id: string
          landed_cost_id: string | null
          notes: string | null
          qty: number
          sale_delivery_id: string | null
          sale_order_id: string | null
          total_cost: number
          unit_cost: number
        }
        Insert: {
          brand_variant_id: string
          created_at?: string
          date?: string
          id?: string
          landed_cost_id?: string | null
          notes?: string | null
          qty: number
          sale_delivery_id?: string | null
          sale_order_id?: string | null
          total_cost: number
          unit_cost: number
        }
        Update: {
          brand_variant_id?: string
          created_at?: string
          date?: string
          id?: string
          landed_cost_id?: string | null
          notes?: string | null
          qty?: number
          sale_delivery_id?: string | null
          sale_order_id?: string | null
          total_cost?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "cogs_entries_brand_variant_id_fkey"
            columns: ["brand_variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_brand_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cogs_entries_landed_cost_id_fkey"
            columns: ["landed_cost_id"]
            isOneToOne: false
            referencedRelation: "landed_costs"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address_ar: string | null
          address_en: string | null
          cr_number: string | null
          created_at: string
          created_by: string | null
          default_currency: string
          default_tax_rate: number
          id: string
          is_active: boolean
          logo_url: string | null
          name_ar: string | null
          name_en: string
          updated_at: string
          vat_id: string | null
        }
        Insert: {
          address_ar?: string | null
          address_en?: string | null
          cr_number?: string | null
          created_at?: string
          created_by?: string | null
          default_currency?: string
          default_tax_rate?: number
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name_ar?: string | null
          name_en: string
          updated_at?: string
          vat_id?: string | null
        }
        Update: {
          address_ar?: string | null
          address_en?: string | null
          cr_number?: string | null
          created_at?: string
          created_by?: string | null
          default_currency?: string
          default_tax_rate?: number
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name_ar?: string | null
          name_en?: string
          updated_at?: string
          vat_id?: string | null
        }
        Relationships: []
      }
      company_divisions: {
        Row: {
          address: string | null
          address_ar: string | null
          address_en: string | null
          calendar_schedule_id: string | null
          color: string
          company_id: string | null
          company_name_ar: string | null
          company_name_en: string | null
          created_at: string
          created_by: string | null
          css_classes: string | null
          default_currency: string
          default_tax_rate: number
          footer_motto: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          name_ar: string | null
          short_name: string | null
          slug: string
          sort_order: number
          stamp_url: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          address_ar?: string | null
          address_en?: string | null
          calendar_schedule_id?: string | null
          color?: string
          company_id?: string | null
          company_name_ar?: string | null
          company_name_en?: string | null
          created_at?: string
          created_by?: string | null
          css_classes?: string | null
          default_currency?: string
          default_tax_rate?: number
          footer_motto?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          name_ar?: string | null
          short_name?: string | null
          slug: string
          sort_order?: number
          stamp_url?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          address_ar?: string | null
          address_en?: string | null
          calendar_schedule_id?: string | null
          color?: string
          company_id?: string | null
          company_name_ar?: string | null
          company_name_en?: string | null
          created_at?: string
          created_by?: string | null
          css_classes?: string | null
          default_currency?: string
          default_tax_rate?: number
          footer_motto?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          name_ar?: string | null
          short_name?: string | null
          slug?: string
          sort_order?: number
          stamp_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "divisions_calendar_schedule_id_fkey"
            columns: ["calendar_schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "divisions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "divisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_milestones: {
        Row: {
          amount: number
          contract_id: string
          created_at: string
          due_date: string | null
          id: string
          name: string
          percentage: number
          sort_order: number
        }
        Insert: {
          amount?: number
          contract_id: string
          created_at?: string
          due_date?: string | null
          id?: string
          name: string
          percentage?: number
          sort_order?: number
        }
        Update: {
          amount?: number
          contract_id?: string
          created_at?: string
          due_date?: string | null
          id?: string
          name?: string
          percentage?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "contract_milestones_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_payments: {
        Row: {
          amount: number
          contract_id: string
          created_at: string | null
          due_date: string
          id: string
          status: string | null
        }
        Insert: {
          amount: number
          contract_id: string
          created_at?: string | null
          due_date: string
          id?: string
          status?: string | null
        }
        Update: {
          amount?: number
          contract_id?: string
          created_at?: string | null
          due_date?: string
          id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_payments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_services: {
        Row: {
          base_price: number
          brand_id: string | null
          brand_name: string | null
          building_node_id: string | null
          condition: string | null
          condition_factor: number
          contract_id: string
          contract_type: string | null
          created_at: string
          discount: number | null
          discount_scope: string | null
          divisions: string[] | null
          frequency: string
          id: string
          is_general: boolean
          item_kind: string | null
          note: string | null
          price_unit: string | null
          pricing_mode: string | null
          quantity: number
          reliability_factor: number
          service_id: string | null
          service_name: string
          service_path: string[] | null
          sort_order: number
          total_price: number
          unit_price: number
        }
        Insert: {
          base_price?: number
          brand_id?: string | null
          brand_name?: string | null
          building_node_id?: string | null
          condition?: string | null
          condition_factor?: number
          contract_id: string
          contract_type?: string | null
          created_at?: string
          discount?: number | null
          discount_scope?: string | null
          divisions?: string[] | null
          frequency?: string
          id?: string
          is_general?: boolean
          item_kind?: string | null
          note?: string | null
          price_unit?: string | null
          pricing_mode?: string | null
          quantity?: number
          reliability_factor?: number
          service_id?: string | null
          service_name: string
          service_path?: string[] | null
          sort_order?: number
          total_price?: number
          unit_price?: number
        }
        Update: {
          base_price?: number
          brand_id?: string | null
          brand_name?: string | null
          building_node_id?: string | null
          condition?: string | null
          condition_factor?: number
          contract_id?: string
          contract_type?: string | null
          created_at?: string
          discount?: number | null
          discount_scope?: string | null
          divisions?: string[] | null
          frequency?: string
          id?: string
          is_general?: boolean
          item_kind?: string | null
          note?: string | null
          price_unit?: string | null
          pricing_mode?: string | null
          quantity?: number
          reliability_factor?: number
          service_id?: string | null
          service_name?: string
          service_path?: string[] | null
          sort_order?: number
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "contract_services_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_services_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_visits: {
        Row: {
          completed: boolean | null
          contract_id: string
          contract_service_id: string | null
          created_at: string | null
          id: string
          scheduled_date: string
          service_name: string
          team_id: string | null
        }
        Insert: {
          completed?: boolean | null
          contract_id: string
          contract_service_id?: string | null
          created_at?: string | null
          id?: string
          scheduled_date: string
          service_name: string
          team_id?: string | null
        }
        Update: {
          completed?: boolean | null
          contract_id?: string
          contract_service_id?: string | null
          created_at?: string | null
          id?: string
          scheduled_date?: string
          service_name?: string
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_visits_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_visits_contract_service_id_fkey"
            columns: ["contract_service_id"]
            isOneToOne: false
            referencedRelation: "contract_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_visits_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_visits_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_team_monthly_overtime"
            referencedColumns: ["team_id"]
          },
        ]
      }
      contracts: {
        Row: {
          address: string | null
          agent_name: string | null
          approved_at: string | null
          approved_by: string | null
          area_count: number | null
          building_tree: Json
          cancel_reason: string | null
          cancelled_date: string | null
          completed_visits: number | null
          contract_id: string | null
          created_at: string | null
          created_by: string | null
          customer_id: string | null
          customer_name: string | null
          discount: number
          divisions: string[] | null
          end_date: string
          has_signed_doc: boolean | null
          id: string
          last_saved_session: string | null
          monthly_value: number | null
          notes: string | null
          paid_amount: number | null
          payment_frequency: string
          payment_mode: string
          payment_schedule: string | null
          phone: string | null
          phone_id: string | null
          quotation_number: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejected_reason: string | null
          sent_at: string | null
          service_customer_id: string | null
          services_summary: string | null
          signed_doc_url: string | null
          site_name: string
          source_type: string
          start_date: string
          status: Database["public"]["Enums"]["contract_status"] | null
          terms_pdf_url: string | null
          terms_snapshot: Json | null
          total_payments: number | null
          total_value: number | null
          total_visits: number | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          agent_name?: string | null
          approved_at?: string | null
          approved_by?: string | null
          area_count?: number | null
          building_tree?: Json
          cancel_reason?: string | null
          cancelled_date?: string | null
          completed_visits?: number | null
          contract_id?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          discount?: number
          divisions?: string[] | null
          end_date: string
          has_signed_doc?: boolean | null
          id?: string
          last_saved_session?: string | null
          monthly_value?: number | null
          notes?: string | null
          paid_amount?: number | null
          payment_frequency?: string
          payment_mode?: string
          payment_schedule?: string | null
          phone?: string | null
          phone_id?: string | null
          quotation_number?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejected_reason?: string | null
          sent_at?: string | null
          service_customer_id?: string | null
          services_summary?: string | null
          signed_doc_url?: string | null
          site_name?: string
          source_type?: string
          start_date: string
          status?: Database["public"]["Enums"]["contract_status"] | null
          terms_pdf_url?: string | null
          terms_snapshot?: Json | null
          total_payments?: number | null
          total_value?: number | null
          total_visits?: number | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          agent_name?: string | null
          approved_at?: string | null
          approved_by?: string | null
          area_count?: number | null
          building_tree?: Json
          cancel_reason?: string | null
          cancelled_date?: string | null
          completed_visits?: number | null
          contract_id?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          discount?: number
          divisions?: string[] | null
          end_date?: string
          has_signed_doc?: boolean | null
          id?: string
          last_saved_session?: string | null
          monthly_value?: number | null
          notes?: string | null
          paid_amount?: number | null
          payment_frequency?: string
          payment_mode?: string
          payment_schedule?: string | null
          phone?: string | null
          phone_id?: string | null
          quotation_number?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejected_reason?: string | null
          sent_at?: string | null
          service_customer_id?: string | null
          services_summary?: string | null
          signed_doc_url?: string | null
          site_name?: string
          source_type?: string
          start_date?: string
          status?: Database["public"]["Enums"]["contract_status"] | null
          terms_pdf_url?: string | null
          terms_snapshot?: Json | null
          total_payments?: number | null
          total_value?: number | null
          total_visits?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_credit_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "contracts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_phone_id_fkey"
            columns: ["phone_id"]
            isOneToOne: false
            referencedRelation: "service_customer_phones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_service_customer_id_fkey"
            columns: ["service_customer_id"]
            isOneToOne: false
            referencedRelation: "service_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      country_codes: {
        Row: {
          code: string
          flag: string
          id: number
          is_active: boolean
          iso: string
          name: string
          sort_order: number
        }
        Insert: {
          code: string
          flag: string
          id?: number
          is_active?: boolean
          iso: string
          name: string
          sort_order?: number
        }
        Update: {
          code?: string
          flag?: string
          id?: number
          is_active?: boolean
          iso?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      credit_group_payment_methods: {
        Row: {
          created_at: string | null
          credit_group_id: string
          payment_method_id: string
        }
        Insert: {
          created_at?: string | null
          credit_group_id: string
          payment_method_id: string
        }
        Update: {
          created_at?: string | null
          credit_group_id?: string
          payment_method_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_group_payment_methods_credit_group_id_fkey"
            columns: ["credit_group_id"]
            isOneToOne: false
            referencedRelation: "credit_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_group_payment_methods_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_groups: {
        Row: {
          created_at: string
          credit_limit: number
          default_payment_terms: string | null
          id: string
          max_days: number | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credit_limit?: number
          default_payment_terms?: string | null
          id?: string
          max_days?: number | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credit_limit?: number
          default_payment_terms?: string | null
          id?: string
          max_days?: number | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      credit_note_lines: {
        Row: {
          created_at: string | null
          credit_note_id: string
          description: string
          id: string
          invoice_line_id: string | null
          qty: number
          total: number | null
          unit_price: number
        }
        Insert: {
          created_at?: string | null
          credit_note_id: string
          description: string
          id?: string
          invoice_line_id?: string | null
          qty: number
          total?: number | null
          unit_price: number
        }
        Update: {
          created_at?: string | null
          credit_note_id?: string
          description?: string
          id?: string
          invoice_line_id?: string | null
          qty?: number
          total?: number | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "credit_note_lines_credit_note_id_fkey"
            columns: ["credit_note_id"]
            isOneToOne: false
            referencedRelation: "credit_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_note_lines_invoice_line_id_fkey"
            columns: ["invoice_line_id"]
            isOneToOne: false
            referencedRelation: "invoice_line_items"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_notes: {
        Row: {
          approved_by: string | null
          created_at: string
          created_by: string | null
          credit_note_id: string
          customer_name: string | null
          id: string
          invoice_id: string | null
          line_items: Json | null
          new_total: number | null
          note_type: string
          notes: string | null
          original_total: number | null
          pdf_url: string | null
          phone: string | null
          purchase_order_id: string | null
          reason: string
          refund_method: string | null
          refund_reference: string | null
          resolution_type: string | null
          source_return_id: string | null
          status: Database["public"]["Enums"]["credit_note_status"] | null
          supplier_name: string | null
          total_amount: number
          type: string
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          credit_note_id: string
          customer_name?: string | null
          id?: string
          invoice_id?: string | null
          line_items?: Json | null
          new_total?: number | null
          note_type?: string
          notes?: string | null
          original_total?: number | null
          pdf_url?: string | null
          phone?: string | null
          purchase_order_id?: string | null
          reason: string
          refund_method?: string | null
          refund_reference?: string | null
          resolution_type?: string | null
          source_return_id?: string | null
          status?: Database["public"]["Enums"]["credit_note_status"] | null
          supplier_name?: string | null
          total_amount?: number
          type?: string
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          credit_note_id?: string
          customer_name?: string | null
          id?: string
          invoice_id?: string | null
          line_items?: Json | null
          new_total?: number | null
          note_type?: string
          notes?: string | null
          original_total?: number | null
          pdf_url?: string | null
          phone?: string | null
          purchase_order_id?: string | null
          reason?: string
          refund_method?: string | null
          refund_reference?: string | null
          resolution_type?: string | null
          source_return_id?: string | null
          status?: Database["public"]["Enums"]["credit_note_status"] | null
          supplier_name?: string | null
          total_amount?: number
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "customer_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "supplier_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_source_return_id_fkey"
            columns: ["source_return_id"]
            isOneToOne: false
            referencedRelation: "returns"
            referencedColumns: ["id"]
          },
        ]
      }
      currencies: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          symbol: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          symbol: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          symbol?: string
          updated_at?: string
        }
        Relationships: []
      }
      custom_roles: {
        Row: {
          color: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          is_approval_slot: boolean
          is_field_rp: boolean
          is_system: boolean | null
          name: string
          permissions: string[]
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_approval_slot?: boolean
          is_field_rp?: boolean
          is_system?: boolean | null
          name: string
          permissions?: string[]
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_approval_slot?: boolean
          is_field_rp?: boolean
          is_system?: boolean | null
          name?: string
          permissions?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_roles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_addresses: {
        Row: {
          address_type: string
          blue_plate_no: string | null
          building_no: string | null
          created_at: string | null
          customer_id: string
          id: string
          is_primary: boolean
          label: string | null
          lat: number | null
          lng: number | null
          phone_id: string | null
          street_no: string | null
          unit_no: string | null
          zone_no: string | null
        }
        Insert: {
          address_type: string
          blue_plate_no?: string | null
          building_no?: string | null
          created_at?: string | null
          customer_id: string
          id?: string
          is_primary?: boolean
          label?: string | null
          lat?: number | null
          lng?: number | null
          phone_id?: string | null
          street_no?: string | null
          unit_no?: string | null
          zone_no?: string | null
        }
        Update: {
          address_type?: string
          blue_plate_no?: string | null
          building_no?: string | null
          created_at?: string | null
          customer_id?: string
          id?: string
          is_primary?: boolean
          label?: string | null
          lat?: number | null
          lng?: number | null
          phone_id?: string | null
          street_no?: string | null
          unit_no?: string | null
          zone_no?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_addresses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_credit_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_addresses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_addresses_phone_id_fkey"
            columns: ["phone_id"]
            isOneToOne: false
            referencedRelation: "customer_phones"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_blocks: {
        Row: {
          blocked_by: string | null
          created_at: string
          customer_id: string
          id: string
          image_url: string | null
          notes: string | null
          reason: string
        }
        Insert: {
          blocked_by?: string | null
          created_at?: string
          customer_id: string
          id?: string
          image_url?: string | null
          notes?: string | null
          reason: string
        }
        Update: {
          blocked_by?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          image_url?: string | null
          notes?: string | null
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_blocks_blocked_by_fkey"
            columns: ["blocked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_blocks_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "service_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_credit_group_approvals: {
        Row: {
          comment: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decided_by_name: string | null
          force_approved: boolean
          force_comment: string | null
          id: string
          is_active: boolean
          iteration: number
          reason: string | null
          request_id: string
          status: string
          step_order: number
          step_role: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decided_by_name?: string | null
          force_approved?: boolean
          force_comment?: string | null
          id?: string
          is_active?: boolean
          iteration?: number
          reason?: string | null
          request_id: string
          status?: string
          step_order: number
          step_role: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decided_by_name?: string | null
          force_approved?: boolean
          force_comment?: string | null
          id?: string
          is_active?: boolean
          iteration?: number
          reason?: string | null
          request_id?: string
          status?: string
          step_order?: number
          step_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_credit_group_approvals_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_credit_group_approvals_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "customer_credit_group_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_credit_group_requests: {
        Row: {
          created_at: string
          customer_id: string
          decided_at: string | null
          decided_by: string | null
          id: string
          previous_group_id: string | null
          requested_by: string | null
          requested_group_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          previous_group_id?: string | null
          requested_by?: string | null
          requested_group_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          previous_group_id?: string | null
          requested_by?: string | null
          requested_group_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_credit_group_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_credit_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_credit_group_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_credit_group_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_credit_group_requests_previous_group_id_fkey"
            columns: ["previous_group_id"]
            isOneToOne: false
            referencedRelation: "credit_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_credit_group_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_credit_group_requests_requested_group_id_fkey"
            columns: ["requested_group_id"]
            isOneToOne: false
            referencedRelation: "credit_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_phones: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          is_primary: boolean
          label: string | null
          phone: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          is_primary?: boolean
          label?: string | null
          phone: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          is_primary?: boolean
          label?: string | null
          phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_phones_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_credit_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_phones_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_subscriptions: {
        Row: {
          auto_renew: boolean
          created_at: string
          customer_id: string
          dibsy_checkout_url: string | null
          dibsy_payment_id: string | null
          discount_percent_snapshot: number
          end_date: string
          id: string
          package_id: string
          price_paid: number
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          auto_renew?: boolean
          created_at?: string
          customer_id: string
          dibsy_checkout_url?: string | null
          dibsy_payment_id?: string | null
          discount_percent_snapshot: number
          end_date: string
          id?: string
          package_id: string
          price_paid: number
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          auto_renew?: boolean
          created_at?: string
          customer_id?: string
          dibsy_checkout_url?: string | null
          dibsy_payment_id?: string | null
          discount_percent_snapshot?: number
          end_date?: string
          id?: string
          package_id?: string
          price_paid?: number
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_subscriptions_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "subscription_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_subscriptions_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "subscription_packages_with_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_customer_subscriptions_customer"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_credit_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "fk_customer_subscriptions_customer"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          block_reason: string | null
          cr_uploaded_at: string | null
          cr_url: string | null
          created_at: string | null
          credit_balance: number
          credit_group_id: string | null
          credit_limit: number | null
          customer_type: string | null
          email: string | null
          entity_type: string | null
          establishment_id_uploaded_at: string | null
          establishment_id_url: string | null
          id: string
          is_active: boolean
          is_blocked: boolean | null
          name: string
          name_ar: string | null
          pending_balance: number | null
          phone: string
          signed_credit_form_uploaded_at: string | null
          signed_credit_form_url: string | null
          subscription_tag: string | null
          updated_at: string | null
        }
        Insert: {
          block_reason?: string | null
          cr_uploaded_at?: string | null
          cr_url?: string | null
          created_at?: string | null
          credit_balance?: number
          credit_group_id?: string | null
          credit_limit?: number | null
          customer_type?: string | null
          email?: string | null
          entity_type?: string | null
          establishment_id_uploaded_at?: string | null
          establishment_id_url?: string | null
          id?: string
          is_active?: boolean
          is_blocked?: boolean | null
          name: string
          name_ar?: string | null
          pending_balance?: number | null
          phone: string
          signed_credit_form_uploaded_at?: string | null
          signed_credit_form_url?: string | null
          subscription_tag?: string | null
          updated_at?: string | null
        }
        Update: {
          block_reason?: string | null
          cr_uploaded_at?: string | null
          cr_url?: string | null
          created_at?: string | null
          credit_balance?: number
          credit_group_id?: string | null
          credit_limit?: number | null
          customer_type?: string | null
          email?: string | null
          entity_type?: string | null
          establishment_id_uploaded_at?: string | null
          establishment_id_url?: string | null
          id?: string
          is_active?: boolean
          is_blocked?: boolean | null
          name?: string
          name_ar?: string | null
          pending_balance?: number | null
          phone?: string
          signed_credit_form_uploaded_at?: string | null
          signed_credit_form_url?: string | null
          subscription_tag?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_credit_group_id_fkey"
            columns: ["credit_group_id"]
            isOneToOne: false
            referencedRelation: "credit_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      document_terms: {
        Row: {
          content_ar: string
          content_en: string
          created_at: string
          created_by: string | null
          division_id: string | null
          document_type: string
          id: string
          updated_at: string
        }
        Insert: {
          content_ar?: string
          content_en?: string
          created_at?: string
          created_by?: string | null
          division_id?: string | null
          document_type: string
          id?: string
          updated_at?: string
        }
        Update: {
          content_ar?: string
          content_en?: string
          created_at?: string
          created_by?: string | null
          division_id?: string | null
          document_type?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_terms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_terms_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "company_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_terms_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "v_team_monthly_overtime"
            referencedColumns: ["division_id"]
          },
        ]
      }
      employee_services: {
        Row: {
          employee_id: string
          service_id: string
        }
        Insert: {
          employee_id: string
          service_id: string
        }
        Update: {
          employee_id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_services_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          avatar: string | null
          avatar_url: string | null
          created_at: string | null
          deleted_at: string | null
          division_id: string | null
          id: string
          join_date: string
          name: string
          name_ar: string | null
          nationality: string | null
          phone: string
          profile_id: string | null
          site_visit_order: boolean
          site_visit_quotation: boolean
          skills: string[] | null
          status: Database["public"]["Enums"]["employee_status"] | null
          team_id: string | null
          updated_at: string | null
        }
        Insert: {
          avatar?: string | null
          avatar_url?: string | null
          created_at?: string | null
          deleted_at?: string | null
          division_id?: string | null
          id?: string
          join_date: string
          name: string
          name_ar?: string | null
          nationality?: string | null
          phone: string
          profile_id?: string | null
          site_visit_order?: boolean
          site_visit_quotation?: boolean
          skills?: string[] | null
          status?: Database["public"]["Enums"]["employee_status"] | null
          team_id?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar?: string | null
          avatar_url?: string | null
          created_at?: string | null
          deleted_at?: string | null
          division_id?: string | null
          id?: string
          join_date?: string
          name?: string
          name_ar?: string | null
          nationality?: string | null
          phone?: string
          profile_id?: string | null
          site_visit_order?: boolean
          site_visit_quotation?: boolean
          skills?: string[] | null
          status?: Database["public"]["Enums"]["employee_status"] | null
          team_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "company_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "v_team_monthly_overtime"
            referencedColumns: ["division_id"]
          },
          {
            foreignKeyName: "employees_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_employee_team"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_employee_team"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_team_monthly_overtime"
            referencedColumns: ["team_id"]
          },
        ]
      }
      fifo_cost_layers: {
        Row: {
          brand_variant_id: string
          created_at: string | null
          date: string
          id: string
          landed_cost_per_unit: number | null
          qty: number
          receival_id: string | null
          receival_number: string | null
          remaining_qty: number
          total_unit_cost: number
          unit_cost: number
          warehouse_id: string | null
        }
        Insert: {
          brand_variant_id: string
          created_at?: string | null
          date: string
          id?: string
          landed_cost_per_unit?: number | null
          qty: number
          receival_id?: string | null
          receival_number?: string | null
          remaining_qty: number
          total_unit_cost: number
          unit_cost: number
          warehouse_id?: string | null
        }
        Update: {
          brand_variant_id?: string
          created_at?: string | null
          date?: string
          id?: string
          landed_cost_per_unit?: number | null
          qty?: number
          receival_id?: string | null
          receival_number?: string | null
          remaining_qty?: number
          total_unit_cost?: number
          unit_cost?: number
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fifo_cost_layers_brand_variant_id_fkey"
            columns: ["brand_variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_brand_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fifo_cost_layers_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_up_requests: {
        Row: {
          cancelled_reason: string | null
          confirmed_at: string | null
          confirmed_by_user_id: string | null
          created_at: string
          id: string
          notes: string | null
          parent_order_id: string
          request_number: string
          requested_by_user_id: string
          requested_date: string | null
          requested_team_id: string
          requested_time_from: string | null
          requested_time_to: string | null
          resulting_order_id: string | null
          services_to_followup: Json
          status: Database["public"]["Enums"]["follow_up_request_status"]
          time_note: string | null
          updated_at: string
        }
        Insert: {
          cancelled_reason?: string | null
          confirmed_at?: string | null
          confirmed_by_user_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          parent_order_id: string
          request_number: string
          requested_by_user_id: string
          requested_date?: string | null
          requested_team_id: string
          requested_time_from?: string | null
          requested_time_to?: string | null
          resulting_order_id?: string | null
          services_to_followup: Json
          status?: Database["public"]["Enums"]["follow_up_request_status"]
          time_note?: string | null
          updated_at?: string
        }
        Update: {
          cancelled_reason?: string | null
          confirmed_at?: string | null
          confirmed_by_user_id?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          parent_order_id?: string
          request_number?: string
          requested_by_user_id?: string
          requested_date?: string | null
          requested_team_id?: string
          requested_time_from?: string | null
          requested_time_to?: string | null
          resulting_order_id?: string | null
          services_to_followup?: Json
          status?: Database["public"]["Enums"]["follow_up_request_status"]
          time_note?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_up_requests_parent_order_id_fkey"
            columns: ["parent_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_up_requests_requested_team_id_fkey"
            columns: ["requested_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_up_requests_requested_team_id_fkey"
            columns: ["requested_team_id"]
            isOneToOne: false
            referencedRelation: "v_team_monthly_overtime"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "follow_up_requests_resulting_order_id_fkey"
            columns: ["resulting_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      installed_products: {
        Row: {
          address_id: string | null
          brand: string | null
          created_at: string
          customer_id: string
          id: string
          installed_at: string
          model: string | null
          notes: string | null
          order_id: string
          phone_id: string
          product_name: string
          serial_number: string | null
          warranty_expires_at: string | null
          warranty_months: number
        }
        Insert: {
          address_id?: string | null
          brand?: string | null
          created_at?: string
          customer_id: string
          id?: string
          installed_at: string
          model?: string | null
          notes?: string | null
          order_id: string
          phone_id: string
          product_name: string
          serial_number?: string | null
          warranty_expires_at?: string | null
          warranty_months?: number
        }
        Update: {
          address_id?: string | null
          brand?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          installed_at?: string
          model?: string | null
          notes?: string | null
          order_id?: string
          phone_id?: string
          product_name?: string
          serial_number?: string | null
          warranty_expires_at?: string | null
          warranty_months?: number
        }
        Relationships: [
          {
            foreignKeyName: "installed_products_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "customer_addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installed_products_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_credit_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "installed_products_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installed_products_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installed_products_phone_id_fkey"
            columns: ["phone_id"]
            isOneToOne: false
            referencedRelation: "customer_phones"
            referencedColumns: ["id"]
          },
        ]
      }
      instructions: {
        Row: {
          content_preview: string | null
          content_type:
            | Database["public"]["Enums"]["instruction_content_type"]
            | null
          created_at: string | null
          full_content: string | null
          id: string
          linked_service_ids: string[] | null
          name_ar: string | null
          name_en: string
          pdf_file_name: string | null
          status: Database["public"]["Enums"]["service_status"] | null
          type: Database["public"]["Enums"]["instruction_type"]
          updated_at: string | null
        }
        Insert: {
          content_preview?: string | null
          content_type?:
            | Database["public"]["Enums"]["instruction_content_type"]
            | null
          created_at?: string | null
          full_content?: string | null
          id?: string
          linked_service_ids?: string[] | null
          name_ar?: string | null
          name_en: string
          pdf_file_name?: string | null
          status?: Database["public"]["Enums"]["service_status"] | null
          type: Database["public"]["Enums"]["instruction_type"]
          updated_at?: string | null
        }
        Update: {
          content_preview?: string | null
          content_type?:
            | Database["public"]["Enums"]["instruction_content_type"]
            | null
          created_at?: string | null
          full_content?: string | null
          id?: string
          linked_service_ids?: string[] | null
          name_ar?: string | null
          name_en?: string
          pdf_file_name?: string | null
          status?: Database["public"]["Enums"]["service_status"] | null
          type?: Database["public"]["Enums"]["instruction_type"]
          updated_at?: string | null
        }
        Relationships: []
      }
      inventory_brand_variants: {
        Row: {
          average_cost: number | null
          brand: string
          code: string | null
          cost_price: number | null
          created_at: string | null
          damaged_qty: number
          id: string
          incoming: number | null
          incoming_eta: string | null
          item_id: string
          linked_services_count: number
          margin_percent: number
          reorder_point: number
          reserved_qty: number
          selling_price: number | null
          sort_order: number
          status: string
          stock_level: number | null
          updated_at: string | null
        }
        Insert: {
          average_cost?: number | null
          brand: string
          code?: string | null
          cost_price?: number | null
          created_at?: string | null
          damaged_qty?: number
          id?: string
          incoming?: number | null
          incoming_eta?: string | null
          item_id: string
          linked_services_count?: number
          margin_percent?: number
          reorder_point?: number
          reserved_qty?: number
          selling_price?: number | null
          sort_order?: number
          status?: string
          stock_level?: number | null
          updated_at?: string | null
        }
        Update: {
          average_cost?: number | null
          brand?: string
          code?: string | null
          cost_price?: number | null
          created_at?: string | null
          damaged_qty?: number
          id?: string
          incoming?: number | null
          incoming_eta?: string | null
          item_id?: string
          linked_services_count?: number
          margin_percent?: number
          reorder_point?: number
          reserved_qty?: number
          selling_price?: number | null
          sort_order?: number
          status?: string
          stock_level?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_brand_variants_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_categories: {
        Row: {
          created_at: string | null
          id: string
          name_ar: string | null
          name_en: string
          parent_id: string | null
          sku: string | null
          sort_order: number
          status: string
          type: Database["public"]["Enums"]["inventory_type"]
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name_ar?: string | null
          name_en: string
          parent_id?: string | null
          sku?: string | null
          sort_order?: number
          status?: string
          type: Database["public"]["Enums"]["inventory_type"]
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name_ar?: string | null
          name_en?: string
          parent_id?: string | null
          sku?: string | null
          sort_order?: number
          status?: string
          type?: Database["public"]["Enums"]["inventory_type"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "inventory_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_check_approvals: {
        Row: {
          action_at: string | null
          check_id: string
          created_at: string
          id: string
          notes: string | null
          profile_id: string | null
          profile_name: string | null
          status: string
          step_label: string
          step_order: number
          step_role: string
        }
        Insert: {
          action_at?: string | null
          check_id: string
          created_at?: string
          id?: string
          notes?: string | null
          profile_id?: string | null
          profile_name?: string | null
          status?: string
          step_label: string
          step_order: number
          step_role: string
        }
        Update: {
          action_at?: string | null
          check_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          profile_id?: string | null
          profile_name?: string | null
          status?: string
          step_label?: string
          step_order?: number
          step_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_check_approvals_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: false
            referencedRelation: "inventory_checks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_check_approvals_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_check_assignments: {
        Row: {
          assigned_categories: string[]
          check_id: string
          completed_at: string | null
          created_at: string
          id: string
          profile_id: string
          profile_name: string
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assigned_categories?: string[]
          check_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          profile_id: string
          profile_name: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_categories?: string[]
          check_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          profile_id?: string
          profile_name?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_check_assignments_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: false
            referencedRelation: "inventory_checks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_check_assignments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_check_items: {
        Row: {
          assigned_profile_id: string | null
          assigned_profile_name: string | null
          assignment_id: string | null
          brand: string
          brand_variant_id: string
          category_name: string | null
          check_id: string
          counted_qty: number | null
          created_at: string
          id: string
          is_counted: boolean
          item_name: string
          notes: string | null
          sku: string | null
          system_qty: number
          system_qty_at_close: number | null
          updated_at: string
          variance: number | null
          variance_type: string | null
        }
        Insert: {
          assigned_profile_id?: string | null
          assigned_profile_name?: string | null
          assignment_id?: string | null
          brand: string
          brand_variant_id: string
          category_name?: string | null
          check_id: string
          counted_qty?: number | null
          created_at?: string
          id?: string
          is_counted?: boolean
          item_name: string
          notes?: string | null
          sku?: string | null
          system_qty?: number
          system_qty_at_close?: number | null
          updated_at?: string
          variance?: number | null
          variance_type?: string | null
        }
        Update: {
          assigned_profile_id?: string | null
          assigned_profile_name?: string | null
          assignment_id?: string | null
          brand?: string
          brand_variant_id?: string
          category_name?: string | null
          check_id?: string
          counted_qty?: number | null
          created_at?: string
          id?: string
          is_counted?: boolean
          item_name?: string
          notes?: string | null
          sku?: string | null
          system_qty?: number
          system_qty_at_close?: number | null
          updated_at?: string
          variance?: number | null
          variance_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_check_items_assigned_profile_id_fkey"
            columns: ["assigned_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_check_items_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "inventory_check_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_check_items_brand_variant_id_fkey"
            columns: ["brand_variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_brand_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_check_items_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: false
            referencedRelation: "inventory_checks"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_check_log: {
        Row: {
          check_id: string
          created_at: string
          event_type: string
          id: string
          meta: Json | null
          profile_id: string | null
          profile_name: string | null
        }
        Insert: {
          check_id: string
          created_at?: string
          event_type: string
          id?: string
          meta?: Json | null
          profile_id?: string | null
          profile_name?: string | null
        }
        Update: {
          check_id?: string
          created_at?: string
          event_type?: string
          id?: string
          meta?: Json | null
          profile_id?: string | null
          profile_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_check_log_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: false
            referencedRelation: "inventory_checks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_check_log_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_checks: {
        Row: {
          check_number: string
          created_at: string
          created_by: string | null
          id: string
          initiated_by_name: string | null
          initiated_by_profile_id: string | null
          notes: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_by_name: string | null
          started_at: string | null
          status: string
          submitted_at: string | null
          submitted_by: string | null
          submitted_by_name: string | null
          updated_at: string
          warehouse_id: string
          warehouse_name: string
        }
        Insert: {
          check_number: string
          created_at?: string
          created_by?: string | null
          id?: string
          initiated_by_name?: string | null
          initiated_by_profile_id?: string | null
          notes?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name?: string | null
          started_at?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          submitted_by_name?: string | null
          updated_at?: string
          warehouse_id: string
          warehouse_name?: string
        }
        Update: {
          check_number?: string
          created_at?: string
          created_by?: string | null
          id?: string
          initiated_by_name?: string | null
          initiated_by_profile_id?: string | null
          notes?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name?: string | null
          started_at?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          submitted_by_name?: string | null
          updated_at?: string
          warehouse_id?: string
          warehouse_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_checks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_checks_initiated_by_profile_id_fkey"
            columns: ["initiated_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_checks_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_checks_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_checks_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_groups: {
        Row: {
          created_at: string | null
          id: string
          items: Json
          name_ar: string | null
          name_en: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          items?: Json
          name_ar?: string | null
          name_en: string
        }
        Update: {
          created_at?: string | null
          id?: string
          items?: Json
          name_ar?: string | null
          name_en?: string
        }
        Relationships: []
      }
      inventory_items: {
        Row: {
          category_id: string
          cost_price: number | null
          created_at: string | null
          id: string
          linked_services_count: number | null
          markup_percent: number | null
          name_ar: string | null
          name_en: string
          sku: string
          sort_order: number
          status: string
          total_stock: number | null
          unit: string
          updated_at: string | null
        }
        Insert: {
          category_id: string
          cost_price?: number | null
          created_at?: string | null
          id?: string
          linked_services_count?: number | null
          markup_percent?: number | null
          name_ar?: string | null
          name_en: string
          sku: string
          sort_order?: number
          status?: string
          total_stock?: number | null
          unit: string
          updated_at?: string | null
        }
        Update: {
          category_id?: string
          cost_price?: number | null
          created_at?: string | null
          id?: string
          linked_services_count?: number | null
          markup_percent?: number | null
          name_ar?: string | null
          name_en?: string
          sku?: string
          sort_order?: number
          status?: string
          total_stock?: number | null
          unit?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "inventory_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_stock_movements: {
        Row: {
          brand_variant_id: string
          created_at: string
          id: string
          item_name: string
          movement_type: string
          notes: string | null
          qty: number
          reference_id: string | null
          reference_type: string | null
          sku: string | null
          unit_cost: number
          warehouse_id: string | null
        }
        Insert: {
          brand_variant_id: string
          created_at?: string
          id?: string
          item_name: string
          movement_type: string
          notes?: string | null
          qty: number
          reference_id?: string | null
          reference_type?: string | null
          sku?: string | null
          unit_cost?: number
          warehouse_id?: string | null
        }
        Update: {
          brand_variant_id?: string
          created_at?: string
          id?: string
          item_name?: string
          movement_type?: string
          notes?: string | null
          qty?: number
          reference_id?: string | null
          reference_type?: string | null
          sku?: string | null
          unit_cost?: number
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_stock_movements_brand_variant_id_fkey"
            columns: ["brand_variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_brand_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_stock_movements_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_line_items: {
        Row: {
          created_at: string | null
          description: string
          id: string
          invoice_id: string
          match_note: string | null
          match_status: string | null
          qty: number | null
          team_name: string | null
          total: number | null
          unit_price: number | null
        }
        Insert: {
          created_at?: string | null
          description: string
          id?: string
          invoice_id: string
          match_note?: string | null
          match_status?: string | null
          qty?: number | null
          team_name?: string | null
          total?: number | null
          unit_price?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string
          id?: string
          invoice_id?: string
          match_note?: string | null
          match_status?: string | null
          qty?: number | null
          team_name?: string | null
          total?: number | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "customer_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "supplier_bills"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          agent_name: string | null
          created_at: string | null
          customer_id: string | null
          dibsy_checkout_url: string | null
          dibsy_payment_id: string | null
          direction: string
          discount_amount: number
          discount_label: string | null
          division: string | null
          doc_status: string
          due_date: string
          id: string
          invoice_id: string
          invoice_type: string
          issued_date: string
          manually_paid: boolean
          needs_refresh: boolean
          notes: string | null
          paid_amount: number | null
          payment_status: string
          pdf_url: string | null
          phone_id: string | null
          purchase_order_id: string | null
          qb_synced: boolean | null
          receival_id: string | null
          sale_delivery_id: string | null
          sale_order_id: string | null
          source: Database["public"]["Enums"]["invoice_source"]
          source_id: string
          source_label: string | null
          status: Database["public"]["Enums"]["invoice_status"] | null
          subtotal: number | null
          supplier_id: string | null
          tax: number | null
          total_amount: number | null
          updated_at: string | null
        }
        Insert: {
          agent_name?: string | null
          created_at?: string | null
          customer_id?: string | null
          dibsy_checkout_url?: string | null
          dibsy_payment_id?: string | null
          direction?: string
          discount_amount?: number
          discount_label?: string | null
          division?: string | null
          doc_status?: string
          due_date: string
          id?: string
          invoice_id: string
          invoice_type?: string
          issued_date: string
          manually_paid?: boolean
          needs_refresh?: boolean
          notes?: string | null
          paid_amount?: number | null
          payment_status?: string
          pdf_url?: string | null
          phone_id?: string | null
          purchase_order_id?: string | null
          qb_synced?: boolean | null
          receival_id?: string | null
          sale_delivery_id?: string | null
          sale_order_id?: string | null
          source: Database["public"]["Enums"]["invoice_source"]
          source_id: string
          source_label?: string | null
          status?: Database["public"]["Enums"]["invoice_status"] | null
          subtotal?: number | null
          supplier_id?: string | null
          tax?: number | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          agent_name?: string | null
          created_at?: string | null
          customer_id?: string | null
          dibsy_checkout_url?: string | null
          dibsy_payment_id?: string | null
          direction?: string
          discount_amount?: number
          discount_label?: string | null
          division?: string | null
          doc_status?: string
          due_date?: string
          id?: string
          invoice_id?: string
          invoice_type?: string
          issued_date?: string
          manually_paid?: boolean
          needs_refresh?: boolean
          notes?: string | null
          paid_amount?: number | null
          payment_status?: string
          pdf_url?: string | null
          phone_id?: string | null
          purchase_order_id?: string | null
          qb_synced?: boolean | null
          receival_id?: string | null
          sale_delivery_id?: string | null
          sale_order_id?: string | null
          source?: Database["public"]["Enums"]["invoice_source"]
          source_id?: string
          source_label?: string | null
          status?: Database["public"]["Enums"]["invoice_status"] | null
          subtotal?: number | null
          supplier_id?: string | null
          tax?: number | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_credit_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_phone_id_fkey"
            columns: ["phone_id"]
            isOneToOne: false
            referencedRelation: "customer_phones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_receival_id_fkey"
            columns: ["receival_id"]
            isOneToOne: false
            referencedRelation: "receivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_sale_delivery_id_fkey"
            columns: ["sale_delivery_id"]
            isOneToOne: false
            referencedRelation: "sale_deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_sale_order_id_fkey"
            columns: ["sale_order_id"]
            isOneToOne: false
            referencedRelation: "sale_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      landed_costs: {
        Row: {
          all_items_sold: boolean | null
          applied_at: string | null
          attached_po_ids: string[] | null
          attached_receival_ids: string[] | null
          created_at: string | null
          currency: string | null
          date: string
          description: string | null
          id: string
          item_allocations: Json | null
          lc_number: string
          lines: Json | null
          revert_snapshot: Json | null
          total_amount: number | null
          updated_at: string | null
          voided_at: string | null
          voided_reason: string | null
        }
        Insert: {
          all_items_sold?: boolean | null
          applied_at?: string | null
          attached_po_ids?: string[] | null
          attached_receival_ids?: string[] | null
          created_at?: string | null
          currency?: string | null
          date: string
          description?: string | null
          id?: string
          item_allocations?: Json | null
          lc_number: string
          lines?: Json | null
          revert_snapshot?: Json | null
          total_amount?: number | null
          updated_at?: string | null
          voided_at?: string | null
          voided_reason?: string | null
        }
        Update: {
          all_items_sold?: boolean | null
          applied_at?: string | null
          attached_po_ids?: string[] | null
          attached_receival_ids?: string[] | null
          created_at?: string | null
          currency?: string | null
          date?: string
          description?: string | null
          id?: string
          item_allocations?: Json | null
          lc_number?: string
          lines?: Json | null
          revert_snapshot?: Json | null
          total_amount?: number | null
          updated_at?: string | null
          voided_at?: string | null
          voided_reason?: string | null
        }
        Relationships: []
      }
      media_download_jobs: {
        Row: {
          attachment_index: number
          attempts: number
          claimed_at: string | null
          created_at: string
          done_at: string | null
          id: string
          last_error: string | null
          message_id: string
          scheduled_for: string
          status: string
        }
        Insert: {
          attachment_index: number
          attempts?: number
          claimed_at?: string | null
          created_at?: string
          done_at?: string | null
          id?: string
          last_error?: string | null
          message_id: string
          scheduled_for?: string
          status?: string
        }
        Update: {
          attachment_index?: number
          attempts?: number
          claimed_at?: string | null
          created_at?: string
          done_at?: string | null
          id?: string
          last_error?: string | null
          message_id?: string
          scheduled_for?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_download_jobs_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_config: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          has_media_followup: boolean
          id: string
          is_active: boolean
          label: string
          label_ar: string | null
          media_description: string | null
          notes: string | null
          portal_purpose: string | null
          requires_portal: boolean
          slug: string
          sort_order: number
          template_slug: string
          timing_description: string | null
          trigger_type: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          created_by?: string | null
          has_media_followup?: boolean
          id?: string
          is_active?: boolean
          label: string
          label_ar?: string | null
          media_description?: string | null
          notes?: string | null
          portal_purpose?: string | null
          requires_portal?: boolean
          slug: string
          sort_order?: number
          template_slug: string
          timing_description?: string | null
          trigger_type: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          has_media_followup?: boolean
          id?: string
          is_active?: boolean
          label?: string
          label_ar?: string | null
          media_description?: string | null
          notes?: string | null
          portal_purpose?: string | null
          requires_portal?: boolean
          slug?: string
          sort_order?: number
          template_slug?: string
          timing_description?: string | null
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_config_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_config_template_slug_fkey"
            columns: ["template_slug"]
            isOneToOne: false
            referencedRelation: "notification_templates"
            referencedColumns: ["slug"]
          },
        ]
      }
      notification_templates: {
        Row: {
          body_text: string | null
          button_type: string | null
          button_url_suffix_param: string | null
          created_at: string
          created_by: string | null
          description: string | null
          has_buttons: boolean
          id: string
          is_active: boolean
          media_type: string
          param_count: number
          param_names: Json | null
          slug: string
          updated_at: string
          wati_template_name: string
        }
        Insert: {
          body_text?: string | null
          button_type?: string | null
          button_url_suffix_param?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          has_buttons?: boolean
          id?: string
          is_active?: boolean
          media_type?: string
          param_count?: number
          param_names?: Json | null
          slug: string
          updated_at?: string
          wati_template_name?: string
        }
        Update: {
          body_text?: string | null
          button_type?: string | null
          button_url_suffix_param?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          has_buttons?: boolean
          id?: string
          is_active?: boolean
          media_type?: string
          param_count?: number
          param_names?: Json | null
          slug?: string
          updated_at?: string
          wati_template_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_trail: {
        Row: {
          category: Database["public"]["Enums"]["notification_category"]
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          created_by: string | null
          delivery_status: string | null
          error_message: string | null
          external_message_id: string | null
          id: string
          message_preview: string | null
          notification_label: string
          notification_type: string
          order_id: string | null
          provider: string | null
          recipient_name: string
          recipient_phone: string
          status: Database["public"]["Enums"]["notification_status"]
          trigger_detail: string | null
          trigger_type: Database["public"]["Enums"]["notification_trigger"]
        }
        Insert: {
          category: Database["public"]["Enums"]["notification_category"]
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          created_by?: string | null
          delivery_status?: string | null
          error_message?: string | null
          external_message_id?: string | null
          id?: string
          message_preview?: string | null
          notification_label: string
          notification_type: string
          order_id?: string | null
          provider?: string | null
          recipient_name: string
          recipient_phone: string
          status: Database["public"]["Enums"]["notification_status"]
          trigger_detail?: string | null
          trigger_type: Database["public"]["Enums"]["notification_trigger"]
        }
        Update: {
          category?: Database["public"]["Enums"]["notification_category"]
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          created_by?: string | null
          delivery_status?: string | null
          error_message?: string | null
          external_message_id?: string | null
          id?: string
          message_preview?: string | null
          notification_label?: string
          notification_type?: string
          order_id?: string | null
          provider?: string | null
          recipient_name?: string
          recipient_phone?: string
          status?: Database["public"]["Enums"]["notification_status"]
          trigger_detail?: string | null
          trigger_type?: Database["public"]["Enums"]["notification_trigger"]
        }
        Relationships: [
          {
            foreignKeyName: "notification_trail_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string | null
          id: string
          profile_id: string
          read_at: string | null
          related_id: string | null
          related_type: string | null
          title: string
          type: string
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          id?: string
          profile_id: string
          read_at?: string | null
          related_id?: string | null
          related_type?: string | null
          title: string
          type: string
        }
        Update: {
          body?: string | null
          created_at?: string | null
          id?: string
          profile_id?: string
          read_at?: string | null
          related_id?: string | null
          related_type?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_log: {
        Row: {
          action: string
          created_at: string | null
          details: string | null
          id: string
          order_id: string
          user_name: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: string | null
          id?: string
          order_id: string
          user_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: string | null
          id?: string
          order_id?: string
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_quotation_line_items: {
        Row: {
          created_at: string | null
          duration: number | null
          id: string
          name: string
          path: string[]
          price: number
          qty: number
          quotation_id: string
          service_id: string | null
        }
        Insert: {
          created_at?: string | null
          duration?: number | null
          id?: string
          name: string
          path?: string[]
          price: number
          qty?: number
          quotation_id: string
          service_id?: string | null
        }
        Update: {
          created_at?: string | null
          duration?: number | null
          id?: string
          name?: string
          path?: string[]
          price?: number
          qty?: number
          quotation_id?: string
          service_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_quotation_line_items_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "order_quotations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_line_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      order_quotation_log: {
        Row: {
          action: string
          created_at: string | null
          details: string | null
          id: string
          quotation_id: string
          user_name: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: string | null
          id?: string
          quotation_id: string
          user_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: string | null
          id?: string
          quotation_id?: string
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_quotation_log_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "order_quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      order_quotations: {
        Row: {
          agent_name: string | null
          approved_by_customer: boolean | null
          approved_by_manager: boolean | null
          converted_order_id: string | null
          created_at: string | null
          created_date: string
          customer_id: string | null
          discount_type: string
          discount_value: number
          division: string | null
          expiry_date: string
          has_configurable: boolean | null
          id: string
          line_item_count: number | null
          notes: string | null
          quotation_id: string
          sent_date: string | null
          service_customer_id: string
          services_summary: string | null
          status: Database["public"]["Enums"]["order_quotation_status"] | null
          total_amount: number | null
          updated_at: string | null
        }
        Insert: {
          agent_name?: string | null
          approved_by_customer?: boolean | null
          approved_by_manager?: boolean | null
          converted_order_id?: string | null
          created_at?: string | null
          created_date: string
          customer_id?: string | null
          discount_type?: string
          discount_value?: number
          division?: string | null
          expiry_date: string
          has_configurable?: boolean | null
          id?: string
          line_item_count?: number | null
          notes?: string | null
          quotation_id: string
          sent_date?: string | null
          service_customer_id: string
          services_summary?: string | null
          status?: Database["public"]["Enums"]["order_quotation_status"] | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          agent_name?: string | null
          approved_by_customer?: boolean | null
          approved_by_manager?: boolean | null
          converted_order_id?: string | null
          created_at?: string | null
          created_date?: string
          customer_id?: string | null
          discount_type?: string
          discount_value?: number
          division?: string | null
          expiry_date?: string
          has_configurable?: boolean | null
          id?: string
          line_item_count?: number | null
          notes?: string | null
          quotation_id?: string
          sent_date?: string | null
          service_customer_id?: string
          services_summary?: string | null
          status?: Database["public"]["Enums"]["order_quotation_status"] | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_quotations_converted_order_id_fkey"
            columns: ["converted_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_quotations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_credit_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "order_quotations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_quotations_service_customer_id_fkey"
            columns: ["service_customer_id"]
            isOneToOne: false
            referencedRelation: "service_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      order_services: {
        Row: {
          configuration: Json | null
          created_at: string | null
          duration: number | null
          from_time: string | null
          id: string
          name: string
          order_id: string
          path: string[] | null
          price: number | null
          qty: number | null
          service_id: string | null
          to_time: string | null
        }
        Insert: {
          configuration?: Json | null
          created_at?: string | null
          duration?: number | null
          from_time?: string | null
          id?: string
          name: string
          order_id: string
          path?: string[] | null
          price?: number | null
          qty?: number | null
          service_id?: string | null
          to_time?: string | null
        }
        Update: {
          configuration?: Json | null
          created_at?: string | null
          duration?: number | null
          from_time?: string | null
          id?: string
          name?: string
          order_id?: string
          path?: string[] | null
          price?: number | null
          qty?: number | null
          service_id?: string | null
          to_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_services_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      order_team_assignments: {
        Row: {
          created_at: string | null
          duration: string | null
          id: string
          is_full_day: boolean
          order_id: string
          parent_assignment_id: string | null
          scheduled_date: string
          services: Json
          team_id: string
          time_slot: string | null
        }
        Insert: {
          created_at?: string | null
          duration?: string | null
          id?: string
          is_full_day?: boolean
          order_id: string
          parent_assignment_id?: string | null
          scheduled_date: string
          services: Json
          team_id: string
          time_slot?: string | null
        }
        Update: {
          created_at?: string | null
          duration?: string | null
          id?: string
          is_full_day?: boolean
          order_id?: string
          parent_assignment_id?: string | null
          scheduled_date?: string
          services?: Json
          team_id?: string
          time_slot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_team_assignments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_team_assignments_parent_assignment_id_fkey"
            columns: ["parent_assignment_id"]
            isOneToOne: false
            referencedRelation: "order_team_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_team_assignments_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_team_assignments_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_team_monthly_overtime"
            referencedColumns: ["team_id"]
          },
        ]
      }
      order_visit_dates: {
        Row: {
          from_time: string | null
          id: string
          order_id: string
          sort_order: number
          to_time: string | null
          visit_date: string
        }
        Insert: {
          from_time?: string | null
          id?: string
          order_id: string
          sort_order?: number
          to_time?: string | null
          visit_date: string
        }
        Update: {
          from_time?: string | null
          id?: string
          order_id?: string
          sort_order?: number
          to_time?: string | null
          visit_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_visit_dates_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          address: string | null
          address_id: string | null
          agent_name: string | null
          arrival_phone: string | null
          attachments: Json | null
          completed_at: string | null
          completed_by: string | null
          confirmation_pdf_url: string | null
          confirmation_sent_at: string | null
          confirmation_status:
            | Database["public"]["Enums"]["confirmation_status"]
            | null
          created_at: string | null
          created_by: string | null
          customer_id: string | null
          division: string
          follow_up_request_id: string | null
          has_invoice: boolean | null
          id: string
          invoice_number: string | null
          notes: string | null
          order_id: string
          parent_order_id: string | null
          scheduled_date: string
          scheduled_end_date: string | null
          scheduled_time: string | null
          service_customer_id: string
          status: Database["public"]["Enums"]["order_status"] | null
          total_amount: number | null
          type: string | null
          updated_at: string | null
          visit_date: string | null
        }
        Insert: {
          address?: string | null
          address_id?: string | null
          agent_name?: string | null
          arrival_phone?: string | null
          attachments?: Json | null
          completed_at?: string | null
          completed_by?: string | null
          confirmation_pdf_url?: string | null
          confirmation_sent_at?: string | null
          confirmation_status?:
            | Database["public"]["Enums"]["confirmation_status"]
            | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          division: string
          follow_up_request_id?: string | null
          has_invoice?: boolean | null
          id?: string
          invoice_number?: string | null
          notes?: string | null
          order_id: string
          parent_order_id?: string | null
          scheduled_date: string
          scheduled_end_date?: string | null
          scheduled_time?: string | null
          service_customer_id: string
          status?: Database["public"]["Enums"]["order_status"] | null
          total_amount?: number | null
          type?: string | null
          updated_at?: string | null
          visit_date?: string | null
        }
        Update: {
          address?: string | null
          address_id?: string | null
          agent_name?: string | null
          arrival_phone?: string | null
          attachments?: Json | null
          completed_at?: string | null
          completed_by?: string | null
          confirmation_pdf_url?: string | null
          confirmation_sent_at?: string | null
          confirmation_status?:
            | Database["public"]["Enums"]["confirmation_status"]
            | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          division?: string
          follow_up_request_id?: string | null
          has_invoice?: boolean | null
          id?: string
          invoice_number?: string | null
          notes?: string | null
          order_id?: string
          parent_order_id?: string | null
          scheduled_date?: string
          scheduled_end_date?: string | null
          scheduled_time?: string | null
          service_customer_id?: string
          status?: Database["public"]["Enums"]["order_status"] | null
          total_amount?: number | null
          type?: string | null
          updated_at?: string | null
          visit_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "service_customer_addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_credit_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_follow_up_request_id_fkey"
            columns: ["follow_up_request_id"]
            isOneToOne: false
            referencedRelation: "follow_up_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_parent_order_id_fkey"
            columns: ["parent_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_service_customer_id_fkey"
            columns: ["service_customer_id"]
            isOneToOne: false
            referencedRelation: "service_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_bill_allocations: {
        Row: {
          amount: number
          bill_id: string
          created_at: string
          id: string
          payment_id: string
        }
        Insert: {
          amount: number
          bill_id: string
          created_at?: string
          id?: string
          payment_id: string
        }
        Update: {
          amount?: number
          bill_id?: string
          created_at?: string
          id?: string
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_bill_allocations_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "customer_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_bill_allocations_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_bill_allocations_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "supplier_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_bill_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_installments: {
        Row: {
          amount: number
          created_at: string | null
          due_date: string | null
          id: string
          paid_amount: number
          payment_id: string | null
          plan_id: string
          status: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          due_date?: string | null
          id?: string
          paid_amount?: number
          payment_id?: string | null
          plan_id: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          due_date?: string | null
          id?: string
          paid_amount?: number
          payment_id?: string | null
          plan_id?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_installments_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_installments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "payment_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean
          name: string
          requires_payment_link: boolean
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          requires_payment_link?: boolean
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          requires_payment_link?: boolean
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      payment_plans: {
        Row: {
          created_at: string | null
          id: string
          invoice_id: string
          plan_type: string
          status: string
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          invoice_id: string
          plan_type: string
          status?: string
          total_amount: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          invoice_id?: string
          plan_type?: string
          status?: string
          total_amount?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_plans_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "customer_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_plans_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_plans_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "supplier_bills"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_sessions: {
        Row: {
          amount: number
          checkout_url: string | null
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string
          dibsy_payment_id: string | null
          dibsy_response: Json | null
          id: string
          invoice_allocations: Json
          receipt_sent: boolean
          redirect_url: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          checkout_url?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id: string
          dibsy_payment_id?: string | null
          dibsy_response?: Json | null
          id?: string
          invoice_allocations?: Json
          receipt_sent?: boolean
          redirect_url?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          checkout_url?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string
          dibsy_payment_id?: string | null
          dibsy_response?: Json | null
          id?: string
          invoice_allocations?: Json
          receipt_sent?: boolean
          redirect_url?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_sessions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_credit_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "payment_sessions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          agent_name: string | null
          amount: number
          amount_qar: number | null
          bank_name: string | null
          cheque_date: string | null
          cheque_number: string | null
          created_at: string | null
          currency: string
          customer_id: string | null
          date: string
          deleted_at: string | null
          direction: string
          exchange_rate: number
          id: string
          invoice_id: string | null
          method: string
          notes: string | null
          payment_id: string | null
          qb_synced: boolean | null
          reference: string | null
          source_id: string | null
          source_type: string | null
          status: Database["public"]["Enums"]["payment_status"] | null
          supplier_id: string | null
          transaction_id: string | null
          updated_at: string | null
        }
        Insert: {
          agent_name?: string | null
          amount: number
          amount_qar?: number | null
          bank_name?: string | null
          cheque_date?: string | null
          cheque_number?: string | null
          created_at?: string | null
          currency?: string
          customer_id?: string | null
          date: string
          deleted_at?: string | null
          direction?: string
          exchange_rate?: number
          id?: string
          invoice_id?: string | null
          method: string
          notes?: string | null
          payment_id?: string | null
          qb_synced?: boolean | null
          reference?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: Database["public"]["Enums"]["payment_status"] | null
          supplier_id?: string | null
          transaction_id?: string | null
          updated_at?: string | null
        }
        Update: {
          agent_name?: string | null
          amount?: number
          amount_qar?: number | null
          bank_name?: string | null
          cheque_date?: string | null
          cheque_number?: string | null
          created_at?: string | null
          currency?: string
          customer_id?: string | null
          date?: string
          deleted_at?: string | null
          direction?: string
          exchange_rate?: number
          id?: string
          invoice_id?: string | null
          method?: string
          notes?: string | null
          payment_id?: string | null
          qb_synced?: boolean | null
          reference?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: Database["public"]["Enums"]["payment_status"] | null
          supplier_id?: string | null
          transaction_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_credit_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "customer_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "supplier_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      po_approval_chain_tiers: {
        Row: {
          chain_id: string
          deleted_at: string | null
          id: string
          max_amount: number | null
          min_amount: number
          rank: number
          required_roles: string[]
        }
        Insert: {
          chain_id: string
          deleted_at?: string | null
          id?: string
          max_amount?: number | null
          min_amount: number
          rank: number
          required_roles: string[]
        }
        Update: {
          chain_id?: string
          deleted_at?: string | null
          id?: string
          max_amount?: number | null
          min_amount?: number
          rank?: number
          required_roles?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "approval_chain_tiers_chain_id_fkey"
            columns: ["chain_id"]
            isOneToOne: false
            referencedRelation: "po_approval_chains"
            referencedColumns: ["id"]
          },
        ]
      }
      po_approval_chains: {
        Row: {
          archived_at: string | null
          created_at: string | null
          division_id: string | null
          id: string
          is_active: boolean | null
          name: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string | null
          division_id?: string | null
          id?: string
          is_active?: boolean | null
          name: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string | null
          division_id?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_chains_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: true
            referencedRelation: "company_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_chains_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: true
            referencedRelation: "v_team_monthly_overtime"
            referencedColumns: ["division_id"]
          },
        ]
      }
      po_approvals: {
        Row: {
          approved_by: string | null
          comment: string | null
          created_at: string | null
          date: string | null
          force_approved: boolean
          force_comment: string | null
          id: string
          is_active: boolean
          iteration: number
          po_id: string
          role: string
          status: Database["public"]["Enums"]["approval_status"] | null
          tier_rank: number
        }
        Insert: {
          approved_by?: string | null
          comment?: string | null
          created_at?: string | null
          date?: string | null
          force_approved?: boolean
          force_comment?: string | null
          id?: string
          is_active?: boolean
          iteration?: number
          po_id: string
          role: string
          status?: Database["public"]["Enums"]["approval_status"] | null
          tier_rank?: number
        }
        Update: {
          approved_by?: string | null
          comment?: string | null
          created_at?: string | null
          date?: string | null
          force_approved?: boolean
          force_comment?: string | null
          id?: string
          is_active?: boolean
          iteration?: number
          po_id?: string
          role?: string
          status?: Database["public"]["Enums"]["approval_status"] | null
          tier_rank?: number
        }
        Relationships: [
          {
            foreignKeyName: "po_approvals_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      po_edit_requests: {
        Row: {
          created_at: string
          id: string
          po_id: string
          reason: string
          requested_by: string
          review_comment: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          po_id: string
          reason: string
          requested_by: string
          review_comment?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          po_id?: string
          reason?: string
          requested_by?: string
          review_comment?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "po_edit_requests_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_edit_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_edit_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      po_line_items: {
        Row: {
          brand_id: string | null
          brand_variant_id: string | null
          created_at: string | null
          fifo_layers: Json | null
          free_qty: number
          id: string
          item_name: string
          po_id: string
          qty: number
          received_qty: number | null
          sku: string | null
          tool_asset_item_id: string | null
          total_price: number
          unit: string
          unit_price: number
        }
        Insert: {
          brand_id?: string | null
          brand_variant_id?: string | null
          created_at?: string | null
          fifo_layers?: Json | null
          free_qty?: number
          id?: string
          item_name: string
          po_id: string
          qty: number
          received_qty?: number | null
          sku?: string | null
          tool_asset_item_id?: string | null
          total_price: number
          unit: string
          unit_price: number
        }
        Update: {
          brand_id?: string | null
          brand_variant_id?: string | null
          created_at?: string | null
          fifo_layers?: Json | null
          free_qty?: number
          id?: string
          item_name?: string
          po_id?: string
          qty?: number
          received_qty?: number | null
          sku?: string | null
          tool_asset_item_id?: string | null
          total_price?: number
          unit?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "po_line_items_brand_variant_id_fkey"
            columns: ["brand_variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_brand_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_line_items_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_line_items_tool_asset_item_id_fkey"
            columns: ["tool_asset_item_id"]
            isOneToOne: false
            referencedRelation: "tool_asset_items"
            referencedColumns: ["id"]
          },
        ]
      }
      po_rfq_quote_items: {
        Row: {
          id: string
          notes: string | null
          po_line_item_id: string
          quote_id: string
          quoted_price: number
          quoted_qty: number | null
        }
        Insert: {
          id?: string
          notes?: string | null
          po_line_item_id: string
          quote_id: string
          quoted_price?: number
          quoted_qty?: number | null
        }
        Update: {
          id?: string
          notes?: string | null
          po_line_item_id?: string
          quote_id?: string
          quoted_price?: number
          quoted_qty?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "po_rfq_quote_items_po_line_item_id_fkey"
            columns: ["po_line_item_id"]
            isOneToOne: false
            referencedRelation: "po_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_rfq_quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "po_rfq_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      po_rfq_quotes: {
        Row: {
          created_at: string | null
          currency: string
          id: string
          notes: string | null
          po_id: string
          received_date: string | null
          status: string
          supplier_id: string
          total_amount: number | null
        }
        Insert: {
          created_at?: string | null
          currency?: string
          id?: string
          notes?: string | null
          po_id: string
          received_date?: string | null
          status?: string
          supplier_id: string
          total_amount?: number | null
        }
        Update: {
          created_at?: string | null
          currency?: string
          id?: string
          notes?: string | null
          po_id?: string
          received_date?: string | null
          status?: string
          supplier_id?: string
          total_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "po_rfq_quotes_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_rfq_quotes_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      po_versions: {
        Row: {
          currency: string
          delivery_terms: string | null
          delivery_terms_notes: string | null
          discount_amount: number
          discount_label: string | null
          exchange_rate: number
          expected_delivery: string | null
          id: string
          line_items: Json
          payment_milestones: Json | null
          payment_terms: string | null
          payment_terms_notes: string | null
          po_id: string
          snapshot_label: string
          stage: string
          submitted_at: string
          submitted_by: string | null
          subtotal: number
          supplier_id: string
          supplier_name: string
          vendor_notes: string | null
          version_number: number
        }
        Insert: {
          currency: string
          delivery_terms?: string | null
          delivery_terms_notes?: string | null
          discount_amount?: number
          discount_label?: string | null
          exchange_rate: number
          expected_delivery?: string | null
          id?: string
          line_items: Json
          payment_milestones?: Json | null
          payment_terms?: string | null
          payment_terms_notes?: string | null
          po_id: string
          snapshot_label?: string
          stage: string
          submitted_at?: string
          submitted_by?: string | null
          subtotal: number
          supplier_id: string
          supplier_name: string
          vendor_notes?: string | null
          version_number: number
        }
        Update: {
          currency?: string
          delivery_terms?: string | null
          delivery_terms_notes?: string | null
          discount_amount?: number
          discount_label?: string | null
          exchange_rate?: number
          expected_delivery?: string | null
          id?: string
          line_items?: Json
          payment_milestones?: Json | null
          payment_terms?: string | null
          payment_terms_notes?: string | null
          po_id?: string
          snapshot_label?: string
          stage?: string
          submitted_at?: string
          submitted_by?: string | null
          subtotal?: number
          supplier_id?: string
          supplier_name?: string
          vendor_notes?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "po_versions_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_factors: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          division_id: string | null
          factor: number
          id: string
          label: string
          label_ar: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          division_id?: string | null
          factor?: number
          id?: string
          label: string
          label_ar?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          division_id?: string | null
          factor?: number
          id?: string
          label?: string
          label_ar?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pricing_factors_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_factors_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "company_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_factors_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "v_team_monthly_overtime"
            referencedColumns: ["division_id"]
          },
        ]
      }
      profiles: {
        Row: {
          auth_user_id: string
          avatar_url: string | null
          created_at: string
          created_by: string | null
          cx_extension: string | null
          division_id: string | null
          email: string | null
          feature_flags: string[]
          full_name: string
          full_name_ar: string | null
          has_contact_centre_access: boolean
          id: string
          is_active: boolean | null
          is_division_manager: boolean
          must_change_password: boolean
          phone: string | null
          threecx_extension: string | null
          title: string
          updated_at: string
          user_type: Database["public"]["Enums"]["user_type"]
        }
        Insert: {
          auth_user_id: string
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          cx_extension?: string | null
          division_id?: string | null
          email?: string | null
          feature_flags?: string[]
          full_name: string
          full_name_ar?: string | null
          has_contact_centre_access?: boolean
          id?: string
          is_active?: boolean | null
          is_division_manager?: boolean
          must_change_password?: boolean
          phone?: string | null
          threecx_extension?: string | null
          title?: string
          updated_at?: string
          user_type?: Database["public"]["Enums"]["user_type"]
        }
        Update: {
          auth_user_id?: string
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          cx_extension?: string | null
          division_id?: string | null
          email?: string | null
          feature_flags?: string[]
          full_name?: string
          full_name_ar?: string | null
          has_contact_centre_access?: boolean
          id?: string
          is_active?: boolean | null
          is_division_manager?: boolean
          must_change_password?: boolean
          phone?: string | null
          threecx_extension?: string | null
          title?: string
          updated_at?: string
          user_type?: Database["public"]["Enums"]["user_type"]
        }
        Relationships: [
          {
            foreignKeyName: "profiles_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "company_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "v_team_monthly_overtime"
            referencedColumns: ["division_id"]
          },
        ]
      }
      promotion_campaigns: {
        Row: {
          applicable_to: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          divisions: string[] | null
          end_date: string
          id: string
          name: string
          start_date: string
          status: Database["public"]["Enums"]["campaign_status"] | null
          updated_at: string | null
        }
        Insert: {
          applicable_to?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          divisions?: string[] | null
          end_date: string
          id?: string
          name: string
          start_date: string
          status?: Database["public"]["Enums"]["campaign_status"] | null
          updated_at?: string | null
        }
        Update: {
          applicable_to?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          divisions?: string[] | null
          end_date?: string
          id?: string
          name?: string
          start_date?: string
          status?: Database["public"]["Enums"]["campaign_status"] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      promotion_rules: {
        Row: {
          campaign_id: string
          created_at: string | null
          description: string | null
          discount_amount: number | null
          discount_percent: number | null
          free_service_id: string | null
          free_service_name: string | null
          id: string
          service_ids: string[] | null
          type: Database["public"]["Enums"]["promotion_rule_type"]
        }
        Insert: {
          campaign_id: string
          created_at?: string | null
          description?: string | null
          discount_amount?: number | null
          discount_percent?: number | null
          free_service_id?: string | null
          free_service_name?: string | null
          id?: string
          service_ids?: string[] | null
          type: Database["public"]["Enums"]["promotion_rule_type"]
        }
        Update: {
          campaign_id?: string
          created_at?: string | null
          description?: string | null
          discount_amount?: number | null
          discount_percent?: number | null
          free_service_id?: string | null
          free_service_name?: string | null
          id?: string
          service_ids?: string[] | null
          type?: Database["public"]["Enums"]["promotion_rule_type"]
        }
        Relationships: [
          {
            foreignKeyName: "promotion_rules_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "promotion_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          approval_level: number | null
          created_at: string | null
          created_by: string | null
          created_date: string
          currency: string | null
          deleted_at: string | null
          delivery_terms: string | null
          delivery_terms_notes: string | null
          discount_amount: number
          discount_label: string | null
          division_id: string | null
          exchange_rate: number | null
          expected_delivery: string | null
          id: string
          payment_milestones: Json | null
          payment_terms: string | null
          payment_terms_notes: string | null
          pdf_confirmed_url: string | null
          pdf_draft_url: string | null
          pdf_payment_hash: string | null
          pdf_po_url: string | null
          pdf_rfq_url: string | null
          po_number: string
          po_type: Database["public"]["Enums"]["po_type"]
          rfq_id: string | null
          rfq_supplier_ids: string[] | null
          status: Database["public"]["Enums"]["po_status"] | null
          subtotal: number | null
          supplier_id: string
          supplier_name: string
          total_qar: number | null
          updated_at: string | null
          vendor_notes: string | null
          version_number: number
          warehouse_id: string | null
        }
        Insert: {
          approval_level?: number | null
          created_at?: string | null
          created_by?: string | null
          created_date: string
          currency?: string | null
          deleted_at?: string | null
          delivery_terms?: string | null
          delivery_terms_notes?: string | null
          discount_amount?: number
          discount_label?: string | null
          division_id?: string | null
          exchange_rate?: number | null
          expected_delivery?: string | null
          id?: string
          payment_milestones?: Json | null
          payment_terms?: string | null
          payment_terms_notes?: string | null
          pdf_confirmed_url?: string | null
          pdf_draft_url?: string | null
          pdf_payment_hash?: string | null
          pdf_po_url?: string | null
          pdf_rfq_url?: string | null
          po_number: string
          po_type?: Database["public"]["Enums"]["po_type"]
          rfq_id?: string | null
          rfq_supplier_ids?: string[] | null
          status?: Database["public"]["Enums"]["po_status"] | null
          subtotal?: number | null
          supplier_id: string
          supplier_name: string
          total_qar?: number | null
          updated_at?: string | null
          vendor_notes?: string | null
          version_number?: number
          warehouse_id?: string | null
        }
        Update: {
          approval_level?: number | null
          created_at?: string | null
          created_by?: string | null
          created_date?: string
          currency?: string | null
          deleted_at?: string | null
          delivery_terms?: string | null
          delivery_terms_notes?: string | null
          discount_amount?: number
          discount_label?: string | null
          division_id?: string | null
          exchange_rate?: number | null
          expected_delivery?: string | null
          id?: string
          payment_milestones?: Json | null
          payment_terms?: string | null
          payment_terms_notes?: string | null
          pdf_confirmed_url?: string | null
          pdf_draft_url?: string | null
          pdf_payment_hash?: string | null
          pdf_po_url?: string | null
          pdf_rfq_url?: string | null
          po_number?: string
          po_type?: Database["public"]["Enums"]["po_type"]
          rfq_id?: string | null
          rfq_supplier_ids?: string[] | null
          status?: Database["public"]["Enums"]["po_status"] | null
          subtotal?: number | null
          supplier_id?: string
          supplier_name?: string
          total_qar?: number | null
          updated_at?: string | null
          vendor_notes?: string | null
          version_number?: number
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_created_by_profiles_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "company_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "v_team_monthly_overtime"
            referencedColumns: ["division_id"]
          },
          {
            foreignKeyName: "purchase_orders_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      purge_batches: {
        Row: {
          attachment_bytes: number
          filter_payload: Json
          hard_deleted_at: string | null
          id: string
          message_count: number
          performed_by: string
          restored_at: string | null
          soft_deleted_at: string
        }
        Insert: {
          attachment_bytes?: number
          filter_payload: Json
          hard_deleted_at?: string | null
          id?: string
          message_count: number
          performed_by: string
          restored_at?: string | null
          soft_deleted_at?: string
        }
        Update: {
          attachment_bytes?: number
          filter_payload?: Json
          hard_deleted_at?: string | null
          id?: string
          message_count?: number
          performed_by?: string
          restored_at?: string | null
          soft_deleted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purge_batches_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      qb_accounts: {
        Row: {
          account_sub_type: string | null
          account_type: string
          acct_num: string | null
          active: boolean
          classification: string
          current_balance: number | null
          fully_qualified_name: string | null
          id: string
          name: string
          qb_company: string
          qb_id: string
          synced_at: string
        }
        Insert: {
          account_sub_type?: string | null
          account_type: string
          acct_num?: string | null
          active?: boolean
          classification: string
          current_balance?: number | null
          fully_qualified_name?: string | null
          id?: string
          name: string
          qb_company?: string
          qb_id: string
          synced_at?: string
        }
        Update: {
          account_sub_type?: string | null
          account_type?: string
          acct_num?: string | null
          active?: boolean
          classification?: string
          current_balance?: number | null
          fully_qualified_name?: string | null
          id?: string
          name?: string
          qb_company?: string
          qb_id?: string
          synced_at?: string
        }
        Relationships: []
      }
      qb_division_mappings: {
        Row: {
          created_at: string
          division: string
          id: string
          mapping_key: string | null
          mapping_type: string
          qb_account_id: string | null
          qb_company: string
          qb_item_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          division: string
          id?: string
          mapping_key?: string | null
          mapping_type: string
          qb_account_id?: string | null
          qb_company?: string
          qb_item_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          division?: string
          id?: string
          mapping_key?: string | null
          mapping_type?: string
          qb_account_id?: string | null
          qb_company?: string
          qb_item_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qb_division_mappings_qb_account_id_fkey"
            columns: ["qb_account_id"]
            isOneToOne: false
            referencedRelation: "qb_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qb_division_mappings_qb_item_id_fkey"
            columns: ["qb_item_id"]
            isOneToOne: false
            referencedRelation: "qb_items"
            referencedColumns: ["id"]
          },
        ]
      }
      qb_items: {
        Row: {
          active: boolean
          expense_account_ref: string | null
          id: string
          income_account_ref: string | null
          name: string
          qb_company: string
          qb_id: string
          synced_at: string
          type: string | null
        }
        Insert: {
          active?: boolean
          expense_account_ref?: string | null
          id?: string
          income_account_ref?: string | null
          name: string
          qb_company?: string
          qb_id: string
          synced_at?: string
          type?: string | null
        }
        Update: {
          active?: boolean
          expense_account_ref?: string | null
          id?: string
          income_account_ref?: string | null
          name?: string
          qb_company?: string
          qb_id?: string
          synced_at?: string
          type?: string | null
        }
        Relationships: []
      }
      qc_checklists: {
        Row: {
          created_at: string | null
          id: string
          is_general: boolean | null
          label: string
          max_score: number | null
          service_id: string | null
          service_name: string | null
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_general?: boolean | null
          label: string
          max_score?: number | null
          service_id?: string | null
          service_name?: string | null
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_general?: boolean | null
          label?: string
          max_score?: number | null
          service_id?: string | null
          service_name?: string | null
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "qc_checklists_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      qc_inspection_results: {
        Row: {
          created_at: string | null
          date: string
          general_checklist: Json | null
          id: string
          images: string[] | null
          max_possible_score: number | null
          notes: string | null
          order_id: string
          percentage: number | null
          qc_team_id: string
          schedule_entry_id: string
          service_checklist: Json | null
          team_id: string
          total_score: number | null
        }
        Insert: {
          created_at?: string | null
          date: string
          general_checklist?: Json | null
          id?: string
          images?: string[] | null
          max_possible_score?: number | null
          notes?: string | null
          order_id: string
          percentage?: number | null
          qc_team_id: string
          schedule_entry_id: string
          service_checklist?: Json | null
          team_id: string
          total_score?: number | null
        }
        Update: {
          created_at?: string | null
          date?: string
          general_checklist?: Json | null
          id?: string
          images?: string[] | null
          max_possible_score?: number | null
          notes?: string | null
          order_id?: string
          percentage?: number | null
          qc_team_id?: string
          schedule_entry_id?: string
          service_checklist?: Json | null
          team_id?: string
          total_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "qc_inspection_results_qc_team_id_fkey"
            columns: ["qc_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_inspection_results_qc_team_id_fkey"
            columns: ["qc_team_id"]
            isOneToOne: false
            referencedRelation: "v_team_monthly_overtime"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "qc_inspection_results_schedule_entry_id_fkey"
            columns: ["schedule_entry_id"]
            isOneToOne: false
            referencedRelation: "qc_schedule"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_inspection_results_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_inspection_results_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_team_monthly_overtime"
            referencedColumns: ["team_id"]
          },
        ]
      }
      qc_schedule: {
        Row: {
          assigned_qc_team_id: string | null
          created_at: string | null
          id: string
          order_id: string
          order_type: string | null
          priority: Database["public"]["Enums"]["qc_priority"] | null
          reason: string | null
          scheduled_date: string
          service_name: string
          status: Database["public"]["Enums"]["qc_schedule_status"] | null
          team_id: string
          updated_at: string | null
        }
        Insert: {
          assigned_qc_team_id?: string | null
          created_at?: string | null
          id?: string
          order_id: string
          order_type?: string | null
          priority?: Database["public"]["Enums"]["qc_priority"] | null
          reason?: string | null
          scheduled_date: string
          service_name: string
          status?: Database["public"]["Enums"]["qc_schedule_status"] | null
          team_id: string
          updated_at?: string | null
        }
        Update: {
          assigned_qc_team_id?: string | null
          created_at?: string | null
          id?: string
          order_id?: string
          order_type?: string | null
          priority?: Database["public"]["Enums"]["qc_priority"] | null
          reason?: string | null
          scheduled_date?: string
          service_name?: string
          status?: Database["public"]["Enums"]["qc_schedule_status"] | null
          team_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qc_schedule_assigned_qc_team_id_fkey"
            columns: ["assigned_qc_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_schedule_assigned_qc_team_id_fkey"
            columns: ["assigned_qc_team_id"]
            isOneToOne: false
            referencedRelation: "v_team_monthly_overtime"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "qc_schedule_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_schedule_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_team_monthly_overtime"
            referencedColumns: ["team_id"]
          },
        ]
      }
      qc_team_scores: {
        Row: {
          created_at: string | null
          current_score: number | null
          division: Database["public"]["Enums"]["division"]
          id: string
          last_inspection: string | null
          member_change_date: string | null
          previous_scores: Json | null
          service_history: string[] | null
          team_id: string
          total_inspections: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          current_score?: number | null
          division: Database["public"]["Enums"]["division"]
          id?: string
          last_inspection?: string | null
          member_change_date?: string | null
          previous_scores?: Json | null
          service_history?: string[] | null
          team_id: string
          total_inspections?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          current_score?: number | null
          division?: Database["public"]["Enums"]["division"]
          id?: string
          last_inspection?: string | null
          member_change_date?: string | null
          previous_scores?: Json | null
          service_history?: string[] | null
          team_id?: string
          total_inspections?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qc_team_scores_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_team_scores_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_team_monthly_overtime"
            referencedColumns: ["team_id"]
          },
        ]
      }
      reason_list_categories: {
        Row: {
          active: boolean
          created_at: string
          deleted_at: string | null
          id: string
          label: string
          slug: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          deleted_at?: string | null
          id?: string
          label: string
          slug: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          deleted_at?: string | null
          id?: string
          label?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      reason_lists: {
        Row: {
          active: boolean | null
          category: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          division_ids: string[] | null
          id: string
          label: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean | null
          category: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          division_ids?: string[] | null
          id?: string
          label: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean | null
          category?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          division_ids?: string[] | null
          id?: string
          label?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reason_lists_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      receival_edit_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          expires_at: string | null
          id: string
          reason: string
          receival_id: string
          rejection_note: string | null
          requested_by: string
          status: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          reason: string
          receival_id: string
          rejection_note?: string | null
          requested_by: string
          status?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          reason?: string
          receival_id?: string
          rejection_note?: string | null
          requested_by?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "receival_edit_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receival_edit_requests_receival_id_fkey"
            columns: ["receival_id"]
            isOneToOne: false
            referencedRelation: "receivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receival_edit_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      receival_items: {
        Row: {
          brand_variant_id: string | null
          created_at: string | null
          id: string
          is_free: boolean | null
          item_name: string
          po_line_item_id: string | null
          qty_received: number
          receival_id: string
          sku: string | null
          unit_cost: number
        }
        Insert: {
          brand_variant_id?: string | null
          created_at?: string | null
          id?: string
          is_free?: boolean | null
          item_name: string
          po_line_item_id?: string | null
          qty_received: number
          receival_id: string
          sku?: string | null
          unit_cost: number
        }
        Update: {
          brand_variant_id?: string | null
          created_at?: string | null
          id?: string
          is_free?: boolean | null
          item_name?: string
          po_line_item_id?: string | null
          qty_received?: number
          receival_id?: string
          sku?: string | null
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "receival_items_brand_variant_id_fkey"
            columns: ["brand_variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_brand_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receival_items_po_line_item_id_fkey"
            columns: ["po_line_item_id"]
            isOneToOne: false
            referencedRelation: "po_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receival_items_receival_id_fkey"
            columns: ["receival_id"]
            isOneToOne: false
            referencedRelation: "receivals"
            referencedColumns: ["id"]
          },
        ]
      }
      receivals: {
        Row: {
          check_sheet_pdf_url: string | null
          created_at: string | null
          date: string
          id: string
          is_replacement: boolean
          landed_cost_id: string | null
          notes: string | null
          po_id: string
          receipt_pdf_url: string | null
          receival_number: string
          received_by: string | null
          received_by_name: string | null
          source_debit_note_id: string | null
          status: Database["public"]["Enums"]["receival_status"] | null
          updated_at: string | null
          warehouse_id: string
        }
        Insert: {
          check_sheet_pdf_url?: string | null
          created_at?: string | null
          date: string
          id?: string
          is_replacement?: boolean
          landed_cost_id?: string | null
          notes?: string | null
          po_id: string
          receipt_pdf_url?: string | null
          receival_number: string
          received_by?: string | null
          received_by_name?: string | null
          source_debit_note_id?: string | null
          status?: Database["public"]["Enums"]["receival_status"] | null
          updated_at?: string | null
          warehouse_id: string
        }
        Update: {
          check_sheet_pdf_url?: string | null
          created_at?: string | null
          date?: string
          id?: string
          is_replacement?: boolean
          landed_cost_id?: string | null
          notes?: string | null
          po_id?: string
          receipt_pdf_url?: string | null
          receival_number?: string
          received_by?: string | null
          received_by_name?: string | null
          source_debit_note_id?: string | null
          status?: Database["public"]["Enums"]["receival_status"] | null
          updated_at?: string | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receivals_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivals_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivals_source_debit_note_id_fkey"
            columns: ["source_debit_note_id"]
            isOneToOne: false
            referencedRelation: "credit_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivals_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      reminder_categories: {
        Row: {
          created_at: string | null
          icon: string | null
          id: string
          name: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          icon?: string | null
          id?: string
          name: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          icon?: string | null
          id?: string
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      reminders: {
        Row: {
          category_id: string
          channel: Database["public"]["Enums"]["reminder_channel"] | null
          created_at: string | null
          description: string | null
          id: string
          name: string
          name_ar: string | null
          status: Database["public"]["Enums"]["service_status"] | null
          template: string | null
          timing: string | null
          updated_at: string | null
        }
        Insert: {
          category_id: string
          channel?: Database["public"]["Enums"]["reminder_channel"] | null
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          name_ar?: string | null
          status?: Database["public"]["Enums"]["service_status"] | null
          template?: string | null
          timing?: string | null
          updated_at?: string | null
        }
        Update: {
          category_id?: string
          channel?: Database["public"]["Enums"]["reminder_channel"] | null
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          name_ar?: string | null
          status?: Database["public"]["Enums"]["service_status"] | null
          template?: string | null
          timing?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reminders_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "reminder_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      returns: {
        Row: {
          created_at: string
          created_by: string | null
          created_by_name: string | null
          credit_note_id: string | null
          date: string
          deleted_at: string | null
          dispatched_at: string | null
          division_id: string | null
          id: string
          items: Json
          notes: string | null
          pdf_url: string | null
          reason: string
          restock_warehouse_id: string | null
          restocked_at: string | null
          return_number: string
          source_id: string
          source_type: Database["public"]["Enums"]["return_source_type"]
          status: Database["public"]["Enums"]["return_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          credit_note_id?: string | null
          date?: string
          deleted_at?: string | null
          dispatched_at?: string | null
          division_id?: string | null
          id?: string
          items?: Json
          notes?: string | null
          pdf_url?: string | null
          reason?: string
          restock_warehouse_id?: string | null
          restocked_at?: string | null
          return_number: string
          source_id: string
          source_type: Database["public"]["Enums"]["return_source_type"]
          status?: Database["public"]["Enums"]["return_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          credit_note_id?: string | null
          date?: string
          deleted_at?: string | null
          dispatched_at?: string | null
          division_id?: string | null
          id?: string
          items?: Json
          notes?: string | null
          pdf_url?: string | null
          reason?: string
          restock_warehouse_id?: string | null
          restocked_at?: string | null
          return_number?: string
          source_id?: string
          source_type?: Database["public"]["Enums"]["return_source_type"]
          status?: Database["public"]["Enums"]["return_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "returns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_credit_note_id_fkey"
            columns: ["credit_note_id"]
            isOneToOne: false
            referencedRelation: "credit_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "company_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "v_team_monthly_overtime"
            referencedColumns: ["division_id"]
          },
          {
            foreignKeyName: "returns_restock_warehouse_id_fkey"
            columns: ["restock_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      rfq_line_items: {
        Row: {
          created_at: string | null
          id: string
          item_name: string
          qty: number
          rfq_id: string
          sku: string | null
          target_price: number | null
          unit: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          item_name: string
          qty: number
          rfq_id: string
          sku?: string | null
          target_price?: number | null
          unit: string
        }
        Update: {
          created_at?: string | null
          id?: string
          item_name?: string
          qty?: number
          rfq_id?: string
          sku?: string | null
          target_price?: number | null
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "rfq_line_items_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
        ]
      }
      rfq_quotes: {
        Row: {
          created_at: string | null
          currency: string | null
          id: string
          items: Json
          received_date: string | null
          rfq_id: string
          supplier_id: string
          supplier_name: string
          total_amount: number | null
        }
        Insert: {
          created_at?: string | null
          currency?: string | null
          id?: string
          items: Json
          received_date?: string | null
          rfq_id: string
          supplier_id: string
          supplier_name: string
          total_amount?: number | null
        }
        Update: {
          created_at?: string | null
          currency?: string | null
          id?: string
          items?: Json
          received_date?: string | null
          rfq_id?: string
          supplier_id?: string
          supplier_name?: string
          total_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rfq_quotes_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
        ]
      }
      rfqs: {
        Row: {
          created_at: string | null
          created_date: string
          due_date: string
          id: string
          rfq_number: string
          status: Database["public"]["Enums"]["rfq_status"] | null
          suppliers: string[] | null
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_date: string
          due_date: string
          id?: string
          rfq_number: string
          status?: Database["public"]["Enums"]["rfq_status"] | null
          suppliers?: string[] | null
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_date?: string
          due_date?: string
          id?: string
          rfq_number?: string
          status?: Database["public"]["Enums"]["rfq_status"] | null
          suppliers?: string[] | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      sale_deliveries: {
        Row: {
          created_at: string
          created_by: string | null
          created_by_name: string | null
          date: string
          delivery_number: string
          id: string
          items: Json
          pdf_url: string | null
          return_id: string | null
          sale_order_id: string
          source_credit_note_id: string | null
          status: Database["public"]["Enums"]["sale_delivery_status"] | null
          type: string
          updated_at: string
          warehouse_id: string | null
          warehouse_name: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          date: string
          delivery_number: string
          id?: string
          items?: Json
          pdf_url?: string | null
          return_id?: string | null
          sale_order_id: string
          source_credit_note_id?: string | null
          status?: Database["public"]["Enums"]["sale_delivery_status"] | null
          type?: string
          updated_at?: string
          warehouse_id?: string | null
          warehouse_name?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          date?: string
          delivery_number?: string
          id?: string
          items?: Json
          pdf_url?: string | null
          return_id?: string | null
          sale_order_id?: string
          source_credit_note_id?: string | null
          status?: Database["public"]["Enums"]["sale_delivery_status"] | null
          type?: string
          updated_at?: string
          warehouse_id?: string | null
          warehouse_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_deliveries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_deliveries_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_deliveries_sale_order_id_fkey"
            columns: ["sale_order_id"]
            isOneToOne: false
            referencedRelation: "sale_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_deliveries_source_credit_note_id_fkey"
            columns: ["source_credit_note_id"]
            isOneToOne: false
            referencedRelation: "credit_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_deliveries_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_order_approvals: {
        Row: {
          approval_type: Database["public"]["Enums"]["approval_type"]
          comment: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decided_by_name: string | null
          force_approved: boolean
          force_comment: string | null
          id: string
          is_active: boolean
          iteration: number
          reason: string | null
          requested_by: string | null
          source_id: string
          source_type: Database["public"]["Enums"]["approval_source_type"]
          status: Database["public"]["Enums"]["approval_status"] | null
          step_order: number
          step_role: string | null
          updated_at: string
        }
        Insert: {
          approval_type: Database["public"]["Enums"]["approval_type"]
          comment?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decided_by_name?: string | null
          force_approved?: boolean
          force_comment?: string | null
          id?: string
          is_active?: boolean
          iteration?: number
          reason?: string | null
          requested_by?: string | null
          source_id: string
          source_type: Database["public"]["Enums"]["approval_source_type"]
          status?: Database["public"]["Enums"]["approval_status"] | null
          step_order?: number
          step_role?: string | null
          updated_at?: string
        }
        Update: {
          approval_type?: Database["public"]["Enums"]["approval_type"]
          comment?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decided_by_name?: string | null
          force_approved?: boolean
          force_comment?: string | null
          id?: string
          is_active?: boolean
          iteration?: number
          reason?: string | null
          requested_by?: string | null
          source_id?: string
          source_type?: Database["public"]["Enums"]["approval_source_type"]
          status?: Database["public"]["Enums"]["approval_status"] | null
          step_order?: number
          step_role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_order_lines: {
        Row: {
          avg_cost: number
          brand_variant_id: string | null
          created_at: string
          created_by: string | null
          delivered_qty: number | null
          id: string
          item_id: string | null
          item_name: string
          line_type: string
          qty: number
          sale_order_id: string
          sku: string | null
          tool_asset_item_id: string | null
          total: number
          unit: string
          unit_price: number
        }
        Insert: {
          avg_cost?: number
          brand_variant_id?: string | null
          created_at?: string
          created_by?: string | null
          delivered_qty?: number | null
          id?: string
          item_id?: string | null
          item_name: string
          line_type?: string
          qty?: number
          sale_order_id: string
          sku?: string | null
          tool_asset_item_id?: string | null
          total?: number
          unit?: string
          unit_price?: number
        }
        Update: {
          avg_cost?: number
          brand_variant_id?: string | null
          created_at?: string
          created_by?: string | null
          delivered_qty?: number | null
          id?: string
          item_id?: string | null
          item_name?: string
          line_type?: string
          qty?: number
          sale_order_id?: string
          sku?: string | null
          tool_asset_item_id?: string | null
          total?: number
          unit?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_order_lines_brand_variant_id_fkey"
            columns: ["brand_variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_brand_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_order_lines_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_order_lines_sale_order_id_fkey"
            columns: ["sale_order_id"]
            isOneToOne: false
            referencedRelation: "sale_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_order_lines_tool_asset_item_id_fkey"
            columns: ["tool_asset_item_id"]
            isOneToOne: false
            referencedRelation: "tool_asset_items"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_orders: {
        Row: {
          campaign_id: string | null
          created_at: string
          created_by: string | null
          created_by_name: string | null
          currency: string
          customer_id: string
          customer_notes: string | null
          deleted_at: string | null
          delivery_terms: string | null
          delivery_terms_notes: string | null
          discount_amount: number | null
          discount_amount_resolved: number | null
          discount_label: string | null
          discount_type: string | null
          division_id: string | null
          exchange_rate: number
          expected_delivery: string | null
          id: string
          notes: string | null
          payment_milestones: Json | null
          payment_terms: string | null
          payment_terms_notes: string | null
          quotation_pdf_url: string | null
          so_number: string
          status: Database["public"]["Enums"]["sale_order_status"] | null
          subtotal: number | null
          tax: number | null
          total: number | null
          updated_at: string
          validity_days: number
          voucher_id: string | null
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          currency?: string
          customer_id: string
          customer_notes?: string | null
          deleted_at?: string | null
          delivery_terms?: string | null
          delivery_terms_notes?: string | null
          discount_amount?: number | null
          discount_amount_resolved?: number | null
          discount_label?: string | null
          discount_type?: string | null
          division_id?: string | null
          exchange_rate?: number
          expected_delivery?: string | null
          id?: string
          notes?: string | null
          payment_milestones?: Json | null
          payment_terms?: string | null
          payment_terms_notes?: string | null
          quotation_pdf_url?: string | null
          so_number: string
          status?: Database["public"]["Enums"]["sale_order_status"] | null
          subtotal?: number | null
          tax?: number | null
          total?: number | null
          updated_at?: string
          validity_days?: number
          voucher_id?: string | null
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          currency?: string
          customer_id?: string
          customer_notes?: string | null
          deleted_at?: string | null
          delivery_terms?: string | null
          delivery_terms_notes?: string | null
          discount_amount?: number | null
          discount_amount_resolved?: number | null
          discount_label?: string | null
          discount_type?: string | null
          division_id?: string | null
          exchange_rate?: number
          expected_delivery?: string | null
          id?: string
          notes?: string | null
          payment_milestones?: Json | null
          payment_terms?: string | null
          payment_terms_notes?: string | null
          quotation_pdf_url?: string | null
          so_number?: string
          status?: Database["public"]["Enums"]["sale_order_status"] | null
          subtotal?: number | null
          tax?: number | null
          total?: number | null
          updated_at?: string
          validity_days?: number
          voucher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_orders_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "promotion_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_credit_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "sale_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_orders_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "company_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_orders_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "v_team_monthly_overtime"
            referencedColumns: ["division_id"]
          },
          {
            foreignKeyName: "sale_orders_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      schedules: {
        Row: {
          created_at: string | null
          days: Json
          deleted_at: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          days: Json
          deleted_at?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          days?: Json
          deleted_at?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      service_brands: {
        Row: {
          brand_id: string
          created_at: string
          id: string
          is_reliable: boolean
          reliability_factor: number
          service_id: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          id?: string
          is_reliable?: boolean
          reliability_factor?: number
          service_id: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          id?: string
          is_reliable?: boolean
          reliability_factor?: number
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_brands_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_brands_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_customer_addresses: {
        Row: {
          address_type: string
          building: string | null
          created_at: string
          customer_id: string
          id: string
          is_geocoded: boolean
          is_primary: boolean
          label: string | null
          lat: number | null
          lng: number | null
          phone_id: string | null
          street: string | null
          tags: string[]
          unit: string | null
          waze_link: string | null
          zone: string | null
        }
        Insert: {
          address_type: string
          building?: string | null
          created_at?: string
          customer_id: string
          id?: string
          is_geocoded?: boolean
          is_primary?: boolean
          label?: string | null
          lat?: number | null
          lng?: number | null
          phone_id?: string | null
          street?: string | null
          tags?: string[]
          unit?: string | null
          waze_link?: string | null
          zone?: string | null
        }
        Update: {
          address_type?: string
          building?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          is_geocoded?: boolean
          is_primary?: boolean
          label?: string | null
          lat?: number | null
          lng?: number | null
          phone_id?: string | null
          street?: string | null
          tags?: string[]
          unit?: string | null
          waze_link?: string | null
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_customer_addresses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "service_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_customer_addresses_phone_id_fkey"
            columns: ["phone_id"]
            isOneToOne: false
            referencedRelation: "service_customer_phones"
            referencedColumns: ["id"]
          },
        ]
      }
      service_customer_phones: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          is_primary: boolean
          label: string | null
          phone: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          is_primary?: boolean
          label?: string | null
          phone: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          is_primary?: boolean
          label?: string | null
          phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_customer_phones_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "service_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      service_customers: {
        Row: {
          created_at: string
          customer_type: string
          id: string
          is_blocked: boolean
          legacy_customer_id: string | null
          name: string
          name_ar: string | null
          pending_payment_amount: number
          referral_source: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_type?: string
          id?: string
          is_blocked?: boolean
          legacy_customer_id?: string | null
          name: string
          name_ar?: string | null
          pending_payment_amount?: number
          referral_source?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_type?: string
          id?: string
          is_blocked?: boolean
          legacy_customer_id?: string | null
          name?: string
          name_ar?: string | null
          pending_payment_amount?: number
          referral_source?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      service_edit_requests: {
        Row: {
          change_type: Database["public"]["Enums"]["service_change_type"]
          changes: Json
          created_at: string
          division: string[] | null
          id: string
          rejection_reason: string | null
          requested_at: string
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          service_id: string | null
          status: Database["public"]["Enums"]["service_change_status"]
          updated_at: string
        }
        Insert: {
          change_type: Database["public"]["Enums"]["service_change_type"]
          changes: Json
          created_at?: string
          division?: string[] | null
          id?: string
          rejection_reason?: string | null
          requested_at?: string
          requested_by: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          service_id?: string | null
          status?: Database["public"]["Enums"]["service_change_status"]
          updated_at?: string
        }
        Update: {
          change_type?: Database["public"]["Enums"]["service_change_type"]
          changes?: Json
          created_at?: string
          division?: string[] | null
          id?: string
          rejection_reason?: string | null
          requested_at?: string
          requested_by?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          service_id?: string | null
          status?: Database["public"]["Enums"]["service_change_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_change_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_change_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_change_requests_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_instructions: {
        Row: {
          created_at: string
          instruction_id: string
          service_id: string
        }
        Insert: {
          created_at?: string
          instruction_id: string
          service_id: string
        }
        Update: {
          created_at?: string
          instruction_id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_instructions_instruction_id_fkey"
            columns: ["instruction_id"]
            isOneToOne: false
            referencedRelation: "instructions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_instructions_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      service_inventory: {
        Row: {
          brand_variant_id: string
          created_at: string
          group_label: string | null
          id: string
          is_default: boolean
          link_type: string
          notes: string | null
          quantity: number
          service_id: string
          warranty_months: number
        }
        Insert: {
          brand_variant_id: string
          created_at?: string
          group_label?: string | null
          id?: string
          is_default?: boolean
          link_type?: string
          notes?: string | null
          quantity?: number
          service_id: string
          warranty_months?: number
        }
        Update: {
          brand_variant_id?: string
          created_at?: string
          group_label?: string | null
          id?: string
          is_default?: boolean
          link_type?: string
          notes?: string | null
          quantity?: number
          service_id?: string
          warranty_months?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_inventory_brand_variant_id_fkey"
            columns: ["brand_variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_brand_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          booking_time_matrix: Json | null
          brands_supported: number | null
          catalog_image_url: string | null
          category: Database["public"]["Enums"]["service_category"] | null
          code: string | null
          components: Json | null
          contract_type: Database["public"]["Enums"]["contract_type"] | null
          created_at: string | null
          deleted_at: string | null
          discount: number | null
          discount_scope: string | null
          division: string[] | null
          duration: number | null
          emergency_price: number | null
          has_pending_change: boolean
          id: string
          includes_notes: boolean | null
          instructions: boolean | null
          inventory_items: Json | null
          invoice_text_ar: string | null
          invoice_text_en: string | null
          item_kind: string | null
          legacy_service_id: string | null
          name_ar: string | null
          name_en: string
          parent_id: string | null
          photo_requirement: string | null
          price: number | null
          price_unit: string | null
          pricing_mode: string | null
          qc_checklist: boolean | null
          qc_items: Json | null
          reminder_days: number | null
          service_type: Database["public"]["Enums"]["service_type"] | null
          sort_order: number | null
          spare_parts: boolean | null
          status: Database["public"]["Enums"]["service_status"] | null
          tree_type: string | null
          updated_at: string | null
          warranty: number | null
        }
        Insert: {
          booking_time_matrix?: Json | null
          brands_supported?: number | null
          catalog_image_url?: string | null
          category?: Database["public"]["Enums"]["service_category"] | null
          code?: string | null
          components?: Json | null
          contract_type?: Database["public"]["Enums"]["contract_type"] | null
          created_at?: string | null
          deleted_at?: string | null
          discount?: number | null
          discount_scope?: string | null
          division?: string[] | null
          duration?: number | null
          emergency_price?: number | null
          has_pending_change?: boolean
          id?: string
          includes_notes?: boolean | null
          instructions?: boolean | null
          inventory_items?: Json | null
          invoice_text_ar?: string | null
          invoice_text_en?: string | null
          item_kind?: string | null
          legacy_service_id?: string | null
          name_ar?: string | null
          name_en: string
          parent_id?: string | null
          photo_requirement?: string | null
          price?: number | null
          price_unit?: string | null
          pricing_mode?: string | null
          qc_checklist?: boolean | null
          qc_items?: Json | null
          reminder_days?: number | null
          service_type?: Database["public"]["Enums"]["service_type"] | null
          sort_order?: number | null
          spare_parts?: boolean | null
          status?: Database["public"]["Enums"]["service_status"] | null
          tree_type?: string | null
          updated_at?: string | null
          warranty?: number | null
        }
        Update: {
          booking_time_matrix?: Json | null
          brands_supported?: number | null
          catalog_image_url?: string | null
          category?: Database["public"]["Enums"]["service_category"] | null
          code?: string | null
          components?: Json | null
          contract_type?: Database["public"]["Enums"]["contract_type"] | null
          created_at?: string | null
          deleted_at?: string | null
          discount?: number | null
          discount_scope?: string | null
          division?: string[] | null
          duration?: number | null
          emergency_price?: number | null
          has_pending_change?: boolean
          id?: string
          includes_notes?: boolean | null
          instructions?: boolean | null
          inventory_items?: Json | null
          invoice_text_ar?: string | null
          invoice_text_en?: string | null
          item_kind?: string | null
          legacy_service_id?: string | null
          name_ar?: string | null
          name_en?: string
          parent_id?: string | null
          photo_requirement?: string | null
          price?: number | null
          price_unit?: string | null
          pricing_mode?: string | null
          qc_checklist?: boolean | null
          qc_items?: Json | null
          reminder_days?: number | null
          service_type?: Database["public"]["Enums"]["service_type"] | null
          sort_order?: number | null
          spare_parts?: boolean | null
          status?: Database["public"]["Enums"]["service_status"] | null
          tree_type?: string | null
          updated_at?: string | null
          warranty?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "services_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          archived: boolean | null
          carrier: string | null
          carrier_code: string | null
          created_at: string | null
          destination: string | null
          eta: string | null
          etd: string | null
          events: Json | null
          id: string
          is_syncing: boolean
          last_synced_at: string | null
          mode: Database["public"]["Enums"]["shipment_mode"]
          origin: string | null
          po_id: string
          receival_id: string | null
          status: Database["public"]["Enums"]["shipment_status"] | null
          sync_error: string | null
          tracking_number: string
          updated_at: string | null
        }
        Insert: {
          archived?: boolean | null
          carrier?: string | null
          carrier_code?: string | null
          created_at?: string | null
          destination?: string | null
          eta?: string | null
          etd?: string | null
          events?: Json | null
          id?: string
          is_syncing?: boolean
          last_synced_at?: string | null
          mode: Database["public"]["Enums"]["shipment_mode"]
          origin?: string | null
          po_id: string
          receival_id?: string | null
          status?: Database["public"]["Enums"]["shipment_status"] | null
          sync_error?: string | null
          tracking_number: string
          updated_at?: string | null
        }
        Update: {
          archived?: boolean | null
          carrier?: string | null
          carrier_code?: string | null
          created_at?: string | null
          destination?: string | null
          eta?: string | null
          etd?: string | null
          events?: Json | null
          id?: string
          is_syncing?: boolean
          last_synced_at?: string | null
          mode?: Database["public"]["Enums"]["shipment_mode"]
          origin?: string | null
          po_id?: string
          receival_id?: string | null
          status?: Database["public"]["Enums"]["shipment_status"] | null
          sync_error?: string | null
          tracking_number?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipments_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_receival_id_fkey"
            columns: ["receival_id"]
            isOneToOne: false
            referencedRelation: "receivals"
            referencedColumns: ["id"]
          },
        ]
      }
      site_visit_dates: {
        Row: {
          from_time: string | null
          id: string
          sort_order: number | null
          to_time: string | null
          visit_date: string
          visit_id: string
        }
        Insert: {
          from_time?: string | null
          id?: string
          sort_order?: number | null
          to_time?: string | null
          visit_date: string
          visit_id: string
        }
        Update: {
          from_time?: string | null
          id?: string
          sort_order?: number | null
          to_time?: string | null
          visit_date?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_visit_dates_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "site_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      site_visit_team_assignments: {
        Row: {
          created_at: string | null
          duration: string | null
          id: string
          scheduled_date: string | null
          services: Json | null
          team_id: string
          time_slot: string | null
          visit_id: string
        }
        Insert: {
          created_at?: string | null
          duration?: string | null
          id?: string
          scheduled_date?: string | null
          services?: Json | null
          team_id: string
          time_slot?: string | null
          visit_id: string
        }
        Update: {
          created_at?: string | null
          duration?: string | null
          id?: string
          scheduled_date?: string | null
          services?: Json | null
          team_id?: string
          time_slot?: string | null
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_visit_team_assignments_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_visit_team_assignments_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_team_monthly_overtime"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "site_visit_team_assignments_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "site_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      site_visits: {
        Row: {
          address: string | null
          arrival_phone: string | null
          attachments: Json | null
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          created_by: string | null
          customer_id: string | null
          id: string
          mode: string
          notes: string | null
          phone_id: string | null
          scheduled_date: string | null
          service_customer_id: string
          status: string
          updated_at: string | null
          visit_id: string
        }
        Insert: {
          address?: string | null
          arrival_phone?: string | null
          attachments?: Json | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          id?: string
          mode?: string
          notes?: string | null
          phone_id?: string | null
          scheduled_date?: string | null
          service_customer_id: string
          status?: string
          updated_at?: string | null
          visit_id: string
        }
        Update: {
          address?: string | null
          arrival_phone?: string | null
          attachments?: Json | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          id?: string
          mode?: string
          notes?: string | null
          phone_id?: string | null
          scheduled_date?: string | null
          service_customer_id?: string
          status?: string
          updated_at?: string | null
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_visits_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_visits_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_visits_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_credit_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "site_visits_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_visits_phone_id_fkey"
            columns: ["phone_id"]
            isOneToOne: false
            referencedRelation: "customer_phones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_visits_service_customer_id_fkey"
            columns: ["service_customer_id"]
            isOneToOne: false
            referencedRelation: "service_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_adjustment_approvals: {
        Row: {
          action_at: string | null
          adjustment_id: string
          created_at: string
          id: string
          notes: string | null
          profile_id: string | null
          profile_name: string | null
          status: string
          step_label: string
          step_order: number
          step_role: string
        }
        Insert: {
          action_at?: string | null
          adjustment_id: string
          created_at?: string
          id?: string
          notes?: string | null
          profile_id?: string | null
          profile_name?: string | null
          status?: string
          step_label: string
          step_order: number
          step_role: string
        }
        Update: {
          action_at?: string | null
          adjustment_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          profile_id?: string | null
          profile_name?: string | null
          status?: string
          step_label?: string
          step_order?: number
          step_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_adjustment_approvals_adjustment_id_fkey"
            columns: ["adjustment_id"]
            isOneToOne: false
            referencedRelation: "stock_adjustments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustment_approvals_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_adjustments: {
        Row: {
          adjustment_type: string
          approved_at: string | null
          approved_by: string | null
          approved_by_name: string | null
          brand_variant_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          notes: string | null
          photo_urls: string[] | null
          qty: number
          reason: string
          requested_by: string | null
          requested_by_name: string | null
          status: string
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          adjustment_type: string
          approved_at?: string | null
          approved_by?: string | null
          approved_by_name?: string | null
          brand_variant_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          notes?: string | null
          photo_urls?: string[] | null
          qty: number
          reason: string
          requested_by?: string | null
          requested_by_name?: string | null
          status?: string
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          adjustment_type?: string
          approved_at?: string | null
          approved_by?: string | null
          approved_by_name?: string | null
          brand_variant_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          notes?: string | null
          photo_urls?: string[] | null
          qty?: number
          reason?: string
          requested_by?: string | null
          requested_by_name?: string | null
          status?: string
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_adjustments_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_brand_variant_id_fkey"
            columns: ["brand_variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_brand_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_package_services: {
        Row: {
          discount_override: number | null
          id: string
          package_id: string
          service_id: string
        }
        Insert: {
          discount_override?: number | null
          id?: string
          package_id: string
          service_id: string
        }
        Update: {
          discount_override?: number | null
          id?: string
          package_id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_package_services_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "subscription_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_package_services_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "subscription_packages_with_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_package_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_packages: {
        Row: {
          auto_renew_default: boolean
          created_at: string
          created_by_name: string | null
          description: string | null
          discount_percent: number
          duration_months: number
          id: string
          initial_fee: number
          is_active: boolean
          name: string
          name_ar: string | null
          priority_response: string
          response_hours: number | null
          updated_at: string
        }
        Insert: {
          auto_renew_default?: boolean
          created_at?: string
          created_by_name?: string | null
          description?: string | null
          discount_percent?: number
          duration_months?: number
          id?: string
          initial_fee?: number
          is_active?: boolean
          name: string
          name_ar?: string | null
          priority_response?: string
          response_hours?: number | null
          updated_at?: string
        }
        Update: {
          auto_renew_default?: boolean
          created_at?: string
          created_by_name?: string | null
          description?: string | null
          discount_percent?: number
          duration_months?: number
          id?: string
          initial_fee?: number
          is_active?: boolean
          name?: string
          name_ar?: string | null
          priority_response?: string
          response_hours?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      subscription_usage_log: {
        Row: {
          created_at: string
          discount_applied: number
          id: string
          order_id: string
          service_id: string
          subscription_id: string
        }
        Insert: {
          created_at?: string
          discount_applied: number
          id?: string
          order_id: string
          service_id: string
          subscription_id: string
        }
        Update: {
          created_at?: string
          discount_applied?: number
          id?: string
          order_id?: string
          service_id?: string
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_usage_log_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "customer_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          category: string | null
          contact_name: string | null
          country: string | null
          created_at: string
          created_by: string | null
          currency_id: string | null
          email: string | null
          id: string
          is_active: boolean | null
          name: string
          notes: string | null
          phone: string | null
          supplier_type: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          category?: string | null
          contact_name?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          currency_id?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          notes?: string | null
          phone?: string | null
          supplier_type?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          category?: string | null
          contact_name?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          currency_id?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          notes?: string | null
          phone?: string | null
          supplier_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_state: {
        Row: {
          created_at: string | null
          id: string
          last_3cx_sync_at: string | null
          last_wati_sync_at: string | null
          last_whapi_sync_at: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_3cx_sync_at?: string | null
          last_wati_sync_at?: string | null
          last_whapi_sync_at?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          last_3cx_sync_at?: string | null
          last_wati_sync_at?: string | null
          last_whapi_sync_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      team_activity_log: {
        Row: {
          action: string
          actor_id: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_activity_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      team_live_locations: {
        Row: {
          accuracy: number | null
          heading: number | null
          lat: number
          lng: number
          speed: number | null
          team_id: string
          updated_at: string
        }
        Insert: {
          accuracy?: number | null
          heading?: number | null
          lat: number
          lng: number
          speed?: number | null
          team_id: string
          updated_at?: string
        }
        Update: {
          accuracy?: number | null
          heading?: number | null
          lat?: number
          lng?: number
          speed?: number | null
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_live_locations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_live_locations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "v_team_monthly_overtime"
            referencedColumns: ["team_id"]
          },
        ]
      }
      team_schedule_assignments: {
        Row: {
          created_at: string | null
          end_date: string | null
          id: string
          schedule_id: string
          start_date: string
          team_id: string
        }
        Insert: {
          created_at?: string | null
          end_date?: string | null
          id?: string
          schedule_id: string
          start_date: string
          team_id: string
        }
        Update: {
          created_at?: string | null
          end_date?: string | null
          id?: string
          schedule_id?: string
          start_date?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_schedule_assignments_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_schedule_assignments_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_schedule_assignments_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_team_monthly_overtime"
            referencedColumns: ["team_id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          division_id: string | null
          id: string
          is_emergency: boolean
          is_normal: boolean
          is_qc: boolean
          leader_id: string | null
          name: string
          name_ar: string | null
          name_en: string
          phone: string | null
          schedule_end: number | null
          schedule_id: string | null
          schedule_start: number | null
          site_visit_order: boolean
          site_visit_quotation: boolean
          tag: Database["public"]["Enums"]["team_tag"] | null
          traccar_device_id: string | null
          updated_at: string | null
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          division_id?: string | null
          id?: string
          is_emergency?: boolean
          is_normal?: boolean
          is_qc?: boolean
          leader_id?: string | null
          name: string
          name_ar?: string | null
          name_en?: string
          phone?: string | null
          schedule_end?: number | null
          schedule_id?: string | null
          schedule_start?: number | null
          site_visit_order?: boolean
          site_visit_quotation?: boolean
          tag?: Database["public"]["Enums"]["team_tag"] | null
          traccar_device_id?: string | null
          updated_at?: string | null
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          division_id?: string | null
          id?: string
          is_emergency?: boolean
          is_normal?: boolean
          is_qc?: boolean
          leader_id?: string | null
          name?: string
          name_ar?: string | null
          name_en?: string
          phone?: string | null
          schedule_end?: number | null
          schedule_id?: string | null
          schedule_start?: number | null
          site_visit_order?: boolean
          site_visit_quotation?: boolean
          tag?: Database["public"]["Enums"]["team_tag"] | null
          traccar_device_id?: string | null
          updated_at?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teams_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "company_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "v_team_monthly_overtime"
            referencedColumns: ["division_id"]
          },
          {
            foreignKeyName: "teams_leader_id_fkey"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      tl_invoices: {
        Row: {
          created_at: string | null
          created_by: string | null
          customer_name: string
          customer_phone: string | null
          dibsy_checkout_url: string | null
          dibsy_payment_id: string | null
          discount_amount: number
          id: string
          invoice_number: string
          items: Json
          notes: string | null
          order_id: string | null
          payment_method_id: string | null
          payment_status: string
          subtotal: number
          total_amount: number
          updated_at: string | null
          visit_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          customer_name: string
          customer_phone?: string | null
          dibsy_checkout_url?: string | null
          dibsy_payment_id?: string | null
          discount_amount?: number
          id?: string
          invoice_number: string
          items?: Json
          notes?: string | null
          order_id?: string | null
          payment_method_id?: string | null
          payment_status?: string
          subtotal?: number
          total_amount?: number
          updated_at?: string | null
          visit_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          customer_name?: string
          customer_phone?: string | null
          dibsy_checkout_url?: string | null
          dibsy_payment_id?: string | null
          discount_amount?: number
          id?: string
          invoice_number?: string
          items?: Json
          notes?: string | null
          order_id?: string | null
          payment_method_id?: string | null
          payment_status?: string
          subtotal?: number
          total_amount?: number
          updated_at?: string | null
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tl_invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tl_invoices_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      tl_payment_batch_items: {
        Row: {
          amount: number
          batch_id: string
          id: string
          tl_invoice_id: string
        }
        Insert: {
          amount: number
          batch_id: string
          id?: string
          tl_invoice_id: string
        }
        Update: {
          amount?: number
          batch_id?: string
          id?: string
          tl_invoice_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tl_payment_batch_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "tl_payment_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tl_payment_batch_items_tl_invoice_id_fkey"
            columns: ["tl_invoice_id"]
            isOneToOne: false
            referencedRelation: "tl_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      tl_payment_batches: {
        Row: {
          created_at: string | null
          customer_phone: string
          dibsy_checkout_url: string | null
          dibsy_payment_id: string | null
          id: string
          payment_status: string
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          customer_phone: string
          dibsy_checkout_url?: string | null
          dibsy_payment_id?: string | null
          id?: string
          payment_status?: string
          total_amount: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          customer_phone?: string
          dibsy_checkout_url?: string | null
          dibsy_payment_id?: string | null
          id?: string
          payment_status?: string
          total_amount?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      tool_asset_items: {
        Row: {
          category_id: string | null
          created_at: string | null
          id: string
          name_ar: string | null
          name_en: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string | null
          id?: string
          name_ar?: string | null
          name_en: string
        }
        Update: {
          category_id?: string | null
          created_at?: string | null
          id?: string
          name_ar?: string | null
          name_en?: string
        }
        Relationships: [
          {
            foreignKeyName: "tool_asset_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "inventory_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      tool_asset_units: {
        Row: {
          assigned_to: string | null
          brand: string
          condition: Database["public"]["Enums"]["tool_condition"] | null
          created_at: string | null
          expiry: string | null
          id: string
          item_id: string
          serial_number: string
          status: Database["public"]["Enums"]["tool_status"] | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          brand: string
          condition?: Database["public"]["Enums"]["tool_condition"] | null
          created_at?: string | null
          expiry?: string | null
          id?: string
          item_id: string
          serial_number: string
          status?: Database["public"]["Enums"]["tool_status"] | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          brand?: string
          condition?: Database["public"]["Enums"]["tool_condition"] | null
          created_at?: string | null
          expiry?: string | null
          id?: string
          item_id?: string
          serial_number?: string
          status?: Database["public"]["Enums"]["tool_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tool_asset_units_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "tool_asset_items"
            referencedColumns: ["id"]
          },
        ]
      }
      tool_assignments: {
        Row: {
          assigned_at: string
          assigned_to: string
          employee_id: string | null
          id: string
          notes: string | null
          team_id: string | null
          tool_unit_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_to: string
          employee_id?: string | null
          id?: string
          notes?: string | null
          team_id?: string | null
          tool_unit_id: string
        }
        Update: {
          assigned_at?: string
          assigned_to?: string
          employee_id?: string | null
          id?: string
          notes?: string | null
          team_id?: string | null
          tool_unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tool_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_assignments_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_assignments_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_team_monthly_overtime"
            referencedColumns: ["team_id"]
          },
          {
            foreignKeyName: "tool_assignments_tool_unit_id_fkey"
            columns: ["tool_unit_id"]
            isOneToOne: false
            referencedRelation: "tool_asset_units"
            referencedColumns: ["id"]
          },
        ]
      }
      traccar_geofences: {
        Row: {
          color: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          name: string
          traccar_geofence_id: number
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          traccar_geofence_id: number
        }
        Update: {
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          traccar_geofence_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "traccar_geofences_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_company_divisions: {
        Row: {
          created_at: string
          created_by: string | null
          division_id: string
          id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          division_id: string
          id?: string
          profile_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          division_id?: string
          id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_divisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_divisions_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "company_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_divisions_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "v_team_monthly_overtime"
            referencedColumns: ["division_id"]
          },
          {
            foreignKeyName: "user_divisions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_custom_roles: {
        Row: {
          approval_scopes: string[] | null
          created_at: string
          created_by: string | null
          id: string
          profile_id: string
          role_id: string
        }
        Insert: {
          approval_scopes?: string[] | null
          created_at?: string
          created_by?: string | null
          id?: string
          profile_id: string
          role_id: string
        }
        Update: {
          approval_scopes?: string[] | null
          created_at?: string
          created_by?: string | null
          id?: string
          profile_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_custom_roles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_custom_roles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_custom_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "custom_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_ui_preferences: {
        Row: {
          created_at: string
          hide_3cx_mobile_note: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          hide_3cx_mobile_note?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          hide_3cx_mobile_note?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_ui_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          id: string
          name: string | null
          plate: string
          team_id: string | null
          traccar_device_id: string | null
          type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          name?: string | null
          plate: string
          team_id?: string | null
          traccar_device_id?: string | null
          type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          name?: string | null
          plate?: string
          team_id?: string | null
          traccar_device_id?: string | null
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_vehicle_team"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_vehicle_team"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "v_team_monthly_overtime"
            referencedColumns: ["team_id"]
          },
        ]
      }
      voucher_redemptions: {
        Row: {
          customer_name: string | null
          discount_applied: number
          id: string
          order_id: string
          redeemed_at: string | null
          voucher_id: string
        }
        Insert: {
          customer_name?: string | null
          discount_applied: number
          id?: string
          order_id: string
          redeemed_at?: string | null
          voucher_id: string
        }
        Update: {
          customer_name?: string | null
          discount_applied?: number
          id?: string
          order_id?: string
          redeemed_at?: string | null
          voucher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voucher_redemptions_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      vouchers: {
        Row: {
          campaign_id: string | null
          code: string
          created_at: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          max_discount: number | null
          min_order_value: number | null
          type: Database["public"]["Enums"]["voucher_type"] | null
          usage_count: number | null
          usage_limit: number | null
        }
        Insert: {
          campaign_id?: string | null
          code: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          max_discount?: number | null
          min_order_value?: number | null
          type?: Database["public"]["Enums"]["voucher_type"] | null
          usage_count?: number | null
          usage_limit?: number | null
        }
        Update: {
          campaign_id?: string | null
          code?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          max_discount?: number | null
          min_order_value?: number | null
          type?: Database["public"]["Enums"]["voucher_type"] | null
          usage_count?: number | null
          usage_limit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vouchers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "promotion_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_field_rps: {
        Row: {
          created_at: string
          id: string
          profile_id: string
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
          warehouse_id: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_field_rps_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_field_rps_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_manager_log: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          created_at: string
          id: string
          manager_id: string
          removed_at: string | null
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          created_at?: string
          id?: string
          manager_id: string
          removed_at?: string | null
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          created_at?: string
          id?: string
          manager_id?: string
          removed_at?: string | null
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_manager_log_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_manager_log_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_manager_log_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_reorder_points: {
        Row: {
          brand_variant_id: string
          created_at: string
          id: string
          last_notified_at: string | null
          reorder_point: number
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          brand_variant_id: string
          created_at?: string
          id?: string
          last_notified_at?: string | null
          reorder_point?: number
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          brand_variant_id?: string
          created_at?: string
          id?: string
          last_notified_at?: string | null
          reorder_point?: number
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_reorder_points_brand_variant_id_fkey"
            columns: ["brand_variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_brand_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_reorder_points_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_stock_allocations: {
        Row: {
          allocated_qty: number
          brand_variant_id: string
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          allocated_qty?: number
          brand_variant_id: string
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          allocated_qty?: number
          brand_variant_id?: string
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_stock_allocations_brand_variant_id_fkey"
            columns: ["brand_variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_brand_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_stock_allocations_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_transfer_items: {
        Row: {
          brand_variant_id: string
          created_at: string
          dispatched_qty: number | null
          id: string
          item_name: string
          received_qty: number | null
          requested_qty: number
          shrinkage_qty: number
          shrinkage_reason: string | null
          sku: string | null
          transfer_id: string
          unit_cost: number
        }
        Insert: {
          brand_variant_id: string
          created_at?: string
          dispatched_qty?: number | null
          id?: string
          item_name: string
          received_qty?: number | null
          requested_qty: number
          shrinkage_qty?: number
          shrinkage_reason?: string | null
          sku?: string | null
          transfer_id: string
          unit_cost?: number
        }
        Update: {
          brand_variant_id?: string
          created_at?: string
          dispatched_qty?: number | null
          id?: string
          item_name?: string
          received_qty?: number | null
          requested_qty?: number
          shrinkage_qty?: number
          shrinkage_reason?: string | null
          sku?: string | null
          transfer_id?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_transfer_items_brand_variant_id_fkey"
            columns: ["brand_variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_brand_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_transfer_items_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "warehouse_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_transfers: {
        Row: {
          approved_by: string | null
          approved_by_name: string | null
          approved_date: string | null
          cancelled_at: string | null
          cancelled_by_name: string | null
          cancelled_by_profile_id: string | null
          created_at: string | null
          created_by: string | null
          created_by_name: string | null
          created_by_profile_id: string | null
          date: string
          dispatched_at: string | null
          dispatched_by_name: string | null
          dispatched_by_profile_id: string | null
          from_warehouse_id: string
          id: string
          items: Json | null
          notes: string | null
          received_at: string | null
          received_by_name: string | null
          received_by_profile_id: string | null
          status: Database["public"]["Enums"]["transfer_status"] | null
          to_warehouse_id: string
          transfer_number: string
          updated_at: string | null
        }
        Insert: {
          approved_by?: string | null
          approved_by_name?: string | null
          approved_date?: string | null
          cancelled_at?: string | null
          cancelled_by_name?: string | null
          cancelled_by_profile_id?: string | null
          created_at?: string | null
          created_by?: string | null
          created_by_name?: string | null
          created_by_profile_id?: string | null
          date: string
          dispatched_at?: string | null
          dispatched_by_name?: string | null
          dispatched_by_profile_id?: string | null
          from_warehouse_id: string
          id?: string
          items?: Json | null
          notes?: string | null
          received_at?: string | null
          received_by_name?: string | null
          received_by_profile_id?: string | null
          status?: Database["public"]["Enums"]["transfer_status"] | null
          to_warehouse_id: string
          transfer_number: string
          updated_at?: string | null
        }
        Update: {
          approved_by?: string | null
          approved_by_name?: string | null
          approved_date?: string | null
          cancelled_at?: string | null
          cancelled_by_name?: string | null
          cancelled_by_profile_id?: string | null
          created_at?: string | null
          created_by?: string | null
          created_by_name?: string | null
          created_by_profile_id?: string | null
          date?: string
          dispatched_at?: string | null
          dispatched_by_name?: string | null
          dispatched_by_profile_id?: string | null
          from_warehouse_id?: string
          id?: string
          items?: Json | null
          notes?: string | null
          received_at?: string | null
          received_by_name?: string | null
          received_by_profile_id?: string | null
          status?: Database["public"]["Enums"]["transfer_status"] | null
          to_warehouse_id?: string
          transfer_number?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_transfers_cancelled_by_profile_id_fkey"
            columns: ["cancelled_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_transfers_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_transfers_dispatched_by_profile_id_fkey"
            columns: ["dispatched_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_transfers_from_warehouse_id_fkey"
            columns: ["from_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_transfers_received_by_profile_id_fkey"
            columns: ["received_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_transfers_to_warehouse_id_fkey"
            columns: ["to_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          created_at: string | null
          id: string
          item_count: number | null
          location: string | null
          name: string
          total_value: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          item_count?: number | null
          location?: string | null
          name: string
          total_value?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          item_count?: number | null
          location?: string | null
          name?: string
          total_value?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      webhook_logs: {
        Row: {
          created_at: string
          created_by: string | null
          error_message: string | null
          event_type: string | null
          id: string
          payload: Json
          processed: boolean | null
          source: string
          status_code: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          event_type?: string | null
          id?: string
          payload: Json
          processed?: boolean | null
          source: string
          status_code?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          event_type?: string | null
          id?: string
          payload?: Json
          processed?: boolean | null
          source?: string
          status_code?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_logs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      calendar_visits: {
        Row: {
          created_by_name: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          division: string | null
          end_time: string | null
          id: string | null
          is_qc: boolean | null
          order_number: string | null
          service_id: string | null
          services_summary: string | null
          source_id: string | null
          source_type: string | null
          start_time: string | null
          status: string | null
          team_id: string | null
          visit_date: string | null
          visit_type: string | null
        }
        Relationships: []
      }
      credit_group_customer_counts: {
        Row: {
          credit_group_id: string | null
          customer_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_credit_group_id_fkey"
            columns: ["credit_group_id"]
            isOneToOne: false
            referencedRelation: "credit_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_credit_summary: {
        Row: {
          credit_available: number | null
          credit_group_id: string | null
          credit_group_name: string | null
          credit_limit: number | null
          credit_used: number | null
          credit_utilization_pct: number | null
          customer_id: string | null
          customer_name: string | null
          customer_name_ar: string | null
          customer_type: string | null
          is_blocked: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_credit_group_id_fkey"
            columns: ["credit_group_id"]
            isOneToOne: false
            referencedRelation: "credit_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_invoices: {
        Row: {
          agent_name: string | null
          created_at: string | null
          customer_id: string | null
          direction: string | null
          discount_amount: number | null
          discount_label: string | null
          division: string | null
          doc_status: string | null
          due_date: string | null
          id: string | null
          invoice_id: string | null
          invoice_type: string | null
          issued_date: string | null
          manually_paid: boolean | null
          needs_refresh: boolean | null
          notes: string | null
          paid_amount: number | null
          payment_status: string | null
          purchase_order_id: string | null
          qb_synced: boolean | null
          receival_id: string | null
          sale_delivery_id: string | null
          sale_order_id: string | null
          source: Database["public"]["Enums"]["invoice_source"] | null
          source_id: string | null
          source_label: string | null
          status: Database["public"]["Enums"]["invoice_status"] | null
          subtotal: number | null
          supplier_id: string | null
          tax: number | null
          total_amount: number | null
          updated_at: string | null
        }
        Insert: {
          agent_name?: string | null
          created_at?: string | null
          customer_id?: string | null
          direction?: string | null
          discount_amount?: number | null
          discount_label?: string | null
          division?: string | null
          doc_status?: string | null
          due_date?: string | null
          id?: string | null
          invoice_id?: string | null
          invoice_type?: string | null
          issued_date?: string | null
          manually_paid?: boolean | null
          needs_refresh?: boolean | null
          notes?: string | null
          paid_amount?: number | null
          payment_status?: string | null
          purchase_order_id?: string | null
          qb_synced?: boolean | null
          receival_id?: string | null
          sale_delivery_id?: string | null
          sale_order_id?: string | null
          source?: Database["public"]["Enums"]["invoice_source"] | null
          source_id?: string | null
          source_label?: string | null
          status?: Database["public"]["Enums"]["invoice_status"] | null
          subtotal?: number | null
          supplier_id?: string | null
          tax?: number | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          agent_name?: string | null
          created_at?: string | null
          customer_id?: string | null
          direction?: string | null
          discount_amount?: number | null
          discount_label?: string | null
          division?: string | null
          doc_status?: string | null
          due_date?: string | null
          id?: string | null
          invoice_id?: string | null
          invoice_type?: string | null
          issued_date?: string | null
          manually_paid?: boolean | null
          needs_refresh?: boolean | null
          notes?: string | null
          paid_amount?: number | null
          payment_status?: string | null
          purchase_order_id?: string | null
          qb_synced?: boolean | null
          receival_id?: string | null
          sale_delivery_id?: string | null
          sale_order_id?: string | null
          source?: Database["public"]["Enums"]["invoice_source"] | null
          source_id?: string | null
          source_label?: string | null
          status?: Database["public"]["Enums"]["invoice_status"] | null
          subtotal?: number | null
          supplier_id?: string | null
          tax?: number | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_credit_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_receival_id_fkey"
            columns: ["receival_id"]
            isOneToOne: false
            referencedRelation: "receivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_sale_delivery_id_fkey"
            columns: ["sale_delivery_id"]
            isOneToOne: false
            referencedRelation: "sale_deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_sale_order_id_fkey"
            columns: ["sale_order_id"]
            isOneToOne: false
            referencedRelation: "sale_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers_with_multi_phones: {
        Row: {
          customer_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_customer_phones_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "service_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_packages_with_counts: {
        Row: {
          auto_renew_default: boolean | null
          created_at: string | null
          created_by_name: string | null
          description: string | null
          discount_percent: number | null
          duration_months: number | null
          id: string | null
          initial_fee: number | null
          is_active: boolean | null
          name: string | null
          name_ar: string | null
          priority_response: string | null
          response_hours: number | null
          service_count: number | null
          subscriber_count: number | null
          updated_at: string | null
        }
        Relationships: []
      }
      supplier_bills: {
        Row: {
          agent_name: string | null
          created_at: string | null
          customer_id: string | null
          direction: string | null
          discount_amount: number | null
          discount_label: string | null
          division: string | null
          doc_status: string | null
          due_date: string | null
          id: string | null
          invoice_id: string | null
          invoice_type: string | null
          issued_date: string | null
          manually_paid: boolean | null
          needs_refresh: boolean | null
          notes: string | null
          paid_amount: number | null
          payment_status: string | null
          purchase_order_id: string | null
          qb_synced: boolean | null
          receival_id: string | null
          sale_delivery_id: string | null
          sale_order_id: string | null
          source: Database["public"]["Enums"]["invoice_source"] | null
          source_id: string | null
          source_label: string | null
          status: Database["public"]["Enums"]["invoice_status"] | null
          subtotal: number | null
          supplier_id: string | null
          tax: number | null
          total_amount: number | null
          updated_at: string | null
        }
        Insert: {
          agent_name?: string | null
          created_at?: string | null
          customer_id?: string | null
          direction?: string | null
          discount_amount?: number | null
          discount_label?: string | null
          division?: string | null
          doc_status?: string | null
          due_date?: string | null
          id?: string | null
          invoice_id?: string | null
          invoice_type?: string | null
          issued_date?: string | null
          manually_paid?: boolean | null
          needs_refresh?: boolean | null
          notes?: string | null
          paid_amount?: number | null
          payment_status?: string | null
          purchase_order_id?: string | null
          qb_synced?: boolean | null
          receival_id?: string | null
          sale_delivery_id?: string | null
          sale_order_id?: string | null
          source?: Database["public"]["Enums"]["invoice_source"] | null
          source_id?: string | null
          source_label?: string | null
          status?: Database["public"]["Enums"]["invoice_status"] | null
          subtotal?: number | null
          supplier_id?: string | null
          tax?: number | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          agent_name?: string | null
          created_at?: string | null
          customer_id?: string | null
          direction?: string | null
          discount_amount?: number | null
          discount_label?: string | null
          division?: string | null
          doc_status?: string | null
          due_date?: string | null
          id?: string | null
          invoice_id?: string | null
          invoice_type?: string | null
          issued_date?: string | null
          manually_paid?: boolean | null
          needs_refresh?: boolean | null
          notes?: string | null
          paid_amount?: number | null
          payment_status?: string | null
          purchase_order_id?: string | null
          qb_synced?: boolean | null
          receival_id?: string | null
          sale_delivery_id?: string | null
          sale_order_id?: string | null
          source?: Database["public"]["Enums"]["invoice_source"] | null
          source_id?: string | null
          source_label?: string | null
          status?: Database["public"]["Enums"]["invoice_status"] | null
          subtotal?: number | null
          supplier_id?: string | null
          tax?: number | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_credit_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_receival_id_fkey"
            columns: ["receival_id"]
            isOneToOne: false
            referencedRelation: "receivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_sale_delivery_id_fkey"
            columns: ["sale_delivery_id"]
            isOneToOne: false
            referencedRelation: "sale_deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_sale_order_id_fkey"
            columns: ["sale_order_id"]
            isOneToOne: false
            referencedRelation: "sale_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      v_team_monthly_overtime: {
        Row: {
          division_color: string | null
          division_id: string | null
          division_name: string | null
          division_slug: string | null
          early_minutes: number | null
          late_minutes: number | null
          month: string | null
          overtime_minutes: number | null
          overtime_visit_count: number | null
          team_id: string | null
          team_name: string | null
          total_visit_count: number | null
        }
        Relationships: []
      }
      warehouse_stock_view: {
        Row: {
          allocated_qty: number | null
          available_qty: number | null
          avg_cost: number | null
          brand: string | null
          brand_variant_id: string | null
          category_name: string | null
          item_name: string | null
          item_type: string | null
          qty: number | null
          sku: string | null
          subcategory_name: string | null
          total_value: number | null
          unit: string | null
          warehouse_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fifo_cost_layers_brand_variant_id_fkey"
            columns: ["brand_variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_brand_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fifo_cost_layers_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _user_has_permission: {
        Args: { p_permission: string; p_profile_id: string }
        Returns: boolean
      }
      action_stock_adjustment_step: {
        Args: {
          p_action: string
          p_notes: string
          p_profile_id: string
          p_profile_name: string
          p_step_id: string
        }
        Returns: string
      }
      add_workflow_step:
        | {
            Args: {
              p_condition_types?: string[]
              p_is_conditional?: boolean
              p_role_desc?: string
              p_role_name: string
              p_workflow: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_condition_types?: string[]
              p_group_id?: string
              p_is_conditional?: boolean
              p_role_desc?: string
              p_role_name: string
              p_workflow: string
            }
            Returns: Json
          }
      add_workflow_step_for_role:
        | {
            Args: {
              p_condition_types?: string[]
              p_is_conditional?: boolean
              p_role_id: string
              p_workflow: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_condition_types?: string[]
              p_group_id?: string
              p_is_conditional?: boolean
              p_role_id: string
              p_workflow: string
            }
            Returns: Json
          }
      advance_po_approval_tier: {
        Args: { p_po_id: string }
        Returns: undefined
      }
      advance_sales_approval: {
        Args: {
          p_approval_type: Database["public"]["Enums"]["approval_type"]
          p_so_id: string
        }
        Returns: undefined
      }
      allocate_landed_cost: { Args: { p_lc_id: string }; Returns: Json }
      allocate_payment_to_bill: {
        Args: { p_amount: number; p_bill_id: string; p_payment_id: string }
        Returns: undefined
      }
      allocate_warehouse_stock: {
        Args: {
          p_brand_variant_id: string
          p_target_qty: number
          p_unit_cost: number
          p_warehouse_id: string
        }
        Returns: undefined
      }
      append_shipment_events: {
        Args: { p_events: Json; p_shipment_id: string; p_status_map: Json }
        Returns: undefined
      }
      apply_inventory_check_adjustments: {
        Args: { p_check_id: string }
        Returns: undefined
      }
      apply_receival_edit: {
        Args: { p_edit_request_id: string; p_items: Json }
        Returns: Json
      }
      approve_credit_group_change: {
        Args: { p_approval_id: string; p_comment?: string }
        Returns: undefined
      }
      approve_receival_inventory: {
        Args: { p_action: string; p_receival_id: string }
        Returns: string
      }
      approve_sales_request: {
        Args: { p_comment: string; p_request_id: string }
        Returns: undefined
      }
      approve_service_change: { Args: { p_request_id: string }; Returns: Json }
      approve_stock_adjustment_inventory: {
        Args: { p_adjustment_id: string; p_approved_by: string }
        Returns: undefined
      }
      approve_warehouse_transfer_inventory: {
        Args: { p_approved_by: string; p_transfer_id: string }
        Returns: undefined
      }
      archive_workflow_step: {
        Args: { p_profile_id: string; p_step_id: string }
        Returns: undefined
      }
      assign_team_leader: {
        Args: { p_employee_id: string; p_team_id: string }
        Returns: undefined
      }
      attach_payment_to_bill: {
        Args: { p_bill_id: string; p_payment_id: string }
        Returns: undefined
      }
      attach_payment_to_invoice: {
        Args: { p_invoice_id: string; p_payment_id: string }
        Returns: undefined
      }
      backfill_conversation_last_messages: { Args: never; Returns: number }
      batch_increment_received_qty: {
        Args: { p_updates: Json }
        Returns: undefined
      }
      batch_update_reserved_qty: {
        Args: { p_updates: Json }
        Returns: undefined
      }
      batch_update_variant_prices: {
        Args: { p_updates: Json }
        Returns: undefined
      }
      build_inv_check_approval_chain: {
        Args: { p_has_damage_or_writeoff?: boolean; p_has_variance?: boolean }
        Returns: Json
      }
      build_sales_approval_chain: {
        Args: {
          p_approval_type: Database["public"]["Enums"]["approval_type"]
          p_payload: Json
          p_so_id: string
        }
        Returns: undefined
      }
      cancel_delivery_inventory: {
        Args: { p_delivery_id: string; p_so_id: string }
        Returns: undefined
      }
      cancel_transfer: {
        Args: {
          p_cancelled_by_name: string
          p_cancelled_by_profile_id: string
          p_transfer_id: string
        }
        Returns: undefined
      }
      cc_dedup_insert_message: {
        Args: {
          p_agent_name: string
          p_attachments: Json
          p_conversation_id: string
          p_created_at: string
          p_delivery_status: string
          p_external_id: string
          p_from_type: string
          p_message_kind: string
          p_source: string
          p_text: string
          p_wamid: string
          p_wati_id: string
        }
        Returns: string
      }
      check_is_division_manager: {
        Args: { p_profile_id: string }
        Returns: boolean
      }
      claim_media_jobs: {
        Args: { p_limit: number }
        Returns: {
          attachment_index: number
          attempts: number
          id: string
          message_id: string
        }[]
      }
      complete_delivery_inventory: {
        Args: { p_delivery_id: string; p_so_id: string }
        Returns: undefined
      }
      create_and_approve_receival: {
        Args: {
          p_date: string
          p_items: Json
          p_notes: string
          p_po_id: string
          p_receival_number: string
          p_received_by_name: string
          p_warehouse_id: string
        }
        Returns: Json
      }
      create_and_confirm_delivery: {
        Args: {
          p_date: string
          p_items: Json
          p_so_id: string
          p_warehouse_id: string
          p_warehouse_name: string
        }
        Returns: {
          delivery_number: string
          id: string
        }[]
      }
      create_customer_with_phone: {
        Args: { p_link_phone?: string; p_name: string; p_phone: string }
        Returns: Json
      }
      create_landed_cost: {
        Args: {
          p_attached_po_ids: string[]
          p_attached_receival_ids: string[]
          p_currency: string
          p_date: string
          p_description: string
          p_lines: Json
        }
        Returns: Json
      }
      create_order_with_dates: {
        Args: {
          p_address: string
          p_address_id?: string
          p_arrival_phone: string
          p_assignments: Json
          p_attachments: Json
          p_created_by?: string
          p_division: string
          p_notes: string
          p_order_id: string
          p_scheduled_date: string
          p_service_customer_id: string
          p_services: Json
          p_status: string
          p_total_amount: number
          p_type: string
          p_visit_dates: Json
        }
        Returns: string
      }
      create_sale_order:
        | {
            Args: {
              p_currency: string
              p_customer_id: string
              p_customer_notes: string
              p_delivery_terms: string
              p_delivery_terms_notes: string
              p_discount_amount: number
              p_discount_label: string
              p_discount_type: string
              p_division_id?: string
              p_exchange_rate: number
              p_expected_delivery: string
              p_intent: string
              p_line_items: Json
              p_payment_milestones: Json
              p_payment_terms: string
              p_payment_terms_notes: string
              p_validity_days: number
            }
            Returns: Json
          }
        | {
            Args: {
              p_currency: string
              p_customer_id: string
              p_customer_notes: string
              p_delivery_terms: string
              p_delivery_terms_notes: string
              p_discount_amount: number
              p_discount_label: string
              p_discount_type: string
              p_division_id: string
              p_exchange_rate: number
              p_intent: string
              p_line_items: Json
              p_notes: string
              p_payment_milestones: Json
              p_payment_terms: string
              p_payment_terms_notes: string
              p_subtotal: number
              p_validity_days: number
            }
            Returns: Json
          }
      create_service_customer: {
        Args: { p_link_phone?: string; p_name: string; p_phone: string }
        Returns: Json
      }
      create_site_visit: {
        Args: {
          p_address: string
          p_arrival_phone: string
          p_assignments: Json
          p_attachments: Json
          p_created_by?: string
          p_mode: string
          p_notes: string
          p_scheduled_date: string
          p_service_customer_id: string
          p_status: string
          p_visit_dates: Json
          p_visit_id: string
        }
        Returns: string
      }
      create_stock_adjustment_v2: {
        Args: {
          p_adjustment_type: string
          p_brand_variant_id: string
          p_notes: string
          p_photo_urls: string[]
          p_qty: number
          p_reason: string
          p_requested_by: string
          p_requested_by_name: string
          p_warehouse_id: string
        }
        Returns: string
      }
      create_transfer_v2: {
        Args: {
          p_created_by_name?: string
          p_created_by_profile_id?: string
          p_date: string
          p_from_warehouse_id: string
          p_items: Json
          p_notes?: string
          p_to_warehouse_id: string
        }
        Returns: string
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      customer_credit_used: {
        Args: { p_customer_id: string; p_exclude_so_id?: string }
        Returns: number
      }
      deduct_fifo_layers: {
        Args: {
          p_bv_id: string
          p_is_transfer?: boolean
          p_qty: number
          p_wh_id: string
        }
        Returns: {
          total_cost: number
          weighted_unit_cost: number
        }[]
      }
      detach_payment_from_invoice: {
        Args: { p_invoice_id: string; p_payment_id: string }
        Returns: undefined
      }
      dispatch_transfer: {
        Args: {
          p_dispatched_by_name: string
          p_dispatched_by_profile_id: string
          p_transfer_id: string
        }
        Returns: undefined
      }
      fn_refresh_incoming_qty: { Args: { p_bv_id: string }; Returns: undefined }
      fn_refresh_reserved_qty: { Args: { p_bv_id: string }; Returns: undefined }
      force_approve_credit_group_change: {
        Args: { p_comment?: string; p_request_id: string }
        Returns: number
      }
      force_approve_sales_request: {
        Args: {
          p_approval_type: Database["public"]["Enums"]["approval_type"]
          p_comment?: string
          p_so_id: string
        }
        Returns: number
      }
      generate_check_number: { Args: never; Returns: string }
      generate_contract_id: { Args: never; Returns: string }
      generate_invoice_from_so: { Args: { p_so_id: string }; Returns: Json }
      generate_order_quotation_id: { Args: never; Returns: string }
      generate_quotation_number: { Args: never; Returns: string }
      generate_transfer_number: { Args: never; Returns: string }
      get_cogs_breakdown: {
        Args: { p_brand_variant_id: string }
        Returns: Json
      }
      get_customer_pending_balances: { Args: never; Returns: Json }
      get_date_team_availability: {
        Args: { p_dates: string[]; p_from_time: string; p_to_time: string }
        Returns: {
          available_teams_count: number
          visit_date: string
        }[]
      }
      get_dead_stock_report: {
        Args: never
        Returns: {
          average_cost: number
          brand: string
          brand_variant_id: string
          category_name: string
          days_idle: number
          item_name: string
          last_movement_date: string
          last_movement_source: string
          sku: string
          status: string
          stock_level: number
          total_value: number
        }[]
      }
      get_invoice_summary: { Args: never; Returns: Json }
      get_payment_summary: { Args: never; Returns: Json }
      get_stock_value_cogs_summary: {
        Args: { p_brand_variant_ids?: string[] }
        Returns: {
          brand_variant_id: string
          lc_adjustment_count: number
          lc_adjustments_total: number
          sold_at_sale_total: number
        }[]
      }
      get_team_leader_visits: {
        Args: { p_from_date?: string; p_team_id: string }
        Returns: {
          address: string
          customer_name: string
          customer_phone: string
          date: string
          id: string
          order_id: string
          scheduled_time: string
          services_json: Json
          source_id: string
          source_type: string
          status: string
          team_id: string
          team_ids: string[]
          type: string
          waze_link: string
        }[]
      }
      has_admin_permission: { Args: never; Returns: boolean }
      has_inventory_manager_role: {
        Args: { p_profile_id: string }
        Returns: boolean
      }
      increment_credit_balance: {
        Args: { p_amount: number; p_customer_id: string }
        Returns: undefined
      }
      is_contract_visible: { Args: { p_contract_id: string }; Returns: boolean }
      is_division_visible: {
        Args: { row_division_id: string }
        Returns: boolean
      }
      is_field_rp_of: {
        Args: { p_profile_id: string; p_warehouse_id: string }
        Returns: boolean
      }
      mark_overdue_invoices: { Args: never; Returns: undefined }
      next_follow_up_order_id: { Args: never; Returns: string }
      next_follow_up_request_number: { Args: never; Returns: string }
      recalc_average_cost: { Args: { p_bv_id: string }; Returns: undefined }
      recalculate_ar_invoice_payment_status: {
        Args: { p_invoice_id: string }
        Returns: undefined
      }
      receive_transfer: {
        Args: {
          p_received_by_name: string
          p_received_by_profile_id: string
          p_received_items: Json
          p_transfer_id: string
        }
        Returns: undefined
      }
      refresh_po_status: { Args: { p_po_id: string }; Returns: undefined }
      reject_credit_group_change: {
        Args: { p_approval_id: string; p_reason: string }
        Returns: undefined
      }
      reject_sales_request: {
        Args: { p_reason: string; p_request_id: string }
        Returns: undefined
      }
      reject_service_change: {
        Args: { p_reason: string; p_request_id: string }
        Returns: Json
      }
      reject_transfer_v2: {
        Args: {
          p_rejected_by_name: string
          p_rejected_by_profile_id: string
          p_transfer_id: string
        }
        Returns: undefined
      }
      rename_payment_method: {
        Args: { p_id: string; p_new_name: string; p_new_slug: string }
        Returns: undefined
      }
      replace_user_custom_roles: {
        Args: { p_role_ids: string[]; p_user_id: string }
        Returns: undefined
      }
      replace_user_custom_roles_v2: {
        Args: { p_assignments: Json; p_user_id: string }
        Returns: undefined
      }
      replace_warehouse_field_rps: {
        Args: { p_profile_ids: string[]; p_warehouse_id: string }
        Returns: undefined
      }
      resubmit_sale_order: { Args: { p_so_id: string }; Returns: Json }
      revert_landed_cost:
        | { Args: { p_lc_id: string }; Returns: undefined }
        | {
            Args: { p_lc_id: string; p_performer_name?: string }
            Returns: undefined
          }
      rpc_cancel_po_return_dispatch: {
        Args: { p_return_id: string }
        Returns: undefined
      }
      rpc_process_po_return_dispatch: {
        Args: { p_return_id: string }
        Returns: undefined
      }
      rpc_process_return_restock: {
        Args: { p_return_id: string }
        Returns: undefined
      }
      save_employee: {
        Args: {
          p_avatar_url: string
          p_division_id?: string
          p_employee_id: string
          p_join_date: string
          p_name: string
          p_nationality: string
          p_phone: string
          p_service_ids: string[]
          p_status: string
        }
        Returns: {
          avatar: string | null
          avatar_url: string | null
          created_at: string | null
          deleted_at: string | null
          division_id: string | null
          id: string
          join_date: string
          name: string
          name_ar: string | null
          nationality: string | null
          phone: string
          profile_id: string | null
          site_visit_order: boolean
          site_visit_quotation: boolean
          skills: string[] | null
          status: Database["public"]["Enums"]["employee_status"] | null
          team_id: string | null
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "employees"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_inventory_check_item_count: {
        Args: {
          p_counted_qty: number
          p_item_id: string
          p_variance_type: string
        }
        Returns: undefined
      }
      save_order_quotation: {
        Args: {
          p_discount_type?: string
          p_discount_value?: number
          p_division: string
          p_expiry_date: string
          p_line_items: Json
          p_notes: string
          p_quotation_id: string
          p_sent_date: string
          p_service_customer_id: string
          p_status: string
          p_total_amount: number
        }
        Returns: string
      }
      schedule_day_end: { Args: { days: Json }; Returns: number }
      schedule_day_start: { Args: { days: Json }; Returns: number }
      service_inventory_bulk_upsert: {
        Args: {
          p_brand_variant_id: string
          p_link_type?: string
          p_quantity?: number
          p_service_ids: string[]
          p_warranty_months?: number
        }
        Returns: undefined
      }
      set_credit_note_pdf_url: {
        Args: { p_id: string; p_url: string }
        Returns: undefined
      }
      set_invoice_pdf_url: {
        Args: { p_id: string; p_url: string }
        Returns: undefined
      }
      set_po_pdf_url: {
        Args: {
          p_id: string
          p_payment_hash?: string
          p_url: string
          p_variant: string
        }
        Returns: undefined
      }
      set_receival_check_pdf_url: {
        Args: { p_id: string; p_url: string }
        Returns: undefined
      }
      set_sale_order_pdf_url: {
        Args: { p_id: string; p_url: string }
        Returns: undefined
      }
      sku_abbreviation: {
        Args: { input: string; len?: number }
        Returns: string
      }
      snapshot_inventory_check_system_qty: {
        Args: { p_check_id: string }
        Returns: undefined
      }
      storage_customer_credit_docs_write_allowed: {
        Args: never
        Returns: boolean
      }
      storage_lc_bills_write_allowed: { Args: never; Returns: boolean }
      submit_credit_group_change: {
        Args: { p_customer_id: string; p_requested_group_id: string }
        Returns: Json
      }
      submit_service_change: { Args: { p_payload: Json }; Returns: Json }
      swap_visit_team: {
        Args: { p_assignment_id: string; p_new_team_id: string }
        Returns: Json
      }
      sync_team_active_schedule: {
        Args: { p_team_id: string }
        Returns: undefined
      }
      toggle_workflow_step: {
        Args: { p_active: boolean; p_step_id: string }
        Returns: undefined
      }
      update_pending_service_change: {
        Args: { p_new_changes: Json; p_request_id: string }
        Returns: Json
      }
      update_reserved_qty: {
        Args: { p_bv_id: string; p_delta: number }
        Returns: undefined
      }
      update_workflow_step_conditions: {
        Args: {
          p_condition_types: string[]
          p_is_conditional: boolean
          p_step_id: string
        }
        Returns: undefined
      }
      update_workflow_step_role: {
        Args: { p_role_id: string; p_step_id: string }
        Returns: undefined
      }
      upsert_employee_services: {
        Args: { p_employee_id: string; p_service_ids: string[] }
        Returns: undefined
      }
      upsert_package_with_services: {
        Args: { p_package: Json; p_services: Json }
        Returns: string
      }
      user_can_action_adjustment_step: {
        Args: {
          p_profile_id: string
          p_step_role: string
          p_warehouse_id: string
        }
        Returns: boolean
      }
      user_has_approval_role_in_scope: {
        Args: { p_profile_id: string; p_role_names: string[]; p_scope: string }
        Returns: boolean
      }
      validate_lc_allocation: { Args: { p_lc_id: string }; Returns: Json }
      withdraw_service_change: { Args: { p_request_id: string }; Returns: Json }
    }
    Enums: {
      address_type: "blue-plate" | "google-coords"
      approval_source_type: "sale_order" | "order"
      approval_status: "pending" | "approved" | "rejected"
      approval_type: "margin" | "credit"
      campaign_status: "active" | "scheduled" | "expired" | "disabled"
      confirmation_status:
        | "not_sent"
        | "sent"
        | "confirmed"
        | "no_response"
        | "manually_confirmed"
      contract_status:
        | "active"
        | "expiring_soon"
        | "overdue_payment"
        | "cancelled"
        | "completed"
        | "draft"
        | "manager_review"
        | "customer_pending"
        | "approved"
        | "rejected"
        | "expired"
      contract_type: "preventive" | "area" | "general"
      credit_note_status: "draft" | "approved" | "issued" | "redeemed"
      division: "maintenance" | "cleaning" | "kitchen" | "pest-control"
      employee_status:
        | "active"
        | "vacation"
        | "archived"
        | "unassigned"
        | "on-task"
      follow_up_request_status:
        | "pending"
        | "confirmed"
        | "cancelled"
        | "rejected"
      instruction_content_type: "text" | "pdf"
      instruction_type: "pre-service" | "post-service"
      inventory_type: "products" | "spare-parts" | "consumables" | "tools"
      invoice_source: "order" | "contract" | "quotation"
      invoice_status:
        | "draft"
        | "sent"
        | "partially_paid"
        | "paid"
        | "overdue"
        | "cancelled"
        | "void"
      message_source:
        | "whatsapp"
        | "whatsapp_api"
        | "phone"
        | "sms"
        | "email"
        | "whatsapp_whapi"
        | "3cx_call"
        | "manual"
      notification_category:
        | "order"
        | "contract"
        | "invoice"
        | "payment"
        | "system"
        | "reminder"
      notification_channel: "whatsapp" | "sms" | "email" | "push"
      notification_status: "sent" | "failed" | "pending" | "delivered"
      notification_trigger: "manual" | "scheduled" | "event" | "reminder"
      order_quotation_status:
        | "draft"
        | "sent"
        | "pending_approval"
        | "approved"
        | "customer_approved"
        | "rejected"
        | "expired"
        | "converted"
        | "cancelled"
      order_status:
        | "scheduled"
        | "confirmed"
        | "in-progress"
        | "completed"
        | "pending-approval"
        | "cancelled"
        | "waitlist"
        | "pending-confirmation"
        | "customer-unavailable"
      payment_status:
        | "completed"
        | "pending"
        | "failed"
        | "refunded"
        | "processing"
      po_status:
        | "draft"
        | "pending_approval"
        | "approved"
        | "partially_received"
        | "received"
        | "completed"
        | "cancelled"
      po_type: "rfq" | "draft" | "confirmed"
      promotion_rule_type:
        | "percentage"
        | "fixed"
        | "buy_one_get_one"
        | "buy_x_get_y"
        | "buy_x_discount_get_y"
      qc_priority: "high" | "medium" | "low"
      qc_schedule_status: "pending" | "in-progress" | "completed" | "missed"
      receival_status: "pending_approval" | "approved" | "rejected"
      reminder_channel: "Email" | "SMS" | "WhatsApp"
      return_source_type: "sale_order" | "order" | "purchase_order"
      return_status:
        | "pending"
        | "received"
        | "restocked"
        | "closed"
        | "dispatched"
        | "supplier_confirmed"
        | "cancelled"
      rfq_status: "draft" | "sent" | "received" | "cancelled"
      sale_delivery_status:
        | "pending"
        | "in_progress"
        | "delivered"
        | "cancelled"
      sale_order_status:
        | "quotation"
        | "confirmed"
        | "in_progress"
        | "delivered"
        | "cancelled"
        | "pending_approval"
        | "partial_delivery"
        | "invoiced"
        | "closed"
      service_category:
        | "Repair"
        | "Installation"
        | "Maintenance"
        | "Cleaning"
        | "Quick Service"
      service_change_status: "pending" | "approved" | "rejected"
      service_change_type: "add" | "edit" | "delete"
      service_status: "active" | "inactive"
      service_type: "standard" | "configurable"
      shipment_mode: "air" | "sea" | "land" | "manual"
      shipment_status:
        | "booked"
        | "in_transit"
        | "customs"
        | "delivered"
        | "delayed"
      team_tag: "normal" | "emergency" | "qc" | "site-visit"
      tl_order_type:
        | "order"
        | "site-visit-single"
        | "site-visit-contract"
        | "contract"
        | "backwork"
        | "follow-up"
        | "qc"
      tool_condition: "New" | "Good" | "Fair" | "Maintenance"
      tool_status: "available" | "assigned" | "maintenance" | "retired"
      transfer_status:
        | "pending"
        | "in_transit"
        | "pending_approval"
        | "approved"
        | "rejected"
        | "received"
        | "cancelled"
      user_type: "internal" | "customer" | "employee" | "team-leader"
      voucher_type: "single_use" | "multi_use" | "limited"
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
      address_type: ["blue-plate", "google-coords"],
      approval_source_type: ["sale_order", "order"],
      approval_status: ["pending", "approved", "rejected"],
      approval_type: ["margin", "credit"],
      campaign_status: ["active", "scheduled", "expired", "disabled"],
      confirmation_status: [
        "not_sent",
        "sent",
        "confirmed",
        "no_response",
        "manually_confirmed",
      ],
      contract_status: [
        "active",
        "expiring_soon",
        "overdue_payment",
        "cancelled",
        "completed",
        "draft",
        "manager_review",
        "customer_pending",
        "approved",
        "rejected",
        "expired",
      ],
      contract_type: ["preventive", "area", "general"],
      credit_note_status: ["draft", "approved", "issued", "redeemed"],
      division: ["maintenance", "cleaning", "kitchen", "pest-control"],
      employee_status: [
        "active",
        "vacation",
        "archived",
        "unassigned",
        "on-task",
      ],
      follow_up_request_status: [
        "pending",
        "confirmed",
        "cancelled",
        "rejected",
      ],
      instruction_content_type: ["text", "pdf"],
      instruction_type: ["pre-service", "post-service"],
      inventory_type: ["products", "spare-parts", "consumables", "tools"],
      invoice_source: ["order", "contract", "quotation"],
      invoice_status: [
        "draft",
        "sent",
        "partially_paid",
        "paid",
        "overdue",
        "cancelled",
        "void",
      ],
      message_source: [
        "whatsapp",
        "whatsapp_api",
        "phone",
        "sms",
        "email",
        "whatsapp_whapi",
        "3cx_call",
        "manual",
      ],
      notification_category: [
        "order",
        "contract",
        "invoice",
        "payment",
        "system",
        "reminder",
      ],
      notification_channel: ["whatsapp", "sms", "email", "push"],
      notification_status: ["sent", "failed", "pending", "delivered"],
      notification_trigger: ["manual", "scheduled", "event", "reminder"],
      order_quotation_status: [
        "draft",
        "sent",
        "pending_approval",
        "approved",
        "customer_approved",
        "rejected",
        "expired",
        "converted",
        "cancelled",
      ],
      order_status: [
        "scheduled",
        "confirmed",
        "in-progress",
        "completed",
        "pending-approval",
        "cancelled",
        "waitlist",
        "pending-confirmation",
        "customer-unavailable",
      ],
      payment_status: [
        "completed",
        "pending",
        "failed",
        "refunded",
        "processing",
      ],
      po_status: [
        "draft",
        "pending_approval",
        "approved",
        "partially_received",
        "received",
        "completed",
        "cancelled",
      ],
      po_type: ["rfq", "draft", "confirmed"],
      promotion_rule_type: [
        "percentage",
        "fixed",
        "buy_one_get_one",
        "buy_x_get_y",
        "buy_x_discount_get_y",
      ],
      qc_priority: ["high", "medium", "low"],
      qc_schedule_status: ["pending", "in-progress", "completed", "missed"],
      receival_status: ["pending_approval", "approved", "rejected"],
      reminder_channel: ["Email", "SMS", "WhatsApp"],
      return_source_type: ["sale_order", "order", "purchase_order"],
      return_status: [
        "pending",
        "received",
        "restocked",
        "closed",
        "dispatched",
        "supplier_confirmed",
        "cancelled",
      ],
      rfq_status: ["draft", "sent", "received", "cancelled"],
      sale_delivery_status: [
        "pending",
        "in_progress",
        "delivered",
        "cancelled",
      ],
      sale_order_status: [
        "quotation",
        "confirmed",
        "in_progress",
        "delivered",
        "cancelled",
        "pending_approval",
        "partial_delivery",
        "invoiced",
        "closed",
      ],
      service_category: [
        "Repair",
        "Installation",
        "Maintenance",
        "Cleaning",
        "Quick Service",
      ],
      service_change_status: ["pending", "approved", "rejected"],
      service_change_type: ["add", "edit", "delete"],
      service_status: ["active", "inactive"],
      service_type: ["standard", "configurable"],
      shipment_mode: ["air", "sea", "land", "manual"],
      shipment_status: [
        "booked",
        "in_transit",
        "customs",
        "delivered",
        "delayed",
      ],
      team_tag: ["normal", "emergency", "qc", "site-visit"],
      tl_order_type: [
        "order",
        "site-visit-single",
        "site-visit-contract",
        "contract",
        "backwork",
        "follow-up",
        "qc",
      ],
      tool_condition: ["New", "Good", "Fair", "Maintenance"],
      tool_status: ["available", "assigned", "maintenance", "retired"],
      transfer_status: [
        "pending",
        "in_transit",
        "pending_approval",
        "approved",
        "rejected",
        "received",
        "cancelled",
      ],
      user_type: ["internal", "customer", "employee", "team-leader"],
      voucher_type: ["single_use", "multi_use", "limited"],
    },
  },
} as const
A new version of Supabase CLI is available: v2.109.0 (currently installed v2.91.3)
We recommend updating regularly for new features and bug fixes: https://supabase.com/docs/guides/cli/getting-started#updating-the-supabase-cli
