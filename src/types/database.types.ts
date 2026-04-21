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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
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
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: string | null
          entity_id: string
          entity_type: string
          id?: string
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
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
      approval_requests: {
        Row: {
          approval_type: Database["public"]["Enums"]["approval_type"]
          comment: string | null
          created_at: string
          decided_by: string | null
          decided_by_name: string | null
          id: string
          reason: string | null
          requested_by: string | null
          source_id: string
          source_type: Database["public"]["Enums"]["approval_source_type"]
          status: Database["public"]["Enums"]["approval_status"] | null
          updated_at: string
        }
        Insert: {
          approval_type: Database["public"]["Enums"]["approval_type"]
          comment?: string | null
          created_at?: string
          decided_by?: string | null
          decided_by_name?: string | null
          id?: string
          reason?: string | null
          requested_by?: string | null
          source_id: string
          source_type: Database["public"]["Enums"]["approval_source_type"]
          status?: Database["public"]["Enums"]["approval_status"] | null
          updated_at?: string
        }
        Update: {
          approval_type?: Database["public"]["Enums"]["approval_type"]
          comment?: string | null
          created_at?: string
          decided_by?: string | null
          decided_by_name?: string | null
          id?: string
          reason?: string | null
          requested_by?: string | null
          source_id?: string
          source_type?: Database["public"]["Enums"]["approval_source_type"]
          status?: Database["public"]["Enums"]["approval_status"] | null
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
      chat_conversations: {
        Row: {
          channel: Database["public"]["Enums"]["message_source"] | null
          created_at: string | null
          customer_id: string
          id: string
          last_message: string | null
          last_message_at: string | null
          unread_count: number | null
          updated_at: string | null
        }
        Insert: {
          channel?: Database["public"]["Enums"]["message_source"] | null
          created_at?: string | null
          customer_id: string
          id?: string
          last_message?: string | null
          last_message_at?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Update: {
          channel?: Database["public"]["Enums"]["message_source"] | null
          created_at?: string | null
          customer_id?: string
          id?: string
          last_message?: string | null
          last_message_at?: string | null
          unread_count?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
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
          from_type: string
          id: string
          source: Database["public"]["Enums"]["message_source"]
          text: string
        }
        Insert: {
          agent_name?: string | null
          attachments?: Json | null
          call_metadata?: Json | null
          conversation_id: string
          created_at?: string | null
          from_type: string
          id?: string
          source: Database["public"]["Enums"]["message_source"]
          text: string
        }
        Update: {
          agent_name?: string | null
          attachments?: Json | null
          call_metadata?: Json | null
          conversation_id?: string
          created_at?: string | null
          from_type?: string
          id?: string
          source?: Database["public"]["Enums"]["message_source"]
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
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
      contract_visits: {
        Row: {
          completed: boolean | null
          contract_id: string
          created_at: string | null
          id: string
          scheduled_date: string
          service_name: string
          team_id: string | null
        }
        Insert: {
          completed?: boolean | null
          contract_id: string
          created_at?: string | null
          id?: string
          scheduled_date: string
          service_name: string
          team_id?: string | null
        }
        Update: {
          completed?: boolean | null
          contract_id?: string
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
            foreignKeyName: "contract_visits_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          agent_name: string | null
          area_count: number | null
          cancel_reason: string | null
          cancelled_date: string | null
          completed_visits: number | null
          contract_id: string
          created_at: string | null
          customer_id: string
          divisions: string[] | null
          end_date: string
          has_signed_doc: boolean | null
          id: string
          monthly_value: number | null
          paid_amount: number | null
          payment_schedule: string | null
          services_summary: string | null
          site_name: string
          start_date: string
          status: Database["public"]["Enums"]["contract_status"] | null
          total_payments: number | null
          total_value: number | null
          total_visits: number | null
          updated_at: string | null
        }
        Insert: {
          agent_name?: string | null
          area_count?: number | null
          cancel_reason?: string | null
          cancelled_date?: string | null
          completed_visits?: number | null
          contract_id: string
          created_at?: string | null
          customer_id: string
          divisions?: string[] | null
          end_date: string
          has_signed_doc?: boolean | null
          id?: string
          monthly_value?: number | null
          paid_amount?: number | null
          payment_schedule?: string | null
          services_summary?: string | null
          site_name: string
          start_date: string
          status?: Database["public"]["Enums"]["contract_status"] | null
          total_payments?: number | null
          total_value?: number | null
          total_visits?: number | null
          updated_at?: string | null
        }
        Update: {
          agent_name?: string | null
          area_count?: number | null
          cancel_reason?: string | null
          cancelled_date?: string | null
          completed_visits?: number | null
          contract_id?: string
          created_at?: string | null
          customer_id?: string
          divisions?: string[] | null
          end_date?: string
          has_signed_doc?: boolean | null
          id?: string
          monthly_value?: number | null
          paid_amount?: number | null
          payment_schedule?: string | null
          services_summary?: string | null
          site_name?: string
          start_date?: string
          status?: Database["public"]["Enums"]["contract_status"] | null
          total_payments?: number | null
          total_value?: number | null
          total_visits?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
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
          customer_name: string
          id: string
          invoice_id: string
          line_items: Json | null
          notes: string | null
          phone: string | null
          reason: string
          refund_method: Database["public"]["Enums"]["payment_method"] | null
          refund_reference: string | null
          status: Database["public"]["Enums"]["credit_note_status"] | null
          total_amount: number
          type: string
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          credit_note_id: string
          customer_name: string
          id?: string
          invoice_id: string
          line_items?: Json | null
          notes?: string | null
          phone?: string | null
          reason: string
          refund_method?: Database["public"]["Enums"]["payment_method"] | null
          refund_reference?: string | null
          status?: Database["public"]["Enums"]["credit_note_status"] | null
          total_amount?: number
          type?: string
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          credit_note_id?: string
          customer_name?: string
          id?: string
          invoice_id?: string
          line_items?: Json | null
          notes?: string | null
          phone?: string | null
          reason?: string
          refund_method?: Database["public"]["Enums"]["payment_method"] | null
          refund_reference?: string | null
          status?: Database["public"]["Enums"]["credit_note_status"] | null
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
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_roles: {
        Row: {
          color: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
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
          blue_plate_building: string | null
          blue_plate_street: string | null
          blue_plate_unit: string | null
          blue_plate_zone: string | null
          coords_lat: number | null
          coords_lng: number | null
          country: string | null
          created_at: string | null
          customer_id: string
          id: string
          label: string
          line: string
          tags: string[] | null
          type: Database["public"]["Enums"]["address_type"]
          updated_at: string | null
        }
        Insert: {
          blue_plate_building?: string | null
          blue_plate_street?: string | null
          blue_plate_unit?: string | null
          blue_plate_zone?: string | null
          coords_lat?: number | null
          coords_lng?: number | null
          country?: string | null
          created_at?: string | null
          customer_id: string
          id?: string
          label: string
          line: string
          tags?: string[] | null
          type: Database["public"]["Enums"]["address_type"]
          updated_at?: string | null
        }
        Update: {
          blue_plate_building?: string | null
          blue_plate_street?: string | null
          blue_plate_unit?: string | null
          blue_plate_zone?: string | null
          coords_lat?: number | null
          coords_lng?: number | null
          country?: string | null
          created_at?: string | null
          customer_id?: string
          id?: string
          label?: string
          line?: string
          tags?: string[] | null
          type?: Database["public"]["Enums"]["address_type"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_addresses_customer_id_fkey"
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
          created_at: string | null
          credit_limit: number | null
          customer_type: string | null
          email: string | null
          id: string
          is_blocked: boolean | null
          name: string
          name_ar: string | null
          pending_balance: number | null
          phone: string
          subscription_tag: string | null
          updated_at: string | null
        }
        Insert: {
          block_reason?: string | null
          created_at?: string | null
          credit_limit?: number | null
          customer_type?: string | null
          email?: string | null
          id?: string
          is_blocked?: boolean | null
          name: string
          name_ar?: string | null
          pending_balance?: number | null
          phone: string
          subscription_tag?: string | null
          updated_at?: string | null
        }
        Update: {
          block_reason?: string | null
          created_at?: string | null
          credit_limit?: number | null
          customer_type?: string | null
          email?: string | null
          id?: string
          is_blocked?: boolean | null
          name?: string
          name_ar?: string | null
          pending_balance?: number | null
          phone?: string
          subscription_tag?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      divisions: {
        Row: {
          address_ar: string | null
          address_en: string | null
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
          address_ar?: string | null
          address_en?: string | null
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
          address_ar?: string | null
          address_en?: string | null
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
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          avatar: string | null
          created_at: string | null
          id: string
          join_date: string
          name: string
          name_ar: string | null
          nationality: string | null
          phone: string
          skills: string[] | null
          status: Database["public"]["Enums"]["employee_status"] | null
          team_id: string | null
          updated_at: string | null
        }
        Insert: {
          avatar?: string | null
          created_at?: string | null
          id?: string
          join_date: string
          name: string
          name_ar?: string | null
          nationality?: string | null
          phone: string
          skills?: string[] | null
          status?: Database["public"]["Enums"]["employee_status"] | null
          team_id?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar?: string | null
          created_at?: string | null
          id?: string
          join_date?: string
          name?: string
          name_ar?: string | null
          nationality?: string | null
          phone?: string
          skills?: string[] | null
          status?: Database["public"]["Enums"]["employee_status"] | null
          team_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_employee_team"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
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
        }
        Relationships: [
          {
            foreignKeyName: "fifo_cost_layers_brand_variant_id_fkey"
            columns: ["brand_variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_brand_variants"
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
          id: string
          incoming: number | null
          incoming_eta: string | null
          item_id: string
          selling_price: number | null
          stock_level: number | null
          updated_at: string | null
        }
        Insert: {
          average_cost?: number | null
          brand: string
          code?: string | null
          cost_price?: number | null
          created_at?: string | null
          id?: string
          incoming?: number | null
          incoming_eta?: string | null
          item_id: string
          selling_price?: number | null
          stock_level?: number | null
          updated_at?: string | null
        }
        Update: {
          average_cost?: number | null
          brand?: string
          code?: string | null
          cost_price?: number | null
          created_at?: string | null
          id?: string
          incoming?: number | null
          incoming_eta?: string | null
          item_id?: string
          selling_price?: number | null
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
          sku: string | null
          type: Database["public"]["Enums"]["inventory_type"]
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name_ar?: string | null
          name_en: string
          sku?: string | null
          type: Database["public"]["Enums"]["inventory_type"]
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name_ar?: string | null
          name_en?: string
          sku?: string | null
          type?: Database["public"]["Enums"]["inventory_type"]
          updated_at?: string | null
        }
        Relationships: []
      }
      inventory_check_items: {
        Row: {
          brand: string
          brand_variant_id: string
          check_id: string
          counted_qty: number | null
          created_at: string
          id: string
          is_counted: boolean
          item_name: string
          notes: string | null
          sku: string | null
          system_qty: number
          updated_at: string
          variance: number | null
        }
        Insert: {
          brand: string
          brand_variant_id: string
          check_id: string
          counted_qty?: number | null
          created_at?: string
          id?: string
          is_counted?: boolean
          item_name: string
          notes?: string | null
          sku?: string | null
          system_qty?: number
          updated_at?: string
          variance?: number | null
        }
        Update: {
          brand?: string
          brand_variant_id?: string
          check_id?: string
          counted_qty?: number | null
          created_at?: string
          id?: string
          is_counted?: boolean
          item_name?: string
          notes?: string | null
          sku?: string | null
          system_qty?: number
          updated_at?: string
          variance?: number | null
        }
        Relationships: [
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
      inventory_checks: {
        Row: {
          check_number: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_by_name: string | null
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
          notes?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name?: string | null
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
          notes?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name?: string | null
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
      invoice_line_items: {
        Row: {
          created_at: string | null
          description: string
          id: string
          invoice_id: string
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
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          agent_name: string | null
          created_at: string | null
          customer_id: string
          division: string | null
          due_date: string
          id: string
          invoice_id: string
          issued_date: string
          notes: string | null
          paid_amount: number | null
          qb_synced: boolean | null
          source: Database["public"]["Enums"]["invoice_source"]
          source_id: string
          source_label: string | null
          status: Database["public"]["Enums"]["invoice_status"] | null
          subtotal: number | null
          tax: number | null
          total_amount: number | null
          updated_at: string | null
        }
        Insert: {
          agent_name?: string | null
          created_at?: string | null
          customer_id: string
          division?: string | null
          due_date: string
          id?: string
          invoice_id: string
          issued_date: string
          notes?: string | null
          paid_amount?: number | null
          qb_synced?: boolean | null
          source: Database["public"]["Enums"]["invoice_source"]
          source_id: string
          source_label?: string | null
          status?: Database["public"]["Enums"]["invoice_status"] | null
          subtotal?: number | null
          tax?: number | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          agent_name?: string | null
          created_at?: string | null
          customer_id?: string
          division?: string | null
          due_date?: string
          id?: string
          invoice_id?: string
          issued_date?: string
          notes?: string | null
          paid_amount?: number | null
          qb_synced?: boolean | null
          source?: Database["public"]["Enums"]["invoice_source"]
          source_id?: string
          source_label?: string | null
          status?: Database["public"]["Enums"]["invoice_status"] | null
          subtotal?: number | null
          tax?: number | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      landed_costs: {
        Row: {
          all_items_sold: boolean | null
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
          total_amount: number | null
          updated_at: string | null
        }
        Insert: {
          all_items_sold?: boolean | null
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
          total_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          all_items_sold?: boolean | null
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
          total_amount?: number | null
          updated_at?: string | null
        }
        Relationships: []
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
      order_services: {
        Row: {
          configuration: Json | null
          created_at: string | null
          duration: number | null
          id: string
          name: string
          order_id: string
          path: string[] | null
          price: number | null
          qty: number | null
          service_id: string | null
        }
        Insert: {
          configuration?: Json | null
          created_at?: string | null
          duration?: number | null
          id?: string
          name: string
          order_id: string
          path?: string[] | null
          price?: number | null
          qty?: number | null
          service_id?: string | null
        }
        Update: {
          configuration?: Json | null
          created_at?: string | null
          duration?: number | null
          id?: string
          name?: string
          order_id?: string
          path?: string[] | null
          price?: number | null
          qty?: number | null
          service_id?: string | null
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
          order_id: string
          scheduled_date: string
          services: Json
          team_id: string
          time_slot: string | null
        }
        Insert: {
          created_at?: string | null
          duration?: string | null
          id?: string
          order_id: string
          scheduled_date: string
          services: Json
          team_id: string
          time_slot?: string | null
        }
        Update: {
          created_at?: string | null
          duration?: string | null
          id?: string
          order_id?: string
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
            foreignKeyName: "order_team_assignments_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          address: string | null
          agent_name: string | null
          confirmation_sent_at: string | null
          confirmation_status:
            | Database["public"]["Enums"]["confirmation_status"]
            | null
          created_at: string | null
          customer_id: string
          division: Database["public"]["Enums"]["division"]
          has_invoice: boolean | null
          id: string
          invoice_number: string | null
          notes: string | null
          order_id: string
          scheduled_date: string
          scheduled_end_date: string | null
          scheduled_time: string | null
          status: Database["public"]["Enums"]["order_status"] | null
          total_amount: number | null
          type: string | null
          updated_at: string | null
          visit_date: string | null
        }
        Insert: {
          address?: string | null
          agent_name?: string | null
          confirmation_sent_at?: string | null
          confirmation_status?:
            | Database["public"]["Enums"]["confirmation_status"]
            | null
          created_at?: string | null
          customer_id: string
          division: Database["public"]["Enums"]["division"]
          has_invoice?: boolean | null
          id?: string
          invoice_number?: string | null
          notes?: string | null
          order_id: string
          scheduled_date: string
          scheduled_end_date?: string | null
          scheduled_time?: string | null
          status?: Database["public"]["Enums"]["order_status"] | null
          total_amount?: number | null
          type?: string | null
          updated_at?: string | null
          visit_date?: string | null
        }
        Update: {
          address?: string | null
          agent_name?: string | null
          confirmation_sent_at?: string | null
          confirmation_status?:
            | Database["public"]["Enums"]["confirmation_status"]
            | null
          created_at?: string | null
          customer_id?: string
          division?: Database["public"]["Enums"]["division"]
          has_invoice?: boolean | null
          id?: string
          invoice_number?: string | null
          notes?: string | null
          order_id?: string
          scheduled_date?: string
          scheduled_end_date?: string | null
          scheduled_time?: string | null
          status?: Database["public"]["Enums"]["order_status"] | null
          total_amount?: number | null
          type?: string | null
          updated_at?: string | null
          visit_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
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
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          agent_name: string | null
          amount: number
          bank_name: string | null
          cheque_date: string | null
          cheque_number: string | null
          created_at: string | null
          date: string
          id: string
          invoice_id: string
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          payment_id: string
          qb_synced: boolean | null
          reference: string | null
          status: Database["public"]["Enums"]["payment_status"] | null
          transaction_id: string | null
          updated_at: string | null
        }
        Insert: {
          agent_name?: string | null
          amount: number
          bank_name?: string | null
          cheque_date?: string | null
          cheque_number?: string | null
          created_at?: string | null
          date: string
          id?: string
          invoice_id: string
          method: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          payment_id: string
          qb_synced?: boolean | null
          reference?: string | null
          status?: Database["public"]["Enums"]["payment_status"] | null
          transaction_id?: string | null
          updated_at?: string | null
        }
        Update: {
          agent_name?: string | null
          amount?: number
          bank_name?: string | null
          cheque_date?: string | null
          cheque_number?: string | null
          created_at?: string | null
          date?: string
          id?: string
          invoice_id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          payment_id?: string
          qb_synced?: boolean | null
          reference?: string | null
          status?: Database["public"]["Enums"]["payment_status"] | null
          transaction_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      phone_line_permissions_3cx: {
        Row: {
          can_call: boolean
          can_receive: boolean
          created_at: string
          created_by: string | null
          id: string
          phone_line_id: string
          profile_id: string
          updated_at: string
        }
        Insert: {
          can_call?: boolean
          can_receive?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          phone_line_id: string
          profile_id: string
          updated_at?: string
        }
        Update: {
          can_call?: boolean
          can_receive?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          phone_line_id?: string
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "phone_line_permissions_3cx_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phone_line_permissions_3cx_phone_line_id_fkey"
            columns: ["phone_line_id"]
            isOneToOne: false
            referencedRelation: "phone_lines_3cx"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phone_line_permissions_3cx_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      phone_lines_3cx: {
        Row: {
          created_at: string
          created_by: string | null
          cx_dn: string | null
          division_id: string | null
          id: string
          is_active: boolean
          is_emergency: boolean
          label: string
          number: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          cx_dn?: string | null
          division_id?: string | null
          id?: string
          is_active?: boolean
          is_emergency?: boolean
          label: string
          number: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          cx_dn?: string | null
          division_id?: string | null
          id?: string
          is_active?: boolean
          is_emergency?: boolean
          label?: string
          number?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "phone_lines_3cx_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "phone_lines_3cx_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
        ]
      }
      po_approvals: {
        Row: {
          approved_by: string | null
          comment: string | null
          created_at: string | null
          date: string | null
          id: string
          po_id: string
          role: Database["public"]["Enums"]["approval_role"]
          status: Database["public"]["Enums"]["approval_status"] | null
        }
        Insert: {
          approved_by?: string | null
          comment?: string | null
          created_at?: string | null
          date?: string | null
          id?: string
          po_id: string
          role: Database["public"]["Enums"]["approval_role"]
          status?: Database["public"]["Enums"]["approval_status"] | null
        }
        Update: {
          approved_by?: string | null
          comment?: string | null
          created_at?: string | null
          date?: string | null
          id?: string
          po_id?: string
          role?: Database["public"]["Enums"]["approval_role"]
          status?: Database["public"]["Enums"]["approval_status"] | null
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
      po_line_items: {
        Row: {
          created_at: string | null
          fifo_layers: Json | null
          id: string
          item_name: string
          po_id: string
          qty: number
          received_qty: number | null
          sku: string | null
          total_price: number
          unit: string
          unit_price: number
        }
        Insert: {
          created_at?: string | null
          fifo_layers?: Json | null
          id?: string
          item_name: string
          po_id: string
          qty: number
          received_qty?: number | null
          sku?: string | null
          total_price: number
          unit: string
          unit_price: number
        }
        Update: {
          created_at?: string | null
          fifo_layers?: Json | null
          id?: string
          item_name?: string
          po_id?: string
          qty?: number
          received_qty?: number | null
          sku?: string | null
          total_price?: number
          unit?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "po_line_items_po_id_fkey"
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
            referencedRelation: "divisions"
            referencedColumns: ["id"]
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
          full_name: string
          full_name_ar: string | null
          id: string
          is_active: boolean | null
          must_change_password: boolean
          phone: string | null
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
          full_name: string
          full_name_ar?: string | null
          id?: string
          is_active?: boolean | null
          must_change_password?: boolean
          phone?: string | null
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
          full_name?: string
          full_name_ar?: string | null
          id?: string
          is_active?: boolean | null
          must_change_password?: boolean
          phone?: string | null
          updated_at?: string
          user_type?: Database["public"]["Enums"]["user_type"]
        }
        Relationships: [
          {
            foreignKeyName: "profiles_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
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
          created_date: string
          currency: string | null
          exchange_rate: number | null
          expected_delivery: string | null
          id: string
          po_number: string
          rfq_id: string | null
          status: Database["public"]["Enums"]["po_status"] | null
          subtotal: number | null
          supplier_id: string
          supplier_name: string
          total_qar: number | null
          updated_at: string | null
          warehouse_id: string | null
        }
        Insert: {
          approval_level?: number | null
          created_at?: string | null
          created_date: string
          currency?: string | null
          exchange_rate?: number | null
          expected_delivery?: string | null
          id?: string
          po_number: string
          rfq_id?: string | null
          status?: Database["public"]["Enums"]["po_status"] | null
          subtotal?: number | null
          supplier_id: string
          supplier_name: string
          total_qar?: number | null
          updated_at?: string | null
          warehouse_id?: string | null
        }
        Update: {
          approval_level?: number | null
          created_at?: string | null
          created_date?: string
          currency?: string | null
          exchange_rate?: number | null
          expected_delivery?: string | null
          id?: string
          po_number?: string
          rfq_id?: string | null
          status?: Database["public"]["Enums"]["po_status"] | null
          subtotal?: number | null
          supplier_id?: string
          supplier_name?: string
          total_qar?: number | null
          updated_at?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
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
            foreignKeyName: "qc_schedule_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
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
        ]
      }
      quotation_log: {
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
            foreignKeyName: "quotation_log_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotations: {
        Row: {
          agent_name: string | null
          approved_by_customer: boolean | null
          approved_by_manager: boolean | null
          converted_order_id: string | null
          created_at: string | null
          created_date: string
          customer_id: string
          division: string | null
          expiry_date: string
          has_configurable: boolean | null
          id: string
          line_item_count: number | null
          quotation_id: string
          sent_date: string | null
          services_summary: string | null
          status: Database["public"]["Enums"]["quotation_status"] | null
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
          customer_id: string
          division?: string | null
          expiry_date: string
          has_configurable?: boolean | null
          id?: string
          line_item_count?: number | null
          quotation_id: string
          sent_date?: string | null
          services_summary?: string | null
          status?: Database["public"]["Enums"]["quotation_status"] | null
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
          customer_id?: string
          division?: string | null
          expiry_date?: string
          has_configurable?: boolean | null
          id?: string
          line_item_count?: number | null
          quotation_id?: string
          sent_date?: string | null
          services_summary?: string | null
          status?: Database["public"]["Enums"]["quotation_status"] | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotations_converted_order_id_fkey"
            columns: ["converted_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
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
      receival_items: {
        Row: {
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
          created_at: string | null
          date: string
          id: string
          landed_cost_id: string | null
          notes: string | null
          po_id: string
          receival_number: string
          received_by: string | null
          received_by_name: string | null
          status: Database["public"]["Enums"]["receival_status"] | null
          updated_at: string | null
          warehouse_id: string
        }
        Insert: {
          created_at?: string | null
          date: string
          id?: string
          landed_cost_id?: string | null
          notes?: string | null
          po_id: string
          receival_number: string
          received_by?: string | null
          received_by_name?: string | null
          status?: Database["public"]["Enums"]["receival_status"] | null
          updated_at?: string | null
          warehouse_id: string
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: string
          landed_cost_id?: string | null
          notes?: string | null
          po_id?: string
          receival_number?: string
          received_by?: string | null
          received_by_name?: string | null
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
          division_id: string | null
          id: string
          items: Json
          notes: string | null
          reason: string
          restock_warehouse_id: string | null
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
          division_id?: string | null
          id?: string
          items?: Json
          notes?: string | null
          reason?: string
          restock_warehouse_id?: string | null
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
          division_id?: string | null
          id?: string
          items?: Json
          notes?: string | null
          reason?: string
          restock_warehouse_id?: string | null
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
            referencedRelation: "divisions"
            referencedColumns: ["id"]
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
          sale_order_id: string
          status: Database["public"]["Enums"]["sale_delivery_status"] | null
          updated_at: string
          warehouse_id: string
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
          sale_order_id: string
          status?: Database["public"]["Enums"]["sale_delivery_status"] | null
          updated_at?: string
          warehouse_id: string
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
          sale_order_id?: string
          status?: Database["public"]["Enums"]["sale_delivery_status"] | null
          updated_at?: string
          warehouse_id?: string
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
            foreignKeyName: "sale_deliveries_sale_order_id_fkey"
            columns: ["sale_order_id"]
            isOneToOne: false
            referencedRelation: "sale_orders"
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
      sale_order_lines: {
        Row: {
          brand_variant_id: string | null
          created_at: string
          created_by: string | null
          delivered_qty: number | null
          id: string
          item_id: string | null
          item_name: string
          qty: number
          sale_order_id: string
          sku: string | null
          total: number
          unit_price: number
        }
        Insert: {
          brand_variant_id?: string | null
          created_at?: string
          created_by?: string | null
          delivered_qty?: number | null
          id?: string
          item_id?: string | null
          item_name: string
          qty?: number
          sale_order_id: string
          sku?: string | null
          total?: number
          unit_price?: number
        }
        Update: {
          brand_variant_id?: string | null
          created_at?: string
          created_by?: string | null
          delivered_qty?: number | null
          id?: string
          item_id?: string | null
          item_name?: string
          qty?: number
          sale_order_id?: string
          sku?: string | null
          total?: number
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
        ]
      }
      sale_orders: {
        Row: {
          campaign_id: string | null
          created_at: string
          created_by: string | null
          created_by_name: string | null
          customer_id: string
          deleted_at: string | null
          discount_amount: number | null
          discount_amount_resolved: number | null
          discount_label: string | null
          discount_type: string | null
          id: string
          notes: string | null
          so_number: string
          status: Database["public"]["Enums"]["sale_order_status"] | null
          subtotal: number | null
          tax: number | null
          total: number | null
          updated_at: string
          voucher_id: string | null
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          customer_id: string
          deleted_at?: string | null
          discount_amount?: number | null
          discount_amount_resolved?: number | null
          discount_label?: string | null
          discount_type?: string | null
          id?: string
          notes?: string | null
          so_number: string
          status?: Database["public"]["Enums"]["sale_order_status"] | null
          subtotal?: number | null
          tax?: number | null
          total?: number | null
          updated_at?: string
          voucher_id?: string | null
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          customer_id?: string
          deleted_at?: string | null
          discount_amount?: number | null
          discount_amount_resolved?: number | null
          discount_label?: string | null
          discount_type?: string | null
          id?: string
          notes?: string | null
          so_number?: string
          status?: Database["public"]["Enums"]["sale_order_status"] | null
          subtotal?: number | null
          tax?: number | null
          total?: number | null
          updated_at?: string
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
            referencedRelation: "customers"
            referencedColumns: ["id"]
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
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          days: Json
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          days?: Json
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      services: {
        Row: {
          booking_time_matrix: Json | null
          brands_supported: number | null
          category: Database["public"]["Enums"]["service_category"] | null
          code: string | null
          components: Json | null
          contract_type: Database["public"]["Enums"]["contract_type"] | null
          created_at: string | null
          discount: number | null
          division: Database["public"]["Enums"]["division"] | null
          duration: number | null
          emergency_price: number | null
          id: string
          includes_notes: boolean | null
          instructions: boolean | null
          inventory_items: Json | null
          catalog_image_url: string | null
          deleted_at: string | null
          legacy_service_id: string | null
          qc_items: Json | null
          invoice_text_ar: string | null
          invoice_text_en: string | null
          name_ar: string | null
          name_en: string
          parent_id: string | null
          price: number | null
          price_unit: string | null
          qc_checklist: boolean | null
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
          category?: Database["public"]["Enums"]["service_category"] | null
          code?: string | null
          components?: Json | null
          contract_type?: Database["public"]["Enums"]["contract_type"] | null
          created_at?: string | null
          discount?: number | null
          division?: Database["public"]["Enums"]["division"] | null
          duration?: number | null
          emergency_price?: number | null
          id?: string
          includes_notes?: boolean | null
          instructions?: boolean | null
          inventory_items?: Json | null
          catalog_image_url?: string | null
          deleted_at?: string | null
          legacy_service_id?: string | null
          qc_items?: Json | null
          invoice_text_ar?: string | null
          invoice_text_en?: string | null
          name_ar?: string | null
          name_en: string
          parent_id?: string | null
          price?: number | null
          price_unit?: string | null
          qc_checklist?: boolean | null
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
          category?: Database["public"]["Enums"]["service_category"] | null
          code?: string | null
          components?: Json | null
          contract_type?: Database["public"]["Enums"]["contract_type"] | null
          created_at?: string | null
          discount?: number | null
          division?: Database["public"]["Enums"]["division"] | null
          duration?: number | null
          emergency_price?: number | null
          id?: string
          includes_notes?: boolean | null
          instructions?: boolean | null
          inventory_items?: Json | null
          catalog_image_url?: string | null
          deleted_at?: string | null
          legacy_service_id?: string | null
          qc_items?: Json | null
          invoice_text_ar?: string | null
          invoice_text_en?: string | null
          name_ar?: string | null
          name_en?: string
          parent_id?: string | null
          price?: number | null
          price_unit?: string | null
          qc_checklist?: boolean | null
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
          carrier: string
          created_at: string | null
          destination: string | null
          eta: string | null
          etd: string | null
          events: Json | null
          id: string
          mode: Database["public"]["Enums"]["shipment_mode"]
          origin: string | null
          po_id: string
          receival_id: string | null
          status: Database["public"]["Enums"]["shipment_status"] | null
          tracking_number: string
          updated_at: string | null
        }
        Insert: {
          archived?: boolean | null
          carrier: string
          created_at?: string | null
          destination?: string | null
          eta?: string | null
          etd?: string | null
          events?: Json | null
          id?: string
          mode: Database["public"]["Enums"]["shipment_mode"]
          origin?: string | null
          po_id: string
          receival_id?: string | null
          status?: Database["public"]["Enums"]["shipment_status"] | null
          tracking_number: string
          updated_at?: string | null
        }
        Update: {
          archived?: boolean | null
          carrier?: string
          created_at?: string | null
          destination?: string | null
          eta?: string | null
          etd?: string | null
          events?: Json | null
          id?: string
          mode?: Database["public"]["Enums"]["shipment_mode"]
          origin?: string | null
          po_id?: string
          receival_id?: string | null
          status?: Database["public"]["Enums"]["shipment_status"] | null
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
      suppliers: {
        Row: {
          address: string | null
          category: string | null
          contact_name: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          is_active: boolean | null
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          category?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          category?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          notes?: string | null
          phone?: string | null
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
        ]
      }
      teams: {
        Row: {
          created_at: string | null
          division: Database["public"]["Enums"]["team_division"]
          id: string
          leader_id: string | null
          name: string
          schedule_end: number | null
          schedule_id: string | null
          schedule_start: number | null
          tag: Database["public"]["Enums"]["team_tag"] | null
          updated_at: string | null
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string | null
          division: Database["public"]["Enums"]["team_division"]
          id?: string
          leader_id?: string | null
          name: string
          schedule_end?: number | null
          schedule_id?: string | null
          schedule_start?: number | null
          tag?: Database["public"]["Enums"]["team_tag"] | null
          updated_at?: string | null
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string | null
          division?: Database["public"]["Enums"]["team_division"]
          id?: string
          leader_id?: string | null
          name?: string
          schedule_end?: number | null
          schedule_id?: string | null
          schedule_start?: number | null
          tag?: Database["public"]["Enums"]["team_tag"] | null
          updated_at?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
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
      user_custom_roles: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          profile_id: string
          role_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          profile_id: string
          role_id: string
        }
        Update: {
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
      user_divisions: {
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
            referencedRelation: "divisions"
            referencedColumns: ["id"]
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
      vehicles: {
        Row: {
          created_at: string | null
          id: string
          plate: string
          team_id: string | null
          type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          plate: string
          team_id?: string | null
          type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          plate?: string
          team_id?: string | null
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
      warehouse_transfers: {
        Row: {
          approved_by: string | null
          approved_by_name: string | null
          approved_date: string | null
          created_at: string | null
          created_by: string | null
          created_by_name: string | null
          date: string
          from_warehouse_id: string
          id: string
          items: Json
          notes: string | null
          status: Database["public"]["Enums"]["transfer_status"] | null
          to_warehouse_id: string
          transfer_number: string
          updated_at: string | null
        }
        Insert: {
          approved_by?: string | null
          approved_by_name?: string | null
          approved_date?: string | null
          created_at?: string | null
          created_by?: string | null
          created_by_name?: string | null
          date: string
          from_warehouse_id: string
          id?: string
          items: Json
          notes?: string | null
          status?: Database["public"]["Enums"]["transfer_status"] | null
          to_warehouse_id: string
          transfer_number: string
          updated_at?: string | null
        }
        Update: {
          approved_by?: string | null
          approved_by_name?: string | null
          approved_date?: string | null
          created_at?: string | null
          created_by?: string | null
          created_by_name?: string | null
          date?: string
          from_warehouse_id?: string
          id?: string
          items?: Json
          notes?: string | null
          status?: Database["public"]["Enums"]["transfer_status"] | null
          to_warehouse_id?: string
          transfer_number?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_transfers_from_warehouse_id_fkey"
            columns: ["from_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
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
          manager_id: string | null
          name: string
          total_value: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          item_count?: number | null
          location?: string | null
          manager_id?: string | null
          name: string
          total_value?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          item_count?: number | null
          location?: string | null
          manager_id?: string | null
          name?: string
          total_value?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
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
      [_ in never]: never
    }
    Functions: {
      replace_user_custom_roles: {
        Args: { p_role_ids: string[]; p_user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      address_type: "blue-plate" | "google-coords"
      approval_role: "purchase_manager" | "accountant" | "owner"
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
      contract_type: "preventive" | "area" | "general"
      credit_note_status: "draft" | "approved" | "issued" | "redeemed"
      division: "maintenance" | "cleaning" | "kitchen" | "pest-control"
      employee_status:
        | "active"
        | "vacation"
        | "archived"
        | "unassigned"
        | "on-task"
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
      message_source: "whatsapp" | "whatsapp_api" | "phone" | "sms" | "email"
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
      order_status:
        | "scheduled"
        | "confirmed"
        | "in-progress"
        | "completed"
        | "pending-approval"
        | "cancelled"
        | "waitlist"
        | "pending-confirmation"
      payment_method:
        | "online"
        | "pay_later"
        | "fawran"
        | "online_transfer"
        | "cheque"
        | "bank_transfer"
        | "cash"
        | "pos"
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
        | "cancelled"
      promotion_rule_type:
        | "percentage"
        | "fixed"
        | "buy_one_get_one"
        | "buy_x_get_y"
        | "buy_x_discount_get_y"
      qc_priority: "high" | "medium" | "low"
      qc_schedule_status: "pending" | "in-progress" | "completed" | "missed"
      quotation_status:
        | "draft"
        | "sent"
        | "pending_approval"
        | "approved"
        | "customer_approved"
        | "rejected"
        | "expired"
        | "converted"
        | "cancelled"
      receival_status: "pending_approval" | "approved" | "rejected"
      reminder_channel: "Email" | "SMS" | "WhatsApp"
      return_source_type: "sale_order" | "order"
      return_status: "pending" | "received" | "restocked" | "closed"
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
      service_category:
        | "Repair"
        | "Installation"
        | "Maintenance"
        | "Cleaning"
        | "Quick Service"
      service_status: "active" | "inactive"
      service_type: "standard" | "configurable"
      shipment_mode: "air" | "sea" | "land" | "manual"
      shipment_status:
        | "booked"
        | "in_transit"
        | "customs"
        | "delivered"
        | "delayed"
      team_division: "alfaytri-maintenance" | "alfaytri-kitchen" | "rsh"
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
      user_type: "internal" | "customer" | "employee"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      address_type: ["blue-plate", "google-coords"],
      approval_role: ["purchase_manager", "accountant", "owner"],
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
      message_source: ["whatsapp", "whatsapp_api", "phone", "sms", "email"],
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
      order_status: [
        "scheduled",
        "confirmed",
        "in-progress",
        "completed",
        "pending-approval",
        "cancelled",
        "waitlist",
        "pending-confirmation",
      ],
      payment_method: [
        "online",
        "pay_later",
        "fawran",
        "online_transfer",
        "cheque",
        "bank_transfer",
        "cash",
        "pos",
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
        "cancelled",
      ],
      promotion_rule_type: [
        "percentage",
        "fixed",
        "buy_one_get_one",
        "buy_x_get_y",
        "buy_x_discount_get_y",
      ],
      qc_priority: ["high", "medium", "low"],
      qc_schedule_status: ["pending", "in-progress", "completed", "missed"],
      quotation_status: [
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
      receival_status: ["pending_approval", "approved", "rejected"],
      reminder_channel: ["Email", "SMS", "WhatsApp"],
      return_source_type: ["sale_order", "order"],
      return_status: ["pending", "received", "restocked", "closed"],
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
      ],
      service_category: [
        "Repair",
        "Installation",
        "Maintenance",
        "Cleaning",
        "Quick Service",
      ],
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
      team_division: ["alfaytri-maintenance", "alfaytri-kitchen", "rsh"],
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
      ],
      user_type: ["internal", "customer", "employee"],
      voucher_type: ["single_use", "multi_use", "limited"],
    },
  },
} as const

// ─── Convenience row type helpers ───
export type DBTable<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type DBInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']

export type DBUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']

export type DBEnum<T extends keyof Database['public']['Enums']> =
  Database['public']['Enums'][T]
