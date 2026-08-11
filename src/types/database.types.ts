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
          module: string | null
          new_data: Json | null
          old_data: Json | null
          performer_name: string | null
          severity: Database["public"]["Enums"]["audit_severity"]
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: string | null
          entity_id: string
          entity_type: string
          id?: string
          module?: string | null
          new_data?: Json | null
          old_data?: Json | null
          performer_name?: string | null
          severity?: Database["public"]["Enums"]["audit_severity"]
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          module?: string | null
          new_data?: Json | null
          old_data?: Json | null
          performer_name?: string | null
          severity?: Database["public"]["Enums"]["audit_severity"]
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          created_at: string
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
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
            referencedRelation: "user_data"
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
      bill_attachments: {
        Row: {
          bill_id: string
          file_name: string
          id: string
          mime_type: string | null
          size_bytes: number | null
          storage_key: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          bill_id: string
          file_name: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_key: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          bill_id?: string
          file_name?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_key?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bill_attachments_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "user_data"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_line_items: {
        Row: {
          bill_id: string
          brand_variant_id: string | null
          created_at: string | null
          description: string
          id: string
          match_note: string | null
          match_status: string | null
          qty: number | null
          total: number | null
          unit_price: number | null
        }
        Insert: {
          bill_id: string
          brand_variant_id?: string | null
          created_at?: string | null
          description: string
          id?: string
          match_note?: string | null
          match_status?: string | null
          qty?: number | null
          total?: number | null
          unit_price?: number | null
        }
        Update: {
          bill_id?: string
          brand_variant_id?: string | null
          created_at?: string | null
          description?: string
          id?: string
          match_note?: string | null
          match_status?: string | null
          qty?: number | null
          total?: number | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bill_line_items_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_line_items_brand_variant_id_fkey"
            columns: ["brand_variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_brand_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      bills: {
        Row: {
          bill_number: string
          created_at: string | null
          discount_amount: number
          discount_label: string | null
          division_id: string | null
          due_date: string
          id: string
          issued_date: string
          needs_refresh: boolean
          notes: string | null
          paid_amount: number | null
          payment_status: Database["public"]["Enums"]["invoice_payment_status"]
          pdf_url: string | null
          purchase_order_id: string | null
          receival_id: string | null
          source_label: string | null
          subtotal: number | null
          supplier_id: string | null
          total_amount: number | null
        }
        Insert: {
          bill_number: string
          created_at?: string | null
          discount_amount?: number
          discount_label?: string | null
          division_id?: string | null
          due_date?: string
          id?: string
          issued_date?: string
          needs_refresh?: boolean
          notes?: string | null
          paid_amount?: number | null
          payment_status?: Database["public"]["Enums"]["invoice_payment_status"]
          pdf_url?: string | null
          purchase_order_id?: string | null
          receival_id?: string | null
          source_label?: string | null
          subtotal?: number | null
          supplier_id?: string | null
          total_amount?: number | null
        }
        Update: {
          bill_number?: string
          created_at?: string | null
          discount_amount?: number
          discount_label?: string | null
          division_id?: string | null
          due_date?: string
          id?: string
          issued_date?: string
          needs_refresh?: boolean
          notes?: string | null
          paid_amount?: number | null
          payment_status?: Database["public"]["Enums"]["invoice_payment_status"]
          pdf_url?: string | null
          purchase_order_id?: string | null
          receival_id?: string | null
          source_label?: string | null
          subtotal?: number | null
          supplier_id?: string | null
          total_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bills_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "company_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: true
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_receival_id_fkey"
            columns: ["receival_id"]
            isOneToOne: false
            referencedRelation: "receivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          created_at: string
          id: string
          name: string
          name_ar: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          name_ar?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          name_ar?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      cogs_entries: {
        Row: {
          brand_variant_id: string
          consumer_customer_id: string | null
          consumer_division_id: string | null
          consumer_sub_container_id: string | null
          consumer_type: string | null
          consumption_id: string | null
          created_at: string
          date: string
          division_id: string | null
          id: string
          landed_cost_id: string | null
          notes: string | null
          qty: number
          sale_delivery_id: string | null
          sale_order_id: string | null
          source_id: string | null
          source_type: string
          total_cost: number
          unit_cost: number
        }
        Insert: {
          brand_variant_id: string
          consumer_customer_id?: string | null
          consumer_division_id?: string | null
          consumer_sub_container_id?: string | null
          consumer_type?: string | null
          consumption_id?: string | null
          created_at?: string
          date?: string
          division_id?: string | null
          id?: string
          landed_cost_id?: string | null
          notes?: string | null
          qty: number
          sale_delivery_id?: string | null
          sale_order_id?: string | null
          source_id?: string | null
          source_type?: string
          total_cost: number
          unit_cost: number
        }
        Update: {
          brand_variant_id?: string
          consumer_customer_id?: string | null
          consumer_division_id?: string | null
          consumer_sub_container_id?: string | null
          consumer_type?: string | null
          consumption_id?: string | null
          created_at?: string
          date?: string
          division_id?: string | null
          id?: string
          landed_cost_id?: string | null
          notes?: string | null
          qty?: number
          sale_delivery_id?: string | null
          sale_order_id?: string | null
          source_id?: string | null
          source_type?: string
          total_cost?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "cogs_entries_brand_variant_id_fkey"
            columns: ["brand_variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_brand_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cogs_entries_consumer_customer_id_fkey"
            columns: ["consumer_customer_id"]
            isOneToOne: false
            referencedRelation: "customer_credit_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "cogs_entries_consumer_customer_id_fkey"
            columns: ["consumer_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cogs_entries_consumer_division_id_fkey"
            columns: ["consumer_division_id"]
            isOneToOne: false
            referencedRelation: "company_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cogs_entries_consumer_sub_container_id_fkey"
            columns: ["consumer_sub_container_id"]
            isOneToOne: false
            referencedRelation: "warehouse_sub_container_totals"
            referencedColumns: ["sub_container_id"]
          },
          {
            foreignKeyName: "cogs_entries_consumer_sub_container_id_fkey"
            columns: ["consumer_sub_container_id"]
            isOneToOne: false
            referencedRelation: "warehouse_sub_containers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cogs_entries_consumption_id_fkey"
            columns: ["consumption_id"]
            isOneToOne: false
            referencedRelation: "consumption_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cogs_entries_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "company_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cogs_entries_landed_cost_id_fkey"
            columns: ["landed_cost_id"]
            isOneToOne: false
            referencedRelation: "landed_costs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cogs_entries_sale_delivery_id_fkey"
            columns: ["sale_delivery_id"]
            isOneToOne: false
            referencedRelation: "sale_deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cogs_entries_sale_order_id_fkey"
            columns: ["sale_order_id"]
            isOneToOne: false
            referencedRelation: "sale_order_paid_summary"
            referencedColumns: ["sale_order_id"]
          },
          {
            foreignKeyName: "cogs_entries_sale_order_id_fkey"
            columns: ["sale_order_id"]
            isOneToOne: false
            referencedRelation: "sale_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cogs_entries_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "fifo_cost_layers"
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
          currency_id: string | null
          default_currency: string
          default_tax_rate: number
          footer_motto: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          name_ar: string | null
          name_en: string
          stamp_url: string | null
          updated_at: string
          vat_id: string | null
        }
        Insert: {
          address_ar?: string | null
          address_en?: string | null
          cr_number?: string | null
          created_at?: string
          created_by?: string | null
          currency_id?: string | null
          default_currency?: string
          default_tax_rate?: number
          footer_motto?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name_ar?: string | null
          name_en: string
          stamp_url?: string | null
          updated_at?: string
          vat_id?: string | null
        }
        Update: {
          address_ar?: string | null
          address_en?: string | null
          cr_number?: string | null
          created_at?: string
          created_by?: string | null
          currency_id?: string | null
          default_currency?: string
          default_tax_rate?: number
          footer_motto?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name_ar?: string | null
          name_en?: string
          stamp_url?: string | null
          updated_at?: string
          vat_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_divisions: {
        Row: {
          address: string | null
          address_ar: string | null
          address_en: string | null
          color: string
          company_id: string | null
          company_name_ar: string | null
          company_name_en: string | null
          created_at: string
          created_by: string | null
          css_classes: string | null
          currency_id: string | null
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
          color?: string
          company_id?: string | null
          company_name_ar?: string | null
          company_name_en?: string | null
          created_at?: string
          created_by?: string | null
          css_classes?: string | null
          currency_id?: string | null
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
          color?: string
          company_id?: string | null
          company_name_ar?: string | null
          company_name_en?: string | null
          created_at?: string
          created_by?: string | null
          css_classes?: string | null
          currency_id?: string | null
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
            foreignKeyName: "company_divisions_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
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
            referencedRelation: "user_data"
            referencedColumns: ["id"]
          },
        ]
      }
      consumption_edit_requests: {
        Row: {
          consumption_id: string
          created_at: string
          id: string
          reason: string
          requested_by: string
          review_comment: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          consumption_id: string
          created_at?: string
          id?: string
          reason: string
          requested_by: string
          review_comment?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          consumption_id?: string
          created_at?: string
          id?: string
          reason?: string
          requested_by?: string
          review_comment?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "consumption_edit_requests_consumption_id_fkey"
            columns: ["consumption_id"]
            isOneToOne: false
            referencedRelation: "consumption_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumption_edit_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "user_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumption_edit_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "user_data"
            referencedColumns: ["id"]
          },
        ]
      }
      consumption_entries: {
        Row: {
          attachments: string[]
          cancelled_at: string | null
          cancelled_by: string | null
          ce_number: string
          consumer_customer_id: string | null
          consumer_sub_container_id: string | null
          consumer_type: string
          created_at: string
          created_by: string | null
          date: string
          division_id: string | null
          id: string
          notes: string | null
          posted_at: string | null
          posted_by: string | null
          source_sub_container_id: string
          source_warehouse_id: string
          status: string
        }
        Insert: {
          attachments?: string[]
          cancelled_at?: string | null
          cancelled_by?: string | null
          ce_number: string
          consumer_customer_id?: string | null
          consumer_sub_container_id?: string | null
          consumer_type: string
          created_at?: string
          created_by?: string | null
          date?: string
          division_id?: string | null
          id?: string
          notes?: string | null
          posted_at?: string | null
          posted_by?: string | null
          source_sub_container_id: string
          source_warehouse_id: string
          status?: string
        }
        Update: {
          attachments?: string[]
          cancelled_at?: string | null
          cancelled_by?: string | null
          ce_number?: string
          consumer_customer_id?: string | null
          consumer_sub_container_id?: string | null
          consumer_type?: string
          created_at?: string
          created_by?: string | null
          date?: string
          division_id?: string | null
          id?: string
          notes?: string | null
          posted_at?: string | null
          posted_by?: string | null
          source_sub_container_id?: string
          source_warehouse_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "consumption_entries_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "user_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumption_entries_consumer_customer_id_fkey"
            columns: ["consumer_customer_id"]
            isOneToOne: false
            referencedRelation: "customer_credit_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "consumption_entries_consumer_customer_id_fkey"
            columns: ["consumer_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumption_entries_consumer_sub_container_id_fkey"
            columns: ["consumer_sub_container_id"]
            isOneToOne: false
            referencedRelation: "warehouse_sub_container_totals"
            referencedColumns: ["sub_container_id"]
          },
          {
            foreignKeyName: "consumption_entries_consumer_sub_container_id_fkey"
            columns: ["consumer_sub_container_id"]
            isOneToOne: false
            referencedRelation: "warehouse_sub_containers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumption_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumption_entries_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "company_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumption_entries_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "user_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumption_entries_source_sub_container_id_fkey"
            columns: ["source_sub_container_id"]
            isOneToOne: false
            referencedRelation: "warehouse_sub_container_totals"
            referencedColumns: ["sub_container_id"]
          },
          {
            foreignKeyName: "consumption_entries_source_sub_container_id_fkey"
            columns: ["source_sub_container_id"]
            isOneToOne: false
            referencedRelation: "warehouse_sub_containers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumption_entries_source_warehouse_id_fkey"
            columns: ["source_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      consumption_lines: {
        Row: {
          brand_variant_id: string
          consumption_id: string
          created_at: string
          id: string
          item_name: string
          qty: number
          sku: string | null
          total_cost: number | null
          unit_cost: number | null
        }
        Insert: {
          brand_variant_id: string
          consumption_id: string
          created_at?: string
          id?: string
          item_name: string
          qty: number
          sku?: string | null
          total_cost?: number | null
          unit_cost?: number | null
        }
        Update: {
          brand_variant_id?: string
          consumption_id?: string
          created_at?: string
          id?: string
          item_name?: string
          qty?: number
          sku?: string | null
          total_cost?: number | null
          unit_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "consumption_lines_brand_variant_id_fkey"
            columns: ["brand_variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_brand_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumption_lines_consumption_id_fkey"
            columns: ["consumption_id"]
            isOneToOne: false
            referencedRelation: "consumption_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      consumption_number_counters: {
        Row: {
          consumer_type: string
          last_seq: number
          period: string
          updated_at: string
        }
        Insert: {
          consumer_type: string
          last_seq?: number
          period: string
          updated_at?: string
        }
        Update: {
          consumer_type?: string
          last_seq?: number
          period?: string
          updated_at?: string
        }
        Relationships: []
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
          condition: string | null
          condition_notes: string | null
          created_at: string | null
          credit_note_id: string
          description: string | null
          id: string
          invoice_line_id: string | null
          line_type: Database["public"]["Enums"]["credit_debit_line_type"]
          qty: number
          sku: string | null
          total: number | null
          unit_price: number
        }
        Insert: {
          condition?: string | null
          condition_notes?: string | null
          created_at?: string | null
          credit_note_id: string
          description?: string | null
          id?: string
          invoice_line_id?: string | null
          line_type?: Database["public"]["Enums"]["credit_debit_line_type"]
          qty: number
          sku?: string | null
          total?: number | null
          unit_price: number
        }
        Update: {
          condition?: string | null
          condition_notes?: string | null
          created_at?: string | null
          credit_note_id?: string
          description?: string | null
          id?: string
          invoice_line_id?: string | null
          line_type?: Database["public"]["Enums"]["credit_debit_line_type"]
          qty?: number
          sku?: string | null
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
            foreignKeyName: "credit_note_lines_credit_note_id_fkey"
            columns: ["credit_note_id"]
            isOneToOne: false
            referencedRelation: "customer_open_credit_notes"
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
          created_at: string
          credit_note_id: string
          customer_id: string | null
          customer_name: string | null
          id: string
          invoice_id: string | null
          new_total: number | null
          original_total: number | null
          pdf_url: string | null
          reason: string
          reason_id: string | null
          refund_method: string | null
          refund_method_id: string | null
          refund_reference: string | null
          resolution_type:
            | Database["public"]["Enums"]["credit_note_resolution_type"]
            | null
          source_return_id: string | null
          status: Database["public"]["Enums"]["credit_note_status"] | null
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          credit_note_id: string
          customer_id?: string | null
          customer_name?: string | null
          id?: string
          invoice_id?: string | null
          new_total?: number | null
          original_total?: number | null
          pdf_url?: string | null
          reason: string
          reason_id?: string | null
          refund_method?: string | null
          refund_method_id?: string | null
          refund_reference?: string | null
          resolution_type?:
            | Database["public"]["Enums"]["credit_note_resolution_type"]
            | null
          source_return_id?: string | null
          status?: Database["public"]["Enums"]["credit_note_status"] | null
          total_amount?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          credit_note_id?: string
          customer_id?: string | null
          customer_name?: string | null
          id?: string
          invoice_id?: string | null
          new_total?: number | null
          original_total?: number | null
          pdf_url?: string | null
          reason?: string
          reason_id?: string | null
          refund_method?: string | null
          refund_method_id?: string | null
          refund_reference?: string | null
          resolution_type?:
            | Database["public"]["Enums"]["credit_note_resolution_type"]
            | null
          source_return_id?: string | null
          status?: Database["public"]["Enums"]["credit_note_status"] | null
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_credit_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "credit_notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
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
            referencedRelation: "so_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_reason_id_fkey"
            columns: ["reason_id"]
            isOneToOne: false
            referencedRelation: "reason_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_refund_method_id_fkey"
            columns: ["refund_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_source_return_id_fkey"
            columns: ["source_return_id"]
            isOneToOne: false
            referencedRelation: "return_progress"
            referencedColumns: ["return_id"]
          },
          {
            foreignKeyName: "credit_notes_source_return_id_fkey"
            columns: ["source_return_id"]
            isOneToOne: false
            referencedRelation: "so_po_returns"
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
          name: string | null
          sort_order: number
          symbol: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string | null
          sort_order?: number
          symbol?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string | null
          sort_order?: number
          symbol?: string | null
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
          id: string
          is_approval_slot: boolean
          is_inventory_receiver: boolean
          is_system_admin: boolean | null
          name: string
          permissions: string[]
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_approval_slot?: boolean
          is_inventory_receiver?: boolean
          is_system_admin?: boolean | null
          name: string
          permissions?: string[]
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_approval_slot?: boolean
          is_inventory_receiver?: boolean
          is_system_admin?: boolean | null
          name?: string
          permissions?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_roles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_data"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_credit_docs: {
        Row: {
          cr_url: string | null
          customer_id: string
          establishment_id_url: string | null
          signed_credit_form_url: string | null
        }
        Insert: {
          cr_url?: string | null
          customer_id: string
          establishment_id_url?: string | null
          signed_credit_form_url?: string | null
        }
        Update: {
          cr_url?: string | null
          customer_id?: string
          establishment_id_url?: string | null
          signed_credit_form_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_credit_docs_new_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customer_credit_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_credit_docs_new_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customers"
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
          status: Database["public"]["Enums"]["approval_status"]
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
          status?: Database["public"]["Enums"]["approval_status"]
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
          status?: Database["public"]["Enums"]["approval_status"]
          step_order?: number
          step_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_credit_group_approvals_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "user_data"
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
          status: Database["public"]["Enums"]["credit_group_request_status"]
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
          status?: Database["public"]["Enums"]["credit_group_request_status"]
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
          status?: Database["public"]["Enums"]["credit_group_request_status"]
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
            referencedRelation: "user_data"
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
            referencedRelation: "user_data"
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
      customers: {
        Row: {
          block_reason: string | null
          created_at: string | null
          credit_group_id: string | null
          email: string | null
          entity_type:
            | Database["public"]["Enums"]["customer_entity_type"]
            | null
          id: string
          is_active: boolean
          name: string
          name_ar: string | null
          updated_at: string | null
        }
        Insert: {
          block_reason?: string | null
          created_at?: string | null
          credit_group_id?: string | null
          email?: string | null
          entity_type?:
            | Database["public"]["Enums"]["customer_entity_type"]
            | null
          id?: string
          is_active?: boolean
          name: string
          name_ar?: string | null
          updated_at?: string | null
        }
        Update: {
          block_reason?: string | null
          created_at?: string | null
          credit_group_id?: string | null
          email?: string | null
          entity_type?:
            | Database["public"]["Enums"]["customer_entity_type"]
            | null
          id?: string
          is_active?: boolean
          name?: string
          name_ar?: string | null
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
      debit_note_lines: {
        Row: {
          condition: string | null
          condition_notes: string | null
          created_at: string | null
          debit_note_id: string
          description: string | null
          id: string
          line_type: Database["public"]["Enums"]["credit_debit_line_type"]
          qty: number
          sku: string | null
          total: number | null
          unit_price: number
        }
        Insert: {
          condition?: string | null
          condition_notes?: string | null
          created_at?: string | null
          debit_note_id: string
          description?: string | null
          id?: string
          line_type?: Database["public"]["Enums"]["credit_debit_line_type"]
          qty: number
          sku?: string | null
          total?: number | null
          unit_price: number
        }
        Update: {
          condition?: string | null
          condition_notes?: string | null
          created_at?: string | null
          debit_note_id?: string
          description?: string | null
          id?: string
          line_type?: Database["public"]["Enums"]["credit_debit_line_type"]
          qty?: number
          sku?: string | null
          total?: number | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "debit_note_lines_debit_note_id_fkey"
            columns: ["debit_note_id"]
            isOneToOne: false
            referencedRelation: "debit_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      debit_notes: {
        Row: {
          bill_id: string | null
          created_at: string
          debit_note_id: string
          id: string
          new_total: number | null
          original_total: number | null
          pdf_url: string | null
          purchase_order_id: string | null
          reason: string
          reason_id: string | null
          remaining_amount: number | null
          resolution_type: string | null
          source_return_id: string | null
          status: Database["public"]["Enums"]["credit_note_status"] | null
          supplier_id: string | null
          supplier_name: string | null
          total_amount: number
          updated_at: string
        }
        Insert: {
          bill_id?: string | null
          created_at?: string
          debit_note_id: string
          id?: string
          new_total?: number | null
          original_total?: number | null
          pdf_url?: string | null
          purchase_order_id?: string | null
          reason: string
          reason_id?: string | null
          remaining_amount?: number | null
          resolution_type?: string | null
          source_return_id?: string | null
          status?: Database["public"]["Enums"]["credit_note_status"] | null
          supplier_id?: string | null
          supplier_name?: string | null
          total_amount?: number
          updated_at?: string
        }
        Update: {
          bill_id?: string | null
          created_at?: string
          debit_note_id?: string
          id?: string
          new_total?: number | null
          original_total?: number | null
          pdf_url?: string | null
          purchase_order_id?: string | null
          reason?: string
          reason_id?: string | null
          remaining_amount?: number | null
          resolution_type?: string | null
          source_return_id?: string | null
          status?: Database["public"]["Enums"]["credit_note_status"] | null
          supplier_id?: string | null
          supplier_name?: string | null
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "debit_notes_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debit_notes_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debit_notes_reason_id_fkey"
            columns: ["reason_id"]
            isOneToOne: false
            referencedRelation: "reason_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debit_notes_source_return_id_fkey"
            columns: ["source_return_id"]
            isOneToOne: false
            referencedRelation: "return_progress"
            referencedColumns: ["return_id"]
          },
          {
            foreignKeyName: "debit_notes_source_return_id_fkey"
            columns: ["source_return_id"]
            isOneToOne: false
            referencedRelation: "so_po_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debit_notes_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_rate_change_log: {
        Row: {
          changed_at: string
          changed_by: string | null
          document_id: string
          document_type: string
          id: string
          new_rate: number
          old_rate: number
          reason: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          document_id: string
          document_type: string
          id?: string
          new_rate: number
          old_rate: number
          reason: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          document_id?: string
          document_type?: string
          id?: string
          new_rate?: number
          old_rate?: number
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "exchange_rate_change_log_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "user_data"
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
          source_currency: string
          source_exchange_rate: number
          source_id: string | null
          source_type: string | null
          sub_container_id: string
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
          source_currency?: string
          source_exchange_rate?: number
          source_id?: string | null
          source_type?: string | null
          sub_container_id: string
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
          source_currency?: string
          source_exchange_rate?: number
          source_id?: string | null
          source_type?: string | null
          sub_container_id?: string
          total_unit_cost?: number
          unit_cost?: number
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fifo_cost_layers_brand_variant_id_fkey"
            columns: ["brand_variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_brand_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fifo_cost_layers_receival_id_fkey"
            columns: ["receival_id"]
            isOneToOne: false
            referencedRelation: "receivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fifo_cost_layers_sub_container_id_fkey"
            columns: ["sub_container_id"]
            isOneToOne: false
            referencedRelation: "warehouse_sub_container_totals"
            referencedColumns: ["sub_container_id"]
          },
          {
            foreignKeyName: "fifo_cost_layers_sub_container_id_fkey"
            columns: ["sub_container_id"]
            isOneToOne: false
            referencedRelation: "warehouse_sub_containers"
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
      inventory_attribute_definitions: {
        Row: {
          attribute_key: string
          category_id: string
          created_at: string
          created_by: string | null
          id: string
          label_ar: string | null
          label_en: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          attribute_key: string
          category_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          label_ar?: string | null
          label_en: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          attribute_key?: string
          category_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          label_ar?: string | null
          label_en?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_attribute_definitions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "inventory_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_attribute_definitions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_data"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_attribute_options: {
        Row: {
          created_at: string
          definition_id: string
          id: string
          is_archived: boolean
          sort_order: number
          value_ar: string | null
          value_en: string
        }
        Insert: {
          created_at?: string
          definition_id: string
          id?: string
          is_archived?: boolean
          sort_order?: number
          value_ar?: string | null
          value_en: string
        }
        Update: {
          created_at?: string
          definition_id?: string
          id?: string
          is_archived?: boolean
          sort_order?: number
          value_ar?: string | null
          value_en?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_attribute_options_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "inventory_attribute_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_categories: {
        Row: {
          created_at: string | null
          default_sub_container_id: string | null
          default_warranty_policy_id: string | null
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
          default_sub_container_id?: string | null
          default_warranty_policy_id?: string | null
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
          default_sub_container_id?: string | null
          default_warranty_policy_id?: string | null
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
            foreignKeyName: "inventory_categories_default_sub_container_id_fkey"
            columns: ["default_sub_container_id"]
            isOneToOne: false
            referencedRelation: "warehouse_sub_container_totals"
            referencedColumns: ["sub_container_id"]
          },
          {
            foreignKeyName: "inventory_categories_default_sub_container_id_fkey"
            columns: ["default_sub_container_id"]
            isOneToOne: false
            referencedRelation: "warehouse_sub_containers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_categories_default_warranty_policy_id_fkey"
            columns: ["default_warranty_policy_id"]
            isOneToOne: false
            referencedRelation: "warranty_policies"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "user_data"
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
            referencedRelation: "user_data"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_check_items: {
        Row: {
          assignment_id: string | null
          brand: string
          brand_variant_id: string
          category_name: string | null
          check_id: string
          counted_qty: number | null
          country_name: string | null
          created_at: string
          id: string
          is_counted: boolean
          item_name: string
          sku: string | null
          system_qty: number
          system_qty_at_close: number | null
          updated_at: string
          variance: number | null
          variance_type: string | null
        }
        Insert: {
          assignment_id?: string | null
          brand: string
          brand_variant_id: string
          category_name?: string | null
          check_id: string
          counted_qty?: number | null
          country_name?: string | null
          created_at?: string
          id?: string
          is_counted?: boolean
          item_name: string
          sku?: string | null
          system_qty?: number
          system_qty_at_close?: number | null
          updated_at?: string
          variance?: number | null
          variance_type?: string | null
        }
        Update: {
          assignment_id?: string | null
          brand?: string
          brand_variant_id?: string
          category_name?: string | null
          check_id?: string
          counted_qty?: number | null
          country_name?: string | null
          created_at?: string
          id?: string
          is_counted?: boolean
          item_name?: string
          sku?: string | null
          system_qty?: number
          system_qty_at_close?: number | null
          updated_at?: string
          variance?: number | null
          variance_type?: string | null
        }
        Relationships: [
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
            referencedRelation: "inventory_item_brand_variants"
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
          event_type: Database["public"]["Enums"]["inventory_check_event_type"]
          id: string
          meta: Json | null
          profile_id: string | null
          profile_name: string | null
        }
        Insert: {
          check_id: string
          created_at?: string
          event_type: Database["public"]["Enums"]["inventory_check_event_type"]
          id?: string
          meta?: Json | null
          profile_id?: string | null
          profile_name?: string | null
        }
        Update: {
          check_id?: string
          created_at?: string
          event_type?: Database["public"]["Enums"]["inventory_check_event_type"]
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
            referencedRelation: "user_data"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_checks: {
        Row: {
          check_number: string
          created_at: string
          id: string
          initiated_by_name: string | null
          initiated_by_profile_id: string | null
          notes: string | null
          reviewed_at: string | null
          reviewed_by_name: string | null
          started_at: string | null
          status: string
          sub_container_id: string | null
          updated_at: string
          warehouse_id: string
          warehouse_name: string
        }
        Insert: {
          check_number: string
          created_at?: string
          id?: string
          initiated_by_name?: string | null
          initiated_by_profile_id?: string | null
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by_name?: string | null
          started_at?: string | null
          status?: string
          sub_container_id?: string | null
          updated_at?: string
          warehouse_id: string
          warehouse_name?: string
        }
        Update: {
          check_number?: string
          created_at?: string
          id?: string
          initiated_by_name?: string | null
          initiated_by_profile_id?: string | null
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by_name?: string | null
          started_at?: string | null
          status?: string
          sub_container_id?: string | null
          updated_at?: string
          warehouse_id?: string
          warehouse_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_checks_initiated_by_profile_id_fkey"
            columns: ["initiated_by_profile_id"]
            isOneToOne: false
            referencedRelation: "user_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_checks_sub_container_id_fkey"
            columns: ["sub_container_id"]
            isOneToOne: false
            referencedRelation: "warehouse_sub_container_totals"
            referencedColumns: ["sub_container_id"]
          },
          {
            foreignKeyName: "inventory_checks_sub_container_id_fkey"
            columns: ["sub_container_id"]
            isOneToOne: false
            referencedRelation: "warehouse_sub_containers"
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
      inventory_damaged_movements: {
        Row: {
          brand_variant_id: string
          created_at: string
          created_by: string | null
          division_id: string | null
          id: string
          movement_type: string
          notes: string | null
          qty: number
          source_return_line_disposition_id: string | null
          source_transfer_id: string | null
          unit_cost: number
          warehouse_id: string
        }
        Insert: {
          brand_variant_id: string
          created_at?: string
          created_by?: string | null
          division_id?: string | null
          id?: string
          movement_type: string
          notes?: string | null
          qty: number
          source_return_line_disposition_id?: string | null
          source_transfer_id?: string | null
          unit_cost?: number
          warehouse_id: string
        }
        Update: {
          brand_variant_id?: string
          created_at?: string
          created_by?: string | null
          division_id?: string | null
          id?: string
          movement_type?: string
          notes?: string | null
          qty?: number
          source_return_line_disposition_id?: string | null
          source_transfer_id?: string | null
          unit_cost?: number
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_damaged_movements_brand_variant_id_fkey"
            columns: ["brand_variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_brand_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_damaged_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_damaged_movements_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "company_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_damaged_movements_source_return_line_disposition_fkey"
            columns: ["source_return_line_disposition_id"]
            isOneToOne: false
            referencedRelation: "return_line_inventory_dispositions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_damaged_movements_source_transfer_id_fkey"
            columns: ["source_transfer_id"]
            isOneToOne: false
            referencedRelation: "warehouse_transfers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_damaged_movements_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_damaged_stock: {
        Row: {
          brand_variant_id: string
          qty: number
          updated_at: string
          warehouse_id: string
          weighted_unit_cost: number
        }
        Insert: {
          brand_variant_id: string
          qty?: number
          updated_at?: string
          warehouse_id: string
          weighted_unit_cost?: number
        }
        Update: {
          brand_variant_id?: string
          qty?: number
          updated_at?: string
          warehouse_id?: string
          weighted_unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_damaged_stock_brand_variant_id_fkey"
            columns: ["brand_variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_brand_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_damaged_stock_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_damaged_stock_layers: {
        Row: {
          brand_variant_id: string
          created_by: string | null
          division_id: string | null
          id: string
          layered_at: string
          qty_received: number
          qty_remaining: number
          source_return_line_id: string | null
          unit_cost: number
          warehouse_id: string
        }
        Insert: {
          brand_variant_id: string
          created_by?: string | null
          division_id?: string | null
          id?: string
          layered_at?: string
          qty_received: number
          qty_remaining: number
          source_return_line_id?: string | null
          unit_cost: number
          warehouse_id: string
        }
        Update: {
          brand_variant_id?: string
          created_by?: string | null
          division_id?: string | null
          id?: string
          layered_at?: string
          qty_received?: number
          qty_remaining?: number
          source_return_line_id?: string | null
          unit_cost?: number
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_damaged_stock_layers_brand_variant_id_fkey"
            columns: ["brand_variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_brand_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_damaged_stock_layers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_damaged_stock_layers_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "company_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_damaged_stock_layers_source_return_line_id_fkey"
            columns: ["source_return_line_id"]
            isOneToOne: false
            referencedRelation: "return_line_progress"
            referencedColumns: ["return_line_id"]
          },
          {
            foreignKeyName: "inventory_damaged_stock_layers_source_return_line_id_fkey"
            columns: ["source_return_line_id"]
            isOneToOne: false
            referencedRelation: "return_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_damaged_stock_layers_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_item_attributes: {
        Row: {
          definition_id: string
          id: string
          item_id: string
          option_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          definition_id: string
          id?: string
          item_id: string
          option_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          definition_id?: string
          id?: string
          item_id?: string
          option_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_item_attributes_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "inventory_attribute_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_item_attributes_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_item_attributes_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "inventory_attribute_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_item_attributes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_data"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_item_brand_variants: {
        Row: {
          average_cost: number | null
          brand: string
          brand_id: string | null
          code: string | null
          cost_price: number | null
          country_id: number | null
          created_at: string | null
          damaged_qty: number
          id: string
          incoming: number | null
          item_id: string
          linked_services_count: number
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
          brand_id?: string | null
          code?: string | null
          cost_price?: number | null
          country_id?: number | null
          created_at?: string | null
          damaged_qty?: number
          id?: string
          incoming?: number | null
          item_id: string
          linked_services_count?: number
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
          brand_id?: string | null
          code?: string | null
          cost_price?: number | null
          country_id?: number | null
          created_at?: string | null
          damaged_qty?: number
          id?: string
          incoming?: number | null
          item_id?: string
          linked_services_count?: number
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
            foreignKeyName: "inventory_brand_variants_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_brand_variants_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_item_brand_variants_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "country_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          category_id: string
          cost_price: number | null
          created_at: string | null
          default_sub_container_id: string | null
          default_warehouse_id: string | null
          id: string
          image_url: string | null
          linked_services_count: number | null
          name_ar: string | null
          name_en: string
          shared_with_division_ids: string[]
          sku: string
          sort_order: number
          status: string
          total_stock: number | null
          unit: string
          updated_at: string | null
          warranty_policy_id: string | null
        }
        Insert: {
          category_id: string
          cost_price?: number | null
          created_at?: string | null
          default_sub_container_id?: string | null
          default_warehouse_id?: string | null
          id?: string
          image_url?: string | null
          linked_services_count?: number | null
          name_ar?: string | null
          name_en: string
          shared_with_division_ids?: string[]
          sku: string
          sort_order?: number
          status?: string
          total_stock?: number | null
          unit: string
          updated_at?: string | null
          warranty_policy_id?: string | null
        }
        Update: {
          category_id?: string
          cost_price?: number | null
          created_at?: string | null
          default_sub_container_id?: string | null
          default_warehouse_id?: string | null
          id?: string
          image_url?: string | null
          linked_services_count?: number | null
          name_ar?: string | null
          name_en?: string
          shared_with_division_ids?: string[]
          sku?: string
          sort_order?: number
          status?: string
          total_stock?: number | null
          unit?: string
          updated_at?: string | null
          warranty_policy_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "inventory_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_default_sub_container_id_fkey"
            columns: ["default_sub_container_id"]
            isOneToOne: false
            referencedRelation: "warehouse_sub_container_totals"
            referencedColumns: ["sub_container_id"]
          },
          {
            foreignKeyName: "inventory_items_default_sub_container_id_fkey"
            columns: ["default_sub_container_id"]
            isOneToOne: false
            referencedRelation: "warehouse_sub_containers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_default_warehouse_id_fkey"
            columns: ["default_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_warranty_policy_id_fkey"
            columns: ["warranty_policy_id"]
            isOneToOne: false
            referencedRelation: "warranty_policies"
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
          movement_type: Database["public"]["Enums"]["stock_movement_type"]
          notes: string | null
          qty: number
          reference_id: string | null
          reference_type: string | null
          sku: string | null
          source_id: string | null
          sub_container_id: string
          unit_cost: number
          warehouse_id: string | null
        }
        Insert: {
          brand_variant_id: string
          created_at?: string
          id?: string
          item_name: string
          movement_type: Database["public"]["Enums"]["stock_movement_type"]
          notes?: string | null
          qty: number
          reference_id?: string | null
          reference_type?: string | null
          sku?: string | null
          source_id?: string | null
          sub_container_id: string
          unit_cost?: number
          warehouse_id?: string | null
        }
        Update: {
          brand_variant_id?: string
          created_at?: string
          id?: string
          item_name?: string
          movement_type?: Database["public"]["Enums"]["stock_movement_type"]
          notes?: string | null
          qty?: number
          reference_id?: string | null
          reference_type?: string | null
          sku?: string | null
          source_id?: string | null
          sub_container_id?: string
          unit_cost?: number
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_stock_movements_brand_variant_id_fkey"
            columns: ["brand_variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_brand_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_stock_movements_sub_container_id_fkey"
            columns: ["sub_container_id"]
            isOneToOne: false
            referencedRelation: "warehouse_sub_container_totals"
            referencedColumns: ["sub_container_id"]
          },
          {
            foreignKeyName: "inventory_stock_movements_sub_container_id_fkey"
            columns: ["sub_container_id"]
            isOneToOne: false
            referencedRelation: "warehouse_sub_containers"
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
          brand_variant_id: string | null
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
          brand_variant_id?: string | null
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
          brand_variant_id?: string | null
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
            foreignKeyName: "invoice_line_items_brand_variant_id_fkey"
            columns: ["brand_variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_brand_variants"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "so_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      landed_cost_item_allocations: {
        Row: {
          allocated_lc_total: number
          brand_variant_id: string | null
          cogs_portion: number
          created_at: string | null
          id: string
          inventory_portion: number
          item_name: string
          landed_cost_id: string
          lc_per_unit: number
          original_unit_cost: number
          qty_received: number
          qty_remaining_at_lc: number
          sku: string | null
          sold_qty: number
          updated_unit_cost: number
        }
        Insert: {
          allocated_lc_total?: number
          brand_variant_id?: string | null
          cogs_portion?: number
          created_at?: string | null
          id?: string
          inventory_portion?: number
          item_name?: string
          landed_cost_id: string
          lc_per_unit?: number
          original_unit_cost?: number
          qty_received?: number
          qty_remaining_at_lc?: number
          sku?: string | null
          sold_qty?: number
          updated_unit_cost?: number
        }
        Update: {
          allocated_lc_total?: number
          brand_variant_id?: string | null
          cogs_portion?: number
          created_at?: string | null
          id?: string
          inventory_portion?: number
          item_name?: string
          landed_cost_id?: string
          lc_per_unit?: number
          original_unit_cost?: number
          qty_received?: number
          qty_remaining_at_lc?: number
          sku?: string | null
          sold_qty?: number
          updated_unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "landed_cost_item_alloc_brand_variant_id_fkey"
            columns: ["brand_variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_brand_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landed_cost_item_allocations_landed_cost_id_fkey"
            columns: ["landed_cost_id"]
            isOneToOne: false
            referencedRelation: "landed_costs"
            referencedColumns: ["id"]
          },
        ]
      }
      landed_cost_lines: {
        Row: {
          amount: number
          bill_path: string | null
          created_at: string | null
          currency: string
          currency_id: string | null
          description: string
          exchange_rate: number
          id: string
          landed_cost_id: string
        }
        Insert: {
          amount?: number
          bill_path?: string | null
          created_at?: string | null
          currency?: string
          currency_id?: string | null
          description?: string
          exchange_rate?: number
          id?: string
          landed_cost_id: string
        }
        Update: {
          amount?: number
          bill_path?: string | null
          created_at?: string | null
          currency?: string
          currency_id?: string | null
          description?: string
          exchange_rate?: number
          id?: string
          landed_cost_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "landed_cost_lines_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landed_cost_lines_landed_cost_id_fkey"
            columns: ["landed_cost_id"]
            isOneToOne: false
            referencedRelation: "landed_costs"
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
          currency_id: string | null
          date: string
          description: string | null
          id: string
          lc_number: string
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
          currency_id?: string | null
          date: string
          description?: string | null
          id?: string
          lc_number: string
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
          currency_id?: string | null
          date?: string
          description?: string | null
          id?: string
          lc_number?: string
          revert_snapshot?: Json | null
          total_amount?: number | null
          updated_at?: string | null
          voided_at?: string | null
          voided_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "landed_costs_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actioned_at: string | null
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
          actioned_at?: string | null
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
          actioned_at?: string | null
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
            referencedRelation: "user_data"
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
            referencedRelation: "bills"
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
          is_cash_equivalent: boolean
          name: string
          requires_payment_link: boolean
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean
          is_cash_equivalent?: boolean
          name: string
          requires_payment_link?: boolean
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean
          is_cash_equivalent?: boolean
          name?: string
          requires_payment_link?: boolean
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      payment_plans: {
        Row: {
          bill_id: string | null
          created_at: string | null
          id: string
          invoice_id: string | null
          plan_type: string
          status: string
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          bill_id?: string | null
          created_at?: string | null
          id?: string
          invoice_id?: string | null
          plan_type: string
          status?: string
          total_amount: number
          updated_at?: string | null
        }
        Update: {
          bill_id?: string | null
          created_at?: string | null
          id?: string
          invoice_id?: string | null
          plan_type?: string
          status?: string
          total_amount?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_plans_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "so_invoices"
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
          bill_id: string | null
          cheque_date: string | null
          cheque_number: string | null
          created_at: string | null
          credit_note_id: string | null
          currency: string
          currency_id: string | null
          customer_id: string | null
          date: string
          debit_note_id: string | null
          deleted_at: string | null
          direction: Database["public"]["Enums"]["payment_direction"]
          exchange_gain: number
          exchange_loss: number
          exchange_rate: number
          id: string
          invoice_id: string | null
          method: string
          method_id: string | null
          notes: string | null
          payment_id: string | null
          qb_synced: boolean | null
          reference: string | null
          source_id: string | null
          source_type: Database["public"]["Enums"]["payment_source_type"] | null
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
          bill_id?: string | null
          cheque_date?: string | null
          cheque_number?: string | null
          created_at?: string | null
          credit_note_id?: string | null
          currency?: string
          currency_id?: string | null
          customer_id?: string | null
          date: string
          debit_note_id?: string | null
          deleted_at?: string | null
          direction?: Database["public"]["Enums"]["payment_direction"]
          exchange_gain?: number
          exchange_loss?: number
          exchange_rate?: number
          id?: string
          invoice_id?: string | null
          method: string
          method_id?: string | null
          notes?: string | null
          payment_id?: string | null
          qb_synced?: boolean | null
          reference?: string | null
          source_id?: string | null
          source_type?:
            | Database["public"]["Enums"]["payment_source_type"]
            | null
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
          bill_id?: string | null
          cheque_date?: string | null
          cheque_number?: string | null
          created_at?: string | null
          credit_note_id?: string | null
          currency?: string
          currency_id?: string | null
          customer_id?: string | null
          date?: string
          debit_note_id?: string | null
          deleted_at?: string | null
          direction?: Database["public"]["Enums"]["payment_direction"]
          exchange_gain?: number
          exchange_loss?: number
          exchange_rate?: number
          id?: string
          invoice_id?: string | null
          method?: string
          method_id?: string | null
          notes?: string | null
          payment_id?: string | null
          qb_synced?: boolean | null
          reference?: string | null
          source_id?: string | null
          source_type?:
            | Database["public"]["Enums"]["payment_source_type"]
            | null
          status?: Database["public"]["Enums"]["payment_status"] | null
          supplier_id?: string | null
          transaction_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_credit_note_id_fkey"
            columns: ["credit_note_id"]
            isOneToOne: false
            referencedRelation: "credit_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_credit_note_id_fkey"
            columns: ["credit_note_id"]
            isOneToOne: false
            referencedRelation: "customer_open_credit_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "payments_debit_note_id_fkey"
            columns: ["debit_note_id"]
            isOneToOne: false
            referencedRelation: "debit_notes"
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
            referencedRelation: "so_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_method_id_fkey"
            columns: ["method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
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
          status: Database["public"]["Enums"]["po_edit_request_status"]
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
          status?: Database["public"]["Enums"]["po_edit_request_status"]
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
          status?: Database["public"]["Enums"]["po_edit_request_status"]
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
            referencedRelation: "user_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_edit_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "user_data"
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
          total_price?: number
          unit?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "po_line_items_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_line_items_brand_variant_id_fkey"
            columns: ["brand_variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_brand_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_line_items_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
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
          currency_id: string | null
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
          currency_id?: string | null
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
          currency_id?: string | null
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
            foreignKeyName: "po_rfq_quotes_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
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
      po_version_lines: {
        Row: {
          brand_id: string | null
          brand_variant_id: string | null
          created_at: string | null
          free_qty: number
          id: string
          item_name: string
          po_version_id: string
          qty: number
          received_qty: number | null
          sku: string | null
          total_price: number
          unit: string
          unit_price: number
        }
        Insert: {
          brand_id?: string | null
          brand_variant_id?: string | null
          created_at?: string | null
          free_qty?: number
          id?: string
          item_name: string
          po_version_id: string
          qty?: number
          received_qty?: number | null
          sku?: string | null
          total_price?: number
          unit?: string
          unit_price?: number
        }
        Update: {
          brand_id?: string | null
          brand_variant_id?: string | null
          created_at?: string | null
          free_qty?: number
          id?: string
          item_name?: string
          po_version_id?: string
          qty?: number
          received_qty?: number | null
          sku?: string | null
          total_price?: number
          unit?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "po_version_lines_po_version_id_fkey"
            columns: ["po_version_id"]
            isOneToOne: false
            referencedRelation: "po_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      po_versions: {
        Row: {
          currency: string
          currency_id: string | null
          delivery_terms: string | null
          delivery_terms_notes: string | null
          discount_amount: number
          discount_label: string | null
          exchange_rate: number
          expected_delivery: string | null
          id: string
          payment_milestones: Json | null
          payment_terms: string | null
          payment_terms_notes: string | null
          po_id: string
          snapshot_label: string
          stage: Database["public"]["Enums"]["po_stage"]
          submitted_at: string
          submitted_by: string | null
          subtotal: number
          supplier_id: string | null
          supplier_name: string
          vendor_notes: string | null
          version_number: number
        }
        Insert: {
          currency: string
          currency_id?: string | null
          delivery_terms?: string | null
          delivery_terms_notes?: string | null
          discount_amount?: number
          discount_label?: string | null
          exchange_rate: number
          expected_delivery?: string | null
          id?: string
          payment_milestones?: Json | null
          payment_terms?: string | null
          payment_terms_notes?: string | null
          po_id: string
          snapshot_label?: string
          stage: Database["public"]["Enums"]["po_stage"]
          submitted_at?: string
          submitted_by?: string | null
          subtotal: number
          supplier_id?: string | null
          supplier_name: string
          vendor_notes?: string | null
          version_number: number
        }
        Update: {
          currency?: string
          currency_id?: string | null
          delivery_terms?: string | null
          delivery_terms_notes?: string | null
          discount_amount?: number
          discount_label?: string | null
          exchange_rate?: number
          expected_delivery?: string | null
          id?: string
          payment_milestones?: Json | null
          payment_terms?: string | null
          payment_terms_notes?: string | null
          po_id?: string
          snapshot_label?: string
          stage?: Database["public"]["Enums"]["po_stage"]
          submitted_at?: string
          submitted_by?: string | null
          subtotal?: number
          supplier_id?: string | null
          supplier_name?: string
          vendor_notes?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "po_versions_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_versions_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_versions_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
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
          currency_id: string | null
          deleted_at: string | null
          delivery_terms: string | null
          delivery_terms_notes: string | null
          discount_amount: number
          discount_label: string | null
          division_id: string | null
          exchange_gain: number
          exchange_loss: number
          exchange_net: number | null
          exchange_rate: number | null
          expected_delivery: string | null
          id: string
          initial_exchange_rate: number
          initial_rate_captured_at: string | null
          initial_rate_captured_by: string | null
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
          quote_deadline: string | null
          rfq_supplier_ids: string[] | null
          status: Database["public"]["Enums"]["po_status"] | null
          subtotal: number | null
          supplier_id: string | null
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
          currency_id?: string | null
          deleted_at?: string | null
          delivery_terms?: string | null
          delivery_terms_notes?: string | null
          discount_amount?: number
          discount_label?: string | null
          division_id?: string | null
          exchange_gain?: number
          exchange_loss?: number
          exchange_net?: number | null
          exchange_rate?: number | null
          expected_delivery?: string | null
          id?: string
          initial_exchange_rate?: number
          initial_rate_captured_at?: string | null
          initial_rate_captured_by?: string | null
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
          quote_deadline?: string | null
          rfq_supplier_ids?: string[] | null
          status?: Database["public"]["Enums"]["po_status"] | null
          subtotal?: number | null
          supplier_id?: string | null
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
          currency_id?: string | null
          deleted_at?: string | null
          delivery_terms?: string | null
          delivery_terms_notes?: string | null
          discount_amount?: number
          discount_label?: string | null
          division_id?: string | null
          exchange_gain?: number
          exchange_loss?: number
          exchange_net?: number | null
          exchange_rate?: number | null
          expected_delivery?: string | null
          id?: string
          initial_exchange_rate?: number
          initial_rate_captured_at?: string | null
          initial_rate_captured_by?: string | null
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
          quote_deadline?: string | null
          rfq_supplier_ids?: string[] | null
          status?: Database["public"]["Enums"]["po_status"] | null
          subtotal?: number | null
          supplier_id?: string | null
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
            referencedRelation: "user_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
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
            foreignKeyName: "purchase_orders_initial_rate_captured_by_fkey"
            columns: ["initial_rate_captured_by"]
            isOneToOne: false
            referencedRelation: "user_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
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
            referencedRelation: "user_data"
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
            referencedRelation: "user_data"
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
            referencedRelation: "user_data"
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
          sub_container_id: string
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
          sub_container_id: string
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
          sub_container_id?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "receival_items_brand_variant_id_fkey"
            columns: ["brand_variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_brand_variants"
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
          {
            foreignKeyName: "receival_items_sub_container_id_fkey"
            columns: ["sub_container_id"]
            isOneToOne: false
            referencedRelation: "warehouse_sub_container_totals"
            referencedColumns: ["sub_container_id"]
          },
          {
            foreignKeyName: "receival_items_sub_container_id_fkey"
            columns: ["sub_container_id"]
            isOneToOne: false
            referencedRelation: "warehouse_sub_containers"
            referencedColumns: ["id"]
          },
        ]
      }
      receivals: {
        Row: {
          carved_from_layer_id: string | null
          check_sheet_pdf_url: string | null
          created_at: string | null
          date: string
          division_id: string | null
          id: string
          is_replacement: boolean
          notes: string | null
          po_id: string | null
          receipt_pdf_url: string | null
          receival_number: string
          received_by: string | null
          received_by_name: string | null
          source_debit_note_id: string | null
          source_type: Database["public"]["Enums"]["receival_source_type"]
          status: Database["public"]["Enums"]["receival_status"] | null
          updated_at: string | null
          warehouse_id: string
        }
        Insert: {
          carved_from_layer_id?: string | null
          check_sheet_pdf_url?: string | null
          created_at?: string | null
          date: string
          division_id?: string | null
          id?: string
          is_replacement?: boolean
          notes?: string | null
          po_id?: string | null
          receipt_pdf_url?: string | null
          receival_number: string
          received_by?: string | null
          received_by_name?: string | null
          source_debit_note_id?: string | null
          source_type?: Database["public"]["Enums"]["receival_source_type"]
          status?: Database["public"]["Enums"]["receival_status"] | null
          updated_at?: string | null
          warehouse_id: string
        }
        Update: {
          carved_from_layer_id?: string | null
          check_sheet_pdf_url?: string | null
          created_at?: string | null
          date?: string
          division_id?: string | null
          id?: string
          is_replacement?: boolean
          notes?: string | null
          po_id?: string | null
          receipt_pdf_url?: string | null
          receival_number?: string
          received_by?: string | null
          received_by_name?: string | null
          source_debit_note_id?: string | null
          source_type?: Database["public"]["Enums"]["receival_source_type"]
          status?: Database["public"]["Enums"]["receival_status"] | null
          updated_at?: string | null
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receivals_carved_from_layer_id_fkey"
            columns: ["carved_from_layer_id"]
            isOneToOne: false
            referencedRelation: "fifo_cost_layers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivals_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "company_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivals_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
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
            foreignKeyName: "receivals_source_debit_note_id_fkey"
            columns: ["source_debit_note_id"]
            isOneToOne: false
            referencedRelation: "customer_open_credit_notes"
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
      repair_vendors: {
        Row: {
          address: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          sub_container_id: string
          updated_at: string
          virtual_warehouse_id: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          sub_container_id: string
          updated_at?: string
          virtual_warehouse_id?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          sub_container_id?: string
          updated_at?: string
          virtual_warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "repair_vendors_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_vendors_sub_container_id_fkey"
            columns: ["sub_container_id"]
            isOneToOne: false
            referencedRelation: "warehouse_sub_container_totals"
            referencedColumns: ["sub_container_id"]
          },
          {
            foreignKeyName: "repair_vendors_sub_container_id_fkey"
            columns: ["sub_container_id"]
            isOneToOne: false
            referencedRelation: "warehouse_sub_containers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repair_vendors_virtual_warehouse_id_fkey"
            columns: ["virtual_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      return_line_customer_resolutions: {
        Row: {
          created_at: string
          created_by: string | null
          credit_note_id: string | null
          id: string
          notes: string | null
          qty: number
          resolution_type: string
          return_line_id: string
          sale_delivery_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          credit_note_id?: string | null
          id?: string
          notes?: string | null
          qty: number
          resolution_type: string
          return_line_id: string
          sale_delivery_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          credit_note_id?: string | null
          id?: string
          notes?: string | null
          qty?: number
          resolution_type?: string
          return_line_id?: string
          sale_delivery_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "return_line_customer_resolutions_credit_note_id_fkey"
            columns: ["credit_note_id"]
            isOneToOne: false
            referencedRelation: "credit_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_line_customer_resolutions_credit_note_id_fkey"
            columns: ["credit_note_id"]
            isOneToOne: false
            referencedRelation: "customer_open_credit_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_line_customer_resolutions_return_line_id_fkey"
            columns: ["return_line_id"]
            isOneToOne: false
            referencedRelation: "return_line_progress"
            referencedColumns: ["return_line_id"]
          },
          {
            foreignKeyName: "return_line_customer_resolutions_return_line_id_fkey"
            columns: ["return_line_id"]
            isOneToOne: false
            referencedRelation: "return_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_line_customer_resolutions_sale_delivery_id_fkey"
            columns: ["sale_delivery_id"]
            isOneToOne: false
            referencedRelation: "sale_deliveries"
            referencedColumns: ["id"]
          },
        ]
      }
      return_line_inventory_dispositions: {
        Row: {
          created_at: string
          created_by: string | null
          disposition_type: string
          id: string
          inventory_stock_movement_id: string | null
          notes: string | null
          qty: number
          return_line_id: string
          warehouse_transfer_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          disposition_type: string
          id?: string
          inventory_stock_movement_id?: string | null
          notes?: string | null
          qty: number
          return_line_id: string
          warehouse_transfer_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          disposition_type?: string
          id?: string
          inventory_stock_movement_id?: string | null
          notes?: string | null
          qty?: number
          return_line_id?: string
          warehouse_transfer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "return_line_inventory_disposit_inventory_stock_movement_id_fkey"
            columns: ["inventory_stock_movement_id"]
            isOneToOne: false
            referencedRelation: "inventory_stock_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_line_inventory_dispositions_return_line_id_fkey"
            columns: ["return_line_id"]
            isOneToOne: false
            referencedRelation: "return_line_progress"
            referencedColumns: ["return_line_id"]
          },
          {
            foreignKeyName: "return_line_inventory_dispositions_return_line_id_fkey"
            columns: ["return_line_id"]
            isOneToOne: false
            referencedRelation: "return_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_line_inventory_dispositions_warehouse_transfer_id_fkey"
            columns: ["warehouse_transfer_id"]
            isOneToOne: false
            referencedRelation: "warehouse_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      return_lines: {
        Row: {
          brand_variant_id: string | null
          condition: string | null
          condition_notes: string | null
          created_at: string | null
          id: string
          item_name: string
          qty: number
          receival_item_id: string | null
          return_id: string
          sale_delivery_line_id: string | null
          sku: string | null
        }
        Insert: {
          brand_variant_id?: string | null
          condition?: string | null
          condition_notes?: string | null
          created_at?: string | null
          id?: string
          item_name?: string
          qty?: number
          receival_item_id?: string | null
          return_id: string
          sale_delivery_line_id?: string | null
          sku?: string | null
        }
        Update: {
          brand_variant_id?: string | null
          condition?: string | null
          condition_notes?: string | null
          created_at?: string | null
          id?: string
          item_name?: string
          qty?: number
          receival_item_id?: string | null
          return_id?: string
          sale_delivery_line_id?: string | null
          sku?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "return_lines_brand_variant_id_fkey"
            columns: ["brand_variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_brand_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_lines_receival_item_id_fkey"
            columns: ["receival_item_id"]
            isOneToOne: false
            referencedRelation: "receival_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_lines_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "return_progress"
            referencedColumns: ["return_id"]
          },
          {
            foreignKeyName: "return_lines_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "so_po_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_lines_sale_delivery_line_id_fkey"
            columns: ["sale_delivery_line_id"]
            isOneToOne: false
            referencedRelation: "sale_delivery_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_deliveries: {
        Row: {
          created_at: string
          created_by: string | null
          created_by_name: string | null
          date: string
          delivery_number: string
          id: string
          pdf_url: string | null
          return_id: string | null
          sale_order_id: string
          source_credit_note_id: string | null
          status: Database["public"]["Enums"]["sale_delivery_status"] | null
          type: Database["public"]["Enums"]["sale_delivery_type"]
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
          pdf_url?: string | null
          return_id?: string | null
          sale_order_id: string
          source_credit_note_id?: string | null
          status?: Database["public"]["Enums"]["sale_delivery_status"] | null
          type?: Database["public"]["Enums"]["sale_delivery_type"]
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
          pdf_url?: string | null
          return_id?: string | null
          sale_order_id?: string
          source_credit_note_id?: string | null
          status?: Database["public"]["Enums"]["sale_delivery_status"] | null
          type?: Database["public"]["Enums"]["sale_delivery_type"]
          updated_at?: string
          warehouse_id?: string | null
          warehouse_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_deliveries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_deliveries_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "return_progress"
            referencedColumns: ["return_id"]
          },
          {
            foreignKeyName: "sale_deliveries_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "so_po_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_deliveries_sale_order_id_fkey"
            columns: ["sale_order_id"]
            isOneToOne: false
            referencedRelation: "sale_order_paid_summary"
            referencedColumns: ["sale_order_id"]
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
            foreignKeyName: "sale_deliveries_source_credit_note_id_fkey"
            columns: ["source_credit_note_id"]
            isOneToOne: false
            referencedRelation: "customer_open_credit_notes"
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
      sale_delivery_lines: {
        Row: {
          brand_variant_id: string | null
          created_at: string | null
          id: string
          item_name: string
          qty_delivered: number
          sale_delivery_id: string
          sku: string | null
        }
        Insert: {
          brand_variant_id?: string | null
          created_at?: string | null
          id?: string
          item_name?: string
          qty_delivered?: number
          sale_delivery_id: string
          sku?: string | null
        }
        Update: {
          brand_variant_id?: string | null
          created_at?: string | null
          id?: string
          item_name?: string
          qty_delivered?: number
          sale_delivery_id?: string
          sku?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_delivery_lines_brand_variant_id_fkey"
            columns: ["brand_variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_brand_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_delivery_lines_sale_delivery_id_fkey"
            columns: ["sale_delivery_id"]
            isOneToOne: false
            referencedRelation: "sale_deliveries"
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
            referencedRelation: "user_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "user_data"
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
          item_name: string
          line_type: string
          qty: number
          sale_order_id: string
          sku: string | null
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
          item_name: string
          line_type?: string
          qty?: number
          sale_order_id: string
          sku?: string | null
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
          item_name?: string
          line_type?: string
          qty?: number
          sale_order_id?: string
          sku?: string | null
          total?: number
          unit?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_order_lines_brand_variant_id_fkey"
            columns: ["brand_variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_brand_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_order_lines_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_order_lines_sale_order_id_fkey"
            columns: ["sale_order_id"]
            isOneToOne: false
            referencedRelation: "sale_order_paid_summary"
            referencedColumns: ["sale_order_id"]
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
          currency: string
          currency_id: string | null
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
          exchange_gain: number
          exchange_loss: number
          exchange_net: number | null
          exchange_rate: number
          expected_delivery: string | null
          id: string
          initial_exchange_rate: number
          initial_rate_captured_at: string | null
          initial_rate_captured_by: string | null
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
          total_qar: number | null
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
          currency_id?: string | null
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
          exchange_gain?: number
          exchange_loss?: number
          exchange_net?: number | null
          exchange_rate?: number
          expected_delivery?: string | null
          id?: string
          initial_exchange_rate?: number
          initial_rate_captured_at?: string | null
          initial_rate_captured_by?: string | null
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
          total_qar?: number | null
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
          currency_id?: string | null
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
          exchange_gain?: number
          exchange_loss?: number
          exchange_net?: number | null
          exchange_rate?: number
          expected_delivery?: string | null
          id?: string
          initial_exchange_rate?: number
          initial_rate_captured_at?: string | null
          initial_rate_captured_by?: string | null
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
          total_qar?: number | null
          updated_at?: string
          validity_days?: number
          voucher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_orders_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
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
            foreignKeyName: "sale_orders_initial_rate_captured_by_fkey"
            columns: ["initial_rate_captured_by"]
            isOneToOne: false
            referencedRelation: "user_data"
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
      so_invoices: {
        Row: {
          agent_name: string | null
          created_at: string | null
          customer_id: string | null
          discount_amount: number
          discount_label: string | null
          division_id: string | null
          due_date: string
          id: string
          invoice_id: string
          invoice_type: Database["public"]["Enums"]["invoice_type"]
          issued_date: string
          needs_refresh: boolean
          notes: string | null
          paid_amount: number | null
          payment_status: Database["public"]["Enums"]["invoice_payment_status"]
          pdf_url: string | null
          qb_synced: boolean | null
          sale_order_id: string | null
          source: Database["public"]["Enums"]["invoice_source"]
          source_id: string
          source_label: string | null
          status: Database["public"]["Enums"]["invoice_status"] | null
          subtotal: number | null
          total_amount: number | null
        }
        Insert: {
          agent_name?: string | null
          created_at?: string | null
          customer_id?: string | null
          discount_amount?: number
          discount_label?: string | null
          division_id?: string | null
          due_date: string
          id?: string
          invoice_id: string
          invoice_type?: Database["public"]["Enums"]["invoice_type"]
          issued_date: string
          needs_refresh?: boolean
          notes?: string | null
          paid_amount?: number | null
          payment_status?: Database["public"]["Enums"]["invoice_payment_status"]
          pdf_url?: string | null
          qb_synced?: boolean | null
          sale_order_id?: string | null
          source: Database["public"]["Enums"]["invoice_source"]
          source_id: string
          source_label?: string | null
          status?: Database["public"]["Enums"]["invoice_status"] | null
          subtotal?: number | null
          total_amount?: number | null
        }
        Update: {
          agent_name?: string | null
          created_at?: string | null
          customer_id?: string | null
          discount_amount?: number
          discount_label?: string | null
          division_id?: string | null
          due_date?: string
          id?: string
          invoice_id?: string
          invoice_type?: Database["public"]["Enums"]["invoice_type"]
          issued_date?: string
          needs_refresh?: boolean
          notes?: string | null
          paid_amount?: number | null
          payment_status?: Database["public"]["Enums"]["invoice_payment_status"]
          pdf_url?: string | null
          qb_synced?: boolean | null
          sale_order_id?: string | null
          source?: Database["public"]["Enums"]["invoice_source"]
          source_id?: string
          source_label?: string | null
          status?: Database["public"]["Enums"]["invoice_status"] | null
          subtotal?: number | null
          total_amount?: number | null
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
            foreignKeyName: "invoices_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "company_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_sale_order_id_fkey"
            columns: ["sale_order_id"]
            isOneToOne: true
            referencedRelation: "sale_order_paid_summary"
            referencedColumns: ["sale_order_id"]
          },
          {
            foreignKeyName: "invoices_sale_order_id_fkey"
            columns: ["sale_order_id"]
            isOneToOne: true
            referencedRelation: "sale_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      so_po_returns: {
        Row: {
          created_at: string
          created_by: string | null
          created_by_name: string | null
          credit_note_id: string | null
          date: string
          debit_note_id: string | null
          deleted_at: string | null
          dispatched_at: string | null
          division_id: string | null
          id: string
          notes: string | null
          pdf_url: string | null
          reason: string
          restock_warehouse_id: string | null
          restocked_at: string | null
          return_number: string
          source_delivery_id: string | null
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
          debit_note_id?: string | null
          deleted_at?: string | null
          dispatched_at?: string | null
          division_id?: string | null
          id?: string
          notes?: string | null
          pdf_url?: string | null
          reason?: string
          restock_warehouse_id?: string | null
          restocked_at?: string | null
          return_number: string
          source_delivery_id?: string | null
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
          debit_note_id?: string | null
          deleted_at?: string | null
          dispatched_at?: string | null
          division_id?: string | null
          id?: string
          notes?: string | null
          pdf_url?: string | null
          reason?: string
          restock_warehouse_id?: string | null
          restocked_at?: string | null
          return_number?: string
          source_delivery_id?: string | null
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
            referencedRelation: "user_data"
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
            foreignKeyName: "returns_credit_note_id_fkey"
            columns: ["credit_note_id"]
            isOneToOne: false
            referencedRelation: "customer_open_credit_notes"
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
            foreignKeyName: "returns_restock_warehouse_id_fkey"
            columns: ["restock_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "so_po_returns_debit_note_id_fkey"
            columns: ["debit_note_id"]
            isOneToOne: false
            referencedRelation: "debit_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "so_po_returns_source_delivery_id_fkey"
            columns: ["source_delivery_id"]
            isOneToOne: false
            referencedRelation: "sale_deliveries"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_adjustment_approvals: {
        Row: {
          action_at: string | null
          adjustment_id: string
          created_at: string
          force_approved: boolean
          force_comment: string | null
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
          force_approved?: boolean
          force_comment?: string | null
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
          force_approved?: boolean
          force_comment?: string | null
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
            referencedRelation: "user_data"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_adjustments: {
        Row: {
          adjustment_type: Database["public"]["Enums"]["stock_adjustment_type"]
          approved_at: string | null
          approved_by_name: string | null
          brand_variant_id: string
          created_at: string
          id: string
          notes: string | null
          photo_urls: string[] | null
          qty: number
          reason: string
          requested_by: string | null
          requested_by_name: string | null
          source_check_id: string | null
          source_check_item_id: string | null
          source_pile: string
          status: string
          sub_container_id: string
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          adjustment_type: Database["public"]["Enums"]["stock_adjustment_type"]
          approved_at?: string | null
          approved_by_name?: string | null
          brand_variant_id: string
          created_at?: string
          id?: string
          notes?: string | null
          photo_urls?: string[] | null
          qty: number
          reason: string
          requested_by?: string | null
          requested_by_name?: string | null
          source_check_id?: string | null
          source_check_item_id?: string | null
          source_pile?: string
          status?: string
          sub_container_id: string
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          adjustment_type?: Database["public"]["Enums"]["stock_adjustment_type"]
          approved_at?: string | null
          approved_by_name?: string | null
          brand_variant_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          photo_urls?: string[] | null
          qty?: number
          reason?: string
          requested_by?: string | null
          requested_by_name?: string | null
          source_check_id?: string | null
          source_check_item_id?: string | null
          source_pile?: string
          status?: string
          sub_container_id?: string
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_adjustments_brand_variant_id_fkey"
            columns: ["brand_variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_brand_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "user_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_source_check_id_fkey"
            columns: ["source_check_id"]
            isOneToOne: false
            referencedRelation: "inventory_checks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_source_check_item_id_fkey"
            columns: ["source_check_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_check_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_sub_container_id_fkey"
            columns: ["sub_container_id"]
            isOneToOne: false
            referencedRelation: "warehouse_sub_container_totals"
            referencedColumns: ["sub_container_id"]
          },
          {
            foreignKeyName: "stock_adjustments_sub_container_id_fkey"
            columns: ["sub_container_id"]
            isOneToOne: false
            referencedRelation: "warehouse_sub_containers"
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
      storage_cleanup_failures: {
        Row: {
          bucket: string
          error_text: string | null
          id: number
          occurred_at: string
          path: string
          source_id: string | null
          source_table: string | null
        }
        Insert: {
          bucket: string
          error_text?: string | null
          id?: number
          occurred_at?: string
          path: string
          source_id?: string | null
          source_table?: string | null
        }
        Update: {
          bucket?: string
          error_text?: string | null
          id?: number
          occurred_at?: string
          path?: string
          source_id?: string | null
          source_table?: string | null
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          address: string | null
          category: string | null
          contact_name: string | null
          country: string | null
          country_id: number | null
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
          country_id?: number | null
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
          country_id?: number | null
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
            foreignKeyName: "suppliers_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "country_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_data"
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
      tool_asset_units: {
        Row: {
          assigned_to: string | null
          brand: string | null
          condition: Database["public"]["Enums"]["tool_condition"] | null
          created_at: string | null
          expiry: string | null
          id: string
          is_placeholder: boolean
          item_id: string | null
          receival_item_id: string | null
          serial_number: string | null
          status: Database["public"]["Enums"]["tool_status"] | null
        }
        Insert: {
          assigned_to?: string | null
          brand?: string | null
          condition?: Database["public"]["Enums"]["tool_condition"] | null
          created_at?: string | null
          expiry?: string | null
          id?: string
          is_placeholder?: boolean
          item_id?: string | null
          receival_item_id?: string | null
          serial_number?: string | null
          status?: Database["public"]["Enums"]["tool_status"] | null
        }
        Update: {
          assigned_to?: string | null
          brand?: string | null
          condition?: Database["public"]["Enums"]["tool_condition"] | null
          created_at?: string | null
          expiry?: string | null
          id?: string
          is_placeholder?: boolean
          item_id?: string | null
          receival_item_id?: string | null
          serial_number?: string | null
          status?: Database["public"]["Enums"]["tool_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "tool_asset_units_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_asset_units_receival_item_id_fkey"
            columns: ["receival_item_id"]
            isOneToOne: false
            referencedRelation: "receival_items"
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
            referencedRelation: "user_data"
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
            foreignKeyName: "user_divisions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "user_data"
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
            referencedRelation: "user_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_custom_roles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "user_data"
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
      user_data: {
        Row: {
          active_division_id: string | null
          auth_user_id: string
          avatar_url: string | null
          created_at: string
          created_by: string | null
          email: string | null
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
          active_division_id?: string | null
          auth_user_id: string
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
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
          active_division_id?: string | null
          auth_user_id?: string
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
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
            foreignKeyName: "user_data_active_division_id_fkey"
            columns: ["active_division_id"]
            isOneToOne: false
            referencedRelation: "company_divisions"
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
            referencedRelation: "inventory_item_brand_variants"
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
      warehouse_responsible_persons: {
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
            foreignKeyName: "warehouse_responsible_persons_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "user_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_responsible_persons_warehouse_id_fkey"
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
          sub_container_id: string
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          allocated_qty?: number
          brand_variant_id: string
          sub_container_id: string
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          allocated_qty?: number
          brand_variant_id?: string
          sub_container_id?: string
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_stock_allocations_brand_variant_id_fkey"
            columns: ["brand_variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_brand_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_stock_allocations_sub_container_id_fkey"
            columns: ["sub_container_id"]
            isOneToOne: false
            referencedRelation: "warehouse_sub_container_totals"
            referencedColumns: ["sub_container_id"]
          },
          {
            foreignKeyName: "warehouse_stock_allocations_sub_container_id_fkey"
            columns: ["sub_container_id"]
            isOneToOne: false
            referencedRelation: "warehouse_sub_containers"
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
      warehouse_stock_summary: {
        Row: {
          allocated_qty: number
          available_qty: number
          avg_cost: number
          brand: string | null
          brand_variant_id: string
          category_name: string | null
          item_name: string | null
          item_type: string | null
          qty: number
          sku: string | null
          sub_container_id: string
          subcategory_name: string | null
          total_value: number
          unit: string | null
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          allocated_qty?: number
          available_qty?: number
          avg_cost?: number
          brand?: string | null
          brand_variant_id: string
          category_name?: string | null
          item_name?: string | null
          item_type?: string | null
          qty?: number
          sku?: string | null
          sub_container_id: string
          subcategory_name?: string | null
          total_value?: number
          unit?: string | null
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          allocated_qty?: number
          available_qty?: number
          avg_cost?: number
          brand?: string | null
          brand_variant_id?: string
          category_name?: string | null
          item_name?: string | null
          item_type?: string | null
          qty?: number
          sku?: string | null
          sub_container_id?: string
          subcategory_name?: string | null
          total_value?: number
          unit?: string | null
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_stock_summary_sub_container_fk"
            columns: ["sub_container_id"]
            isOneToOne: false
            referencedRelation: "warehouse_sub_container_totals"
            referencedColumns: ["sub_container_id"]
          },
          {
            foreignKeyName: "warehouse_stock_summary_sub_container_fk"
            columns: ["sub_container_id"]
            isOneToOne: false
            referencedRelation: "warehouse_sub_containers"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_sub_containers: {
        Row: {
          created_at: string
          created_by: string | null
          division_id: string | null
          id: string
          is_active: boolean
          name: string
          responsible_person_profile_id: string | null
          team_id: string | null
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          division_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          responsible_person_profile_id?: string | null
          team_id?: string | null
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          division_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          responsible_person_profile_id?: string | null
          team_id?: string | null
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_sub_containers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_sub_containers_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "company_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_sub_containers_responsible_person_profile_id_fkey"
            columns: ["responsible_person_profile_id"]
            isOneToOne: false
            referencedRelation: "user_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_sub_containers_warehouse_id_fkey"
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
          sub_container_id: string
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
          sub_container_id: string
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
          sub_container_id?: string
          transfer_id?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_transfer_items_brand_variant_id_fkey"
            columns: ["brand_variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_brand_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_transfer_items_sub_container_id_fkey"
            columns: ["sub_container_id"]
            isOneToOne: false
            referencedRelation: "warehouse_sub_container_totals"
            referencedColumns: ["sub_container_id"]
          },
          {
            foreignKeyName: "warehouse_transfer_items_sub_container_id_fkey"
            columns: ["sub_container_id"]
            isOneToOne: false
            referencedRelation: "warehouse_sub_containers"
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
          approved_by_name: string | null
          approved_by_profile_id: string | null
          approved_date: string | null
          cancelled_at: string | null
          cancelled_by_name: string | null
          cancelled_by_profile_id: string | null
          created_at: string | null
          created_by_name: string | null
          created_by_profile_id: string | null
          date: string
          dispatched_at: string | null
          dispatched_by_name: string | null
          dispatched_by_profile_id: string | null
          expected_return_date: string | null
          from_sub_container_id: string
          from_warehouse_id: string
          id: string
          notes: string | null
          received_at: string | null
          received_by_name: string | null
          received_by_profile_id: string | null
          repair_cost: number | null
          repair_vendor_id: string | null
          source_return_line_disposition_id: string | null
          status: Database["public"]["Enums"]["transfer_status"] | null
          to_sub_container_id: string
          to_warehouse_id: string
          transfer_kind: string
          transfer_number: string
          updated_at: string | null
        }
        Insert: {
          approved_by_name?: string | null
          approved_by_profile_id?: string | null
          approved_date?: string | null
          cancelled_at?: string | null
          cancelled_by_name?: string | null
          cancelled_by_profile_id?: string | null
          created_at?: string | null
          created_by_name?: string | null
          created_by_profile_id?: string | null
          date: string
          dispatched_at?: string | null
          dispatched_by_name?: string | null
          dispatched_by_profile_id?: string | null
          expected_return_date?: string | null
          from_sub_container_id: string
          from_warehouse_id: string
          id?: string
          notes?: string | null
          received_at?: string | null
          received_by_name?: string | null
          received_by_profile_id?: string | null
          repair_cost?: number | null
          repair_vendor_id?: string | null
          source_return_line_disposition_id?: string | null
          status?: Database["public"]["Enums"]["transfer_status"] | null
          to_sub_container_id: string
          to_warehouse_id: string
          transfer_kind?: string
          transfer_number: string
          updated_at?: string | null
        }
        Update: {
          approved_by_name?: string | null
          approved_by_profile_id?: string | null
          approved_date?: string | null
          cancelled_at?: string | null
          cancelled_by_name?: string | null
          cancelled_by_profile_id?: string | null
          created_at?: string | null
          created_by_name?: string | null
          created_by_profile_id?: string | null
          date?: string
          dispatched_at?: string | null
          dispatched_by_name?: string | null
          dispatched_by_profile_id?: string | null
          expected_return_date?: string | null
          from_sub_container_id?: string
          from_warehouse_id?: string
          id?: string
          notes?: string | null
          received_at?: string | null
          received_by_name?: string | null
          received_by_profile_id?: string | null
          repair_cost?: number | null
          repair_vendor_id?: string | null
          source_return_line_disposition_id?: string | null
          status?: Database["public"]["Enums"]["transfer_status"] | null
          to_sub_container_id?: string
          to_warehouse_id?: string
          transfer_kind?: string
          transfer_number?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_transfers_approved_by_profile_id_fkey"
            columns: ["approved_by_profile_id"]
            isOneToOne: false
            referencedRelation: "user_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_transfers_cancelled_by_profile_id_fkey"
            columns: ["cancelled_by_profile_id"]
            isOneToOne: false
            referencedRelation: "user_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_transfers_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "user_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_transfers_dispatched_by_profile_id_fkey"
            columns: ["dispatched_by_profile_id"]
            isOneToOne: false
            referencedRelation: "user_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_transfers_from_sub_container_id_fkey"
            columns: ["from_sub_container_id"]
            isOneToOne: false
            referencedRelation: "warehouse_sub_container_totals"
            referencedColumns: ["sub_container_id"]
          },
          {
            foreignKeyName: "warehouse_transfers_from_sub_container_id_fkey"
            columns: ["from_sub_container_id"]
            isOneToOne: false
            referencedRelation: "warehouse_sub_containers"
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
            referencedRelation: "user_data"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_transfers_repair_vendor_id_fkey"
            columns: ["repair_vendor_id"]
            isOneToOne: false
            referencedRelation: "repair_vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_transfers_source_return_line_disposition_id_fkey"
            columns: ["source_return_line_disposition_id"]
            isOneToOne: false
            referencedRelation: "return_line_inventory_dispositions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_transfers_to_sub_container_id_fkey"
            columns: ["to_sub_container_id"]
            isOneToOne: false
            referencedRelation: "warehouse_sub_container_totals"
            referencedColumns: ["sub_container_id"]
          },
          {
            foreignKeyName: "warehouse_transfers_to_sub_container_id_fkey"
            columns: ["to_sub_container_id"]
            isOneToOne: false
            referencedRelation: "warehouse_sub_containers"
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
          company_id: string | null
          created_at: string | null
          id: string
          is_virtual: boolean
          item_count: number | null
          location: string | null
          name: string
          repair_vendor_id: string | null
          total_value: number | null
          updated_at: string | null
          warehouse_kind: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          is_virtual?: boolean
          item_count?: number | null
          location?: string | null
          name: string
          repair_vendor_id?: string | null
          total_value?: number | null
          updated_at?: string | null
          warehouse_kind?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          is_virtual?: boolean
          item_count?: number | null
          location?: string | null
          name?: string
          repair_vendor_id?: string | null
          total_value?: number | null
          updated_at?: string | null
          warehouse_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouses_repair_vendor_fk"
            columns: ["repair_vendor_id"]
            isOneToOne: false
            referencedRelation: "repair_vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      warranty_number_counters: {
        Row: {
          division_id: string
          next_value: number
          source_type: Database["public"]["Enums"]["warranty_source_type"]
        }
        Insert: {
          division_id: string
          next_value?: number
          source_type: Database["public"]["Enums"]["warranty_source_type"]
        }
        Update: {
          division_id?: string
          next_value?: number
          source_type?: Database["public"]["Enums"]["warranty_source_type"]
        }
        Relationships: [
          {
            foreignKeyName: "warranty_number_counters_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "company_divisions"
            referencedColumns: ["id"]
          },
        ]
      }
      warranty_policies: {
        Row: {
          coverage_type: string
          created_at: string
          created_by: string | null
          duration_months: number
          id: string
          is_active: boolean
          name: string
          starts_from: string
          terms_ar: string | null
          terms_en: string | null
          updated_at: string
          void_conditions: string[]
        }
        Insert: {
          coverage_type: string
          created_at?: string
          created_by?: string | null
          duration_months: number
          id?: string
          is_active?: boolean
          name: string
          starts_from?: string
          terms_ar?: string | null
          terms_en?: string | null
          updated_at?: string
          void_conditions?: string[]
        }
        Update: {
          coverage_type?: string
          created_at?: string
          created_by?: string | null
          duration_months?: number
          id?: string
          is_active?: boolean
          name?: string
          starts_from?: string
          terms_ar?: string | null
          terms_en?: string | null
          updated_at?: string
          void_conditions?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "warranty_policies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_data"
            referencedColumns: ["id"]
          },
        ]
      }
      warranty_records: {
        Row: {
          brand_variant_id: string | null
          coverage_type_snapshot: string
          created_at: string
          customer_id: string
          division_id: string
          duration_months_snapshot: number
          end_date: string
          id: string
          item_name: string
          policy_id: string
          policy_name_snapshot: string
          qty: number
          sale_delivery_line_id: string
          sale_order_id: string
          sku: string | null
          source_type: Database["public"]["Enums"]["warranty_source_type"]
          start_date: string
          starts_from_snapshot: string
          terms_ar_snapshot: string | null
          terms_en_snapshot: string | null
          void_conditions_snapshot: string[]
          warranty_number: string
        }
        Insert: {
          brand_variant_id?: string | null
          coverage_type_snapshot: string
          created_at?: string
          customer_id: string
          division_id: string
          duration_months_snapshot: number
          end_date: string
          id?: string
          item_name: string
          policy_id: string
          policy_name_snapshot: string
          qty: number
          sale_delivery_line_id: string
          sale_order_id: string
          sku?: string | null
          source_type?: Database["public"]["Enums"]["warranty_source_type"]
          start_date: string
          starts_from_snapshot?: string
          terms_ar_snapshot?: string | null
          terms_en_snapshot?: string | null
          void_conditions_snapshot?: string[]
          warranty_number: string
        }
        Update: {
          brand_variant_id?: string | null
          coverage_type_snapshot?: string
          created_at?: string
          customer_id?: string
          division_id?: string
          duration_months_snapshot?: number
          end_date?: string
          id?: string
          item_name?: string
          policy_id?: string
          policy_name_snapshot?: string
          qty?: number
          sale_delivery_line_id?: string
          sale_order_id?: string
          sku?: string | null
          source_type?: Database["public"]["Enums"]["warranty_source_type"]
          start_date?: string
          starts_from_snapshot?: string
          terms_ar_snapshot?: string | null
          terms_en_snapshot?: string | null
          void_conditions_snapshot?: string[]
          warranty_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "warranty_records_brand_variant_id_fkey"
            columns: ["brand_variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_brand_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranty_records_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_credit_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "warranty_records_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranty_records_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "company_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranty_records_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "warranty_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranty_records_sale_delivery_line_id_fkey"
            columns: ["sale_delivery_line_id"]
            isOneToOne: true
            referencedRelation: "sale_delivery_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranty_records_sale_order_id_fkey"
            columns: ["sale_order_id"]
            isOneToOne: false
            referencedRelation: "sale_order_paid_summary"
            referencedColumns: ["sale_order_id"]
          },
          {
            foreignKeyName: "warranty_records_sale_order_id_fkey"
            columns: ["sale_order_id"]
            isOneToOne: false
            referencedRelation: "sale_orders"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
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
      customer_credit_balances: {
        Row: {
          currency: string | null
          customer_id: string | null
          open_amount: number | null
          open_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_credit_summary"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "credit_notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
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
          discount_amount: number | null
          discount_label: string | null
          division_id: string | null
          due_date: string | null
          id: string | null
          invoice_id: string | null
          invoice_type: Database["public"]["Enums"]["invoice_type"] | null
          issued_date: string | null
          needs_refresh: boolean | null
          notes: string | null
          paid_amount: number | null
          payment_status:
            | Database["public"]["Enums"]["invoice_payment_status"]
            | null
          qb_synced: boolean | null
          sale_order_id: string | null
          source: Database["public"]["Enums"]["invoice_source"] | null
          source_id: string | null
          source_label: string | null
          status: Database["public"]["Enums"]["invoice_status"] | null
          subtotal: number | null
          total_amount: number | null
        }
        Insert: {
          agent_name?: string | null
          created_at?: string | null
          customer_id?: string | null
          discount_amount?: number | null
          discount_label?: string | null
          division_id?: string | null
          due_date?: string | null
          id?: string | null
          invoice_id?: string | null
          invoice_type?: Database["public"]["Enums"]["invoice_type"] | null
          issued_date?: string | null
          needs_refresh?: boolean | null
          notes?: string | null
          paid_amount?: number | null
          payment_status?:
            | Database["public"]["Enums"]["invoice_payment_status"]
            | null
          qb_synced?: boolean | null
          sale_order_id?: string | null
          source?: Database["public"]["Enums"]["invoice_source"] | null
          source_id?: string | null
          source_label?: string | null
          status?: Database["public"]["Enums"]["invoice_status"] | null
          subtotal?: number | null
          total_amount?: number | null
        }
        Update: {
          agent_name?: string | null
          created_at?: string | null
          customer_id?: string | null
          discount_amount?: number | null
          discount_label?: string | null
          division_id?: string | null
          due_date?: string | null
          id?: string | null
          invoice_id?: string | null
          invoice_type?: Database["public"]["Enums"]["invoice_type"] | null
          issued_date?: string | null
          needs_refresh?: boolean | null
          notes?: string | null
          paid_amount?: number | null
          payment_status?:
            | Database["public"]["Enums"]["invoice_payment_status"]
            | null
          qb_synced?: boolean | null
          sale_order_id?: string | null
          source?: Database["public"]["Enums"]["invoice_source"] | null
          source_id?: string | null
          source_label?: string | null
          status?: Database["public"]["Enums"]["invoice_status"] | null
          subtotal?: number | null
          total_amount?: number | null
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
            foreignKeyName: "invoices_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "company_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_sale_order_id_fkey"
            columns: ["sale_order_id"]
            isOneToOne: true
            referencedRelation: "sale_order_paid_summary"
            referencedColumns: ["sale_order_id"]
          },
          {
            foreignKeyName: "invoices_sale_order_id_fkey"
            columns: ["sale_order_id"]
            isOneToOne: true
            referencedRelation: "sale_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_open_credit_notes: {
        Row: {
          amount_remaining: number | null
          created_at: string | null
          currency: string | null
          customer_id: string | null
          id: string | null
          invoice_number: string | null
          note_number: string | null
          return_number: string | null
          so_number: string | null
          status: Database["public"]["Enums"]["credit_note_status"] | null
        }
        Relationships: []
      }
      return_line_progress: {
        Row: {
          brand_variant_id: string | null
          condition: string | null
          customer_remaining_qty: number | null
          customer_resolutions_by_type: Json | null
          customer_resolved_qty: number | null
          inventory_dispositions_by_type: Json | null
          inventory_remaining_qty: number | null
          inventory_resolved_qty: number | null
          item_name: string | null
          return_id: string | null
          return_line_id: string | null
          returned_qty: number | null
          sku: string | null
        }
        Relationships: [
          {
            foreignKeyName: "return_lines_brand_variant_id_fkey"
            columns: ["brand_variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_brand_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "return_lines_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "return_progress"
            referencedColumns: ["return_id"]
          },
          {
            foreignKeyName: "return_lines_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "so_po_returns"
            referencedColumns: ["id"]
          },
        ]
      }
      return_progress: {
        Row: {
          compensation_missing: boolean | null
          customer_remaining: number | null
          customer_resolutions_by_type: Json | null
          customer_resolved: number | null
          customer_status: string | null
          inventory_dispositions_by_type: Json | null
          inventory_remaining: number | null
          inventory_resolved: number | null
          inventory_status: string | null
          overall_coverage_status: string | null
          return_id: string | null
          return_number: string | null
          status: Database["public"]["Enums"]["return_status"] | null
          total_damaged: number | null
          total_returned: number | null
        }
        Relationships: []
      }
      sale_order_lines_summary: {
        Row: {
          brand_variant_id: string | null
          item_name: string | null
          net_delivered_qty: number | null
          qty: number | null
          replacement_qty: number | null
          returned_good_qty: number | null
          sale_order_id: string | null
          sale_order_line_id: string | null
          shipped_qty: number | null
          sku: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_order_lines_brand_variant_id_fkey"
            columns: ["brand_variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_brand_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_order_lines_sale_order_id_fkey"
            columns: ["sale_order_id"]
            isOneToOne: false
            referencedRelation: "sale_order_paid_summary"
            referencedColumns: ["sale_order_id"]
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
      sale_order_paid_summary: {
        Row: {
          paid_qar: number | null
          sale_order_id: string | null
        }
        Relationships: []
      }
      supplier_credit_balances: {
        Row: {
          currency: string | null
          open_amount: number | null
          open_count: number | null
          supplier_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_stock_view: {
        Row: {
          allocated_qty: number | null
          available_qty: number | null
          avg_cost: number | null
          brand: string | null
          brand_variant_id: string | null
          category_name: string | null
          country_id: number | null
          country_name: string | null
          image_url: string | null
          item_name: string | null
          item_type: string | null
          qty: number | null
          sku: string | null
          sub_container_id: string | null
          sub_container_name: string | null
          subcategory_name: string | null
          total_value: number | null
          unit: string | null
          warehouse_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_item_brand_variants_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "country_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_stock_summary_sub_container_fk"
            columns: ["sub_container_id"]
            isOneToOne: false
            referencedRelation: "warehouse_sub_container_totals"
            referencedColumns: ["sub_container_id"]
          },
          {
            foreignKeyName: "warehouse_stock_summary_sub_container_fk"
            columns: ["sub_container_id"]
            isOneToOne: false
            referencedRelation: "warehouse_sub_containers"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_sub_container_totals: {
        Row: {
          item_count: number | null
          sub_container_id: string | null
          sub_container_is_active: boolean | null
          sub_container_name: string | null
          total_qty: number | null
          total_value: number | null
          warehouse_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_sub_containers_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _auth_user_has_permission: {
        Args: { p_permission: string }
        Returns: boolean
      }
      _consume_damaged_stock_fifo: {
        Args: {
          p_brand_variant_id: string
          p_qty: number
          p_warehouse_id: string
        }
        Returns: undefined
      }
      _consume_damaged_stock_fifo_returning: {
        Args: {
          p_brand_variant_id: string
          p_qty: number
          p_warehouse_id: string
        }
        Returns: {
          division_id: string
          qty_taken: number
          unit_cost: number
        }[]
      }
      _current_user_data_id: { Args: never; Returns: string }
      _find_or_create_sub_container: {
        Args: { p_division_id: string; p_warehouse_id: string }
        Returns: string
      }
      _fx_document_booking: {
        Args: { p_document_id: string; p_document_type: string }
        Returns: Record<string, unknown>
      }
      _has_custody_admin_role: {
        Args: { p_profile_id: string }
        Returns: boolean
      }
      _maybe_close_return: { Args: { p_return_id: string }; Returns: undefined }
      _record_customer_resolution: {
        Args: {
          p_credit_note_id?: string
          p_notes?: string
          p_qty: number
          p_resolution_type: string
          p_return_line_id: string
          p_sale_delivery_id?: string
        }
        Returns: string
      }
      _record_inventory_disposition: {
        Args: {
          p_disposition_type: string
          p_inventory_stock_movement_id?: string
          p_notes?: string
          p_qty: number
          p_return_line_id: string
          p_warehouse_id?: string
          p_warehouse_transfer_id?: string
        }
        Returns: string
      }
      _return_line_fifo_unit_cost: {
        Args: { p_qty: number; p_return_id: string; p_return_line_id: string }
        Returns: number
      }
      _return_resolution_status: {
        Args: { p_return_id: string }
        Returns: Database["public"]["Enums"]["return_status"]
      }
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
      apply_adjustment: {
        Args: { p_adjustment_id: string }
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
      apply_sale_order_edit: {
        Args: {
          p_discount_amount?: number
          p_discount_label?: string
          p_discount_type?: string
          p_line_items: Json
          p_so_id: string
        }
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
      approve_stock_adjustment_inventory: {
        Args: { p_adjustment_id: string; p_approved_by: string }
        Returns: undefined
      }
      archive_workflow_step: {
        Args: { p_profile_id: string; p_step_id: string }
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
      auto_generate_tool_serials: { Args: { p_item_id: string }; Returns: Json }
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
      bill_recompute_paid_fn: {
        Args: { p_bill_id: string }
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
      cancel_credit_group_change: {
        Args: { p_reason?: string; p_request_id: string }
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
      claim_media_jobs: {
        Args: { p_limit: number }
        Returns: {
          attachment_index: number
          attempts: number
          id: string
          message_id: string
        }[]
      }
      cleanup_old_notifications: { Args: never; Returns: number }
      complete_delivery_inventory: {
        Args: {
          p_delivery_id: string
          p_so_id: string
          p_sub_container_id?: string
        }
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
          p_sub_container_id?: string
          p_warehouse_id: string
        }
        Returns: Json
      }
      create_and_confirm_delivery:
        | {
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
        | {
            Args: {
              p_date: string
              p_items: Json
              p_so_id: string
              p_sub_container_id?: string
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
      create_inventory_receival: {
        Args: {
          p_brand_variant_id: string
          p_date: string
          p_mode: string
          p_notes: string
          p_qty: number
          p_source_layer_id: string
          p_sub_container_id: string
          p_unit_cost: number
          p_warehouse_id: string
        }
        Returns: {
          carved_from_layer_id: string | null
          check_sheet_pdf_url: string | null
          created_at: string | null
          date: string
          division_id: string | null
          id: string
          is_replacement: boolean
          notes: string | null
          po_id: string | null
          receipt_pdf_url: string | null
          receival_number: string
          received_by: string | null
          received_by_name: string | null
          source_debit_note_id: string | null
          source_type: Database["public"]["Enums"]["receival_source_type"]
          status: Database["public"]["Enums"]["receival_status"] | null
          updated_at: string | null
          warehouse_id: string
        }
        SetofOptions: {
          from: "*"
          to: "receivals"
          isOneToOne: true
          isSetofReturn: false
        }
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
      create_sale_order: {
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
          p_sub_container_id?: string
          p_warehouse_id: string
        }
        Returns: string
      }
      create_tool_item_with_default_variant: {
        Args: { p_category_id: string; p_name_ar: string; p_name_en: string }
        Returns: string
      }
      create_transfer_v2: {
        Args: {
          p_created_by_name?: string
          p_created_by_profile_id?: string
          p_date: string
          p_from_sub_container_id?: string
          p_from_warehouse_id: string
          p_items: Json
          p_notes?: string
          p_to_sub_container_id?: string
          p_to_warehouse_id: string
        }
        Returns: string
      }
      create_warranty_records_for_delivery: {
        Args: { p_delivery_id: string }
        Returns: number
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      customer_credit_used: {
        Args: { p_customer_id: string; p_exclude_so_id?: string }
        Returns: number
      }
      deduct_fifo_layers: {
        Args: {
          p_bv_id: string
          p_is_transfer: boolean
          p_qty: number
          p_sub_container_id?: string
          p_wh_id: string
        }
        Returns: {
          layer_id: string
          qty_taken: number
          source_id: string
          source_type: string
          sub_container_id: string
          total_cost: number
          unit_cost: number
        }[]
      }
      detach_payment_from_invoice: {
        Args: { p_invoice_id: string; p_payment_id: string }
        Returns: undefined
      }
      diag_list_receival_triggers: { Args: never; Returns: Json }
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
      force_approve_stock_adjustment: {
        Args: { p_adjustment_id: string; p_comment?: string }
        Returns: number
      }
      generate_check_number: { Args: never; Returns: string }
      generate_consumption_number: {
        Args: { p_consumer_type: string }
        Returns: string
      }
      generate_contract_id: { Args: never; Returns: string }
      generate_invoice_from_so: { Args: { p_so_id: string }; Returns: Json }
      generate_order_quotation_id: { Args: never; Returns: string }
      generate_quotation_number: { Args: never; Returns: string }
      generate_transfer_number: { Args: never; Returns: string }
      get_category_stock_aggregates: {
        Args: { p_type: string }
        Returns: {
          avg_cost: number
          category_id: string
          total_damaged: number
          total_incoming: number
          total_reserved: number
          total_stock: number
          variant_count: number
        }[]
      }
      get_cogs_breakdown: {
        Args: { p_brand_variant_id: string }
        Returns: Json
      }
      get_custody_master_list: {
        Args: { p_warehouse_id?: string }
        Returns: {
          created_at: string
          division_id: string
          division_name: string
          id: string
          is_active: boolean
          name: string
          responsible_person_name: string
          responsible_person_phone: string
          responsible_person_profile_id: string
          updated_at: string
          warehouse_id: string
          warehouse_name: string
        }[]
      }
      get_customer_pending_balances: { Args: never; Returns: Json }
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
      get_effective_attributes: {
        Args: { p_category_id: string }
        Returns: {
          attribute_key: string
          category_id: string
          category_name: string
          definition_id: string
          depth: number
          is_inherited: boolean
          label_ar: string
          label_en: string
          sort_order: number
        }[]
      }
      get_effective_warranty_policy: {
        Args: { p_item_id: string }
        Returns: string
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
      get_warehouse_names: {
        Args: { p_ids: string[] }
        Returns: {
          id: string
          name: string
        }[]
      }
      get_warehouse_sub_containers: {
        Args: { p_warehouse_id: string }
        Returns: {
          division_id: string
          division_name: string
          id: string
          is_active: boolean
          name: string
        }[]
      }
      get_warehouse_sub_containers_admin: {
        Args: { p_warehouse_id: string }
        Returns: {
          created_at: string
          division_id: string
          division_name: string
          id: string
          is_active: boolean
          name: string
          responsible_person_name: string
          responsible_person_phone: string
          responsible_person_profile_id: string
          team_id: string
          updated_at: string
          warehouse_id: string
        }[]
      }
      has_admin_permission: { Args: never; Returns: boolean }
      has_inventory_manager_role: {
        Args: { p_profile_id: string }
        Returns: boolean
      }
      is_division_visible: {
        Args: { row_division_id: string }
        Returns: boolean
      }
      is_field_rp_of: {
        Args: { p_profile_id: string; p_warehouse_id: string }
        Returns: boolean
      }
      is_sub_container_visible: {
        Args: { p_sub_container_id: string }
        Returns: boolean
      }
      mark_overdue_bills: { Args: never; Returns: undefined }
      mark_overdue_invoices: { Args: never; Returns: undefined }
      next_delivery_number: { Args: never; Returns: string }
      next_follow_up_order_id: { Args: never; Returns: string }
      next_follow_up_request_number: { Args: never; Returns: string }
      next_po_number: { Args: never; Returns: string }
      next_so_number: { Args: never; Returns: string }
      next_warranty_number: {
        Args: {
          p_division_id: string
          p_source_type: Database["public"]["Enums"]["warranty_source_type"]
        }
        Returns: string
      }
      po_approval_action: {
        Args: {
          p_action: string
          p_approver_email: string
          p_approver_name: string
          p_approver_profile_id: string
          p_comment?: string
          p_po_id: string
          p_step_id: string
        }
        Returns: Json
      }
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
      refresh_all_stock_summaries: { Args: never; Returns: undefined }
      refresh_po_status: { Args: { p_po_id: string }; Returns: undefined }
      refresh_stock_summary_row: {
        Args: {
          p_brand_variant_id: string
          p_sub_container_id: string
          p_warehouse_id: string
        }
        Returns: undefined
      }
      reject_credit_group_change: {
        Args: { p_approval_id: string; p_reason: string }
        Returns: undefined
      }
      reject_sales_request: {
        Args: { p_reason: string; p_request_id: string }
        Returns: undefined
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
      replace_warehouse_responsible_persons: {
        Args: { p_profile_ids: string[]; p_warehouse_id: string }
        Returns: undefined
      }
      resolve_category_sub_container: {
        Args: { p_category_id: string }
        Returns: string
      }
      resolve_login_email: { Args: { p_username: string }; Returns: string }
      resolve_warranty_division_slug: {
        Args: { p_division_id: string }
        Returns: string
      }
      resubmit_sale_order: { Args: { p_so_id: string }; Returns: Json }
      revert_landed_cost: {
        Args: { p_lc_id: string; p_performer_name?: string }
        Returns: undefined
      }
      rpc_accept_custody_assign: {
        Args: {
          p_accepted_by_name?: string
          p_accepted_by_profile_id?: string
          p_transfer_id: string
        }
        Returns: undefined
      }
      rpc_apply_debit_note_to_bill: {
        Args: { p_amount?: number; p_bill_id?: string; p_debit_note_id: string }
        Returns: string
      }
      rpc_archive_inventory_category: {
        Args: { p_category_id: string }
        Returns: undefined
      }
      rpc_attribute_picker_step: {
        Args: { p_category_id: string; p_picks?: Json }
        Returns: Json
      }
      rpc_build_po_approval_steps: { Args: { p_po_id: string }; Returns: Json }
      rpc_cancel_consumption: {
        Args: { p_consumption_id: string }
        Returns: undefined
      }
      rpc_cancel_po_return_dispatch: {
        Args: { p_return_id: string }
        Returns: undefined
      }
      rpc_clear_po_approval_steps: {
        Args: { p_only_pending?: boolean; p_po_id: string }
        Returns: undefined
      }
      rpc_close_return: {
        Args: { p_resolution: string; p_return_id: string }
        Returns: undefined
      }
      rpc_complete_delivery_with_followup: {
        Args: {
          p_delivery_id: string
          p_remaining_items?: Json
          p_so_id: string
          p_sub_container_id?: string
        }
        Returns: string
      }
      rpc_complete_return_inspection: {
        Args: {
          p_restock_warehouse_id?: string
          p_return_id: string
          p_splits: Json
        }
        Returns: undefined
      }
      rpc_create_custody_assign: {
        Args: {
          p_created_by_name?: string
          p_created_by_profile_id?: string
          p_dest_sub_container_id: string
          p_items: Json
          p_notes?: string
          p_source_sub_container_id: string
          p_source_warehouse_id: string
        }
        Returns: string
      }
      rpc_create_custody_return: {
        Args: {
          p_created_by_name?: string
          p_created_by_profile_id?: string
          p_dest_sub_container_id: string
          p_dest_warehouse_id: string
          p_items: Json
          p_notes?: string
          p_source_sub_container_id: string
        }
        Returns: string
      }
      rpc_create_partial_replacement: {
        Args: {
          p_dispositions?: Json
          p_gift_items?: Json
          p_lines: Json
          p_return_id: string
          p_warehouse_id: string
        }
        Returns: string
      }
      rpc_create_purchase_bill: { Args: { p_payload: Json }; Returns: Json }
      rpc_create_purchase_order: { Args: { p_payload: Json }; Returns: Json }
      rpc_customer_statement: {
        Args: {
          p_customer_id: string
          p_date_from?: string
          p_date_to?: string
        }
        Returns: {
          credit: number
          debit: number
          description: string
          reference: string
          txn_date: string
          txn_type: string
        }[]
      }
      rpc_customer_statement_v2: {
        Args: { p_customer_id: string }
        Returns: Json
      }
      rpc_decide_consumption_edit: {
        Args: { p_comment?: string; p_decision: string; p_request_id: string }
        Returns: undefined
      }
      rpc_delete_customer_payment: {
        Args: { p_payment_id: string }
        Returns: {
          agent_name: string | null
          amount: number
          amount_qar: number | null
          bank_name: string | null
          bill_id: string | null
          cheque_date: string | null
          cheque_number: string | null
          created_at: string | null
          credit_note_id: string | null
          currency: string
          currency_id: string | null
          customer_id: string | null
          date: string
          debit_note_id: string | null
          deleted_at: string | null
          direction: Database["public"]["Enums"]["payment_direction"]
          exchange_gain: number
          exchange_loss: number
          exchange_rate: number
          id: string
          invoice_id: string | null
          method: string
          method_id: string | null
          notes: string | null
          payment_id: string | null
          qb_synced: boolean | null
          reference: string | null
          source_id: string | null
          source_type: Database["public"]["Enums"]["payment_source_type"] | null
          status: Database["public"]["Enums"]["payment_status"] | null
          supplier_id: string | null
          transaction_id: string | null
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_delete_supplier_payment: {
        Args: { p_payment_id: string }
        Returns: {
          agent_name: string | null
          amount: number
          amount_qar: number | null
          bank_name: string | null
          bill_id: string | null
          cheque_date: string | null
          cheque_number: string | null
          created_at: string | null
          credit_note_id: string | null
          currency: string
          currency_id: string | null
          customer_id: string | null
          date: string
          debit_note_id: string | null
          deleted_at: string | null
          direction: Database["public"]["Enums"]["payment_direction"]
          exchange_gain: number
          exchange_loss: number
          exchange_rate: number
          id: string
          invoice_id: string | null
          method: string
          method_id: string | null
          notes: string | null
          payment_id: string | null
          qb_synced: boolean | null
          reference: string | null
          source_id: string | null
          source_type: Database["public"]["Enums"]["payment_source_type"] | null
          status: Database["public"]["Enums"]["payment_status"] | null
          supplier_id: string | null
          transaction_id: string | null
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_dispatch_custody_assign: {
        Args: {
          p_dispatched_by_name?: string
          p_dispatched_by_profile_id?: string
          p_transfer_id: string
        }
        Returns: undefined
      }
      rpc_edit_customer_payment: {
        Args: {
          p_amount: number
          p_date: string
          p_exchange_rate?: number
          p_method: string
          p_notes: string
          p_payment_id: string
          p_reference: string
        }
        Returns: {
          agent_name: string | null
          amount: number
          amount_qar: number | null
          bank_name: string | null
          bill_id: string | null
          cheque_date: string | null
          cheque_number: string | null
          created_at: string | null
          credit_note_id: string | null
          currency: string
          currency_id: string | null
          customer_id: string | null
          date: string
          debit_note_id: string | null
          deleted_at: string | null
          direction: Database["public"]["Enums"]["payment_direction"]
          exchange_gain: number
          exchange_loss: number
          exchange_rate: number
          id: string
          invoice_id: string | null
          method: string
          method_id: string | null
          notes: string | null
          payment_id: string | null
          qb_synced: boolean | null
          reference: string | null
          source_id: string | null
          source_type: Database["public"]["Enums"]["payment_source_type"] | null
          status: Database["public"]["Enums"]["payment_status"] | null
          supplier_id: string | null
          transaction_id: string | null
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_edit_supplier_payment: {
        Args: {
          p_amount: number
          p_date: string
          p_exchange_rate?: number
          p_method: string
          p_notes: string
          p_payment_id: string
          p_reference: string
        }
        Returns: {
          agent_name: string | null
          amount: number
          amount_qar: number | null
          bank_name: string | null
          bill_id: string | null
          cheque_date: string | null
          cheque_number: string | null
          created_at: string | null
          credit_note_id: string | null
          currency: string
          currency_id: string | null
          customer_id: string | null
          date: string
          debit_note_id: string | null
          deleted_at: string | null
          direction: Database["public"]["Enums"]["payment_direction"]
          exchange_gain: number
          exchange_loss: number
          exchange_rate: number
          id: string
          invoice_id: string | null
          method: string
          method_id: string | null
          notes: string | null
          payment_id: string | null
          qb_synced: boolean | null
          reference: string | null
          source_id: string | null
          source_type: Database["public"]["Enums"]["payment_source_type"] | null
          status: Database["public"]["Enums"]["payment_status"] | null
          supplier_id: string | null
          transaction_id: string | null
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rpc_financial_dashboard: { Args: never; Returns: Json }
      rpc_my_consumption_sources: {
        Args: never
        Returns: {
          sub_container_id: string
          sub_container_name: string
          warehouse_id: string
          warehouse_kind: string
          warehouse_name: string
        }[]
      }
      rpc_post_consumption: {
        Args: {
          p_attachments: string[]
          p_consumer_sub_container_id: string
          p_consumer_type: string
          p_lines: Json
          p_notes: string
          p_source_sub_container_id: string
          p_source_warehouse_id: string
        }
        Returns: string
      }
      rpc_process_po_return_dispatch: {
        Args: { p_return_id: string }
        Returns: undefined
      }
      rpc_process_return_restock: {
        Args: { p_return_id: string }
        Returns: undefined
      }
      rpc_product_profitability: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: Json
      }
      rpc_profitability_drilldown: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: Json
      }
      rpc_purchase_aging_report: {
        Args: never
        Returns: {
          bill_count: number
          current_amt: number
          days_1_30: number
          days_31_60: number
          days_61_90: number
          days_over_90: number
          supplier_id: string
          supplier_name: string
          total_outstanding: number
        }[]
      }
      rpc_recompute_document_fx: {
        Args: { p_document_id: string; p_document_type: string }
        Returns: undefined
      }
      rpc_record_inventory_disposition: {
        Args: {
          p_dispositions: Json
          p_return_id: string
          p_warehouse_id: string
        }
        Returns: number
      }
      rpc_record_return_refund: {
        Args: {
          p_lines: Json
          p_refund_method?: string
          p_refund_reference?: string
          p_return_id: string
        }
        Returns: undefined
      }
      rpc_record_return_store_credit: {
        Args: { p_lines: Json; p_return_id: string }
        Returns: undefined
      }
      rpc_redeem_credit_note: {
        Args: {
          p_amount: number
          p_credit_note_id: string
          p_date?: string
          p_invoice_id: string
          p_method: string
          p_notes?: string
          p_reference?: string
          p_source_id?: string
          p_source_type?: string
        }
        Returns: string
      }
      rpc_replace_po_lines: {
        Args: { p_lines: Json; p_po_id: string }
        Returns: undefined
      }
      rpc_report_accounts_payable: {
        Args: {
          p_division_ids?: string[]
          p_from?: string
          p_status?: string
          p_supplier_id?: string
          p_to?: string
        }
        Returns: {
          amount: number
          bill_no: string
          division_id: string
          division_name: string
          due: number
          due_date: string
          issued_date: string
          paid: number
          po_amount: number
          po_currency: string
          po_id: string
          po_no: string
          status: string
          supplier: string
        }[]
      }
      rpc_report_accounts_receivable: {
        Args: {
          p_customer_id?: string
          p_division_ids?: string[]
          p_from?: string
          p_status?: string
          p_to?: string
        }
        Returns: {
          amount: number
          customer: string
          division_id: string
          division_name: string
          due: number
          due_date: string
          invoice_no: string
          issued_date: string
          paid: number
          sale_order_id: string
          so_no: string
          status: string
        }[]
      }
      rpc_report_cash: {
        Args: {
          p_division_ids?: string[]
          p_end: string
          p_method_ids?: string[]
          p_start: string
        }
        Returns: {
          balance: number
          credit: number
          date: string
          debit: number
          division_id: string
          division_name: string
          doc_kind: string
          doc_no: string
          is_opening: boolean
          party: string
          payment_method: string
        }[]
      }
      rpc_report_pnl: {
        Args: {
          p_basis?: string
          p_division_ids?: string[]
          p_end: string
          p_start: string
          p_warehouse_ids?: string[]
        }
        Returns: Json
      }
      rpc_report_pnl_fx_detail: {
        Args: { p_division_ids?: string[]; p_end: string; p_start: string }
        Returns: {
          amount: number
          amount_qar: number
          counterparty: string
          currency: string
          doc_id: string
          doc_number: string
          doc_type: string
          exchange_gain: number
          exchange_loss: number
          net_fx: number
          payment_date: string
          payment_id: string
        }[]
      }
      rpc_report_product_cost: {
        Args: {
          p_brand_variant_id?: string
          p_category_id?: string
          p_division_ids?: string[]
          p_po_id?: string
          p_warehouse_ids?: string[]
        }
        Returns: {
          barcode: string
          brand_variant_id: string
          category: string
          division_id: string
          division_name: string
          layer_id: string
          po_id: string
          po_no: string
          product_name: string
          product_type: string
          qty: number
          sales_price: number
          sub_category: string
          total_cost: number
          unit_cost: number
          warehouse_id: string
          warehouse_name: string
        }[]
      }
      rpc_report_revenue_cogs: {
        Args: {
          p_brand_variant_id?: string
          p_category_id?: string
          p_customer_id?: string
          p_division_ids?: string[]
          p_end: string
          p_start: string
          p_warehouse_ids?: string[]
        }
        Returns: {
          barcode: string
          brand_variant_id: string
          category: string
          cogs_id: string
          customer: string
          date: string
          division_id: string
          division_name: string
          gross_profit: number
          margin_pct: number
          product_name: string
          product_type: string
          qty: number
          sale_order_id: string
          sales_price: number
          so_no: string
          source_type: string
          total_cost: number
          total_sales: number
          unit_cost: number
          warehouse_id: string
          warehouse_name: string
        }[]
      }
      rpc_request_consumption_edit: {
        Args: { p_consumption_id: string; p_reason: string }
        Returns: string
      }
      rpc_request_damaged_writeoff: {
        Args: {
          p_brand_variant_id: string
          p_notes: string
          p_qty: number
          p_reason: string
          p_requested_by: string
          p_requested_by_name: string
          p_sub_container_id: string
          p_warehouse_id: string
        }
        Returns: string
      }
      rpc_return_damaged_from_repair: {
        Args: {
          p_notes?: string
          p_outcome: string
          p_qty_good: number
          p_qty_writeoff: number
          p_repair_cost?: number
          p_transfer_id: string
        }
        Returns: undefined
      }
      rpc_sales_aging_report: {
        Args: never
        Returns: {
          current_amt: number
          customer_id: string
          customer_name: string
          days_1_30: number
          days_31_60: number
          days_61_90: number
          days_over_90: number
          invoice_count: number
          total_outstanding: number
        }[]
      }
      rpc_seed_payment_plan_from_so: {
        Args: { p_invoice_id: string; p_so_id: string }
        Returns: string
      }
      rpc_send_damaged_for_repair: {
        Args: {
          p_expected_return_date: string
          p_notes?: string
          p_repair_vendor_id: string
          p_return_line_disposition_id: string
          p_source_division_id?: string
          p_warehouse_id: string
        }
        Returns: string
      }
      rpc_send_damaged_stock_for_repair: {
        Args: {
          p_brand_variant_id: string
          p_expected_return_date: string
          p_notes?: string
          p_qty: number
          p_repair_vendor_id: string
          p_source_division_id: string
          p_warehouse_id: string
        }
        Returns: string
      }
      rpc_settle_installment: {
        Args: {
          p_amount_paid: number
          p_currency?: string
          p_date: string
          p_exchange_rate?: number
          p_installment_id: string
          p_method: string
          p_reference?: string
        }
        Returns: string
      }
      rpc_sync_invoice_from_so: { Args: { p_so_id: string }; Returns: Json }
      rpc_update_document_initial_rate: {
        Args: {
          p_document_id: string
          p_document_type: string
          p_new_rate: number
          p_reason: string
        }
        Returns: undefined
      }
      rpc_update_inventory_sort_orders: {
        Args: { p_updates: Json }
        Returns: undefined
      }
      rpc_upsert_warehouse_sub_container: {
        Args: {
          p_division_id?: string
          p_id?: string
          p_is_active?: boolean
          p_name: string
          p_responsible_person_profile_id?: string
          p_warehouse_id: string
        }
        Returns: string
      }
      save_customer_credit_docs: {
        Args: { p_customer_id: string; p_docs: Json }
        Returns: undefined
      }
      save_customer_phones: {
        Args: { p_customer_id: string; p_phones: Json }
        Returns: undefined
      }
      save_inventory_check_item_count: {
        Args: {
          p_assignment_id?: string
          p_counted_qty: number
          p_item_id: string
          p_profile_id?: string
          p_profile_name?: string
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
      search_customers: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_only_active?: boolean
          p_query?: string
        }
        Returns: Json
      }
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
      set_active_division: {
        Args: { p_division_id: string }
        Returns: undefined
      }
      set_bill_pdf_url: {
        Args: { p_id: string; p_url: string }
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
      storage_delete_object: {
        Args: {
          p_bucket: string
          p_path: string
          p_source_id?: string
          p_source_table?: string
        }
        Returns: undefined
      }
      storage_lc_bills_write_allowed: { Args: never; Returns: boolean }
      submit_credit_group_change: {
        Args: { p_customer_id: string; p_requested_group_id: string }
        Returns: Json
      }
      toggle_workflow_step: {
        Args: { p_active: boolean; p_step_id: string }
        Returns: undefined
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
    }
    Enums: {
      address_type: "blue-plate" | "google-coords"
      approval_source_type: "sale_order" | "order"
      approval_status: "pending" | "approved" | "rejected"
      approval_type: "margin" | "credit"
      audit_severity: "info" | "warning" | "error" | "critical"
      credit_debit_line_type: "original" | "returned"
      credit_group_request_status:
        | "pending"
        | "approved"
        | "rejected"
        | "cancelled"
      credit_note_resolution_type: "refund" | "replacement" | "store_credit"
      credit_note_status:
        | "draft"
        | "approved"
        | "open"
        | "in_progress"
        | "resolved"
        | "void"
      customer_entity_type: "individual" | "business"
      division: "maintenance" | "cleaning" | "kitchen" | "pest-control"
      instruction_content_type: "text" | "pdf"
      instruction_type: "pre-service" | "post-service"
      inventory_check_event_type:
        | "initialized"
        | "user_completed"
        | "all_counted"
        | "approval_action"
        | "approved"
        | "rejected"
        | "user_started"
        | "cancelled"
      inventory_check_step_role:
        | "accounting_manager"
        | "inventory_manager"
        | "responsible_person"
        | "brand_manager"
        | "owner"
      inventory_type: "products" | "spare-parts" | "consumables" | "tools"
      invoice_payment_status: "unpaid" | "partially_paid" | "paid" | "overdue"
      invoice_source: "sale_order" | "contract" | "quotation"
      invoice_status:
        | "draft"
        | "sent"
        | "partially_paid"
        | "paid"
        | "overdue"
        | "cancelled"
        | "void"
      invoice_type: "cash" | "credit"
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
        | "booking"
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
      payment_direction: "incoming" | "outgoing"
      payment_source_type: "sale_order" | "purchase_order" | "invoice" | "bill"
      payment_status:
        | "completed"
        | "pending"
        | "failed"
        | "refunded"
        | "processing"
      po_edit_request_status: "pending" | "approved" | "rejected" | "used"
      po_stage: "rfq" | "draft" | "po"
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
      receival_source_type: "purchase" | "inventory"
      receival_status: "pending_approval" | "approved" | "rejected"
      reminder_channel: "Email" | "SMS" | "WhatsApp"
      return_source_type: "sale_order" | "purchase_order"
      return_status:
        | "pending"
        | "pending_inspection"
        | "received"
        | "restocked"
        | "closed"
        | "dispatched"
        | "supplier_confirmed"
        | "cancelled"
        | "resolved_credit"
        | "resolved_replacement"
        | "resolved_partial"
      sale_delivery_status:
        | "pending"
        | "in_progress"
        | "delivered"
        | "cancelled"
      sale_delivery_type: "standard" | "replacement"
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
      stock_adjustment_type:
        | "increase"
        | "decrease"
        | "set"
        | "damage"
        | "write_off"
      stock_movement_type:
        | "purchase_receival"
        | "sale_delivery"
        | "adjustment"
        | "transfer_in"
        | "transfer_out"
        | "cost_adjustment"
        | "receival_edit"
        | "free_receival"
        | "sale_return"
        | "sale_return_damaged"
        | "purchase_return"
        | "purchase_return_cancelled"
        | "inventory_check"
        | "inventory_receival_carve"
        | "inventory_receival_new"
        | "damaged_return_from_repair_as_good"
        | "consumption"
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
      warranty_source_type: "sale" | "service" | "contract"
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
      approval_source_type: ["sale_order", "order"],
      approval_status: ["pending", "approved", "rejected"],
      approval_type: ["margin", "credit"],
      audit_severity: ["info", "warning", "error", "critical"],
      credit_debit_line_type: ["original", "returned"],
      credit_group_request_status: [
        "pending",
        "approved",
        "rejected",
        "cancelled",
      ],
      credit_note_resolution_type: ["refund", "replacement", "store_credit"],
      credit_note_status: [
        "draft",
        "approved",
        "open",
        "in_progress",
        "resolved",
        "void",
      ],
      customer_entity_type: ["individual", "business"],
      division: ["maintenance", "cleaning", "kitchen", "pest-control"],
      instruction_content_type: ["text", "pdf"],
      instruction_type: ["pre-service", "post-service"],
      inventory_check_event_type: [
        "initialized",
        "user_completed",
        "all_counted",
        "approval_action",
        "approved",
        "rejected",
        "user_started",
        "cancelled",
      ],
      inventory_check_step_role: [
        "accounting_manager",
        "inventory_manager",
        "responsible_person",
        "brand_manager",
        "owner",
      ],
      inventory_type: ["products", "spare-parts", "consumables", "tools"],
      invoice_payment_status: ["unpaid", "partially_paid", "paid", "overdue"],
      invoice_source: ["sale_order", "contract", "quotation"],
      invoice_status: [
        "draft",
        "sent",
        "partially_paid",
        "paid",
        "overdue",
        "cancelled",
        "void",
      ],
      invoice_type: ["cash", "credit"],
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
        "booking",
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
      payment_direction: ["incoming", "outgoing"],
      payment_source_type: ["sale_order", "purchase_order", "invoice", "bill"],
      payment_status: [
        "completed",
        "pending",
        "failed",
        "refunded",
        "processing",
      ],
      po_edit_request_status: ["pending", "approved", "rejected", "used"],
      po_stage: ["rfq", "draft", "po"],
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
      receival_source_type: ["purchase", "inventory"],
      receival_status: ["pending_approval", "approved", "rejected"],
      reminder_channel: ["Email", "SMS", "WhatsApp"],
      return_source_type: ["sale_order", "purchase_order"],
      return_status: [
        "pending",
        "pending_inspection",
        "received",
        "restocked",
        "closed",
        "dispatched",
        "supplier_confirmed",
        "cancelled",
        "resolved_credit",
        "resolved_replacement",
        "resolved_partial",
      ],
      sale_delivery_status: [
        "pending",
        "in_progress",
        "delivered",
        "cancelled",
      ],
      sale_delivery_type: ["standard", "replacement"],
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
      stock_adjustment_type: [
        "increase",
        "decrease",
        "set",
        "damage",
        "write_off",
      ],
      stock_movement_type: [
        "purchase_receival",
        "sale_delivery",
        "adjustment",
        "transfer_in",
        "transfer_out",
        "cost_adjustment",
        "receival_edit",
        "free_receival",
        "sale_return",
        "sale_return_damaged",
        "purchase_return",
        "purchase_return_cancelled",
        "inventory_check",
        "inventory_receival_carve",
        "inventory_receival_new",
        "damaged_return_from_repair_as_good",
        "consumption",
      ],
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
      warranty_source_type: ["sale", "service", "contract"],
    },
  },
} as const

export type DBTable<T extends keyof Database['public']['Tables']>  = Database['public']['Tables'][T]['Row']
export type DBInsert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type DBUpdate<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']
export type AllTables = keyof Database['public']['Tables']
