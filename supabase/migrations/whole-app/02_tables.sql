-- whole-app 02: tables (live wkmvjxxmzstsvahuiwsz post-repair, byte-exact from catalog)
-- order: sequences -> tables (with inline PK/UNIQUE/CHECK) -> sequence ownership -> foreign keys

-- ============ SEQUENCES ============
CREATE SEQUENCE public.consumption_entry_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 NO CYCLE;
CREATE SEQUENCE public.contract_id_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 NO CYCLE;
CREATE SEQUENCE public.country_codes_id_seq AS integer START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 NO CYCLE;
CREATE SEQUENCE public.delivery_number_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 NO CYCLE;
CREATE SEQUENCE public.follow_up_order_seq_2026_06 AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 NO CYCLE;
CREATE SEQUENCE public.follow_up_request_seq_2026 AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 NO CYCLE;
CREATE SEQUENCE public.inventory_check_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 NO CYCLE;
CREATE SEQUENCE public.inventory_receival_number_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 NO CYCLE;
CREATE SEQUENCE public.lc_number_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 NO CYCLE;
CREATE SEQUENCE public.order_quotation_number_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 NO CYCLE;
CREATE SEQUENCE public.quotation_number_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 NO CYCLE;
CREATE SEQUENCE public.receival_number_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 NO CYCLE;
CREATE SEQUENCE public.sale_delivery_number_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 NO CYCLE;
CREATE SEQUENCE public.storage_cleanup_failures_id_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 NO CYCLE;
CREATE SEQUENCE public.warehouse_transfer_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 NO CYCLE;

-- ============ TABLES ============

CREATE TABLE public.activity_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  action text NOT NULL,
  details text,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  module text,
  severity audit_severity DEFAULT 'info'::audit_severity NOT NULL,
  performer_name text,
  old_data jsonb,
  new_data jsonb,
  CONSTRAINT activity_log_pkey PRIMARY KEY (id)
);

CREATE TABLE public.app_settings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  key text NOT NULL,
  value jsonb DEFAULT '{}'::jsonb NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT app_settings_pkey PRIMARY KEY (id),
  CONSTRAINT app_settings_key_key UNIQUE (key)
);

CREATE TABLE public.approval_workflow_groups (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workflow text NOT NULL,
  group_label text DEFAULT 'Default'::text NOT NULL,
  group_order integer DEFAULT 1 NOT NULL,
  mode text DEFAULT 'any_one'::text NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT approval_workflow_groups_pkey PRIMARY KEY (id),
  CONSTRAINT approval_workflow_groups_mode_check CHECK ((mode = ANY (ARRAY['any_one'::text, 'all_must'::text]))),
  CONSTRAINT approval_workflow_groups_workflow_check CHECK ((workflow = ANY (ARRAY['po'::text, 'inv_check'::text, 'stock_adj'::text, 'sales_margin'::text, 'sales_credit'::text, 'credit_group'::text, 'receival_edit'::text, 'consumption_edit'::text])))
);

CREATE TABLE public.approval_workflow_steps (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  workflow text NOT NULL,
  role_id uuid NOT NULL,
  step_key text NOT NULL,
  step_label text NOT NULL,
  step_order integer NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  is_conditional boolean DEFAULT false NOT NULL,
  condition_types text[] DEFAULT '{}'::text[],
  archived_at timestamp with time zone,
  archived_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  group_id uuid,
  CONSTRAINT workflow_approval_steps_pkey PRIMARY KEY (id),
  CONSTRAINT workflow_approval_steps_workflow_step_key_key UNIQUE (workflow, step_key),
  CONSTRAINT positive_order CHECK ((step_order > 0)),
  CONSTRAINT workflow_approval_steps_workflow_check CHECK ((workflow = ANY (ARRAY['po'::text, 'inv_check'::text, 'stock_adj'::text, 'sales_margin'::text, 'sales_credit'::text, 'credit_group'::text, 'receival_edit'::text, 'consumption_edit'::text])))
);

CREATE TABLE public.bill_attachments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  bill_id uuid NOT NULL,
  storage_key text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid,
  uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT bill_attachments_pkey PRIMARY KEY (id)
);

CREATE TABLE public.bill_line_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  bill_id uuid NOT NULL,
  description text NOT NULL,
  qty integer DEFAULT 1,
  unit_price numeric DEFAULT 0,
  total numeric DEFAULT 0,
  match_status text,
  match_note text,
  created_at timestamp with time zone DEFAULT now(),
  brand_variant_id uuid,
  CONSTRAINT bill_line_items_pkey PRIMARY KEY (id),
  CONSTRAINT bill_line_items_match_status_check CHECK ((match_status = ANY (ARRAY['matched'::text, 'qty_discrepancy'::text, 'price_discrepancy'::text, 'unmatched'::text, 'accepted_with_note'::text]))),
  CONSTRAINT bill_line_items_qty_positive CHECK ((qty > 0)),
  CONSTRAINT bill_line_items_unit_price_non_neg CHECK ((unit_price >= (0)::numeric))
);

CREATE TABLE public.bills (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  bill_number text NOT NULL,
  source_label text,
  payment_status invoice_payment_status DEFAULT 'unpaid'::invoice_payment_status NOT NULL,
  supplier_id uuid,
  purchase_order_id uuid,
  receival_id uuid,
  division_id uuid,
  issued_date date DEFAULT CURRENT_DATE NOT NULL,
  due_date date DEFAULT CURRENT_DATE NOT NULL,
  subtotal numeric,
  discount_amount numeric DEFAULT 0 NOT NULL,
  discount_label text,
  total_amount numeric,
  paid_amount numeric,
  needs_refresh boolean DEFAULT false NOT NULL,
  notes text,
  pdf_url text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT bills_pkey PRIMARY KEY (id),
  CONSTRAINT bills_purchase_order_id_unique UNIQUE (purchase_order_id),
  CONSTRAINT bills_total_amount_non_negative CHECK (((total_amount IS NULL) OR (total_amount >= (0)::numeric)))
);

CREATE TABLE public.brand_group_members (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  group_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid,
  CONSTRAINT brand_group_members_pkey PRIMARY KEY (id),
  CONSTRAINT brand_group_members_group_id_brand_id_key UNIQUE (group_id, brand_id)
);

CREATE TABLE public.brand_groups (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  name_ar text,
  scope text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid,
  deleted_at timestamp with time zone,
  CONSTRAINT brand_groups_pkey PRIMARY KEY (id)
);

CREATE TABLE public.brands (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  name_ar text,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT brands_pkey PRIMARY KEY (id)
);

CREATE TABLE public.call_records (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  message_id uuid NOT NULL,
  call_id text NOT NULL,
  agent_extension text,
  agent_name text,
  customer_phone text NOT NULL,
  direction text,
  status text,
  started_at timestamp with time zone NOT NULL,
  ended_at timestamp with time zone,
  duration_seconds integer,
  recording_url text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  initiated_by uuid,
  CONSTRAINT call_records_pkey PRIMARY KEY (id),
  CONSTRAINT call_records_direction_check CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text]))),
  CONSTRAINT call_records_status_check CHECK ((status = ANY (ARRAY['in_progress'::text, 'answered'::text, 'missed'::text, 'rejected'::text])))
);

CREATE TABLE public.chat_conversations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  customer_id uuid,
  last_message text,
  last_message_at timestamp with time zone,
  unread_count integer DEFAULT 0,
  channel message_source,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  conversation_type text DEFAULT 'customer'::text NOT NULL,
  wati_phone text,
  wati_contact_name text,
  assigned_agent text,
  is_opened boolean DEFAULT false NOT NULL,
  wati_status text DEFAULT 'open'::text NOT NULL,
  provider text DEFAULT 'wati'::text NOT NULL,
  customer_id_v2 uuid,
  unknown_phone text,
  is_deleted boolean DEFAULT false NOT NULL,
  deleted_at timestamp with time zone,
  deleted_by uuid,
  last_message_from_type text,
  unanswered_dismissed_at timestamp with time zone,
  CONSTRAINT chat_conversations_pkey PRIMARY KEY (id),
  CONSTRAINT chat_conversations_wati_phone_provider_key UNIQUE (wati_phone, provider),
  CONSTRAINT chat_conversations_conversation_type_check CHECK ((conversation_type = ANY (ARRAY['customer'::text, 'team'::text]))),
  CONSTRAINT chat_conversations_last_message_from_type_check CHECK (((last_message_from_type IS NULL) OR (last_message_from_type = ANY (ARRAY['agent'::text, 'customer'::text])))),
  CONSTRAINT chat_conversations_provider_check CHECK ((provider = ANY (ARRAY['wati'::text, 'whapi'::text])))
);

CREATE TABLE public.chat_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  conversation_id uuid NOT NULL,
  text text,
  from_type text NOT NULL,
  agent_name text,
  source message_source NOT NULL,
  attachments jsonb,
  call_metadata jsonb,
  created_at timestamp with time zone DEFAULT now(),
  delivery_status text DEFAULT 'sending'::text,
  external_id text,
  reply_to_external_id text,
  sent_by_profile_id uuid,
  reactions jsonb DEFAULT '[]'::jsonb NOT NULL,
  message_kind text DEFAULT 'message'::text NOT NULL,
  phone_id uuid,
  deleted_at timestamp with time zone,
  deleted_by uuid,
  purge_batch_id uuid,
  wamid text,
  wati_id text,
  revoked_at timestamp with time zone,
  CONSTRAINT chat_messages_pkey PRIMARY KEY (id),
  CONSTRAINT chat_messages_delivery_status_check CHECK ((delivery_status = ANY (ARRAY['sending'::text, 'sent'::text, 'delivered'::text, 'read'::text, 'failed'::text])))
);

CREATE TABLE public.cogs_entries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  brand_variant_id uuid NOT NULL,
  sale_delivery_id uuid,
  sale_order_id uuid,
  qty integer NOT NULL,
  unit_cost numeric NOT NULL,
  total_cost numeric NOT NULL,
  date date DEFAULT CURRENT_DATE NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  landed_cost_id uuid,
  notes text,
  source_type text DEFAULT 'sale'::text NOT NULL,
  division_id uuid,
  source_id uuid,
  consumer_division_id uuid,
  consumption_id uuid,
  consumer_type text,
  consumer_customer_id uuid,
  consumer_sub_container_id uuid,
  milestone_id uuid,
  discipline_id uuid,
  code text,
  CONSTRAINT cogs_entries_pkey PRIMARY KEY (id),
  CONSTRAINT cogs_entries_consumer_type_check CHECK (((consumer_type IS NULL) OR (consumer_type = ANY (ARRAY['custody'::text, 'internal'::text])))),
  CONSTRAINT cogs_entries_source_check CHECK ((NOT ((sale_delivery_id IS NOT NULL) AND (landed_cost_id IS NOT NULL))))
);

CREATE TABLE public.companies (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name_en text NOT NULL,
  name_ar text,
  cr_number text,
  vat_id text,
  default_currency character varying(3) DEFAULT 'QAR'::character varying NOT NULL,
  default_tax_rate numeric DEFAULT 0 NOT NULL,
  logo_url text,
  address_en text,
  address_ar text,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid,
  stamp_url text,
  footer_motto text,
  currency_id uuid,
  CONSTRAINT companies_pkey PRIMARY KEY (id)
);

CREATE TABLE public.company_divisions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  slug text NOT NULL,
  name text NOT NULL,
  short_name text,
  color text DEFAULT '#2563eb'::text NOT NULL,
  css_classes text,
  company_name_en text,
  company_name_ar text,
  address_en text,
  address_ar text,
  logo_url text,
  stamp_url text,
  is_active boolean DEFAULT true NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid,
  footer_motto text,
  default_currency character varying(3) DEFAULT 'QAR'::character varying NOT NULL,
  default_tax_rate numeric DEFAULT 0 NOT NULL,
  company_id uuid,
  name_ar text,
  address text,
  currency_id uuid,
  calendar_schedule_id uuid,
  CONSTRAINT divisions_pkey PRIMARY KEY (id),
  CONSTRAINT divisions_slug_key UNIQUE (slug)
);

CREATE TABLE public.consumption_edit_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  consumption_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  reason text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  review_comment text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT consumption_edit_requests_pkey PRIMARY KEY (id),
  CONSTRAINT consumption_edit_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);

CREATE TABLE public.consumption_entries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ce_number text NOT NULL,
  date date DEFAULT CURRENT_DATE NOT NULL,
  source_warehouse_id uuid NOT NULL,
  source_sub_container_id uuid NOT NULL,
  consumer_type text NOT NULL,
  consumer_customer_id uuid,
  notes text,
  attachments text[] DEFAULT '{}'::text[] NOT NULL,
  status text DEFAULT 'draft'::text NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  posted_by uuid,
  posted_at timestamp with time zone,
  cancelled_by uuid,
  cancelled_at timestamp with time zone,
  division_id uuid,
  consumer_sub_container_id uuid,
  milestone_id uuid,
  discipline_id uuid,
  code text,
  is_team_item boolean DEFAULT false NOT NULL,
  CONSTRAINT consumption_entries_pkey PRIMARY KEY (id),
  CONSTRAINT consumption_entries_ce_number_key UNIQUE (ce_number),
  CONSTRAINT consumption_entries_consumer_type_check CHECK ((consumer_type = ANY (ARRAY['custody'::text, 'internal'::text]))),
  CONSTRAINT consumption_entries_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'posted'::text, 'cancelled'::text])))
);

CREATE TABLE public.consumption_lines (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  consumption_id uuid NOT NULL,
  brand_variant_id uuid NOT NULL,
  item_name text NOT NULL,
  sku text,
  qty integer NOT NULL,
  unit_cost numeric,
  total_cost numeric GENERATED ALWAYS AS (((qty)::numeric * unit_cost)) STORED,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT consumption_lines_pkey PRIMARY KEY (id),
  CONSTRAINT consumption_lines_qty_check CHECK ((qty > 0))
);

CREATE TABLE public.consumption_number_counters (
  consumer_type text NOT NULL,
  period text NOT NULL,
  last_seq integer DEFAULT 0 NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT consumption_number_counters_pkey PRIMARY KEY (consumer_type, period),
  CONSTRAINT consumption_number_counters_consumer_type_check CHECK ((consumer_type = ANY (ARRAY['custody'::text, 'internal'::text])))
);

CREATE TABLE public.contract_milestones (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  contract_id uuid NOT NULL,
  name text NOT NULL,
  percentage numeric DEFAULT 0 NOT NULL,
  amount numeric DEFAULT 0 NOT NULL,
  due_date date,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT contract_milestones_pkey PRIMARY KEY (id)
);

CREATE TABLE public.contract_payments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  contract_id uuid NOT NULL,
  due_date date NOT NULL,
  amount numeric NOT NULL,
  status text DEFAULT 'pending'::text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT contract_payments_pkey PRIMARY KEY (id)
);

CREATE TABLE public.contract_services (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  contract_id uuid NOT NULL,
  service_id uuid,
  building_node_id text,
  service_name text NOT NULL,
  service_path text[] DEFAULT '{}'::text[],
  brand_id uuid,
  brand_name text,
  reliability_factor numeric DEFAULT 1.0 NOT NULL,
  condition text,
  condition_factor numeric DEFAULT 1.0 NOT NULL,
  frequency text DEFAULT 'monthly'::text NOT NULL,
  quantity integer DEFAULT 1 NOT NULL,
  base_price numeric DEFAULT 0 NOT NULL,
  unit_price numeric DEFAULT 0 NOT NULL,
  total_price numeric DEFAULT 0 NOT NULL,
  divisions text[] DEFAULT '{}'::text[],
  note text,
  is_general boolean DEFAULT false NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  contract_type text DEFAULT 'preventive'::text,
  item_kind text DEFAULT 'service'::text,
  pricing_mode text DEFAULT 'by_condition'::text,
  discount numeric DEFAULT 0,
  discount_scope text DEFAULT 'services_only'::text,
  price_unit text,
  CONSTRAINT contract_services_pkey PRIMARY KEY (id),
  CONSTRAINT contract_services_contract_type_check CHECK ((contract_type = ANY (ARRAY['preventive'::text, 'area'::text, 'general'::text]))),
  CONSTRAINT contract_services_discount_check CHECK ((discount >= (0)::numeric)),
  CONSTRAINT contract_services_discount_scope_check CHECK ((discount_scope = ANY (ARRAY['services_only'::text, 'services_and_products'::text]))),
  CONSTRAINT contract_services_item_kind_check CHECK ((item_kind = ANY (ARRAY['service'::text, 'product'::text]))),
  CONSTRAINT contract_services_pricing_mode_check CHECK ((pricing_mode = ANY (ARRAY['fixed'::text, 'by_condition'::text])))
);

CREATE TABLE public.contract_visits (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  contract_id uuid NOT NULL,
  service_name text NOT NULL,
  scheduled_date date NOT NULL,
  team_id uuid,
  completed boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  contract_service_id uuid,
  CONSTRAINT contract_visits_pkey PRIMARY KEY (id)
);

CREATE TABLE public.contracts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  contract_id text,
  customer_id uuid,
  site_name text DEFAULT ''::text NOT NULL,
  divisions text[] DEFAULT '{}'::text[],
  services_summary text,
  agent_name text,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status contract_status DEFAULT 'active'::contract_status,
  monthly_value numeric DEFAULT 0,
  total_value numeric DEFAULT 0,
  total_visits integer DEFAULT 0,
  completed_visits integer DEFAULT 0,
  total_payments numeric DEFAULT 0,
  paid_amount numeric DEFAULT 0,
  payment_schedule text,
  has_signed_doc boolean DEFAULT false,
  area_count integer DEFAULT 0,
  cancelled_date date,
  cancel_reason text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  quotation_number text,
  source_type text DEFAULT 'direct'::text NOT NULL,
  building_tree jsonb DEFAULT '{"nodes": []}'::jsonb NOT NULL,
  discount numeric DEFAULT 0 NOT NULL,
  payment_mode text DEFAULT 'fixed'::text NOT NULL,
  payment_frequency text DEFAULT 'monthly'::text NOT NULL,
  notes text,
  signed_doc_url text,
  terms_snapshot jsonb,
  approved_by uuid,
  approved_at timestamp with time zone,
  sent_at timestamp with time zone,
  created_by uuid,
  rejected_reason text,
  rejected_by uuid,
  rejected_at timestamp with time zone,
  last_saved_session text,
  service_customer_id uuid,
  phone_id uuid,
  terms_pdf_url text,
  customer_name text,
  phone text,
  address text,
  CONSTRAINT contracts_pkey PRIMARY KEY (id),
  CONSTRAINT contracts_contract_id_key UNIQUE (contract_id),
  CONSTRAINT contracts_quotation_number_key UNIQUE (quotation_number)
);

CREATE TABLE public.country_codes (
  id integer DEFAULT nextval('country_codes_id_seq'::regclass) NOT NULL,
  code text NOT NULL,
  iso text NOT NULL,
  flag text NOT NULL,
  name text NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  sort_order integer DEFAULT 999 NOT NULL,
  CONSTRAINT country_codes_pkey PRIMARY KEY (id),
  CONSTRAINT country_codes_code_key UNIQUE (code)
);

CREATE TABLE public.credit_group_payment_methods (
  credit_group_id uuid NOT NULL,
  payment_method_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT credit_group_payment_methods_pkey PRIMARY KEY (credit_group_id, payment_method_id)
);

CREATE TABLE public.credit_groups (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  credit_limit numeric DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  max_days integer,
  default_payment_terms text,
  CONSTRAINT credit_groups_pkey PRIMARY KEY (id),
  CONSTRAINT credit_groups_name_key UNIQUE (name),
  CONSTRAINT credit_groups_default_payment_terms_chk CHECK (((default_payment_terms IS NULL) OR (default_payment_terms = ANY (ARRAY['100% Advance'::text, '100% After Delivery'::text, '50/50'::text, 'Net 30'::text, 'Net 60'::text, 'Custom'::text]))))
);

CREATE TABLE public.credit_note_lines (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  credit_note_id uuid NOT NULL,
  invoice_line_id uuid,
  description text,
  qty numeric(10,2) NOT NULL,
  unit_price numeric(12,2) NOT NULL,
  total numeric(12,2) GENERATED ALWAYS AS ((qty * unit_price)) STORED,
  created_at timestamp with time zone DEFAULT now(),
  sku text,
  line_type credit_debit_line_type DEFAULT 'returned'::credit_debit_line_type NOT NULL,
  condition text,
  condition_notes text,
  CONSTRAINT credit_note_lines_pkey PRIMARY KEY (id)
);

CREATE TABLE public.credit_notes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  credit_note_id text NOT NULL,
  invoice_id uuid,
  customer_name text,
  reason text NOT NULL,
  total_amount numeric DEFAULT 0 NOT NULL,
  status credit_note_status DEFAULT 'open'::credit_note_status,
  refund_method text,
  refund_reference text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  source_return_id uuid,
  original_total numeric,
  new_total numeric,
  pdf_url text,
  resolution_type credit_note_resolution_type,
  reason_id uuid,
  customer_id uuid,
  refund_method_id uuid,
  CONSTRAINT credit_notes_pkey PRIMARY KEY (id),
  CONSTRAINT credit_notes_credit_note_id_key UNIQUE (credit_note_id)
);

CREATE TABLE public.currencies (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  code text NOT NULL,
  name text,
  symbol text,
  is_active boolean DEFAULT true NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT currencies_pkey PRIMARY KEY (id),
  CONSTRAINT currencies_code_key UNIQUE (code)
);

CREATE TABLE public.custom_roles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  color text DEFAULT 'bg-primary/15 text-primary border-primary/30'::text,
  permissions text[] DEFAULT '{}'::text[] NOT NULL,
  is_system_admin boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid,
  deleted_at timestamp with time zone,
  is_approval_slot boolean DEFAULT false NOT NULL,
  is_inventory_receiver boolean DEFAULT false NOT NULL,
  CONSTRAINT custom_roles_pkey PRIMARY KEY (id),
  CONSTRAINT custom_roles_name_key UNIQUE (name)
);

CREATE TABLE public.customer_addresses (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  customer_id uuid NOT NULL,
  label text,
  address_type address_type NOT NULL,
  unit_no text,
  building_no text,
  street_no text,
  zone_no text,
  lat numeric,
  lng numeric,
  created_at timestamp with time zone DEFAULT now(),
  phone_id uuid,
  is_primary boolean DEFAULT false NOT NULL,
  blue_plate_no character varying,
  CONSTRAINT customer_addresses_pkey PRIMARY KEY (id)
);

CREATE TABLE public.customer_blocks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  customer_id uuid NOT NULL,
  reason text NOT NULL,
  notes text,
  image_url text,
  blocked_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT customer_blocks_pkey PRIMARY KEY (id)
);

CREATE TABLE public.customer_credit_docs (
  customer_id uuid NOT NULL,
  cr_url text,
  establishment_id_url text,
  signed_credit_form_url text,
  CONSTRAINT customer_credit_docs_new_pkey PRIMARY KEY (customer_id)
);

CREATE TABLE public.customer_credit_group_approvals (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  request_id uuid NOT NULL,
  step_role text NOT NULL,
  step_order integer NOT NULL,
  status approval_status DEFAULT 'pending'::approval_status NOT NULL,
  decided_by uuid,
  decided_by_name text,
  decided_at timestamp with time zone,
  is_active boolean DEFAULT true NOT NULL,
  iteration integer DEFAULT 1 NOT NULL,
  comment text,
  reason text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  force_approved boolean DEFAULT false NOT NULL,
  force_comment text,
  CONSTRAINT customer_credit_group_approvals_pkey PRIMARY KEY (id)
);

CREATE TABLE public.customer_credit_group_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  customer_id uuid NOT NULL,
  requested_group_id uuid NOT NULL,
  previous_group_id uuid,
  status credit_group_request_status DEFAULT 'pending'::credit_group_request_status NOT NULL,
  requested_by uuid,
  decided_by uuid,
  decided_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT customer_credit_group_requests_pkey PRIMARY KEY (id)
);

CREATE TABLE public.customer_phones (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  customer_id uuid NOT NULL,
  phone character varying(20) NOT NULL,
  label character varying(50),
  is_primary boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT customer_phones_pkey PRIMARY KEY (id),
  CONSTRAINT customer_phones_phone_unique UNIQUE (phone)
);

CREATE TABLE public.customer_subscriptions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  customer_id uuid NOT NULL,
  package_id uuid NOT NULL,
  price_paid numeric(10,2) NOT NULL,
  discount_percent_snapshot numeric(5,2) NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  auto_renew boolean DEFAULT true NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  dibsy_payment_id text,
  dibsy_checkout_url text,
  CONSTRAINT customer_subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT chk_cs_date_range CHECK ((end_date >= start_date)),
  CONSTRAINT customer_subscriptions_status_check CHECK ((status = ANY (ARRAY['pending_payment'::text, 'active'::text, 'expired'::text, 'cancelled'::text])))
);

CREATE TABLE public.customers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  name_ar text,
  email text,
  block_reason text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  credit_group_id uuid,
  entity_type customer_entity_type DEFAULT 'individual'::customer_entity_type,
  is_active boolean DEFAULT true NOT NULL,
  address text,
  latitude numeric,
  longitude numeric,
  CONSTRAINT customers_pkey PRIMARY KEY (id)
);

CREATE TABLE public.debit_note_lines (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  debit_note_id uuid NOT NULL,
  description text,
  sku text,
  qty numeric NOT NULL,
  unit_price numeric NOT NULL,
  total numeric GENERATED ALWAYS AS ((qty * unit_price)) STORED,
  line_type credit_debit_line_type DEFAULT 'returned'::credit_debit_line_type NOT NULL,
  condition text,
  condition_notes text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT debit_note_lines_pkey PRIMARY KEY (id)
);

CREATE TABLE public.debit_notes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  debit_note_id text NOT NULL,
  bill_id uuid,
  purchase_order_id uuid,
  supplier_name text,
  reason text NOT NULL,
  status credit_note_status DEFAULT 'open'::credit_note_status,
  total_amount numeric DEFAULT 0 NOT NULL,
  original_total numeric,
  new_total numeric,
  source_return_id uuid,
  resolution_type text,
  pdf_url text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  reason_id uuid,
  supplier_id uuid,
  remaining_amount numeric,
  CONSTRAINT debit_notes_pkey PRIMARY KEY (id),
  CONSTRAINT debit_notes_remaining_amount_non_negative CHECK (((remaining_amount IS NULL) OR (remaining_amount >= (0)::numeric))),
  CONSTRAINT debit_notes_resolution_type_check CHECK ((resolution_type = ANY (ARRAY['supplier_credit'::text, 'replacement'::text])))
);

CREATE TABLE public.disciplines (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT disciplines_pkey PRIMARY KEY (id),
  CONSTRAINT disciplines_name_key UNIQUE (name)
);

CREATE TABLE public.document_terms (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  document_type text NOT NULL,
  content_ar text DEFAULT ''::text NOT NULL,
  content_en text DEFAULT ''::text NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  division_id uuid,
  CONSTRAINT document_terms_pkey PRIMARY KEY (id)
);

CREATE TABLE public.employee_services (
  employee_id uuid NOT NULL,
  service_id uuid NOT NULL,
  CONSTRAINT employee_services_pkey PRIMARY KEY (employee_id, service_id)
);

CREATE TABLE public.employees (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  name_ar text,
  phone text NOT NULL,
  skills text[] DEFAULT '{}'::text[],
  status employee_status DEFAULT 'active'::employee_status,
  team_id uuid,
  avatar text,
  join_date date NOT NULL,
  nationality text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  site_visit_order boolean DEFAULT false NOT NULL,
  site_visit_quotation boolean DEFAULT false NOT NULL,
  avatar_url text,
  deleted_at timestamp with time zone,
  division_id uuid,
  profile_id uuid,
  CONSTRAINT employees_pkey PRIMARY KEY (id)
);

CREATE TABLE public.exchange_rate_change_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  document_type text NOT NULL,
  document_id uuid NOT NULL,
  old_rate numeric NOT NULL,
  new_rate numeric NOT NULL,
  reason text NOT NULL,
  changed_by uuid,
  changed_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT exchange_rate_change_log_pkey PRIMARY KEY (id),
  CONSTRAINT exchange_rate_change_log_document_type_check CHECK ((document_type = ANY (ARRAY['purchase_order'::text, 'sale_order'::text]))),
  CONSTRAINT exchange_rate_change_log_new_rate_positive CHECK ((new_rate > (0)::numeric)),
  CONSTRAINT exchange_rate_change_log_reason_len CHECK ((char_length(TRIM(BOTH FROM reason)) >= 5))
);

CREATE TABLE public.fifo_cost_layers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  brand_variant_id uuid NOT NULL,
  receival_number text,
  date date NOT NULL,
  qty integer NOT NULL,
  unit_cost numeric NOT NULL,
  landed_cost_per_unit numeric DEFAULT 0,
  total_unit_cost numeric NOT NULL,
  remaining_qty integer NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  warehouse_id uuid,
  source_type text DEFAULT 'receival'::text,
  receival_id uuid,
  source_id uuid,
  source_currency text DEFAULT 'QAR'::text NOT NULL,
  source_exchange_rate numeric DEFAULT 1 NOT NULL,
  sub_container_id uuid NOT NULL,
  CONSTRAINT fifo_cost_layers_pkey PRIMARY KEY (id)
);

CREATE TABLE public.follow_up_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  request_number text NOT NULL,
  parent_order_id uuid NOT NULL,
  requested_by_user_id uuid NOT NULL,
  requested_team_id uuid NOT NULL,
  requested_date date,
  requested_time_from time without time zone,
  requested_time_to time without time zone,
  time_note text,
  services_to_followup jsonb NOT NULL,
  notes text,
  status follow_up_request_status DEFAULT 'pending'::follow_up_request_status NOT NULL,
  confirmed_by_user_id uuid,
  confirmed_at timestamp with time zone,
  resulting_order_id uuid,
  cancelled_reason text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT follow_up_requests_pkey PRIMARY KEY (id),
  CONSTRAINT follow_up_requests_request_number_key UNIQUE (request_number),
  CONSTRAINT chk_fur_time_pair CHECK (((requested_time_from IS NULL) = (requested_time_to IS NULL))),
  CONSTRAINT chk_fur_when_present CHECK ((((requested_date IS NOT NULL) AND (requested_time_from IS NOT NULL)) OR (time_note IS NOT NULL)))
);

CREATE TABLE public.installed_products (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  customer_id uuid NOT NULL,
  phone_id uuid NOT NULL,
  address_id uuid,
  order_id uuid NOT NULL,
  product_name character varying(255) NOT NULL,
  brand character varying(100),
  model character varying(100),
  serial_number character varying(100),
  installed_at date NOT NULL,
  warranty_months integer DEFAULT 0 NOT NULL,
  warranty_expires_at date,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT installed_products_pkey PRIMARY KEY (id)
);

CREATE TABLE public.instructions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name_en text NOT NULL,
  name_ar text,
  type instruction_type NOT NULL,
  content_type instruction_content_type DEFAULT 'text'::instruction_content_type,
  content_preview text,
  full_content text,
  pdf_file_name text,
  linked_service_ids uuid[] DEFAULT '{}'::uuid[],
  status service_status DEFAULT 'active'::service_status,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT instructions_pkey PRIMARY KEY (id)
);

CREATE TABLE public.inventory_attribute_definitions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  category_id uuid NOT NULL,
  attribute_key text NOT NULL,
  label_en text NOT NULL,
  label_ar text,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid,
  CONSTRAINT inventory_attribute_definitions_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_attribute_definitions_category_id_attribute_key_key UNIQUE (category_id, attribute_key)
);

CREATE TABLE public.inventory_attribute_options (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  definition_id uuid NOT NULL,
  value_en text NOT NULL,
  value_ar text,
  sort_order integer DEFAULT 0 NOT NULL,
  is_archived boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT inventory_attribute_options_pkey PRIMARY KEY (id)
);

CREATE TABLE public.inventory_categories (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name_en text NOT NULL,
  name_ar text,
  sku text,
  type inventory_type NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  status text DEFAULT 'active'::text NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  parent_id uuid,
  default_sub_container_id uuid,
  default_warranty_policy_id uuid,
  tool_tracking_mode tool_tracking_mode DEFAULT 'bulk'::tool_tracking_mode NOT NULL,
  is_team_item boolean DEFAULT false NOT NULL,
  CONSTRAINT inventory_categories_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_categories_status_check CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text])))
);

CREATE TABLE public.inventory_category_divisions (
  category_id uuid NOT NULL,
  division_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid,
  CONSTRAINT inventory_category_divisions_pkey PRIMARY KEY (category_id, division_id)
);

CREATE TABLE public.inventory_check_approvals (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  check_id uuid NOT NULL,
  step_order integer NOT NULL,
  step_role text NOT NULL,
  step_label text NOT NULL,
  profile_id uuid,
  profile_name text,
  status text DEFAULT 'pending'::text NOT NULL,
  action_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT inventory_check_approvals_pkey PRIMARY KEY (id),
  CONSTRAINT inv_check_approvals_rejected_needs_notes_chk CHECK (((status <> 'rejected'::text) OR (COALESCE(TRIM(BOTH FROM notes), ''::text) <> ''::text))),
  CONSTRAINT inventory_check_approvals_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);

CREATE TABLE public.inventory_check_assignments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  check_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  profile_name text NOT NULL,
  assigned_categories text[] DEFAULT '{}'::text[] NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT inventory_check_assignments_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_check_assignments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'completed'::text])))
);

CREATE TABLE public.inventory_check_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  check_id uuid NOT NULL,
  brand_variant_id uuid NOT NULL,
  item_name text NOT NULL,
  brand text NOT NULL,
  sku text,
  system_qty numeric DEFAULT 0 NOT NULL,
  counted_qty numeric,
  is_counted boolean DEFAULT false NOT NULL,
  variance numeric GENERATED ALWAYS AS ((COALESCE(counted_qty, (0)::numeric) - system_qty)) STORED,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  assignment_id uuid,
  category_name text,
  variance_type text,
  system_qty_at_close numeric,
  country_name text,
  CONSTRAINT inventory_check_items_pkey PRIMARY KEY (id)
);

CREATE TABLE public.inventory_check_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  check_id uuid NOT NULL,
  event_type inventory_check_event_type NOT NULL,
  profile_id uuid,
  profile_name text,
  meta jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT inventory_check_log_pkey PRIMARY KEY (id)
);

CREATE TABLE public.inventory_checks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  check_number text NOT NULL,
  warehouse_id uuid NOT NULL,
  warehouse_name text DEFAULT ''::text NOT NULL,
  status text DEFAULT 'draft'::text NOT NULL,
  reviewed_by_name text,
  reviewed_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  initiated_by_profile_id uuid,
  initiated_by_name text,
  started_at timestamp with time zone,
  sub_container_id uuid,
  CONSTRAINT inventory_checks_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_checks_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'in_progress'::text, 'submitted'::text, 'reviewed'::text, 'pending_approval'::text, 'approved'::text, 'rejected'::text, 'completed'::text, 'cancelled'::text])))
);

CREATE TABLE public.inventory_damaged_movements (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  movement_type text NOT NULL,
  qty numeric NOT NULL,
  warehouse_id uuid NOT NULL,
  brand_variant_id uuid NOT NULL,
  unit_cost numeric DEFAULT 0 NOT NULL,
  source_return_line_disposition_id uuid,
  source_transfer_id uuid,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid,
  division_id uuid,
  CONSTRAINT inventory_damaged_movements_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_damaged_movements_movement_type_check CHECK ((movement_type = ANY (ARRAY['restock_as_damaged_in'::text, 'send_for_repair_out'::text, 'return_from_repair_as_writeoff'::text, 'damaged_write_off'::text, 'damaged_adjust'::text]))),
  CONSTRAINT inventory_damaged_movements_qty_check CHECK ((qty > (0)::numeric))
);

CREATE TABLE public.inventory_damaged_stock (
  warehouse_id uuid NOT NULL,
  brand_variant_id uuid NOT NULL,
  qty numeric DEFAULT 0 NOT NULL,
  weighted_unit_cost numeric DEFAULT 0 NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT inventory_damaged_stock_pkey PRIMARY KEY (warehouse_id, brand_variant_id),
  CONSTRAINT inventory_damaged_stock_qty_check CHECK ((qty >= (0)::numeric)),
  CONSTRAINT inventory_damaged_stock_weighted_unit_cost_check CHECK ((weighted_unit_cost >= (0)::numeric))
);

CREATE TABLE public.inventory_damaged_stock_layers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  warehouse_id uuid NOT NULL,
  brand_variant_id uuid NOT NULL,
  qty_received numeric NOT NULL,
  qty_remaining numeric NOT NULL,
  unit_cost numeric NOT NULL,
  source_return_line_id uuid,
  layered_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid,
  division_id uuid,
  CONSTRAINT inventory_damaged_stock_layers_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_damaged_stock_layers_qty_received_check CHECK ((qty_received > (0)::numeric)),
  CONSTRAINT inventory_damaged_stock_layers_qty_remaining_check CHECK ((qty_remaining >= (0)::numeric)),
  CONSTRAINT inventory_damaged_stock_layers_unit_cost_check CHECK ((unit_cost >= (0)::numeric))
);

CREATE TABLE public.inventory_item_attributes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  item_id uuid NOT NULL,
  definition_id uuid NOT NULL,
  option_id uuid NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_by uuid,
  CONSTRAINT inventory_item_attributes_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_item_attributes_item_id_definition_id_key UNIQUE (item_id, definition_id)
);

CREATE TABLE public.inventory_item_brand_variants (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  item_id uuid NOT NULL,
  brand text NOT NULL,
  code text,
  cost_price numeric DEFAULT 0,
  selling_price numeric DEFAULT 0,
  stock_level integer DEFAULT 0,
  incoming integer DEFAULT 0,
  average_cost numeric,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  reserved_qty integer DEFAULT 0 NOT NULL,
  linked_services_count integer DEFAULT 0 NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  reorder_point integer DEFAULT 0 NOT NULL,
  damaged_qty integer DEFAULT 0 NOT NULL,
  brand_id uuid,
  country_id integer,
  CONSTRAINT inventory_brand_variants_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_brand_variants_status_check CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text])))
);

CREATE TABLE public.inventory_item_divisions (
  item_id uuid NOT NULL,
  division_id uuid NOT NULL,
  category_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid,
  tool_tracking_mode tool_tracking_mode,
  CONSTRAINT inventory_item_divisions_pkey PRIMARY KEY (item_id, division_id)
);

CREATE TABLE public.inventory_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  category_id uuid NOT NULL,
  name_en text NOT NULL,
  name_ar text,
  sku text NOT NULL,
  unit text NOT NULL,
  cost_price numeric DEFAULT 0,
  linked_services_count integer DEFAULT 0,
  total_stock integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  status text DEFAULT 'active'::text NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  default_sub_container_id uuid,
  default_warehouse_id uuid,
  image_url text,
  warranty_policy_id uuid,
  specification text,
  po_specification_default boolean DEFAULT false NOT NULL,
  is_team_item boolean,
  CONSTRAINT inventory_items_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_items_status_check CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text])))
);

CREATE TABLE public.inventory_stock_movements (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  warehouse_id uuid,
  brand_variant_id uuid NOT NULL,
  item_name text NOT NULL,
  sku text,
  movement_type stock_movement_type NOT NULL,
  qty integer NOT NULL,
  unit_cost numeric DEFAULT 0 NOT NULL,
  reference_type text,
  reference_id uuid,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  sub_container_id uuid NOT NULL,
  source_id uuid,
  CONSTRAINT inventory_stock_movements_pkey PRIMARY KEY (id)
);

CREATE TABLE public.invoice_line_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  invoice_id uuid NOT NULL,
  description text NOT NULL,
  qty integer DEFAULT 1,
  unit_price numeric DEFAULT 0,
  total numeric DEFAULT 0,
  team_name text,
  created_at timestamp with time zone DEFAULT now(),
  brand_variant_id uuid,
  CONSTRAINT invoice_line_items_pkey PRIMARY KEY (id),
  CONSTRAINT invoice_line_items_qty_positive CHECK ((qty > 0)),
  CONSTRAINT invoice_line_items_unit_price_non_neg CHECK ((unit_price >= (0)::numeric))
);

CREATE TABLE public.invoices (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  invoice_id text NOT NULL,
  customer_id uuid,
  source invoice_source NOT NULL,
  source_id text NOT NULL,
  source_label text,
  issued_date date NOT NULL,
  due_date date NOT NULL,
  status invoice_status DEFAULT 'draft'::invoice_status,
  subtotal numeric DEFAULT 0,
  tax numeric DEFAULT 0,
  total_amount numeric DEFAULT 0,
  paid_amount numeric DEFAULT 0,
  agent_name text,
  division text,
  notes text,
  qb_synced boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  direction invoice_direction DEFAULT 'ar'::invoice_direction NOT NULL,
  supplier_id uuid,
  purchase_order_id uuid,
  receival_id uuid,
  sale_order_id uuid,
  sale_delivery_id uuid,
  needs_refresh boolean DEFAULT false NOT NULL,
  doc_status invoice_doc_status DEFAULT 'draft'::invoice_doc_status NOT NULL,
  payment_status invoice_payment_status DEFAULT 'unpaid'::invoice_payment_status NOT NULL,
  invoice_type invoice_type DEFAULT 'credit'::invoice_type NOT NULL,
  discount_amount numeric DEFAULT 0 NOT NULL,
  discount_label text,
  manually_paid boolean DEFAULT false NOT NULL,
  dibsy_payment_id text,
  dibsy_checkout_url text,
  phone_id uuid,
  pdf_url text
);

CREATE TABLE public.landed_cost_item_allocations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  landed_cost_id uuid NOT NULL,
  brand_variant_id uuid,
  item_name text DEFAULT 'Item'::text NOT NULL,
  sku text,
  qty_received integer DEFAULT 0 NOT NULL,
  qty_remaining_at_lc integer DEFAULT 0 NOT NULL,
  sold_qty integer DEFAULT 0 NOT NULL,
  original_unit_cost numeric DEFAULT 0 NOT NULL,
  lc_per_unit numeric DEFAULT 0 NOT NULL,
  updated_unit_cost numeric DEFAULT 0 NOT NULL,
  allocated_lc_total numeric DEFAULT 0 NOT NULL,
  inventory_portion numeric DEFAULT 0 NOT NULL,
  cogs_portion numeric DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT landed_cost_item_allocations_pkey PRIMARY KEY (id)
);

CREATE TABLE public.landed_cost_lines (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  landed_cost_id uuid NOT NULL,
  description text DEFAULT ''::text NOT NULL,
  amount numeric DEFAULT 0 NOT NULL,
  currency text DEFAULT 'QAR'::text NOT NULL,
  exchange_rate numeric DEFAULT 1 NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  bill_path text,
  currency_id uuid,
  CONSTRAINT landed_cost_lines_pkey PRIMARY KEY (id)
);

CREATE TABLE public.landed_costs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  lc_number text NOT NULL,
  description text,
  total_amount numeric DEFAULT 0,
  currency text DEFAULT 'QAR'::text,
  attached_receival_ids uuid[] DEFAULT '{}'::uuid[],
  attached_po_ids uuid[] DEFAULT '{}'::uuid[],
  all_items_sold boolean DEFAULT false,
  date date NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  voided_at timestamp with time zone,
  voided_reason text,
  applied_at timestamp with time zone,
  revert_snapshot jsonb,
  currency_id uuid,
  CONSTRAINT landed_costs_pkey PRIMARY KEY (id),
  CONSTRAINT landed_costs_lc_number_key UNIQUE (lc_number)
);

CREATE TABLE public.media_download_jobs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  message_id uuid NOT NULL,
  attachment_index integer NOT NULL,
  status text DEFAULT 'queued'::text NOT NULL,
  attempts integer DEFAULT 0 NOT NULL,
  last_error text,
  scheduled_for timestamp with time zone DEFAULT now() NOT NULL,
  claimed_at timestamp with time zone,
  done_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT media_download_jobs_pkey PRIMARY KEY (id),
  CONSTRAINT media_download_jobs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'in_progress'::text, 'done'::text, 'failed'::text])))
);

CREATE TABLE public.notification_config (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  slug text NOT NULL,
  label text NOT NULL,
  label_ar text,
  category notification_category NOT NULL,
  trigger_type notification_trigger NOT NULL,
  timing_description text,
  template_slug text NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  requires_portal boolean DEFAULT false NOT NULL,
  portal_purpose text,
  has_media_followup boolean DEFAULT false NOT NULL,
  media_description text,
  sort_order integer DEFAULT 0 NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid,
  CONSTRAINT notification_config_pkey PRIMARY KEY (id),
  CONSTRAINT notification_config_slug_key UNIQUE (slug)
);

CREATE TABLE public.notification_templates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  slug text NOT NULL,
  wati_template_name text DEFAULT ''::text NOT NULL,
  description text,
  media_type text DEFAULT 'none'::text NOT NULL,
  has_buttons boolean DEFAULT false NOT NULL,
  button_type text,
  button_url_suffix_param text,
  param_count integer DEFAULT 0 NOT NULL,
  param_names jsonb DEFAULT '[]'::jsonb,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid,
  body_text text,
  CONSTRAINT notification_templates_pkey PRIMARY KEY (id),
  CONSTRAINT notification_templates_slug_key UNIQUE (slug)
);

CREATE TABLE public.notifications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  profile_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  related_id uuid,
  related_type text,
  read_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  actioned_at timestamp with time zone,
  CONSTRAINT notifications_pkey PRIMARY KEY (id)
);

CREATE TABLE public.order_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  order_id uuid NOT NULL,
  action text NOT NULL,
  user_name text,
  details text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT order_log_pkey PRIMARY KEY (id)
);

CREATE TABLE public.order_quotation_line_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  quotation_id uuid NOT NULL,
  service_id uuid,
  name text NOT NULL,
  path text[] DEFAULT '{}'::text[] NOT NULL,
  qty integer DEFAULT 1 NOT NULL,
  price numeric NOT NULL,
  duration integer,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT quotation_line_items_pkey PRIMARY KEY (id)
);

CREATE TABLE public.order_quotation_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  quotation_id uuid NOT NULL,
  action text NOT NULL,
  user_name text,
  details text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT quotation_log_pkey PRIMARY KEY (id)
);

CREATE TABLE public.order_quotations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  quotation_id text NOT NULL,
  customer_id uuid,
  division text,
  services_summary text,
  agent_name text,
  created_date date NOT NULL,
  expiry_date date NOT NULL,
  sent_date timestamp with time zone,
  status order_quotation_status DEFAULT 'draft'::order_quotation_status,
  total_amount numeric DEFAULT 0,
  line_item_count integer DEFAULT 0,
  has_configurable boolean DEFAULT false,
  converted_order_id uuid,
  approved_by_manager boolean DEFAULT false,
  approved_by_customer boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  notes text,
  service_customer_id uuid NOT NULL,
  discount_type text DEFAULT 'flat'::text NOT NULL,
  discount_value numeric(12,2) DEFAULT 0 NOT NULL,
  CONSTRAINT quotations_pkey PRIMARY KEY (id),
  CONSTRAINT quotations_quotation_id_key UNIQUE (quotation_id),
  CONSTRAINT quotations_discount_type_check CHECK ((discount_type = ANY (ARRAY['flat'::text, 'percent'::text])))
);

CREATE TABLE public.order_services (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  order_id uuid NOT NULL,
  service_id uuid,
  name text NOT NULL,
  path text[] DEFAULT '{}'::text[],
  qty integer DEFAULT 1,
  price numeric DEFAULT 0,
  duration integer,
  configuration jsonb,
  created_at timestamp with time zone DEFAULT now(),
  from_time time without time zone,
  to_time time without time zone,
  CONSTRAINT order_services_pkey PRIMARY KEY (id)
);

CREATE TABLE public.order_team_assignments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  order_id uuid NOT NULL,
  team_id uuid NOT NULL,
  services jsonb NOT NULL,
  scheduled_date date NOT NULL,
  time_slot text,
  duration text,
  created_at timestamp with time zone DEFAULT now(),
  is_full_day boolean DEFAULT false NOT NULL,
  parent_assignment_id uuid,
  CONSTRAINT order_team_assignments_pkey PRIMARY KEY (id),
  CONSTRAINT uq_team_slot UNIQUE (team_id, scheduled_date, time_slot)
);

CREATE TABLE public.order_visit_dates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  order_id uuid NOT NULL,
  visit_date date NOT NULL,
  from_time time without time zone,
  to_time time without time zone,
  sort_order smallint DEFAULT 0 NOT NULL,
  CONSTRAINT order_visit_dates_pkey PRIMARY KEY (id),
  CONSTRAINT order_visit_dates_order_id_visit_date_key UNIQUE (order_id, visit_date)
);

CREATE TABLE public.orders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  order_id text NOT NULL,
  customer_id uuid,
  type text DEFAULT 'order'::text,
  division text NOT NULL,
  status order_status DEFAULT 'scheduled'::order_status,
  confirmation_status confirmation_status DEFAULT 'not_sent'::confirmation_status,
  confirmation_sent_at timestamp with time zone,
  scheduled_date date NOT NULL,
  scheduled_end_date date,
  scheduled_time text,
  visit_date date,
  total_amount numeric DEFAULT 0,
  agent_name text,
  notes text,
  address text,
  has_invoice boolean DEFAULT false,
  invoice_number text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  arrival_phone text,
  attachments jsonb DEFAULT '[]'::jsonb,
  service_customer_id uuid NOT NULL,
  address_id uuid,
  completed_at timestamp with time zone,
  completed_by uuid,
  parent_order_id uuid,
  follow_up_request_id uuid,
  confirmation_pdf_url text,
  created_by uuid,
  CONSTRAINT orders_pkey PRIMARY KEY (id),
  CONSTRAINT orders_order_id_key UNIQUE (order_id)
);

CREATE TABLE public.payment_bill_allocations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  payment_id uuid NOT NULL,
  bill_id uuid NOT NULL,
  amount numeric NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT payment_bill_allocations_pkey PRIMARY KEY (id),
  CONSTRAINT payment_bill_allocations_payment_id_bill_id_key UNIQUE (payment_id, bill_id),
  CONSTRAINT payment_bill_allocations_amount_check CHECK ((amount > (0)::numeric))
);

CREATE TABLE public.payment_installments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  plan_id uuid NOT NULL,
  due_date date,
  amount numeric(12,2) NOT NULL,
  paid_amount numeric(12,2) DEFAULT 0 NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  payment_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT payment_installments_pkey PRIMARY KEY (id),
  CONSTRAINT payment_installments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'overdue'::text, 'partial'::text])))
);

CREATE TABLE public.payment_methods (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  requires_payment_link boolean DEFAULT false NOT NULL,
  is_cash_equivalent boolean DEFAULT false NOT NULL,
  CONSTRAINT payment_methods_pkey PRIMARY KEY (id),
  CONSTRAINT payment_methods_slug_key UNIQUE (slug)
);

CREATE TABLE public.payment_plans (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  invoice_id uuid,
  plan_type text NOT NULL,
  total_amount numeric(12,2) NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  bill_id uuid,
  CONSTRAINT payment_plans_pkey PRIMARY KEY (id),
  CONSTRAINT payment_plans_plan_type_check CHECK ((plan_type = ANY (ARRAY['schedule'::text, 'adhoc'::text]))),
  CONSTRAINT payment_plans_status_check CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'cancelled'::text])))
);

CREATE TABLE public.payments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  payment_id text,
  invoice_id uuid,
  amount numeric NOT NULL,
  method text NOT NULL,
  status payment_status DEFAULT 'pending'::payment_status,
  date date NOT NULL,
  reference text,
  cheque_number text,
  cheque_date date,
  bank_name text,
  transaction_id text,
  agent_name text,
  notes text,
  qb_synced boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  direction payment_direction DEFAULT 'incoming'::payment_direction NOT NULL,
  source_type payment_source_type,
  source_id uuid,
  supplier_id uuid,
  currency text DEFAULT 'QAR'::text NOT NULL,
  exchange_rate numeric DEFAULT 1 NOT NULL,
  amount_qar numeric,
  deleted_at timestamp with time zone,
  customer_id uuid,
  bill_id uuid,
  credit_note_id uuid,
  currency_id uuid,
  method_id uuid,
  exchange_gain numeric DEFAULT 0 NOT NULL,
  exchange_loss numeric DEFAULT 0 NOT NULL,
  debit_note_id uuid,
  CONSTRAINT payments_pkey PRIMARY KEY (id),
  CONSTRAINT payments_payment_id_key UNIQUE (payment_id)
);

CREATE TABLE public.po_approval_chain_tiers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  chain_id uuid NOT NULL,
  rank integer NOT NULL,
  min_amount numeric NOT NULL,
  max_amount numeric,
  required_roles text[] NOT NULL,
  deleted_at timestamp with time zone,
  CONSTRAINT approval_chain_tiers_pkey PRIMARY KEY (id),
  CONSTRAINT approval_chain_tiers_chain_id_rank_key UNIQUE (chain_id, rank),
  CONSTRAINT chk_amount_range CHECK (((max_amount IS NULL) OR (max_amount > min_amount))),
  CONSTRAINT chk_required_roles_nonempty CHECK ((cardinality(required_roles) > 0))
);

CREATE TABLE public.po_approval_chains (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  division_id uuid,
  name text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  archived_at timestamp with time zone,
  CONSTRAINT approval_chains_pkey PRIMARY KEY (id),
  CONSTRAINT approval_chains_division_id_key UNIQUE (division_id)
);

CREATE TABLE public.po_approvals (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  po_id uuid NOT NULL,
  role text NOT NULL,
  status approval_status DEFAULT 'pending'::approval_status,
  approved_by text,
  date date,
  comment text,
  created_at timestamp with time zone DEFAULT now(),
  tier_rank integer DEFAULT 1 NOT NULL,
  is_active boolean DEFAULT false NOT NULL,
  iteration integer DEFAULT 1 NOT NULL,
  force_approved boolean DEFAULT false NOT NULL,
  force_comment text,
  CONSTRAINT po_approvals_pkey PRIMARY KEY (id),
  CONSTRAINT po_approvals_rejected_needs_comment_chk CHECK (((status <> 'rejected'::approval_status) OR (COALESCE(TRIM(BOTH FROM comment), ''::text) <> ''::text)))
);

CREATE TABLE public.po_edit_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  po_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  reason text NOT NULL,
  status po_edit_request_status DEFAULT 'pending'::po_edit_request_status NOT NULL,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  review_comment text,
  used_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT po_edit_requests_pkey PRIMARY KEY (id)
);

CREATE TABLE public.po_line_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  po_id uuid NOT NULL,
  item_name text NOT NULL,
  sku text,
  qty integer NOT NULL,
  received_qty integer DEFAULT 0,
  unit text NOT NULL,
  unit_price numeric NOT NULL,
  total_price numeric NOT NULL,
  fifo_layers jsonb,
  created_at timestamp with time zone DEFAULT now(),
  brand_variant_id uuid,
  free_qty integer DEFAULT 0 NOT NULL,
  brand_id uuid,
  show_specification boolean DEFAULT false NOT NULL,
  division_id uuid,
  CONSTRAINT po_line_items_pkey PRIMARY KEY (id),
  CONSTRAINT po_line_items_qty_positive CHECK ((qty > 0)),
  CONSTRAINT po_line_items_unit_price_non_neg CHECK ((unit_price >= (0)::numeric))
);

CREATE TABLE public.po_rfq_quote_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  quote_id uuid NOT NULL,
  po_line_item_id uuid NOT NULL,
  quoted_price numeric DEFAULT 0 NOT NULL,
  quoted_qty integer,
  notes text,
  CONSTRAINT po_rfq_quote_items_pkey PRIMARY KEY (id)
);

CREATE TABLE public.po_rfq_quotes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  po_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  currency text DEFAULT 'QAR'::text NOT NULL,
  total_amount numeric DEFAULT 0,
  status text DEFAULT 'pending'::text NOT NULL,
  received_date date,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  currency_id uuid,
  CONSTRAINT po_rfq_quotes_pkey PRIMARY KEY (id),
  CONSTRAINT po_rfq_quotes_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'received'::text, 'awarded'::text, 'rejected'::text])))
);

CREATE TABLE public.po_version_lines (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  po_version_id uuid NOT NULL,
  item_name text NOT NULL,
  sku text,
  qty integer DEFAULT 0 NOT NULL,
  received_qty integer DEFAULT 0,
  unit text DEFAULT 'pcs'::text NOT NULL,
  unit_price numeric DEFAULT 0 NOT NULL,
  total_price numeric DEFAULT 0 NOT NULL,
  brand_variant_id uuid,
  free_qty integer DEFAULT 0 NOT NULL,
  brand_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT po_version_lines_pkey PRIMARY KEY (id)
);

CREATE TABLE public.po_versions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  po_id uuid NOT NULL,
  version_number integer NOT NULL,
  submitted_at timestamp with time zone DEFAULT now() NOT NULL,
  submitted_by uuid,
  supplier_name text NOT NULL,
  currency text NOT NULL,
  exchange_rate numeric NOT NULL,
  subtotal numeric NOT NULL,
  discount_amount numeric DEFAULT 0 NOT NULL,
  discount_label text,
  payment_terms text,
  payment_terms_notes text,
  payment_milestones jsonb,
  delivery_terms text,
  delivery_terms_notes text,
  expected_delivery date,
  vendor_notes text,
  snapshot_label text DEFAULT 'manual'::text NOT NULL,
  stage po_stage NOT NULL,
  supplier_id uuid,
  currency_id uuid,
  CONSTRAINT po_versions_pkey PRIMARY KEY (id)
);

CREATE TABLE public.project_disciplines (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  project_id uuid NOT NULL,
  discipline_id uuid NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT project_disciplines_pkey PRIMARY KEY (id),
  CONSTRAINT project_disciplines_project_id_discipline_id_key UNIQUE (project_id, discipline_id)
);

CREATE TABLE public.project_milestones (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  sub_container_id uuid NOT NULL,
  label text NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  discipline_id uuid,
  CONSTRAINT project_milestones_pkey PRIMARY KEY (id)
);

CREATE TABLE public.projects (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  project_number text NOT NULL,
  name text NOT NULL,
  division_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  responsible_person_profile_id uuid,
  is_active boolean DEFAULT true NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT projects_pkey PRIMARY KEY (id),
  CONSTRAINT projects_division_id_project_number_key UNIQUE (division_id, project_number)
);

CREATE TABLE public.promotion_campaigns (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  description text,
  applicable_to text DEFAULT 'all'::text,
  divisions text[],
  start_date date NOT NULL,
  end_date date NOT NULL,
  status campaign_status DEFAULT 'scheduled'::campaign_status,
  created_by text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT promotion_campaigns_pkey PRIMARY KEY (id)
);

CREATE TABLE public.promotion_rules (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  campaign_id uuid NOT NULL,
  type promotion_rule_type NOT NULL,
  service_ids text[],
  discount_percent numeric,
  discount_amount numeric,
  free_service_id text,
  free_service_name text,
  description text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT promotion_rules_pkey PRIMARY KEY (id)
);

CREATE TABLE public.purchase_orders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  po_number text NOT NULL,
  supplier_name text NOT NULL,
  status po_status DEFAULT 'draft'::po_status,
  currency text DEFAULT 'QAR'::text,
  exchange_rate numeric DEFAULT 1,
  subtotal numeric DEFAULT 0,
  total_qar numeric DEFAULT 0,
  created_date date NOT NULL,
  expected_delivery date,
  approval_level integer DEFAULT 1,
  warehouse_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  payment_terms text,
  payment_terms_notes text,
  payment_milestones jsonb,
  delivery_terms text,
  delivery_terms_notes text,
  vendor_notes text,
  discount_amount numeric DEFAULT 0 NOT NULL,
  discount_label text,
  created_by uuid,
  deleted_at timestamp with time zone,
  version_number integer DEFAULT 1 NOT NULL,
  division_id uuid,
  po_type po_type DEFAULT 'draft'::po_type NOT NULL,
  pdf_rfq_url text,
  pdf_draft_url text,
  pdf_po_url text,
  pdf_confirmed_url text,
  pdf_payment_hash text,
  rfq_supplier_ids uuid[] DEFAULT '{}'::uuid[],
  supplier_id uuid,
  quote_deadline date,
  currency_id uuid,
  initial_exchange_rate numeric DEFAULT 1 NOT NULL,
  initial_rate_captured_at timestamp with time zone,
  initial_rate_captured_by uuid,
  exchange_gain numeric DEFAULT 0 NOT NULL,
  exchange_loss numeric DEFAULT 0 NOT NULL,
  exchange_net numeric GENERATED ALWAYS AS ((COALESCE(exchange_gain, (0)::numeric) - COALESCE(exchange_loss, (0)::numeric))) STORED,
  show_specifications boolean DEFAULT true NOT NULL,
  division_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  CONSTRAINT purchase_orders_pkey PRIMARY KEY (id),
  CONSTRAINT purchase_orders_po_number_key UNIQUE (po_number)
);

CREATE TABLE public.purge_batches (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  performed_by uuid NOT NULL,
  filter_payload jsonb NOT NULL,
  message_count integer NOT NULL,
  attachment_bytes bigint DEFAULT 0 NOT NULL,
  soft_deleted_at timestamp with time zone DEFAULT now() NOT NULL,
  hard_deleted_at timestamp with time zone,
  restored_at timestamp with time zone,
  CONSTRAINT purge_batches_pkey PRIMARY KEY (id)
);

CREATE TABLE public.qc_checklists (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  service_id uuid,
  service_name text,
  is_general boolean DEFAULT false,
  label text NOT NULL,
  max_score integer DEFAULT 10,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT qc_checklists_pkey PRIMARY KEY (id)
);

CREATE TABLE public.qc_inspection_results (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  schedule_entry_id uuid NOT NULL,
  order_id text NOT NULL,
  team_id uuid NOT NULL,
  qc_team_id uuid NOT NULL,
  date date NOT NULL,
  service_checklist jsonb DEFAULT '[]'::jsonb,
  general_checklist jsonb DEFAULT '[]'::jsonb,
  total_score integer DEFAULT 0,
  max_possible_score integer DEFAULT 0,
  percentage integer DEFAULT 0,
  notes text,
  images text[] DEFAULT '{}'::text[],
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT qc_inspection_results_pkey PRIMARY KEY (id)
);

CREATE TABLE public.qc_schedule (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  order_id text NOT NULL,
  order_type text DEFAULT 'one-time'::text,
  team_id uuid NOT NULL,
  service_name text NOT NULL,
  scheduled_date date NOT NULL,
  status qc_schedule_status DEFAULT 'pending'::qc_schedule_status,
  priority qc_priority DEFAULT 'medium'::qc_priority,
  reason text,
  assigned_qc_team_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT qc_schedule_pkey PRIMARY KEY (id)
);

CREATE TABLE public.qc_team_scores (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  team_id uuid NOT NULL,
  division division NOT NULL,
  current_score integer DEFAULT 0,
  total_inspections integer DEFAULT 0,
  last_inspection date,
  member_change_date date,
  previous_scores jsonb DEFAULT '[]'::jsonb,
  service_history text[] DEFAULT '{}'::text[],
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT qc_team_scores_pkey PRIMARY KEY (id)
);

CREATE TABLE public.reason_list_categories (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  slug text NOT NULL,
  label text NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  active boolean DEFAULT true NOT NULL,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT reason_list_categories_pkey PRIMARY KEY (id),
  CONSTRAINT reason_list_categories_slug_key UNIQUE (slug),
  CONSTRAINT reason_list_categories_slug_check CHECK ((slug ~ '^[a-z][a-z0-9_]*$'::text))
);

CREATE TABLE public.reason_lists (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  category text NOT NULL,
  label text NOT NULL,
  active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid,
  deleted_at timestamp with time zone,
  division_ids uuid[],
  CONSTRAINT reason_lists_pkey PRIMARY KEY (id)
);

CREATE TABLE public.receival_edit_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  receival_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  reason text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  approved_by uuid,
  rejection_note text,
  expires_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  approved_at timestamp with time zone,
  CONSTRAINT receival_edit_requests_pkey PRIMARY KEY (id),
  CONSTRAINT receival_edit_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'completed'::text, 'expired'::text])))
);

CREATE TABLE public.receival_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  receival_id uuid NOT NULL,
  po_line_item_id uuid,
  item_name text NOT NULL,
  sku text,
  qty_received integer NOT NULL,
  unit_cost numeric NOT NULL,
  is_free boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  brand_variant_id uuid,
  sub_container_id uuid NOT NULL,
  CONSTRAINT receival_items_pkey PRIMARY KEY (id)
);

CREATE TABLE public.receivals (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  receival_number text NOT NULL,
  po_id uuid,
  warehouse_id uuid NOT NULL,
  received_by uuid,
  received_by_name text,
  date date NOT NULL,
  status receival_status DEFAULT 'pending_approval'::receival_status,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  check_sheet_pdf_url text,
  receipt_pdf_url text,
  is_replacement boolean DEFAULT false NOT NULL,
  source_debit_note_id uuid,
  source_type receival_source_type DEFAULT 'purchase'::receival_source_type NOT NULL,
  carved_from_layer_id uuid,
  division_id uuid,
  CONSTRAINT receivals_pkey PRIMARY KEY (id),
  CONSTRAINT receivals_receival_number_key UNIQUE (receival_number)
);

CREATE TABLE public.reminder_categories (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  icon text,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT reminder_categories_pkey PRIMARY KEY (id)
);

CREATE TABLE public.reminders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  category_id uuid NOT NULL,
  name text NOT NULL,
  name_ar text,
  description text,
  template text,
  channel reminder_channel DEFAULT 'Email'::reminder_channel,
  timing text,
  status service_status DEFAULT 'active'::service_status,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT reminders_pkey PRIMARY KEY (id)
);

CREATE TABLE public.repair_vendors (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  phone text,
  address text,
  notes text,
  virtual_warehouse_id uuid,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid,
  sub_container_id uuid NOT NULL,
  CONSTRAINT repair_vendors_pkey PRIMARY KEY (id),
  CONSTRAINT repair_vendors_name_uq UNIQUE (name)
);

CREATE TABLE public.return_line_customer_resolutions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  return_line_id uuid NOT NULL,
  resolution_type text NOT NULL,
  qty numeric NOT NULL,
  sale_delivery_id uuid,
  credit_note_id uuid,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid,
  CONSTRAINT return_line_customer_resolutions_pkey PRIMARY KEY (id),
  CONSTRAINT return_line_customer_resolutions_link_matches_type CHECK (
CASE resolution_type
    WHEN 'replacement'::text THEN ((sale_delivery_id IS NOT NULL) AND (credit_note_id IS NULL))
    WHEN 'refund'::text THEN ((sale_delivery_id IS NULL) AND (credit_note_id IS NOT NULL))
    WHEN 'store_credit'::text THEN ((sale_delivery_id IS NULL) AND (credit_note_id IS NOT NULL))
    ELSE NULL::boolean
END),
  CONSTRAINT return_line_customer_resolutions_qty_check CHECK ((qty > (0)::numeric)),
  CONSTRAINT return_line_customer_resolutions_resolution_type_check CHECK ((resolution_type = ANY (ARRAY['refund'::text, 'replacement'::text, 'store_credit'::text])))
);

CREATE TABLE public.return_line_inventory_dispositions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  return_line_id uuid NOT NULL,
  disposition_type text NOT NULL,
  qty numeric NOT NULL,
  inventory_stock_movement_id uuid,
  warehouse_transfer_id uuid,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid,
  CONSTRAINT return_line_inventory_dispositions_pkey PRIMARY KEY (id),
  CONSTRAINT return_line_inventory_dispositions_disposition_type_check CHECK ((disposition_type = ANY (ARRAY['write_off'::text, 'restock_as_damaged'::text, 'send_for_repair'::text]))),
  CONSTRAINT return_line_inventory_dispositions_link_matches_type CHECK (
CASE disposition_type
    WHEN 'write_off'::text THEN ((inventory_stock_movement_id IS NOT NULL) AND (warehouse_transfer_id IS NULL))
    WHEN 'restock_as_damaged'::text THEN ((inventory_stock_movement_id IS NULL) AND (warehouse_transfer_id IS NULL))
    WHEN 'send_for_repair'::text THEN (inventory_stock_movement_id IS NULL)
    ELSE NULL::boolean
END),
  CONSTRAINT return_line_inventory_dispositions_qty_check CHECK ((qty > (0)::numeric))
);

CREATE TABLE public.return_lines (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  return_id uuid NOT NULL,
  brand_variant_id uuid,
  item_name text DEFAULT 'Item'::text NOT NULL,
  sku text,
  qty integer DEFAULT 0 NOT NULL,
  condition text,
  condition_notes text,
  created_at timestamp with time zone DEFAULT now(),
  receival_item_id uuid,
  sale_delivery_line_id uuid,
  consumption_line_id uuid,
  CONSTRAINT return_lines_pkey PRIMARY KEY (id),
  CONSTRAINT return_lines_provenance_required CHECK (((receival_item_id IS NOT NULL) OR (sale_delivery_line_id IS NOT NULL) OR (consumption_line_id IS NOT NULL)))
);

CREATE TABLE public.returns (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  return_number text NOT NULL,
  source_type return_source_type NOT NULL,
  source_id uuid NOT NULL,
  date date DEFAULT CURRENT_DATE NOT NULL,
  reason text DEFAULT ''::text NOT NULL,
  restock_warehouse_id uuid,
  credit_note_id uuid,
  notes text,
  status return_status DEFAULT 'pending'::return_status NOT NULL,
  division_id uuid,
  created_by uuid,
  created_by_name text DEFAULT ''::text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  deleted_at timestamp with time zone,
  restocked_at timestamp with time zone,
  dispatched_at timestamp with time zone,
  pdf_url text
);

CREATE TABLE public.sale_deliveries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  delivery_number text NOT NULL,
  sale_order_id uuid NOT NULL,
  warehouse_id uuid,
  warehouse_name text,
  date date NOT NULL,
  status sale_delivery_status DEFAULT 'pending'::sale_delivery_status,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid,
  created_by_name text,
  type sale_delivery_type DEFAULT 'standard'::sale_delivery_type NOT NULL,
  return_id uuid,
  pdf_url text,
  source_credit_note_id uuid,
  CONSTRAINT sale_deliveries_pkey PRIMARY KEY (id),
  CONSTRAINT sale_deliveries_delivery_number_key UNIQUE (delivery_number)
);

CREATE TABLE public.sale_delivery_lines (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  sale_delivery_id uuid NOT NULL,
  brand_variant_id uuid,
  item_name text DEFAULT 'Item'::text NOT NULL,
  sku text,
  qty_delivered integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT sale_delivery_lines_pkey PRIMARY KEY (id)
);

CREATE TABLE public.sale_order_approvals (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  source_type approval_source_type NOT NULL,
  source_id uuid NOT NULL,
  approval_type approval_type NOT NULL,
  status approval_status DEFAULT 'pending'::approval_status,
  requested_by uuid,
  decided_by uuid,
  decided_by_name text,
  reason text,
  comment text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  step_role text,
  step_order integer DEFAULT 1 NOT NULL,
  is_active boolean DEFAULT false NOT NULL,
  iteration integer DEFAULT 1 NOT NULL,
  decided_at timestamp with time zone,
  force_approved boolean DEFAULT false NOT NULL,
  force_comment text,
  CONSTRAINT approval_requests_pkey PRIMARY KEY (id)
);

CREATE TABLE public.sale_order_lines (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  sale_order_id uuid NOT NULL,
  item_name text NOT NULL,
  sku text,
  qty integer DEFAULT 1 NOT NULL,
  unit_price numeric DEFAULT 0 NOT NULL,
  total numeric DEFAULT 0 NOT NULL,
  delivered_qty integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid,
  brand_variant_id uuid,
  line_type text DEFAULT 'products'::text NOT NULL,
  unit text DEFAULT 'pcs'::text NOT NULL,
  avg_cost numeric DEFAULT 0 NOT NULL,
  CONSTRAINT sale_order_lines_pkey PRIMARY KEY (id),
  CONSTRAINT sale_order_lines_qty_positive CHECK ((qty > 0)),
  CONSTRAINT sale_order_lines_unit_price_non_neg CHECK ((unit_price >= (0)::numeric))
);

CREATE TABLE public.sale_orders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  so_number text NOT NULL,
  customer_id uuid NOT NULL,
  status sale_order_status DEFAULT 'quotation'::sale_order_status,
  subtotal numeric DEFAULT 0,
  tax numeric DEFAULT 0,
  total numeric DEFAULT 0,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid,
  notes text,
  discount_amount numeric DEFAULT 0,
  discount_label text,
  created_by_name text,
  discount_type text DEFAULT 'fixed'::text,
  discount_amount_resolved numeric DEFAULT 0,
  voucher_id uuid,
  campaign_id uuid,
  currency text DEFAULT 'QAR'::text NOT NULL,
  exchange_rate numeric DEFAULT 1 NOT NULL,
  expected_delivery date,
  payment_terms text,
  payment_terms_notes text,
  payment_milestones jsonb,
  delivery_terms text,
  delivery_terms_notes text,
  customer_notes text,
  validity_days integer DEFAULT 30 NOT NULL,
  division_id uuid,
  quotation_pdf_url text,
  currency_id uuid,
  initial_exchange_rate numeric DEFAULT 1 NOT NULL,
  initial_rate_captured_at timestamp with time zone,
  initial_rate_captured_by uuid,
  total_qar numeric,
  exchange_gain numeric DEFAULT 0 NOT NULL,
  exchange_loss numeric DEFAULT 0 NOT NULL,
  exchange_net numeric GENERATED ALWAYS AS ((COALESCE(exchange_gain, (0)::numeric) - COALESCE(exchange_loss, (0)::numeric))) STORED,
  CONSTRAINT sale_orders_pkey PRIMARY KEY (id),
  CONSTRAINT sale_orders_so_number_key UNIQUE (so_number)
);

CREATE TABLE public.schedules (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  days jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone,
  CONSTRAINT schedules_pkey PRIMARY KEY (id)
);

CREATE TABLE public.service_brands (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  service_id uuid NOT NULL,
  brand_id uuid NOT NULL,
  reliability_factor numeric DEFAULT 1.0 NOT NULL,
  is_reliable boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT service_brands_pkey PRIMARY KEY (id),
  CONSTRAINT service_brands_service_id_brand_id_key UNIQUE (service_id, brand_id)
);

CREATE TABLE public.service_customer_addresses (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  customer_id uuid NOT NULL,
  address_type text NOT NULL,
  label text,
  unit text,
  building text,
  street text,
  zone text,
  lat numeric,
  lng numeric,
  is_primary boolean DEFAULT false NOT NULL,
  tags text[] DEFAULT '{}'::text[] NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  is_geocoded boolean DEFAULT true NOT NULL,
  waze_link text,
  phone_id uuid,
  CONSTRAINT service_customer_addresses_pkey PRIMARY KEY (id),
  CONSTRAINT service_customer_addresses_address_type_check CHECK ((address_type = ANY (ARRAY['blue-plate'::text, 'google-coords'::text])))
);

CREATE TABLE public.service_customer_phones (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  customer_id uuid NOT NULL,
  phone text NOT NULL,
  label text,
  is_primary boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT service_customer_phones_pkey PRIMARY KEY (id)
);

CREATE TABLE public.service_customers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  name_ar text,
  legacy_customer_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  is_blocked boolean DEFAULT false NOT NULL,
  customer_type text DEFAULT 'individual'::text NOT NULL,
  pending_payment_amount numeric DEFAULT 0 NOT NULL,
  referral_source text,
  CONSTRAINT service_customers_pkey PRIMARY KEY (id),
  CONSTRAINT service_customers_customer_type_check CHECK ((customer_type = ANY (ARRAY['individual'::text, 'business'::text])))
);

CREATE TABLE public.service_edit_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  service_id uuid,
  division text[],
  change_type service_change_type NOT NULL,
  changes jsonb NOT NULL,
  status service_change_status DEFAULT 'pending'::service_change_status NOT NULL,
  requested_by uuid NOT NULL,
  reviewed_by uuid,
  rejection_reason text,
  requested_at timestamp with time zone DEFAULT now() NOT NULL,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT service_change_requests_pkey PRIMARY KEY (id),
  CONSTRAINT scr_add_no_service_id CHECK (((change_type <> 'add'::service_change_type) OR (service_id IS NULL))),
  CONSTRAINT scr_edit_delete_require_service_id CHECK (((change_type = 'add'::service_change_type) OR (service_id IS NOT NULL))),
  CONSTRAINT scr_rejection_reason_required CHECK (((status <> 'rejected'::service_change_status) OR (rejection_reason IS NOT NULL)))
);

CREATE TABLE public.service_instructions (
  service_id uuid NOT NULL,
  instruction_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT service_instructions_pkey PRIMARY KEY (service_id, instruction_id)
);

CREATE TABLE public.service_inventory (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  service_id uuid NOT NULL,
  brand_variant_id uuid NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  quantity numeric DEFAULT 1 NOT NULL,
  link_type text DEFAULT 'consumable'::text NOT NULL,
  warranty_months integer DEFAULT 0 NOT NULL,
  group_label text,
  is_default boolean DEFAULT false NOT NULL,
  CONSTRAINT service_inventory_pkey PRIMARY KEY (id),
  CONSTRAINT service_inventory_link_type_check CHECK ((link_type = ANY (ARRAY['supply'::text, 'consumable'::text])))
);

CREATE TABLE public.services (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  parent_id uuid,
  name_en text NOT NULL,
  name_ar text,
  code text,
  price numeric,
  emergency_price numeric,
  duration integer,
  warranty integer,
  category service_category,
  status service_status DEFAULT 'active'::service_status,
  division text[] DEFAULT '{}'::text[],
  service_type service_type DEFAULT 'standard'::service_type,
  contract_type contract_type,
  price_unit text,
  discount numeric,
  brands_supported integer,
  includes_notes boolean DEFAULT false,
  spare_parts boolean DEFAULT false,
  qc_checklist boolean DEFAULT false,
  instructions boolean DEFAULT false,
  reminder_days integer,
  invoice_text_en text,
  invoice_text_ar text,
  booking_time_matrix jsonb,
  inventory_items jsonb,
  components jsonb,
  tree_type text DEFAULT 'normal'::text,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone,
  catalog_image_url text,
  legacy_service_id text,
  qc_items jsonb,
  photo_requirement text DEFAULT 'none'::text,
  has_pending_change boolean DEFAULT false NOT NULL,
  item_kind text DEFAULT 'service'::text,
  pricing_mode text DEFAULT 'by_condition'::text,
  discount_scope text DEFAULT 'services_only'::text,
  CONSTRAINT services_pkey PRIMARY KEY (id),
  CONSTRAINT services_discount_scope_check CHECK ((discount_scope = ANY (ARRAY['services_only'::text, 'services_and_products'::text]))),
  CONSTRAINT services_item_kind_check CHECK ((item_kind = ANY (ARRAY['service'::text, 'product'::text]))),
  CONSTRAINT services_pricing_mode_check CHECK ((pricing_mode = ANY (ARRAY['fixed'::text, 'by_condition'::text])))
);

CREATE TABLE public.shipments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tracking_number text NOT NULL,
  po_id uuid NOT NULL,
  receival_id uuid,
  mode shipment_mode NOT NULL,
  carrier text,
  status shipment_status DEFAULT 'booked'::shipment_status,
  origin text,
  destination text,
  etd date,
  eta date,
  events jsonb DEFAULT '[]'::jsonb,
  archived boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  last_synced_at timestamp with time zone,
  sync_error text,
  carrier_code text,
  is_syncing boolean DEFAULT false NOT NULL,
  CONSTRAINT shipments_pkey PRIMARY KEY (id)
);

CREATE TABLE public.site_visit_dates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  visit_id uuid NOT NULL,
  visit_date date NOT NULL,
  from_time time without time zone,
  to_time time without time zone,
  sort_order smallint DEFAULT 0,
  CONSTRAINT site_visit_dates_pkey PRIMARY KEY (id)
);

CREATE TABLE public.site_visit_team_assignments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  visit_id uuid NOT NULL,
  team_id uuid NOT NULL,
  scheduled_date date,
  time_slot text,
  duration text DEFAULT '1'::text,
  services jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT site_visit_team_assignments_pkey PRIMARY KEY (id)
);

CREATE TABLE public.site_visits (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  visit_id text NOT NULL,
  customer_id uuid,
  phone_id uuid,
  status text DEFAULT 'scheduled'::text NOT NULL,
  mode text DEFAULT 'normal'::text NOT NULL,
  scheduled_date date,
  address text,
  notes text,
  arrival_phone text,
  attachments jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  service_customer_id uuid NOT NULL,
  completed_at timestamp with time zone,
  completed_by uuid,
  created_by uuid,
  CONSTRAINT site_visits_pkey PRIMARY KEY (id),
  CONSTRAINT site_visits_visit_id_key UNIQUE (visit_id)
);

CREATE TABLE public.so_invoices (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  invoice_id text NOT NULL,
  customer_id uuid,
  source invoice_source NOT NULL,
  source_id text NOT NULL,
  source_label text,
  issued_date date NOT NULL,
  due_date date NOT NULL,
  status invoice_status DEFAULT 'draft'::invoice_status,
  subtotal numeric DEFAULT 0,
  total_amount numeric DEFAULT 0,
  paid_amount numeric DEFAULT 0,
  agent_name text,
  notes text,
  qb_synced boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  sale_order_id uuid,
  needs_refresh boolean DEFAULT false NOT NULL,
  payment_status invoice_payment_status DEFAULT 'unpaid'::invoice_payment_status NOT NULL,
  invoice_type invoice_type DEFAULT 'credit'::invoice_type NOT NULL,
  discount_amount numeric DEFAULT 0 NOT NULL,
  discount_label text,
  pdf_url text,
  division_id uuid,
  CONSTRAINT invoices_pkey PRIMARY KEY (id),
  CONSTRAINT invoices_invoice_id_key UNIQUE (invoice_id),
  CONSTRAINT so_invoices_sale_order_id_unique UNIQUE (sale_order_id)
);

CREATE TABLE public.so_po_returns (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  return_number text NOT NULL,
  source_type return_source_type NOT NULL,
  source_id uuid NOT NULL,
  date date DEFAULT CURRENT_DATE NOT NULL,
  reason text DEFAULT ''::text NOT NULL,
  restock_warehouse_id uuid,
  credit_note_id uuid,
  notes text,
  status return_status DEFAULT 'pending'::return_status NOT NULL,
  division_id uuid,
  created_by uuid,
  created_by_name text DEFAULT ''::text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  deleted_at timestamp with time zone,
  restocked_at timestamp with time zone,
  dispatched_at timestamp with time zone,
  pdf_url text,
  source_delivery_id uuid,
  debit_note_id uuid,
  warranty_claim_id uuid,
  CONSTRAINT returns_pkey PRIMARY KEY (id)
);

CREATE TABLE public.stock_adjustment_approvals (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  adjustment_id uuid NOT NULL,
  step_order integer NOT NULL,
  step_role text NOT NULL,
  step_label text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  profile_id uuid,
  profile_name text,
  action_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  force_approved boolean DEFAULT false NOT NULL,
  force_comment text,
  CONSTRAINT stock_adjustment_approvals_pkey PRIMARY KEY (id),
  CONSTRAINT stock_adjustment_approvals_adjustment_id_step_order_key UNIQUE (adjustment_id, step_order),
  CONSTRAINT stock_adjustment_approvals_status_chk CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);

CREATE TABLE public.stock_adjustments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  warehouse_id uuid NOT NULL,
  brand_variant_id uuid NOT NULL,
  adjustment_type stock_adjustment_type NOT NULL,
  qty numeric NOT NULL,
  reason text NOT NULL,
  notes text,
  photo_urls text[],
  status text DEFAULT 'pending_approval'::text NOT NULL,
  requested_by uuid,
  requested_by_name text,
  approved_by_name text,
  approved_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  source_check_id uuid,
  source_check_item_id uuid,
  sub_container_id uuid NOT NULL,
  source_pile text DEFAULT 'good'::text NOT NULL,
  tool_unit_id uuid,
  CONSTRAINT stock_adjustments_pkey PRIMARY KEY (id),
  CONSTRAINT stock_adjustments_source_pile_check CHECK ((source_pile = ANY (ARRAY['good'::text, 'damaged'::text]))),
  CONSTRAINT stock_adjustments_status_check CHECK ((status = ANY (ARRAY['pending_approval'::text, 'approved'::text, 'rejected'::text])))
);

CREATE TABLE public.storage_cleanup_failures (
  id bigint DEFAULT nextval('storage_cleanup_failures_id_seq'::regclass) NOT NULL,
  occurred_at timestamp with time zone DEFAULT now() NOT NULL,
  bucket text NOT NULL,
  path text NOT NULL,
  source_table text,
  source_id text,
  error_text text,
  CONSTRAINT storage_cleanup_failures_pkey PRIMARY KEY (id)
);

CREATE TABLE public.subscription_package_services (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  package_id uuid NOT NULL,
  service_id uuid NOT NULL,
  discount_override numeric(5,2),
  CONSTRAINT subscription_package_services_pkey PRIMARY KEY (id),
  CONSTRAINT subscription_package_services_package_id_service_id_key UNIQUE (package_id, service_id),
  CONSTRAINT subscription_package_services_discount_override_check CHECK (((discount_override IS NULL) OR ((discount_override >= (0)::numeric) AND (discount_override <= (100)::numeric))))
);

CREATE TABLE public.subscription_packages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  name_ar text,
  description text,
  discount_percent numeric(5,2) DEFAULT 0 NOT NULL,
  initial_fee numeric(10,2) DEFAULT 0 NOT NULL,
  duration_months integer DEFAULT 12 NOT NULL,
  priority_response text DEFAULT 'none'::text NOT NULL,
  response_hours integer,
  auto_renew_default boolean DEFAULT true NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_by_name text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT subscription_packages_pkey PRIMARY KEY (id),
  CONSTRAINT chk_sp_duration CHECK ((duration_months >= 1)),
  CONSTRAINT subscription_packages_discount_percent_check CHECK (((discount_percent >= (0)::numeric) AND (discount_percent <= (100)::numeric))),
  CONSTRAINT subscription_packages_initial_fee_check CHECK ((initial_fee >= (0)::numeric)),
  CONSTRAINT subscription_packages_priority_response_check CHECK ((priority_response = ANY (ARRAY['none'::text, '24_48hr'::text, 'under_24hr'::text]))),
  CONSTRAINT subscription_packages_response_hours_check CHECK (((response_hours IS NULL) OR ((response_hours >= 1) AND (response_hours <= 168))))
);

CREATE TABLE public.subscription_usage_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  subscription_id uuid NOT NULL,
  order_id uuid NOT NULL,
  service_id uuid NOT NULL,
  discount_applied numeric(5,2) NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT subscription_usage_log_pkey PRIMARY KEY (id)
);

CREATE TABLE public.suppliers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  category text,
  contact_name text,
  phone text,
  email text,
  address text,
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid,
  currency_id uuid,
  supplier_type text DEFAULT 'local'::text,
  country text,
  country_id integer,
  division_id uuid,
  CONSTRAINT suppliers_pkey PRIMARY KEY (id),
  CONSTRAINT suppliers_supplier_type_check CHECK ((supplier_type = ANY (ARRAY['local'::text, 'international'::text])))
);

CREATE TABLE public.sync_state (
  id text DEFAULT 'singleton'::text NOT NULL,
  last_3cx_sync_at timestamp with time zone DEFAULT '2020-01-01 00:00:00+00'::timestamp with time zone,
  last_wati_sync_at timestamp with time zone DEFAULT '2020-01-01 00:00:00+00'::timestamp with time zone,
  last_whapi_sync_at timestamp with time zone DEFAULT '2020-01-01 00:00:00+00'::timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT sync_state_pkey PRIMARY KEY (id)
);

CREATE TABLE public.team_activity_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  actor_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  before_data jsonb,
  after_data jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT team_activity_log_pkey PRIMARY KEY (id)
);

CREATE TABLE public.team_live_locations (
  team_id uuid NOT NULL,
  lat numeric(10,7) NOT NULL,
  lng numeric(10,7) NOT NULL,
  accuracy double precision,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  speed double precision,
  heading double precision,
  CONSTRAINT team_live_locations_pkey PRIMARY KEY (team_id)
);

CREATE TABLE public.team_schedule_assignments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  team_id uuid NOT NULL,
  schedule_id uuid NOT NULL,
  start_date date NOT NULL,
  end_date date,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT team_schedule_assignments_pkey PRIMARY KEY (id)
);

CREATE TABLE public.teams (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  tag team_tag DEFAULT 'normal'::team_tag,
  vehicle_id uuid,
  schedule_id uuid,
  schedule_start integer DEFAULT 7,
  schedule_end integer DEFAULT 17,
  leader_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  is_emergency boolean DEFAULT false NOT NULL,
  is_qc boolean DEFAULT false NOT NULL,
  traccar_device_id text,
  deleted_at timestamp with time zone,
  name_en text DEFAULT ''::text NOT NULL,
  name_ar text,
  phone text,
  site_visit_order boolean DEFAULT false NOT NULL,
  site_visit_quotation boolean DEFAULT false NOT NULL,
  division_id uuid,
  is_normal boolean DEFAULT false NOT NULL,
  CONSTRAINT teams_pkey PRIMARY KEY (id),
  CONSTRAINT teams_traccar_device_id_unique UNIQUE (traccar_device_id),
  CONSTRAINT check_qc_exclusive CHECK ((NOT (is_qc AND (is_normal OR is_emergency))))
);

CREATE TABLE public.tl_invoice_lines (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tl_invoice_id uuid NOT NULL,
  name text DEFAULT 'Item'::text NOT NULL,
  qty numeric DEFAULT 1 NOT NULL,
  unit_price numeric DEFAULT 0 NOT NULL,
  total numeric DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT tl_invoice_lines_pkey PRIMARY KEY (id)
);

CREATE TABLE public.tl_invoice_payments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tl_invoice_id uuid NOT NULL,
  amount numeric NOT NULL,
  payment_method_id uuid,
  method_slug text,
  paid_at timestamp with time zone DEFAULT now() NOT NULL,
  registered_by uuid,
  registered_by_name text,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT tl_invoice_payments_pkey PRIMARY KEY (id),
  CONSTRAINT tl_invoice_payments_amount_check CHECK ((amount > (0)::numeric))
);

CREATE TABLE public.tl_invoices (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  invoice_number text NOT NULL,
  visit_id uuid NOT NULL,
  order_id text,
  customer_name text NOT NULL,
  customer_phone text,
  subtotal numeric DEFAULT 0 NOT NULL,
  discount_amount numeric DEFAULT 0 NOT NULL,
  total_amount numeric DEFAULT 0 NOT NULL,
  payment_method_id uuid,
  payment_status text DEFAULT 'unpaid'::text NOT NULL,
  dibsy_payment_id text,
  dibsy_checkout_url text,
  notes text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  paid_amount numeric DEFAULT 0 NOT NULL,
  pdf_url text,
  CONSTRAINT tl_invoices_pkey PRIMARY KEY (id),
  CONSTRAINT tl_invoices_invoice_number_unique UNIQUE (invoice_number),
  CONSTRAINT tl_invoices_visit_id_unique UNIQUE (visit_id),
  CONSTRAINT tl_invoices_payment_status_check CHECK ((payment_status = ANY (ARRAY['unpaid'::text, 'partial'::text, 'paid'::text])))
);

CREATE TABLE public.tl_payment_batch_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  batch_id uuid NOT NULL,
  tl_invoice_id uuid NOT NULL,
  amount numeric NOT NULL,
  CONSTRAINT tl_payment_batch_items_pkey PRIMARY KEY (id)
);

CREATE TABLE public.tl_payment_batches (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  customer_phone text NOT NULL,
  total_amount numeric NOT NULL,
  dibsy_payment_id text,
  dibsy_checkout_url text,
  payment_status text DEFAULT 'pending'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT tl_payment_batches_pkey PRIMARY KEY (id),
  CONSTRAINT tl_payment_batches_payment_status_check CHECK ((payment_status = ANY (ARRAY['pending'::text, 'paid'::text])))
);

CREATE TABLE public.tool_asset_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  category_id uuid,
  name_en text NOT NULL,
  name_ar text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT tool_asset_items_pkey PRIMARY KEY (id)
);

CREATE TABLE public.tool_asset_units (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  item_id uuid,
  serial_number text,
  brand text,
  condition tool_condition DEFAULT 'Good'::tool_condition,
  status tool_status DEFAULT 'available'::tool_status,
  expiry date,
  assigned_to uuid,
  created_at timestamp with time zone DEFAULT now(),
  receival_item_id uuid,
  is_placeholder boolean DEFAULT false NOT NULL,
  division_id uuid,
  current_custody_location_id uuid,
  lifecycle_type tool_lifecycle_type DEFAULT 'new'::tool_lifecycle_type NOT NULL,
  unit_cost numeric,
  pending_scrap boolean DEFAULT false NOT NULL,
  CONSTRAINT tool_asset_units_pkey PRIMARY KEY (id)
);

CREATE TABLE public.tool_assignments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tool_unit_id uuid NOT NULL,
  assigned_to text NOT NULL,
  team_id uuid,
  employee_id uuid,
  assigned_at timestamp with time zone DEFAULT now() NOT NULL,
  notes text,
  CONSTRAINT tool_assignments_pkey PRIMARY KEY (id),
  CONSTRAINT one_target CHECK ((((team_id IS NOT NULL) AND (employee_id IS NULL)) OR ((employee_id IS NOT NULL) AND (team_id IS NULL)))),
  CONSTRAINT tool_assignments_assigned_to_check CHECK ((assigned_to = ANY (ARRAY['team'::text, 'employee'::text])))
);

CREATE TABLE public.tool_check_sessions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  division_id uuid NOT NULL,
  initiated_by uuid,
  initiated_at timestamp with time zone DEFAULT now() NOT NULL,
  status text DEFAULT 'in_progress'::text NOT NULL,
  completed_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT tool_check_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT tool_check_sessions_status_check CHECK ((status = ANY (ARRAY['in_progress'::text, 'completed'::text])))
);

CREATE TABLE public.tool_unit_assignments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  unit_id uuid NOT NULL,
  custody_location_id uuid NOT NULL,
  assigned_at timestamp with time zone DEFAULT now() NOT NULL,
  released_at timestamp with time zone,
  release_reason text,
  assigned_by uuid,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  returned_to_warehouse_id uuid,
  CONSTRAINT tool_unit_assignments_pkey PRIMARY KEY (id),
  CONSTRAINT tool_unit_assignments_release_reason_check CHECK ((release_reason = ANY (ARRAY['moved'::text, 'returned'::text, 'scrapped'::text, 'sent_for_repair'::text])))
);

CREATE TABLE public.tool_unit_inspections (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  unit_id uuid NOT NULL,
  custody_location_id uuid,
  inspected_at timestamp with time zone DEFAULT now() NOT NULL,
  inspected_by uuid,
  verdict text NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  session_id uuid,
  CONSTRAINT tool_unit_inspections_pkey PRIMARY KEY (id),
  CONSTRAINT tool_unit_inspections_verdict_check CHECK ((verdict = ANY (ARRAY['good'::text, 'bad'::text, 'under_repair'::text])))
);

CREATE TABLE public.traccar_geofences (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  traccar_geofence_id integer NOT NULL,
  name text NOT NULL,
  description text,
  color text DEFAULT '#3B82F6'::text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT traccar_geofences_pkey PRIMARY KEY (id),
  CONSTRAINT traccar_geofences_traccar_geofence_id_key UNIQUE (traccar_geofence_id)
);

CREATE TABLE public.user_company_divisions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  profile_id uuid NOT NULL,
  division_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid,
  CONSTRAINT user_divisions_pkey PRIMARY KEY (id)
);

CREATE TABLE public.user_custom_roles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  profile_id uuid NOT NULL,
  role_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid,
  approval_scopes text[],
  CONSTRAINT user_custom_roles_pkey PRIMARY KEY (id),
  CONSTRAINT user_custom_roles_profile_id_role_id_key UNIQUE (profile_id, role_id),
  CONSTRAINT user_custom_roles_approval_scopes_chk CHECK (((approval_scopes IS NULL) OR (approval_scopes <@ ARRAY['po'::text, 'inv_check'::text, 'stock_adj'::text, 'sales_margin'::text, 'sales_credit'::text, 'credit_group'::text])))
);

CREATE TABLE public.user_data (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  auth_user_id uuid NOT NULL,
  user_type user_type DEFAULT 'internal'::user_type NOT NULL,
  full_name text NOT NULL,
  full_name_ar text,
  phone text,
  email text,
  avatar_url text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid,
  must_change_password boolean DEFAULT false NOT NULL,
  is_division_manager boolean DEFAULT false NOT NULL,
  title text DEFAULT 'Mr.'::text NOT NULL,
  threecx_extension text,
  has_contact_centre_access boolean DEFAULT false NOT NULL,
  active_division_id uuid,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_auth_user_id_key UNIQUE (auth_user_id)
);

CREATE TABLE public.vehicles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  type text NOT NULL,
  plate text NOT NULL,
  team_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  traccar_device_id text,
  deleted_at timestamp with time zone,
  name text,
  CONSTRAINT vehicles_pkey PRIMARY KEY (id),
  CONSTRAINT vehicles_traccar_device_id_unique UNIQUE (traccar_device_id)
);

CREATE TABLE public.voucher_redemptions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  voucher_id uuid NOT NULL,
  order_id text NOT NULL,
  customer_name text,
  discount_applied numeric NOT NULL,
  redeemed_at timestamp with time zone DEFAULT now(),
  CONSTRAINT voucher_redemptions_pkey PRIMARY KEY (id)
);

CREATE TABLE public.vouchers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  code text NOT NULL,
  campaign_id uuid,
  type voucher_type DEFAULT 'single_use'::voucher_type,
  usage_limit integer,
  usage_count integer DEFAULT 0,
  min_order_value numeric,
  max_discount numeric,
  is_active boolean DEFAULT true,
  expires_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT vouchers_pkey PRIMARY KEY (id),
  CONSTRAINT vouchers_code_key UNIQUE (code)
);

CREATE TABLE public.warehouse_field_rps (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  warehouse_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT warehouse_field_rps_pkey PRIMARY KEY (id)
);

CREATE TABLE public.warehouse_item_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  warehouse_id uuid NOT NULL,
  requested_by uuid,
  requester_name text,
  dest_sub_container_id uuid,
  dest_name text,
  item_name text NOT NULL,
  qty numeric NOT NULL,
  notes text,
  status text DEFAULT 'pending'::text NOT NULL,
  resolved_by uuid,
  resolved_at timestamp with time zone,
  resolution_note text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  request_group_id uuid,
  CONSTRAINT warehouse_item_requests_pkey PRIMARY KEY (id),
  CONSTRAINT warehouse_item_requests_qty_check CHECK ((qty > (0)::numeric)),
  CONSTRAINT warehouse_item_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'fulfilled'::text, 'dismissed'::text])))
);

CREATE TABLE public.warehouse_reorder_points (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  warehouse_id uuid NOT NULL,
  brand_variant_id uuid NOT NULL,
  reorder_point integer DEFAULT 0 NOT NULL,
  last_notified_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT warehouse_reorder_points_pkey PRIMARY KEY (id),
  CONSTRAINT warehouse_reorder_points_warehouse_id_brand_variant_id_key UNIQUE (warehouse_id, brand_variant_id)
);

CREATE TABLE public.warehouse_responsible_persons (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  warehouse_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT warehouse_responsible_persons_pkey PRIMARY KEY (id),
  CONSTRAINT warehouse_field_rps_warehouse_id_profile_id_key UNIQUE (warehouse_id, profile_id)
);

CREATE TABLE public.warehouse_stock_allocations (
  warehouse_id uuid NOT NULL,
  brand_variant_id uuid NOT NULL,
  allocated_qty integer DEFAULT 0 NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  sub_container_id uuid NOT NULL,
  CONSTRAINT warehouse_stock_allocations_pkey PRIMARY KEY (warehouse_id, brand_variant_id, sub_container_id)
);

CREATE TABLE public.warehouse_stock_summary (
  warehouse_id uuid NOT NULL,
  brand_variant_id uuid NOT NULL,
  item_name text,
  brand text,
  sku text,
  unit text,
  qty integer DEFAULT 0 NOT NULL,
  avg_cost numeric DEFAULT 0 NOT NULL,
  total_value numeric DEFAULT 0 NOT NULL,
  category_name text,
  subcategory_name text,
  item_type text,
  allocated_qty integer DEFAULT 0 NOT NULL,
  available_qty integer DEFAULT 0 NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  sub_container_id uuid NOT NULL,
  CONSTRAINT warehouse_stock_summary_pkey PRIMARY KEY (warehouse_id, sub_container_id, brand_variant_id)
);

CREATE TABLE public.warehouse_sub_containers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  warehouse_id uuid NOT NULL,
  division_id uuid,
  name text NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid,
  team_id uuid,
  responsible_person_profile_id uuid,
  project_id uuid,
  discipline_id uuid,
  CONSTRAINT warehouse_sub_containers_pkey PRIMARY KEY (id),
  CONSTRAINT warehouse_sub_containers_warehouse_division_name_uniq UNIQUE NULLS NOT DISTINCT (warehouse_id, division_id, name)
);

CREATE TABLE public.warehouse_transfer_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  transfer_id uuid NOT NULL,
  brand_variant_id uuid NOT NULL,
  item_name text NOT NULL,
  sku text,
  requested_qty integer NOT NULL,
  unit_cost numeric DEFAULT 0 NOT NULL,
  dispatched_qty integer,
  received_qty integer,
  shrinkage_qty integer DEFAULT 0 NOT NULL,
  shrinkage_reason text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  sub_container_id uuid NOT NULL,
  returned_qty integer DEFAULT 0 NOT NULL,
  CONSTRAINT warehouse_transfer_items_pkey PRIMARY KEY (id)
);

CREATE TABLE public.warehouse_transfers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  transfer_number text NOT NULL,
  from_warehouse_id uuid NOT NULL,
  to_warehouse_id uuid NOT NULL,
  status transfer_status DEFAULT 'pending'::transfer_status,
  created_by_name text,
  approved_by_name text,
  date date NOT NULL,
  approved_date date,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by_profile_id uuid,
  dispatched_by_profile_id uuid,
  dispatched_by_name text,
  dispatched_at timestamp with time zone,
  received_by_profile_id uuid,
  received_by_name text,
  received_at timestamp with time zone,
  cancelled_by_profile_id uuid,
  cancelled_by_name text,
  cancelled_at timestamp with time zone,
  approved_by_profile_id uuid,
  transfer_kind text DEFAULT 'good_stock'::text NOT NULL,
  repair_vendor_id uuid,
  source_return_line_disposition_id uuid,
  expected_return_date date,
  repair_cost numeric,
  from_sub_container_id uuid NOT NULL,
  to_sub_container_id uuid NOT NULL,
  request_group_id uuid,
  tool_unit_id uuid,
  CONSTRAINT warehouse_transfers_pkey PRIMARY KEY (id),
  CONSTRAINT warehouse_transfers_transfer_number_key UNIQUE (transfer_number),
  CONSTRAINT check_different_location CHECK (((from_warehouse_id <> to_warehouse_id) OR (from_sub_container_id IS DISTINCT FROM to_sub_container_id))),
  CONSTRAINT warehouse_transfers_kind_check CHECK ((transfer_kind = ANY (ARRAY['good_stock'::text, 'damaged_repair_out'::text, 'damaged_repair_return_good'::text, 'damaged_repair_return_writeoff'::text, 'custody_assign'::text, 'custody_return'::text]))),
  CONSTRAINT warehouse_transfers_repair_cost_check CHECK (((repair_cost IS NULL) OR (repair_cost >= (0)::numeric))),
  CONSTRAINT warehouse_transfers_repair_shape CHECK (
CASE transfer_kind
    WHEN 'good_stock'::text THEN ((repair_vendor_id IS NULL) AND (source_return_line_disposition_id IS NULL))
    WHEN 'damaged_repair_out'::text THEN (repair_vendor_id IS NOT NULL)
    WHEN 'damaged_repair_return_good'::text THEN (repair_vendor_id IS NOT NULL)
    WHEN 'damaged_repair_return_writeoff'::text THEN (repair_vendor_id IS NOT NULL)
    WHEN 'custody_assign'::text THEN ((repair_vendor_id IS NULL) AND (source_return_line_disposition_id IS NULL))
    WHEN 'custody_return'::text THEN ((repair_vendor_id IS NULL) AND (source_return_line_disposition_id IS NULL))
    ELSE NULL::boolean
END)
);

CREATE TABLE public.warehouses (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  location text,
  item_count integer DEFAULT 0,
  total_value numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  is_virtual boolean DEFAULT false NOT NULL,
  repair_vendor_id uuid,
  company_id uuid,
  warehouse_kind text DEFAULT 'general'::text NOT NULL,
  is_project_warehouse boolean DEFAULT false NOT NULL,
  can_transfer_custody boolean DEFAULT false NOT NULL,
  latitude numeric,
  longitude numeric,
  CONSTRAINT warehouses_pkey PRIMARY KEY (id),
  CONSTRAINT warehouses_kind_check CHECK ((warehouse_kind = ANY (ARRAY['general'::text, 'repair'::text, 'custody'::text])))
);

CREATE TABLE public.warranty_claim_counters (
  division_id uuid NOT NULL,
  next_value integer DEFAULT 1 NOT NULL,
  CONSTRAINT warranty_claim_counters_pkey PRIMARY KEY (division_id)
);

CREATE TABLE public.warranty_claims (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  claim_number text NOT NULL,
  warranty_record_id uuid NOT NULL,
  warranty_type warranty_source_type NOT NULL,
  status warranty_claim_status DEFAULT 'open'::warranty_claim_status NOT NULL,
  issue_description text NOT NULL,
  reported_by uuid,
  reported_at timestamp with time zone DEFAULT now() NOT NULL,
  decision text,
  decided_by uuid,
  decided_at timestamp with time zone,
  decision_reason text,
  resolution_type text,
  resolved_at timestamp with time zone,
  linked_return_id uuid,
  linked_credit_note_id uuid,
  void_reason text,
  voided_by uuid,
  voided_at timestamp with time zone,
  division_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  claim_qty integer NOT NULL,
  CONSTRAINT warranty_claims_pkey PRIMARY KEY (id),
  CONSTRAINT warranty_claims_claim_number_key UNIQUE (claim_number),
  CONSTRAINT warranty_claims_claim_qty_positive CHECK ((claim_qty > 0)),
  CONSTRAINT warranty_claims_decision_check CHECK ((decision = ANY (ARRAY['covered'::text, 'rejected'::text]))),
  CONSTRAINT warranty_claims_resolution_type_check CHECK ((resolution_type = ANY (ARRAY['replacement'::text, 'credit'::text, 'refund'::text, 'repair'::text])))
);

CREATE TABLE public.warranty_number_counters (
  source_type warranty_source_type NOT NULL,
  division_id uuid NOT NULL,
  next_value integer DEFAULT 1 NOT NULL,
  CONSTRAINT warranty_number_counters_pkey PRIMARY KEY (source_type, division_id),
  CONSTRAINT warranty_number_counters_next_value_check CHECK ((next_value > 0))
);

CREATE TABLE public.warranty_policies (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  duration_months integer NOT NULL,
  coverage_type text NOT NULL,
  starts_from text DEFAULT 'delivery_date'::text NOT NULL,
  terms_en text,
  terms_ar text,
  void_conditions text[] DEFAULT '{}'::text[] NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid,
  CONSTRAINT warranty_policies_pkey PRIMARY KEY (id),
  CONSTRAINT warranty_policies_name_key UNIQUE (name),
  CONSTRAINT warranty_policies_coverage_type_check CHECK ((coverage_type = ANY (ARRAY['none'::text, 'parts_only'::text, 'parts_and_labor'::text, 'replacement_only'::text]))),
  CONSTRAINT warranty_policies_duration_months_check CHECK ((duration_months >= 0)),
  CONSTRAINT warranty_policies_starts_from_check CHECK ((starts_from = ANY (ARRAY['delivery_date'::text, 'invoice_date'::text])))
);

CREATE TABLE public.warranty_records (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  warranty_number text NOT NULL,
  sale_delivery_line_id uuid,
  sale_order_id uuid,
  customer_id uuid,
  division_id uuid NOT NULL,
  brand_variant_id uuid,
  item_name text NOT NULL,
  sku text,
  qty integer NOT NULL,
  policy_id uuid NOT NULL,
  policy_name_snapshot text NOT NULL,
  coverage_type_snapshot text NOT NULL,
  duration_months_snapshot integer NOT NULL,
  terms_en_snapshot text,
  terms_ar_snapshot text,
  void_conditions_snapshot text[] DEFAULT '{}'::text[] NOT NULL,
  starts_from_snapshot text DEFAULT 'delivery_date'::text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  source_type warranty_source_type DEFAULT 'sale'::warranty_source_type NOT NULL,
  origin_country_id integer,
  origin_name_snapshot text,
  consumption_id uuid,
  consumption_line_id uuid,
  CONSTRAINT warranty_records_pkey PRIMARY KEY (id),
  CONSTRAINT warranty_records_sale_delivery_line_id_key UNIQUE (sale_delivery_line_id),
  CONSTRAINT warranty_records_warranty_number_key UNIQUE (warranty_number),
  CONSTRAINT warranty_records_coverage_type_snapshot_check CHECK ((coverage_type_snapshot = ANY (ARRAY['none'::text, 'parts_only'::text, 'parts_and_labor'::text, 'replacement_only'::text]))),
  CONSTRAINT warranty_records_duration_months_snapshot_check CHECK ((duration_months_snapshot >= 0)),
  CONSTRAINT warranty_records_end_after_start CHECK ((end_date >= start_date)),
  CONSTRAINT warranty_records_qty_check CHECK ((qty > 0)),
  CONSTRAINT warranty_records_source_xor CHECK ((((sale_delivery_line_id IS NOT NULL) AND (consumption_line_id IS NULL)) OR ((sale_delivery_line_id IS NULL) AND (consumption_line_id IS NOT NULL)))),
  CONSTRAINT warranty_records_starts_from_snapshot_check CHECK ((starts_from_snapshot = ANY (ARRAY['delivery_date'::text, 'invoice_date'::text])))
);

-- ============ SEQUENCE OWNERSHIP ============
ALTER SEQUENCE public.country_codes_id_seq OWNED BY public.country_codes.id;
ALTER SEQUENCE public.storage_cleanup_failures_id_seq OWNED BY public.storage_cleanup_failures.id;

-- ============ FOREIGN KEYS ============
ALTER TABLE public.approval_workflow_steps ADD CONSTRAINT approval_workflow_steps_group_id_fkey FOREIGN KEY (group_id) REFERENCES approval_workflow_groups(id) ON DELETE SET NULL;
ALTER TABLE public.approval_workflow_steps ADD CONSTRAINT workflow_approval_steps_archived_by_fkey FOREIGN KEY (archived_by) REFERENCES user_data(id);
ALTER TABLE public.approval_workflow_steps ADD CONSTRAINT workflow_approval_steps_role_id_fkey FOREIGN KEY (role_id) REFERENCES custom_roles(id);
ALTER TABLE public.bill_attachments ADD CONSTRAINT bill_attachments_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE;
ALTER TABLE public.bill_attachments ADD CONSTRAINT bill_attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES user_data(id) ON DELETE SET NULL;
ALTER TABLE public.bill_line_items ADD CONSTRAINT bill_line_items_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE;
ALTER TABLE public.bill_line_items ADD CONSTRAINT bill_line_items_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES inventory_item_brand_variants(id) ON DELETE SET NULL;
ALTER TABLE public.bills ADD CONSTRAINT bills_division_id_fkey FOREIGN KEY (division_id) REFERENCES company_divisions(id);
ALTER TABLE public.bills ADD CONSTRAINT bills_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id);
ALTER TABLE public.bills ADD CONSTRAINT bills_receival_id_fkey FOREIGN KEY (receival_id) REFERENCES receivals(id);
ALTER TABLE public.bills ADD CONSTRAINT bills_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id);
ALTER TABLE public.brand_group_members ADD CONSTRAINT brand_group_members_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE;
ALTER TABLE public.brand_group_members ADD CONSTRAINT brand_group_members_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_data(id);
ALTER TABLE public.brand_group_members ADD CONSTRAINT brand_group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES brand_groups(id) ON DELETE CASCADE;
ALTER TABLE public.brand_groups ADD CONSTRAINT brand_groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_data(id);
ALTER TABLE public.call_records ADD CONSTRAINT call_records_initiated_by_fkey FOREIGN KEY (initiated_by) REFERENCES user_data(id);
ALTER TABLE public.call_records ADD CONSTRAINT call_records_message_id_fkey FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE;
ALTER TABLE public.chat_conversations ADD CONSTRAINT chat_conversations_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES service_customers(id) ON DELETE SET NULL;
ALTER TABLE public.chat_conversations ADD CONSTRAINT chat_conversations_customer_id_v2_fkey FOREIGN KEY (customer_id_v2) REFERENCES service_customers(id) ON DELETE SET NULL;
ALTER TABLE public.chat_conversations ADD CONSTRAINT chat_conversations_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES user_data(id);
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES user_data(id);
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_phone_id_fkey FOREIGN KEY (phone_id) REFERENCES service_customer_phones(id) ON DELETE SET NULL;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_purge_batch_id_fkey FOREIGN KEY (purge_batch_id) REFERENCES purge_batches(id) ON DELETE SET NULL;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_sent_by_profile_id_fkey FOREIGN KEY (sent_by_profile_id) REFERENCES user_data(id) ON DELETE SET NULL;
ALTER TABLE public.cogs_entries ADD CONSTRAINT cogs_entries_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES inventory_item_brand_variants(id);
ALTER TABLE public.cogs_entries ADD CONSTRAINT cogs_entries_consumer_customer_id_fkey FOREIGN KEY (consumer_customer_id) REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE public.cogs_entries ADD CONSTRAINT cogs_entries_consumer_division_id_fkey FOREIGN KEY (consumer_division_id) REFERENCES company_divisions(id);
ALTER TABLE public.cogs_entries ADD CONSTRAINT cogs_entries_consumer_sub_container_id_fkey FOREIGN KEY (consumer_sub_container_id) REFERENCES warehouse_sub_containers(id) ON DELETE SET NULL;
ALTER TABLE public.cogs_entries ADD CONSTRAINT cogs_entries_consumption_id_fkey FOREIGN KEY (consumption_id) REFERENCES consumption_entries(id) ON DELETE SET NULL;
ALTER TABLE public.cogs_entries ADD CONSTRAINT cogs_entries_discipline_id_fkey FOREIGN KEY (discipline_id) REFERENCES disciplines(id) ON DELETE SET NULL;
ALTER TABLE public.cogs_entries ADD CONSTRAINT cogs_entries_division_id_fkey FOREIGN KEY (division_id) REFERENCES company_divisions(id);
ALTER TABLE public.cogs_entries ADD CONSTRAINT cogs_entries_landed_cost_id_fkey FOREIGN KEY (landed_cost_id) REFERENCES landed_costs(id);
ALTER TABLE public.cogs_entries ADD CONSTRAINT cogs_entries_milestone_id_fkey FOREIGN KEY (milestone_id) REFERENCES project_milestones(id) ON DELETE SET NULL;
ALTER TABLE public.cogs_entries ADD CONSTRAINT cogs_entries_sale_delivery_id_fkey FOREIGN KEY (sale_delivery_id) REFERENCES sale_deliveries(id);
ALTER TABLE public.cogs_entries ADD CONSTRAINT cogs_entries_sale_order_id_fkey FOREIGN KEY (sale_order_id) REFERENCES sale_orders(id);
ALTER TABLE public.cogs_entries ADD CONSTRAINT cogs_entries_source_id_fkey FOREIGN KEY (source_id) REFERENCES fifo_cost_layers(id) ON DELETE SET NULL;
ALTER TABLE public.companies ADD CONSTRAINT companies_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.companies ADD CONSTRAINT companies_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES currencies(id);
ALTER TABLE public.company_divisions ADD CONSTRAINT company_divisions_calendar_schedule_id_fkey FOREIGN KEY (calendar_schedule_id) REFERENCES schedules(id) ON DELETE SET NULL;
ALTER TABLE public.company_divisions ADD CONSTRAINT company_divisions_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES currencies(id);
ALTER TABLE public.company_divisions ADD CONSTRAINT divisions_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id);
ALTER TABLE public.company_divisions ADD CONSTRAINT divisions_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_data(id);
ALTER TABLE public.consumption_edit_requests ADD CONSTRAINT consumption_edit_requests_consumption_id_fkey FOREIGN KEY (consumption_id) REFERENCES consumption_entries(id) ON DELETE CASCADE;
ALTER TABLE public.consumption_edit_requests ADD CONSTRAINT consumption_edit_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES user_data(id);
ALTER TABLE public.consumption_edit_requests ADD CONSTRAINT consumption_edit_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES user_data(id);
ALTER TABLE public.consumption_entries ADD CONSTRAINT consumption_entries_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES user_data(id) ON DELETE SET NULL;
ALTER TABLE public.consumption_entries ADD CONSTRAINT consumption_entries_consumer_customer_id_fkey FOREIGN KEY (consumer_customer_id) REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE public.consumption_entries ADD CONSTRAINT consumption_entries_consumer_sub_container_id_fkey FOREIGN KEY (consumer_sub_container_id) REFERENCES warehouse_sub_containers(id) ON DELETE SET NULL;
ALTER TABLE public.consumption_entries ADD CONSTRAINT consumption_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_data(id) ON DELETE SET NULL;
ALTER TABLE public.consumption_entries ADD CONSTRAINT consumption_entries_discipline_id_fkey FOREIGN KEY (discipline_id) REFERENCES disciplines(id) ON DELETE SET NULL;
ALTER TABLE public.consumption_entries ADD CONSTRAINT consumption_entries_division_id_fkey FOREIGN KEY (division_id) REFERENCES company_divisions(id) ON DELETE SET NULL;
ALTER TABLE public.consumption_entries ADD CONSTRAINT consumption_entries_milestone_id_fkey FOREIGN KEY (milestone_id) REFERENCES project_milestones(id) ON DELETE SET NULL;
ALTER TABLE public.consumption_entries ADD CONSTRAINT consumption_entries_posted_by_fkey FOREIGN KEY (posted_by) REFERENCES user_data(id) ON DELETE SET NULL;
ALTER TABLE public.consumption_entries ADD CONSTRAINT consumption_entries_source_sub_container_id_fkey FOREIGN KEY (source_sub_container_id) REFERENCES warehouse_sub_containers(id) ON DELETE RESTRICT;
ALTER TABLE public.consumption_entries ADD CONSTRAINT consumption_entries_source_warehouse_id_fkey FOREIGN KEY (source_warehouse_id) REFERENCES warehouses(id) ON DELETE RESTRICT;
ALTER TABLE public.consumption_lines ADD CONSTRAINT consumption_lines_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES inventory_item_brand_variants(id) ON DELETE RESTRICT;
ALTER TABLE public.consumption_lines ADD CONSTRAINT consumption_lines_consumption_id_fkey FOREIGN KEY (consumption_id) REFERENCES consumption_entries(id) ON DELETE CASCADE;
ALTER TABLE public.contract_milestones ADD CONSTRAINT contract_milestones_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE;
ALTER TABLE public.contract_payments ADD CONSTRAINT contract_payments_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE;
ALTER TABLE public.contract_services ADD CONSTRAINT contract_services_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES brands(id);
ALTER TABLE public.contract_services ADD CONSTRAINT contract_services_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE;
ALTER TABLE public.contract_services ADD CONSTRAINT contract_services_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id);
ALTER TABLE public.contract_visits ADD CONSTRAINT contract_visits_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE;
ALTER TABLE public.contract_visits ADD CONSTRAINT contract_visits_contract_service_id_fkey FOREIGN KEY (contract_service_id) REFERENCES contract_services(id) ON DELETE SET NULL;
ALTER TABLE public.contract_visits ADD CONSTRAINT contract_visits_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id);
ALTER TABLE public.contracts ADD CONSTRAINT contracts_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES user_data(id);
ALTER TABLE public.contracts ADD CONSTRAINT contracts_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_data(id);
ALTER TABLE public.contracts ADD CONSTRAINT contracts_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);
ALTER TABLE public.contracts ADD CONSTRAINT contracts_phone_id_fkey FOREIGN KEY (phone_id) REFERENCES service_customer_phones(id);
ALTER TABLE public.contracts ADD CONSTRAINT contracts_rejected_by_fkey FOREIGN KEY (rejected_by) REFERENCES user_data(id);
ALTER TABLE public.contracts ADD CONSTRAINT contracts_service_customer_id_fkey FOREIGN KEY (service_customer_id) REFERENCES service_customers(id);
ALTER TABLE public.credit_group_payment_methods ADD CONSTRAINT credit_group_payment_methods_credit_group_id_fkey FOREIGN KEY (credit_group_id) REFERENCES credit_groups(id) ON DELETE CASCADE;
ALTER TABLE public.credit_group_payment_methods ADD CONSTRAINT credit_group_payment_methods_payment_method_id_fkey FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE CASCADE;
ALTER TABLE public.credit_note_lines ADD CONSTRAINT credit_note_lines_credit_note_id_fkey FOREIGN KEY (credit_note_id) REFERENCES credit_notes(id) ON DELETE CASCADE;
ALTER TABLE public.credit_note_lines ADD CONSTRAINT credit_note_lines_invoice_line_id_fkey FOREIGN KEY (invoice_line_id) REFERENCES invoice_line_items(id);
ALTER TABLE public.credit_notes ADD CONSTRAINT credit_notes_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);
ALTER TABLE public.credit_notes ADD CONSTRAINT credit_notes_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES so_invoices(id);
ALTER TABLE public.credit_notes ADD CONSTRAINT credit_notes_reason_id_fkey FOREIGN KEY (reason_id) REFERENCES reason_lists(id);
ALTER TABLE public.credit_notes ADD CONSTRAINT credit_notes_refund_method_id_fkey FOREIGN KEY (refund_method_id) REFERENCES payment_methods(id);
ALTER TABLE public.credit_notes ADD CONSTRAINT credit_notes_source_return_id_fkey FOREIGN KEY (source_return_id) REFERENCES so_po_returns(id) ON DELETE SET NULL;
ALTER TABLE public.custom_roles ADD CONSTRAINT custom_roles_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_data(id);
ALTER TABLE public.customer_addresses ADD CONSTRAINT customer_addresses_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
ALTER TABLE public.customer_addresses ADD CONSTRAINT customer_addresses_phone_id_fkey FOREIGN KEY (phone_id) REFERENCES customer_phones(id) ON DELETE CASCADE;
ALTER TABLE public.customer_blocks ADD CONSTRAINT customer_blocks_blocked_by_fkey FOREIGN KEY (blocked_by) REFERENCES user_data(id) ON DELETE SET NULL;
ALTER TABLE public.customer_blocks ADD CONSTRAINT customer_blocks_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES service_customers(id) ON DELETE CASCADE;
ALTER TABLE public.customer_credit_docs ADD CONSTRAINT customer_credit_docs_new_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
ALTER TABLE public.customer_credit_group_approvals ADD CONSTRAINT customer_credit_group_approvals_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES user_data(id);
ALTER TABLE public.customer_credit_group_approvals ADD CONSTRAINT customer_credit_group_approvals_request_id_fkey FOREIGN KEY (request_id) REFERENCES customer_credit_group_requests(id) ON DELETE CASCADE;
ALTER TABLE public.customer_credit_group_requests ADD CONSTRAINT customer_credit_group_requests_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
ALTER TABLE public.customer_credit_group_requests ADD CONSTRAINT customer_credit_group_requests_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES user_data(id);
ALTER TABLE public.customer_credit_group_requests ADD CONSTRAINT customer_credit_group_requests_previous_group_id_fkey FOREIGN KEY (previous_group_id) REFERENCES credit_groups(id);
ALTER TABLE public.customer_credit_group_requests ADD CONSTRAINT customer_credit_group_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES user_data(id);
ALTER TABLE public.customer_credit_group_requests ADD CONSTRAINT customer_credit_group_requests_requested_group_id_fkey FOREIGN KEY (requested_group_id) REFERENCES credit_groups(id);
ALTER TABLE public.customer_phones ADD CONSTRAINT customer_phones_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
ALTER TABLE public.customer_subscriptions ADD CONSTRAINT customer_subscriptions_package_id_fkey FOREIGN KEY (package_id) REFERENCES subscription_packages(id);
ALTER TABLE public.customer_subscriptions ADD CONSTRAINT fk_customer_subscriptions_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT;
ALTER TABLE public.customers ADD CONSTRAINT customers_credit_group_id_fkey FOREIGN KEY (credit_group_id) REFERENCES credit_groups(id);
ALTER TABLE public.debit_note_lines ADD CONSTRAINT debit_note_lines_debit_note_id_fkey FOREIGN KEY (debit_note_id) REFERENCES debit_notes(id) ON DELETE CASCADE;
ALTER TABLE public.debit_notes ADD CONSTRAINT debit_notes_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES bills(id);
ALTER TABLE public.debit_notes ADD CONSTRAINT debit_notes_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id);
ALTER TABLE public.debit_notes ADD CONSTRAINT debit_notes_reason_id_fkey FOREIGN KEY (reason_id) REFERENCES reason_lists(id);
ALTER TABLE public.debit_notes ADD CONSTRAINT debit_notes_source_return_id_fkey FOREIGN KEY (source_return_id) REFERENCES so_po_returns(id);
ALTER TABLE public.debit_notes ADD CONSTRAINT debit_notes_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id);
ALTER TABLE public.document_terms ADD CONSTRAINT document_terms_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_data(id);
ALTER TABLE public.document_terms ADD CONSTRAINT document_terms_division_id_fkey FOREIGN KEY (division_id) REFERENCES company_divisions(id);
ALTER TABLE public.employee_services ADD CONSTRAINT employee_services_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
ALTER TABLE public.employee_services ADD CONSTRAINT employee_services_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE;
ALTER TABLE public.employees ADD CONSTRAINT employees_division_id_fkey FOREIGN KEY (division_id) REFERENCES company_divisions(id) ON DELETE SET NULL;
ALTER TABLE public.employees ADD CONSTRAINT employees_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES user_data(id) ON DELETE SET NULL;
ALTER TABLE public.employees ADD CONSTRAINT fk_employee_team FOREIGN KEY (team_id) REFERENCES teams(id);
ALTER TABLE public.exchange_rate_change_log ADD CONSTRAINT exchange_rate_change_log_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES user_data(id);
ALTER TABLE public.fifo_cost_layers ADD CONSTRAINT fifo_cost_layers_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES inventory_item_brand_variants(id) ON DELETE RESTRICT;
ALTER TABLE public.fifo_cost_layers ADD CONSTRAINT fifo_cost_layers_receival_id_fkey FOREIGN KEY (receival_id) REFERENCES receivals(id);
ALTER TABLE public.fifo_cost_layers ADD CONSTRAINT fifo_cost_layers_sub_container_id_fkey FOREIGN KEY (sub_container_id) REFERENCES warehouse_sub_containers(id) ON DELETE RESTRICT;
ALTER TABLE public.fifo_cost_layers ADD CONSTRAINT fifo_cost_layers_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES warehouses(id);
ALTER TABLE public.follow_up_requests ADD CONSTRAINT follow_up_requests_confirmed_by_user_id_fkey FOREIGN KEY (confirmed_by_user_id) REFERENCES auth.users(id);
ALTER TABLE public.follow_up_requests ADD CONSTRAINT follow_up_requests_parent_order_id_fkey FOREIGN KEY (parent_order_id) REFERENCES orders(id);
ALTER TABLE public.follow_up_requests ADD CONSTRAINT follow_up_requests_requested_by_user_id_fkey FOREIGN KEY (requested_by_user_id) REFERENCES auth.users(id);
ALTER TABLE public.follow_up_requests ADD CONSTRAINT follow_up_requests_requested_team_id_fkey FOREIGN KEY (requested_team_id) REFERENCES teams(id);
ALTER TABLE public.follow_up_requests ADD CONSTRAINT follow_up_requests_resulting_order_id_fkey FOREIGN KEY (resulting_order_id) REFERENCES orders(id);
ALTER TABLE public.installed_products ADD CONSTRAINT installed_products_address_id_fkey FOREIGN KEY (address_id) REFERENCES customer_addresses(id);
ALTER TABLE public.installed_products ADD CONSTRAINT installed_products_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
ALTER TABLE public.installed_products ADD CONSTRAINT installed_products_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id);
ALTER TABLE public.installed_products ADD CONSTRAINT installed_products_phone_id_fkey FOREIGN KEY (phone_id) REFERENCES customer_phones(id);
ALTER TABLE public.inventory_attribute_definitions ADD CONSTRAINT inventory_attribute_definitions_category_id_fkey FOREIGN KEY (category_id) REFERENCES inventory_categories(id) ON DELETE CASCADE;
ALTER TABLE public.inventory_attribute_definitions ADD CONSTRAINT inventory_attribute_definitions_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_data(id) ON DELETE SET NULL;
ALTER TABLE public.inventory_attribute_options ADD CONSTRAINT inventory_attribute_options_definition_id_fkey FOREIGN KEY (definition_id) REFERENCES inventory_attribute_definitions(id) ON DELETE CASCADE;
ALTER TABLE public.inventory_categories ADD CONSTRAINT inventory_categories_default_sub_container_id_fkey FOREIGN KEY (default_sub_container_id) REFERENCES warehouse_sub_containers(id) ON DELETE SET NULL;
ALTER TABLE public.inventory_categories ADD CONSTRAINT inventory_categories_default_warranty_policy_id_fkey FOREIGN KEY (default_warranty_policy_id) REFERENCES warranty_policies(id) ON DELETE SET NULL;
ALTER TABLE public.inventory_categories ADD CONSTRAINT inventory_categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES inventory_categories(id) ON DELETE RESTRICT;
ALTER TABLE public.inventory_category_divisions ADD CONSTRAINT inventory_category_divisions_category_id_fkey FOREIGN KEY (category_id) REFERENCES inventory_categories(id) ON DELETE CASCADE;
ALTER TABLE public.inventory_category_divisions ADD CONSTRAINT inventory_category_divisions_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_data(id);
ALTER TABLE public.inventory_category_divisions ADD CONSTRAINT inventory_category_divisions_division_id_fkey FOREIGN KEY (division_id) REFERENCES company_divisions(id) ON DELETE CASCADE;
ALTER TABLE public.inventory_check_approvals ADD CONSTRAINT inventory_check_approvals_check_id_fkey FOREIGN KEY (check_id) REFERENCES inventory_checks(id) ON DELETE CASCADE;
ALTER TABLE public.inventory_check_approvals ADD CONSTRAINT inventory_check_approvals_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES user_data(id);
ALTER TABLE public.inventory_check_assignments ADD CONSTRAINT inventory_check_assignments_check_id_fkey FOREIGN KEY (check_id) REFERENCES inventory_checks(id) ON DELETE CASCADE;
ALTER TABLE public.inventory_check_assignments ADD CONSTRAINT inventory_check_assignments_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES user_data(id);
ALTER TABLE public.inventory_check_items ADD CONSTRAINT inventory_check_items_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES inventory_check_assignments(id) ON DELETE SET NULL;
ALTER TABLE public.inventory_check_items ADD CONSTRAINT inventory_check_items_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES inventory_item_brand_variants(id);
ALTER TABLE public.inventory_check_items ADD CONSTRAINT inventory_check_items_check_id_fkey FOREIGN KEY (check_id) REFERENCES inventory_checks(id);
ALTER TABLE public.inventory_check_log ADD CONSTRAINT inventory_check_log_check_id_fkey FOREIGN KEY (check_id) REFERENCES inventory_checks(id) ON DELETE CASCADE;
ALTER TABLE public.inventory_check_log ADD CONSTRAINT inventory_check_log_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES user_data(id);
ALTER TABLE public.inventory_checks ADD CONSTRAINT inventory_checks_initiated_by_profile_id_fkey FOREIGN KEY (initiated_by_profile_id) REFERENCES user_data(id);
ALTER TABLE public.inventory_checks ADD CONSTRAINT inventory_checks_sub_container_id_fkey FOREIGN KEY (sub_container_id) REFERENCES warehouse_sub_containers(id) ON DELETE RESTRICT;
ALTER TABLE public.inventory_checks ADD CONSTRAINT inventory_checks_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES warehouses(id);
ALTER TABLE public.inventory_damaged_movements ADD CONSTRAINT inventory_damaged_movements_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES inventory_item_brand_variants(id) ON DELETE RESTRICT;
ALTER TABLE public.inventory_damaged_movements ADD CONSTRAINT inventory_damaged_movements_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_data(id) ON DELETE SET NULL;
ALTER TABLE public.inventory_damaged_movements ADD CONSTRAINT inventory_damaged_movements_division_id_fkey FOREIGN KEY (division_id) REFERENCES company_divisions(id) ON DELETE SET NULL;
ALTER TABLE public.inventory_damaged_movements ADD CONSTRAINT inventory_damaged_movements_source_return_line_disposition_fkey FOREIGN KEY (source_return_line_disposition_id) REFERENCES return_line_inventory_dispositions(id) ON DELETE SET NULL;
ALTER TABLE public.inventory_damaged_movements ADD CONSTRAINT inventory_damaged_movements_source_transfer_id_fkey FOREIGN KEY (source_transfer_id) REFERENCES warehouse_transfers(id) ON DELETE SET NULL;
ALTER TABLE public.inventory_damaged_movements ADD CONSTRAINT inventory_damaged_movements_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE RESTRICT;
ALTER TABLE public.inventory_damaged_stock ADD CONSTRAINT inventory_damaged_stock_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES inventory_item_brand_variants(id) ON DELETE RESTRICT;
ALTER TABLE public.inventory_damaged_stock ADD CONSTRAINT inventory_damaged_stock_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE RESTRICT;
ALTER TABLE public.inventory_damaged_stock_layers ADD CONSTRAINT inventory_damaged_stock_layers_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES inventory_item_brand_variants(id) ON DELETE RESTRICT;
ALTER TABLE public.inventory_damaged_stock_layers ADD CONSTRAINT inventory_damaged_stock_layers_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_data(id) ON DELETE SET NULL;
ALTER TABLE public.inventory_damaged_stock_layers ADD CONSTRAINT inventory_damaged_stock_layers_division_id_fkey FOREIGN KEY (division_id) REFERENCES company_divisions(id) ON DELETE SET NULL;
ALTER TABLE public.inventory_damaged_stock_layers ADD CONSTRAINT inventory_damaged_stock_layers_source_return_line_id_fkey FOREIGN KEY (source_return_line_id) REFERENCES return_lines(id) ON DELETE SET NULL;
ALTER TABLE public.inventory_damaged_stock_layers ADD CONSTRAINT inventory_damaged_stock_layers_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE RESTRICT;
ALTER TABLE public.inventory_item_attributes ADD CONSTRAINT inventory_item_attributes_definition_id_fkey FOREIGN KEY (definition_id) REFERENCES inventory_attribute_definitions(id) ON DELETE CASCADE;
ALTER TABLE public.inventory_item_attributes ADD CONSTRAINT inventory_item_attributes_item_id_fkey FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE CASCADE;
ALTER TABLE public.inventory_item_attributes ADD CONSTRAINT inventory_item_attributes_option_id_fkey FOREIGN KEY (option_id) REFERENCES inventory_attribute_options(id) ON DELETE RESTRICT;
ALTER TABLE public.inventory_item_attributes ADD CONSTRAINT inventory_item_attributes_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES user_data(id) ON DELETE SET NULL;
ALTER TABLE public.inventory_item_brand_variants ADD CONSTRAINT inventory_brand_variants_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL;
ALTER TABLE public.inventory_item_brand_variants ADD CONSTRAINT inventory_brand_variants_item_id_fkey FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE CASCADE;
ALTER TABLE public.inventory_item_brand_variants ADD CONSTRAINT inventory_item_brand_variants_country_id_fkey FOREIGN KEY (country_id) REFERENCES country_codes(id) ON DELETE SET NULL;
ALTER TABLE public.inventory_item_divisions ADD CONSTRAINT inventory_item_divisions_category_id_fkey FOREIGN KEY (category_id) REFERENCES inventory_categories(id) ON DELETE SET NULL;
ALTER TABLE public.inventory_item_divisions ADD CONSTRAINT inventory_item_divisions_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_data(id);
ALTER TABLE public.inventory_item_divisions ADD CONSTRAINT inventory_item_divisions_division_id_fkey FOREIGN KEY (division_id) REFERENCES company_divisions(id) ON DELETE CASCADE;
ALTER TABLE public.inventory_item_divisions ADD CONSTRAINT inventory_item_divisions_item_id_fkey FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE CASCADE;
ALTER TABLE public.inventory_items ADD CONSTRAINT inventory_items_category_id_fkey FOREIGN KEY (category_id) REFERENCES inventory_categories(id);
ALTER TABLE public.inventory_items ADD CONSTRAINT inventory_items_default_sub_container_id_fkey FOREIGN KEY (default_sub_container_id) REFERENCES warehouse_sub_containers(id) ON DELETE SET NULL;
ALTER TABLE public.inventory_items ADD CONSTRAINT inventory_items_default_warehouse_id_fkey FOREIGN KEY (default_warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL;
ALTER TABLE public.inventory_items ADD CONSTRAINT inventory_items_warranty_policy_id_fkey FOREIGN KEY (warranty_policy_id) REFERENCES warranty_policies(id) ON DELETE SET NULL;
ALTER TABLE public.inventory_stock_movements ADD CONSTRAINT inventory_stock_movements_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES inventory_item_brand_variants(id);
ALTER TABLE public.inventory_stock_movements ADD CONSTRAINT inventory_stock_movements_sub_container_id_fkey FOREIGN KEY (sub_container_id) REFERENCES warehouse_sub_containers(id) ON DELETE RESTRICT;
ALTER TABLE public.inventory_stock_movements ADD CONSTRAINT inventory_stock_movements_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES warehouses(id);
ALTER TABLE public.invoice_line_items ADD CONSTRAINT invoice_line_items_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES inventory_item_brand_variants(id) ON DELETE SET NULL;
ALTER TABLE public.invoice_line_items ADD CONSTRAINT invoice_line_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES so_invoices(id) ON DELETE CASCADE;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_phone_id_fkey FOREIGN KEY (phone_id) REFERENCES customer_phones(id) ON DELETE SET NULL;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_receival_id_fkey FOREIGN KEY (receival_id) REFERENCES receivals(id);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_sale_delivery_id_fkey FOREIGN KEY (sale_delivery_id) REFERENCES sale_deliveries(id);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_sale_order_id_fkey FOREIGN KEY (sale_order_id) REFERENCES sale_orders(id);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id);
ALTER TABLE public.landed_cost_item_allocations ADD CONSTRAINT landed_cost_item_alloc_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES inventory_item_brand_variants(id);
ALTER TABLE public.landed_cost_item_allocations ADD CONSTRAINT landed_cost_item_allocations_landed_cost_id_fkey FOREIGN KEY (landed_cost_id) REFERENCES landed_costs(id) ON DELETE CASCADE;
ALTER TABLE public.landed_cost_lines ADD CONSTRAINT landed_cost_lines_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES currencies(id);
ALTER TABLE public.landed_cost_lines ADD CONSTRAINT landed_cost_lines_landed_cost_id_fkey FOREIGN KEY (landed_cost_id) REFERENCES landed_costs(id) ON DELETE CASCADE;
ALTER TABLE public.landed_costs ADD CONSTRAINT landed_costs_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES currencies(id);
ALTER TABLE public.media_download_jobs ADD CONSTRAINT media_download_jobs_message_id_fkey FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE;
ALTER TABLE public.notification_config ADD CONSTRAINT notification_config_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_data(id);
ALTER TABLE public.notification_templates ADD CONSTRAINT notification_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_data(id);
ALTER TABLE public.notifications ADD CONSTRAINT notifications_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES user_data(id) ON DELETE CASCADE;
ALTER TABLE public.order_log ADD CONSTRAINT order_log_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
ALTER TABLE public.order_quotation_line_items ADD CONSTRAINT order_quotation_line_items_quotation_id_fkey FOREIGN KEY (quotation_id) REFERENCES order_quotations(id) ON DELETE CASCADE;
ALTER TABLE public.order_quotation_line_items ADD CONSTRAINT quotation_line_items_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id);
ALTER TABLE public.order_quotation_log ADD CONSTRAINT order_quotation_log_quotation_id_fkey FOREIGN KEY (quotation_id) REFERENCES order_quotations(id) ON DELETE CASCADE;
ALTER TABLE public.order_quotations ADD CONSTRAINT order_quotations_converted_order_id_fkey FOREIGN KEY (converted_order_id) REFERENCES orders(id);
ALTER TABLE public.order_quotations ADD CONSTRAINT order_quotations_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);
ALTER TABLE public.order_quotations ADD CONSTRAINT order_quotations_service_customer_id_fkey FOREIGN KEY (service_customer_id) REFERENCES service_customers(id);
ALTER TABLE public.order_services ADD CONSTRAINT order_services_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
ALTER TABLE public.order_services ADD CONSTRAINT order_services_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id);
ALTER TABLE public.order_team_assignments ADD CONSTRAINT order_team_assignments_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
ALTER TABLE public.order_team_assignments ADD CONSTRAINT order_team_assignments_parent_assignment_id_fkey FOREIGN KEY (parent_assignment_id) REFERENCES order_team_assignments(id);
ALTER TABLE public.order_team_assignments ADD CONSTRAINT order_team_assignments_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id);
ALTER TABLE public.order_visit_dates ADD CONSTRAINT order_visit_dates_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
ALTER TABLE public.orders ADD CONSTRAINT orders_address_id_fkey FOREIGN KEY (address_id) REFERENCES service_customer_addresses(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD CONSTRAINT orders_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES user_data(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD CONSTRAINT orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_data(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);
ALTER TABLE public.orders ADD CONSTRAINT orders_follow_up_request_id_fkey FOREIGN KEY (follow_up_request_id) REFERENCES follow_up_requests(id);
ALTER TABLE public.orders ADD CONSTRAINT orders_parent_order_id_fkey FOREIGN KEY (parent_order_id) REFERENCES orders(id);
ALTER TABLE public.orders ADD CONSTRAINT orders_service_customer_id_fkey FOREIGN KEY (service_customer_id) REFERENCES service_customers(id);
ALTER TABLE public.payment_bill_allocations ADD CONSTRAINT payment_bill_allocations_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE;
ALTER TABLE public.payment_bill_allocations ADD CONSTRAINT payment_bill_allocations_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE;
ALTER TABLE public.payment_installments ADD CONSTRAINT payment_installments_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES payments(id);
ALTER TABLE public.payment_installments ADD CONSTRAINT payment_installments_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES payment_plans(id) ON DELETE CASCADE;
ALTER TABLE public.payment_plans ADD CONSTRAINT payment_plans_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE;
ALTER TABLE public.payment_plans ADD CONSTRAINT payment_plans_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES so_invoices(id) ON DELETE CASCADE;
ALTER TABLE public.payments ADD CONSTRAINT payments_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES bills(id);
ALTER TABLE public.payments ADD CONSTRAINT payments_credit_note_id_fkey FOREIGN KEY (credit_note_id) REFERENCES credit_notes(id) ON DELETE SET NULL;
ALTER TABLE public.payments ADD CONSTRAINT payments_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES currencies(id);
ALTER TABLE public.payments ADD CONSTRAINT payments_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);
ALTER TABLE public.payments ADD CONSTRAINT payments_debit_note_id_fkey FOREIGN KEY (debit_note_id) REFERENCES debit_notes(id);
ALTER TABLE public.payments ADD CONSTRAINT payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES so_invoices(id);
ALTER TABLE public.payments ADD CONSTRAINT payments_method_id_fkey FOREIGN KEY (method_id) REFERENCES payment_methods(id);
ALTER TABLE public.payments ADD CONSTRAINT payments_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;
ALTER TABLE public.po_approval_chain_tiers ADD CONSTRAINT approval_chain_tiers_chain_id_fkey FOREIGN KEY (chain_id) REFERENCES po_approval_chains(id) ON DELETE CASCADE;
ALTER TABLE public.po_approval_chains ADD CONSTRAINT approval_chains_division_id_fkey FOREIGN KEY (division_id) REFERENCES company_divisions(id);
ALTER TABLE public.po_approvals ADD CONSTRAINT po_approvals_po_id_fkey FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE;
ALTER TABLE public.po_edit_requests ADD CONSTRAINT po_edit_requests_po_id_fkey FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE;
ALTER TABLE public.po_edit_requests ADD CONSTRAINT po_edit_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES user_data(id);
ALTER TABLE public.po_edit_requests ADD CONSTRAINT po_edit_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES user_data(id);
ALTER TABLE public.po_line_items ADD CONSTRAINT po_line_items_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES brands(id);
ALTER TABLE public.po_line_items ADD CONSTRAINT po_line_items_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES inventory_item_brand_variants(id) ON DELETE SET NULL;
ALTER TABLE public.po_line_items ADD CONSTRAINT po_line_items_division_id_fkey FOREIGN KEY (division_id) REFERENCES company_divisions(id) ON DELETE SET NULL;
ALTER TABLE public.po_line_items ADD CONSTRAINT po_line_items_po_id_fkey FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE;
ALTER TABLE public.po_rfq_quote_items ADD CONSTRAINT po_rfq_quote_items_po_line_item_id_fkey FOREIGN KEY (po_line_item_id) REFERENCES po_line_items(id) ON DELETE CASCADE;
ALTER TABLE public.po_rfq_quote_items ADD CONSTRAINT po_rfq_quote_items_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES po_rfq_quotes(id) ON DELETE CASCADE;
ALTER TABLE public.po_rfq_quotes ADD CONSTRAINT po_rfq_quotes_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES currencies(id);
ALTER TABLE public.po_rfq_quotes ADD CONSTRAINT po_rfq_quotes_po_id_fkey FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE;
ALTER TABLE public.po_rfq_quotes ADD CONSTRAINT po_rfq_quotes_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id);
ALTER TABLE public.po_version_lines ADD CONSTRAINT po_version_lines_po_version_id_fkey FOREIGN KEY (po_version_id) REFERENCES po_versions(id) ON DELETE CASCADE;
ALTER TABLE public.po_versions ADD CONSTRAINT po_versions_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES currencies(id);
ALTER TABLE public.po_versions ADD CONSTRAINT po_versions_po_id_fkey FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE;
ALTER TABLE public.po_versions ADD CONSTRAINT po_versions_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.po_versions ADD CONSTRAINT po_versions_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id);
ALTER TABLE public.project_disciplines ADD CONSTRAINT project_disciplines_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_data(id);
ALTER TABLE public.project_disciplines ADD CONSTRAINT project_disciplines_discipline_id_fkey FOREIGN KEY (discipline_id) REFERENCES disciplines(id) ON DELETE RESTRICT;
ALTER TABLE public.project_disciplines ADD CONSTRAINT project_disciplines_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE public.project_milestones ADD CONSTRAINT project_milestones_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_data(id);
ALTER TABLE public.project_milestones ADD CONSTRAINT project_milestones_discipline_id_fkey FOREIGN KEY (discipline_id) REFERENCES disciplines(id) ON DELETE RESTRICT;
ALTER TABLE public.project_milestones ADD CONSTRAINT project_milestones_sub_container_id_fkey FOREIGN KEY (sub_container_id) REFERENCES warehouse_sub_containers(id) ON DELETE CASCADE;
ALTER TABLE public.projects ADD CONSTRAINT projects_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_data(id);
ALTER TABLE public.projects ADD CONSTRAINT projects_division_id_fkey FOREIGN KEY (division_id) REFERENCES company_divisions(id);
ALTER TABLE public.projects ADD CONSTRAINT projects_responsible_person_profile_id_fkey FOREIGN KEY (responsible_person_profile_id) REFERENCES user_data(id);
ALTER TABLE public.projects ADD CONSTRAINT projects_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES warehouses(id);
ALTER TABLE public.promotion_rules ADD CONSTRAINT promotion_rules_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES promotion_campaigns(id) ON DELETE CASCADE;
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_created_by_profiles_fkey FOREIGN KEY (created_by) REFERENCES user_data(id) ON DELETE SET NULL;
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES currencies(id);
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_division_id_fkey FOREIGN KEY (division_id) REFERENCES company_divisions(id) ON DELETE RESTRICT;
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_initial_rate_captured_by_fkey FOREIGN KEY (initial_rate_captured_by) REFERENCES user_data(id);
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id);
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES warehouses(id);
ALTER TABLE public.purge_batches ADD CONSTRAINT purge_batches_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES user_data(id);
ALTER TABLE public.qc_checklists ADD CONSTRAINT qc_checklists_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id);
ALTER TABLE public.qc_inspection_results ADD CONSTRAINT qc_inspection_results_qc_team_id_fkey FOREIGN KEY (qc_team_id) REFERENCES teams(id);
ALTER TABLE public.qc_inspection_results ADD CONSTRAINT qc_inspection_results_schedule_entry_id_fkey FOREIGN KEY (schedule_entry_id) REFERENCES qc_schedule(id);
ALTER TABLE public.qc_inspection_results ADD CONSTRAINT qc_inspection_results_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id);
ALTER TABLE public.qc_schedule ADD CONSTRAINT qc_schedule_assigned_qc_team_id_fkey FOREIGN KEY (assigned_qc_team_id) REFERENCES teams(id);
ALTER TABLE public.qc_schedule ADD CONSTRAINT qc_schedule_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id);
ALTER TABLE public.qc_team_scores ADD CONSTRAINT qc_team_scores_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id);
ALTER TABLE public.reason_lists ADD CONSTRAINT reason_lists_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_data(id);
ALTER TABLE public.receival_edit_requests ADD CONSTRAINT receival_edit_requests_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES user_data(id);
ALTER TABLE public.receival_edit_requests ADD CONSTRAINT receival_edit_requests_receival_id_fkey FOREIGN KEY (receival_id) REFERENCES receivals(id);
ALTER TABLE public.receival_edit_requests ADD CONSTRAINT receival_edit_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES user_data(id);
ALTER TABLE public.receival_items ADD CONSTRAINT receival_items_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES inventory_item_brand_variants(id);
ALTER TABLE public.receival_items ADD CONSTRAINT receival_items_po_line_item_id_fkey FOREIGN KEY (po_line_item_id) REFERENCES po_line_items(id);
ALTER TABLE public.receival_items ADD CONSTRAINT receival_items_receival_id_fkey FOREIGN KEY (receival_id) REFERENCES receivals(id) ON DELETE CASCADE;
ALTER TABLE public.receival_items ADD CONSTRAINT receival_items_sub_container_id_fkey FOREIGN KEY (sub_container_id) REFERENCES warehouse_sub_containers(id) ON DELETE RESTRICT;
ALTER TABLE public.receivals ADD CONSTRAINT receivals_carved_from_layer_id_fkey FOREIGN KEY (carved_from_layer_id) REFERENCES fifo_cost_layers(id) ON DELETE SET NULL;
ALTER TABLE public.receivals ADD CONSTRAINT receivals_division_id_fkey FOREIGN KEY (division_id) REFERENCES company_divisions(id);
ALTER TABLE public.receivals ADD CONSTRAINT receivals_po_id_fkey FOREIGN KEY (po_id) REFERENCES purchase_orders(id);
ALTER TABLE public.receivals ADD CONSTRAINT receivals_source_debit_note_id_fkey FOREIGN KEY (source_debit_note_id) REFERENCES credit_notes(id);
ALTER TABLE public.receivals ADD CONSTRAINT receivals_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES warehouses(id);
ALTER TABLE public.reminders ADD CONSTRAINT reminders_category_id_fkey FOREIGN KEY (category_id) REFERENCES reminder_categories(id) ON DELETE CASCADE;
ALTER TABLE public.repair_vendors ADD CONSTRAINT repair_vendors_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_data(id) ON DELETE SET NULL;
ALTER TABLE public.repair_vendors ADD CONSTRAINT repair_vendors_sub_container_id_fkey FOREIGN KEY (sub_container_id) REFERENCES warehouse_sub_containers(id) ON DELETE RESTRICT;
ALTER TABLE public.repair_vendors ADD CONSTRAINT repair_vendors_virtual_warehouse_id_fkey FOREIGN KEY (virtual_warehouse_id) REFERENCES warehouses(id) ON DELETE RESTRICT;
ALTER TABLE public.return_line_customer_resolutions ADD CONSTRAINT return_line_customer_resolutions_credit_note_id_fkey FOREIGN KEY (credit_note_id) REFERENCES credit_notes(id) ON DELETE SET NULL;
ALTER TABLE public.return_line_customer_resolutions ADD CONSTRAINT return_line_customer_resolutions_return_line_id_fkey FOREIGN KEY (return_line_id) REFERENCES return_lines(id) ON DELETE CASCADE;
ALTER TABLE public.return_line_customer_resolutions ADD CONSTRAINT return_line_customer_resolutions_sale_delivery_id_fkey FOREIGN KEY (sale_delivery_id) REFERENCES sale_deliveries(id) ON DELETE SET NULL;
ALTER TABLE public.return_line_inventory_dispositions ADD CONSTRAINT return_line_inventory_disposit_inventory_stock_movement_id_fkey FOREIGN KEY (inventory_stock_movement_id) REFERENCES inventory_stock_movements(id) ON DELETE SET NULL;
ALTER TABLE public.return_line_inventory_dispositions ADD CONSTRAINT return_line_inventory_dispositions_return_line_id_fkey FOREIGN KEY (return_line_id) REFERENCES return_lines(id) ON DELETE CASCADE;
ALTER TABLE public.return_line_inventory_dispositions ADD CONSTRAINT return_line_inventory_dispositions_warehouse_transfer_id_fkey FOREIGN KEY (warehouse_transfer_id) REFERENCES warehouse_transfers(id) ON DELETE SET NULL;
ALTER TABLE public.return_lines ADD CONSTRAINT return_lines_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES inventory_item_brand_variants(id);
ALTER TABLE public.return_lines ADD CONSTRAINT return_lines_consumption_line_id_fkey FOREIGN KEY (consumption_line_id) REFERENCES consumption_lines(id);
ALTER TABLE public.return_lines ADD CONSTRAINT return_lines_receival_item_id_fkey FOREIGN KEY (receival_item_id) REFERENCES receival_items(id);
ALTER TABLE public.return_lines ADD CONSTRAINT return_lines_return_id_fkey FOREIGN KEY (return_id) REFERENCES so_po_returns(id) ON DELETE CASCADE;
ALTER TABLE public.return_lines ADD CONSTRAINT return_lines_sale_delivery_line_id_fkey FOREIGN KEY (sale_delivery_line_id) REFERENCES sale_delivery_lines(id);
ALTER TABLE public.returns ADD CONSTRAINT returns_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_data(id);
ALTER TABLE public.returns ADD CONSTRAINT returns_credit_note_id_fkey FOREIGN KEY (credit_note_id) REFERENCES credit_notes(id);
ALTER TABLE public.returns ADD CONSTRAINT returns_division_id_fkey FOREIGN KEY (division_id) REFERENCES company_divisions(id);
ALTER TABLE public.returns ADD CONSTRAINT returns_restock_warehouse_id_fkey FOREIGN KEY (restock_warehouse_id) REFERENCES warehouses(id);
ALTER TABLE public.sale_deliveries ADD CONSTRAINT sale_deliveries_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_data(id);
ALTER TABLE public.sale_deliveries ADD CONSTRAINT sale_deliveries_return_id_fkey FOREIGN KEY (return_id) REFERENCES so_po_returns(id) ON DELETE SET NULL;
ALTER TABLE public.sale_deliveries ADD CONSTRAINT sale_deliveries_sale_order_id_fkey FOREIGN KEY (sale_order_id) REFERENCES sale_orders(id);
ALTER TABLE public.sale_deliveries ADD CONSTRAINT sale_deliveries_source_credit_note_id_fkey FOREIGN KEY (source_credit_note_id) REFERENCES credit_notes(id);
ALTER TABLE public.sale_deliveries ADD CONSTRAINT sale_deliveries_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES warehouses(id);
ALTER TABLE public.sale_delivery_lines ADD CONSTRAINT sale_delivery_lines_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES inventory_item_brand_variants(id);
ALTER TABLE public.sale_delivery_lines ADD CONSTRAINT sale_delivery_lines_sale_delivery_id_fkey FOREIGN KEY (sale_delivery_id) REFERENCES sale_deliveries(id) ON DELETE CASCADE;
ALTER TABLE public.sale_order_approvals ADD CONSTRAINT approval_requests_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES user_data(id);
ALTER TABLE public.sale_order_approvals ADD CONSTRAINT approval_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES user_data(id);
ALTER TABLE public.sale_order_lines ADD CONSTRAINT sale_order_lines_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES inventory_item_brand_variants(id);
ALTER TABLE public.sale_order_lines ADD CONSTRAINT sale_order_lines_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_data(id);
ALTER TABLE public.sale_order_lines ADD CONSTRAINT sale_order_lines_sale_order_id_fkey FOREIGN KEY (sale_order_id) REFERENCES sale_orders(id);
ALTER TABLE public.sale_orders ADD CONSTRAINT sale_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_data(id);
ALTER TABLE public.sale_orders ADD CONSTRAINT sale_orders_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES currencies(id);
ALTER TABLE public.sale_orders ADD CONSTRAINT sale_orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);
ALTER TABLE public.sale_orders ADD CONSTRAINT sale_orders_division_id_fkey FOREIGN KEY (division_id) REFERENCES company_divisions(id) ON DELETE RESTRICT;
ALTER TABLE public.sale_orders ADD CONSTRAINT sale_orders_initial_rate_captured_by_fkey FOREIGN KEY (initial_rate_captured_by) REFERENCES user_data(id);
ALTER TABLE public.service_brands ADD CONSTRAINT service_brands_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE;
ALTER TABLE public.service_brands ADD CONSTRAINT service_brands_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE;
ALTER TABLE public.service_customer_addresses ADD CONSTRAINT service_customer_addresses_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES service_customers(id) ON DELETE CASCADE;
ALTER TABLE public.service_customer_addresses ADD CONSTRAINT service_customer_addresses_phone_id_fkey FOREIGN KEY (phone_id) REFERENCES service_customer_phones(id) ON DELETE SET NULL;
ALTER TABLE public.service_customer_phones ADD CONSTRAINT service_customer_phones_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES service_customers(id) ON DELETE CASCADE;
ALTER TABLE public.service_edit_requests ADD CONSTRAINT service_change_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES user_data(id);
ALTER TABLE public.service_edit_requests ADD CONSTRAINT service_change_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES user_data(id);
ALTER TABLE public.service_edit_requests ADD CONSTRAINT service_change_requests_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id);
ALTER TABLE public.service_instructions ADD CONSTRAINT service_instructions_instruction_id_fkey FOREIGN KEY (instruction_id) REFERENCES instructions(id) ON DELETE CASCADE;
ALTER TABLE public.service_instructions ADD CONSTRAINT service_instructions_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE;
ALTER TABLE public.service_inventory ADD CONSTRAINT service_inventory_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES inventory_item_brand_variants(id);
ALTER TABLE public.services ADD CONSTRAINT services_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES services(id);
ALTER TABLE public.shipments ADD CONSTRAINT shipments_po_id_fkey FOREIGN KEY (po_id) REFERENCES purchase_orders(id);
ALTER TABLE public.shipments ADD CONSTRAINT shipments_receival_id_fkey FOREIGN KEY (receival_id) REFERENCES receivals(id);
ALTER TABLE public.site_visit_dates ADD CONSTRAINT site_visit_dates_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES site_visits(id) ON DELETE CASCADE;
ALTER TABLE public.site_visit_team_assignments ADD CONSTRAINT site_visit_team_assignments_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id);
ALTER TABLE public.site_visit_team_assignments ADD CONSTRAINT site_visit_team_assignments_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES site_visits(id) ON DELETE CASCADE;
ALTER TABLE public.site_visits ADD CONSTRAINT site_visits_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES user_data(id) ON DELETE SET NULL;
ALTER TABLE public.site_visits ADD CONSTRAINT site_visits_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_data(id) ON DELETE SET NULL;
ALTER TABLE public.site_visits ADD CONSTRAINT site_visits_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);
ALTER TABLE public.site_visits ADD CONSTRAINT site_visits_phone_id_fkey FOREIGN KEY (phone_id) REFERENCES customer_phones(id);
ALTER TABLE public.site_visits ADD CONSTRAINT site_visits_service_customer_id_fkey FOREIGN KEY (service_customer_id) REFERENCES service_customers(id);
ALTER TABLE public.so_invoices ADD CONSTRAINT invoices_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);
ALTER TABLE public.so_invoices ADD CONSTRAINT invoices_division_id_fkey FOREIGN KEY (division_id) REFERENCES company_divisions(id);
ALTER TABLE public.so_invoices ADD CONSTRAINT invoices_sale_order_id_fkey FOREIGN KEY (sale_order_id) REFERENCES sale_orders(id);
ALTER TABLE public.so_po_returns ADD CONSTRAINT returns_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_data(id);
ALTER TABLE public.so_po_returns ADD CONSTRAINT returns_credit_note_id_fkey FOREIGN KEY (credit_note_id) REFERENCES credit_notes(id);
ALTER TABLE public.so_po_returns ADD CONSTRAINT returns_division_id_fkey FOREIGN KEY (division_id) REFERENCES company_divisions(id);
ALTER TABLE public.so_po_returns ADD CONSTRAINT returns_restock_warehouse_id_fkey FOREIGN KEY (restock_warehouse_id) REFERENCES warehouses(id);
ALTER TABLE public.so_po_returns ADD CONSTRAINT so_po_returns_debit_note_id_fkey FOREIGN KEY (debit_note_id) REFERENCES debit_notes(id);
ALTER TABLE public.so_po_returns ADD CONSTRAINT so_po_returns_source_delivery_id_fkey FOREIGN KEY (source_delivery_id) REFERENCES sale_deliveries(id) ON DELETE SET NULL;
ALTER TABLE public.so_po_returns ADD CONSTRAINT so_po_returns_warranty_claim_id_fkey FOREIGN KEY (warranty_claim_id) REFERENCES warranty_claims(id);
ALTER TABLE public.stock_adjustment_approvals ADD CONSTRAINT stock_adjustment_approvals_adjustment_id_fkey FOREIGN KEY (adjustment_id) REFERENCES stock_adjustments(id) ON DELETE CASCADE;
ALTER TABLE public.stock_adjustment_approvals ADD CONSTRAINT stock_adjustment_approvals_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES user_data(id);
ALTER TABLE public.stock_adjustments ADD CONSTRAINT stock_adjustments_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES inventory_item_brand_variants(id);
ALTER TABLE public.stock_adjustments ADD CONSTRAINT stock_adjustments_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES user_data(id);
ALTER TABLE public.stock_adjustments ADD CONSTRAINT stock_adjustments_source_check_id_fkey FOREIGN KEY (source_check_id) REFERENCES inventory_checks(id) ON DELETE SET NULL;
ALTER TABLE public.stock_adjustments ADD CONSTRAINT stock_adjustments_source_check_item_id_fkey FOREIGN KEY (source_check_item_id) REFERENCES inventory_check_items(id) ON DELETE SET NULL;
ALTER TABLE public.stock_adjustments ADD CONSTRAINT stock_adjustments_sub_container_id_fkey FOREIGN KEY (sub_container_id) REFERENCES warehouse_sub_containers(id) ON DELETE RESTRICT;
ALTER TABLE public.stock_adjustments ADD CONSTRAINT stock_adjustments_tool_unit_id_fkey FOREIGN KEY (tool_unit_id) REFERENCES tool_asset_units(id) ON DELETE SET NULL;
ALTER TABLE public.stock_adjustments ADD CONSTRAINT stock_adjustments_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES warehouses(id);
ALTER TABLE public.subscription_package_services ADD CONSTRAINT subscription_package_services_package_id_fkey FOREIGN KEY (package_id) REFERENCES subscription_packages(id) ON DELETE CASCADE;
ALTER TABLE public.subscription_package_services ADD CONSTRAINT subscription_package_services_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT;
ALTER TABLE public.subscription_usage_log ADD CONSTRAINT subscription_usage_log_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES customer_subscriptions(id);
ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_country_id_fkey FOREIGN KEY (country_id) REFERENCES country_codes(id);
ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_data(id);
ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES currencies(id);
ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_division_id_fkey FOREIGN KEY (division_id) REFERENCES company_divisions(id) ON DELETE SET NULL;
ALTER TABLE public.team_activity_log ADD CONSTRAINT team_activity_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES user_data(id) ON DELETE SET NULL;
ALTER TABLE public.team_live_locations ADD CONSTRAINT team_live_locations_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.team_schedule_assignments ADD CONSTRAINT team_schedule_assignments_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES schedules(id);
ALTER TABLE public.team_schedule_assignments ADD CONSTRAINT team_schedule_assignments_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.teams ADD CONSTRAINT teams_division_id_fkey FOREIGN KEY (division_id) REFERENCES company_divisions(id);
ALTER TABLE public.teams ADD CONSTRAINT teams_leader_id_fkey FOREIGN KEY (leader_id) REFERENCES employees(id);
ALTER TABLE public.teams ADD CONSTRAINT teams_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES schedules(id);
ALTER TABLE public.teams ADD CONSTRAINT teams_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES vehicles(id);
ALTER TABLE public.tl_invoice_lines ADD CONSTRAINT tl_invoice_lines_tl_invoice_id_fkey FOREIGN KEY (tl_invoice_id) REFERENCES tl_invoices(id) ON DELETE CASCADE;
ALTER TABLE public.tl_invoice_payments ADD CONSTRAINT tl_invoice_payments_payment_method_id_fkey FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id);
ALTER TABLE public.tl_invoice_payments ADD CONSTRAINT tl_invoice_payments_registered_by_fkey FOREIGN KEY (registered_by) REFERENCES user_data(id);
ALTER TABLE public.tl_invoice_payments ADD CONSTRAINT tl_invoice_payments_tl_invoice_id_fkey FOREIGN KEY (tl_invoice_id) REFERENCES tl_invoices(id) ON DELETE CASCADE;
ALTER TABLE public.tl_invoices ADD CONSTRAINT tl_invoices_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_data(id);
ALTER TABLE public.tl_invoices ADD CONSTRAINT tl_invoices_payment_method_id_fkey FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id);
ALTER TABLE public.tl_payment_batch_items ADD CONSTRAINT tl_payment_batch_items_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES tl_payment_batches(id) ON DELETE CASCADE;
ALTER TABLE public.tl_payment_batch_items ADD CONSTRAINT tl_payment_batch_items_tl_invoice_id_fkey FOREIGN KEY (tl_invoice_id) REFERENCES tl_invoices(id);
ALTER TABLE public.tool_asset_items ADD CONSTRAINT tool_asset_items_category_id_fkey FOREIGN KEY (category_id) REFERENCES inventory_categories(id);
ALTER TABLE public.tool_asset_units ADD CONSTRAINT tool_asset_units_current_custody_location_id_fkey FOREIGN KEY (current_custody_location_id) REFERENCES warehouse_sub_containers(id);
ALTER TABLE public.tool_asset_units ADD CONSTRAINT tool_asset_units_division_id_fkey FOREIGN KEY (division_id) REFERENCES company_divisions(id);
ALTER TABLE public.tool_asset_units ADD CONSTRAINT tool_asset_units_item_id_fkey FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE SET NULL;
ALTER TABLE public.tool_asset_units ADD CONSTRAINT tool_asset_units_receival_item_id_fkey FOREIGN KEY (receival_item_id) REFERENCES receival_items(id) ON DELETE SET NULL;
ALTER TABLE public.tool_assignments ADD CONSTRAINT tool_assignments_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
ALTER TABLE public.tool_assignments ADD CONSTRAINT tool_assignments_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.tool_assignments ADD CONSTRAINT tool_assignments_tool_unit_id_fkey FOREIGN KEY (tool_unit_id) REFERENCES tool_asset_units(id) ON DELETE CASCADE;
ALTER TABLE public.tool_check_sessions ADD CONSTRAINT tool_check_sessions_division_id_fkey FOREIGN KEY (division_id) REFERENCES company_divisions(id);
ALTER TABLE public.tool_unit_assignments ADD CONSTRAINT tool_unit_assignments_custody_location_id_fkey FOREIGN KEY (custody_location_id) REFERENCES warehouse_sub_containers(id);
ALTER TABLE public.tool_unit_assignments ADD CONSTRAINT tool_unit_assignments_returned_to_warehouse_id_fkey FOREIGN KEY (returned_to_warehouse_id) REFERENCES warehouses(id);
ALTER TABLE public.tool_unit_assignments ADD CONSTRAINT tool_unit_assignments_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES tool_asset_units(id) ON DELETE CASCADE;
ALTER TABLE public.tool_unit_inspections ADD CONSTRAINT tool_unit_inspections_custody_location_id_fkey FOREIGN KEY (custody_location_id) REFERENCES warehouse_sub_containers(id);
ALTER TABLE public.tool_unit_inspections ADD CONSTRAINT tool_unit_inspections_session_id_fkey FOREIGN KEY (session_id) REFERENCES tool_check_sessions(id);
ALTER TABLE public.tool_unit_inspections ADD CONSTRAINT tool_unit_inspections_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES tool_asset_units(id) ON DELETE CASCADE;
ALTER TABLE public.traccar_geofences ADD CONSTRAINT traccar_geofences_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_data(id);
ALTER TABLE public.user_company_divisions ADD CONSTRAINT user_divisions_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_data(id);
ALTER TABLE public.user_company_divisions ADD CONSTRAINT user_divisions_division_id_fkey FOREIGN KEY (division_id) REFERENCES company_divisions(id);
ALTER TABLE public.user_company_divisions ADD CONSTRAINT user_divisions_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES user_data(id);
ALTER TABLE public.user_custom_roles ADD CONSTRAINT user_custom_roles_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_data(id);
ALTER TABLE public.user_custom_roles ADD CONSTRAINT user_custom_roles_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES user_data(id);
ALTER TABLE public.user_custom_roles ADD CONSTRAINT user_custom_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES custom_roles(id) ON DELETE CASCADE;
ALTER TABLE public.user_data ADD CONSTRAINT profiles_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.user_data ADD CONSTRAINT user_data_active_division_id_fkey FOREIGN KEY (active_division_id) REFERENCES company_divisions(id) ON DELETE SET NULL;
ALTER TABLE public.vehicles ADD CONSTRAINT fk_vehicle_team FOREIGN KEY (team_id) REFERENCES teams(id);
ALTER TABLE public.voucher_redemptions ADD CONSTRAINT voucher_redemptions_voucher_id_fkey FOREIGN KEY (voucher_id) REFERENCES vouchers(id) ON DELETE CASCADE;
ALTER TABLE public.vouchers ADD CONSTRAINT vouchers_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES promotion_campaigns(id) ON DELETE SET NULL;
ALTER TABLE public.warehouse_field_rps ADD CONSTRAINT warehouse_field_rps_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES user_data(id) ON DELETE CASCADE;
ALTER TABLE public.warehouse_field_rps ADD CONSTRAINT warehouse_field_rps_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE;
ALTER TABLE public.warehouse_item_requests ADD CONSTRAINT warehouse_item_requests_dest_sub_container_id_fkey FOREIGN KEY (dest_sub_container_id) REFERENCES warehouse_sub_containers(id) ON DELETE SET NULL;
ALTER TABLE public.warehouse_item_requests ADD CONSTRAINT warehouse_item_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES user_data(id) ON DELETE SET NULL;
ALTER TABLE public.warehouse_item_requests ADD CONSTRAINT warehouse_item_requests_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES user_data(id) ON DELETE SET NULL;
ALTER TABLE public.warehouse_item_requests ADD CONSTRAINT warehouse_item_requests_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE;
ALTER TABLE public.warehouse_reorder_points ADD CONSTRAINT warehouse_reorder_points_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES inventory_item_brand_variants(id) ON DELETE CASCADE;
ALTER TABLE public.warehouse_reorder_points ADD CONSTRAINT warehouse_reorder_points_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE;
ALTER TABLE public.warehouse_responsible_persons ADD CONSTRAINT warehouse_responsible_persons_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES user_data(id) ON DELETE CASCADE;
ALTER TABLE public.warehouse_responsible_persons ADD CONSTRAINT warehouse_responsible_persons_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE;
ALTER TABLE public.warehouse_stock_allocations ADD CONSTRAINT warehouse_stock_allocations_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES inventory_item_brand_variants(id) ON DELETE CASCADE;
ALTER TABLE public.warehouse_stock_allocations ADD CONSTRAINT warehouse_stock_allocations_sub_container_id_fkey FOREIGN KEY (sub_container_id) REFERENCES warehouse_sub_containers(id) ON DELETE RESTRICT;
ALTER TABLE public.warehouse_stock_allocations ADD CONSTRAINT warehouse_stock_allocations_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE;
ALTER TABLE public.warehouse_stock_summary ADD CONSTRAINT warehouse_stock_summary_sub_container_fk FOREIGN KEY (sub_container_id) REFERENCES warehouse_sub_containers(id) ON DELETE RESTRICT;
ALTER TABLE public.warehouse_sub_containers ADD CONSTRAINT warehouse_sub_containers_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_data(id) ON DELETE SET NULL;
ALTER TABLE public.warehouse_sub_containers ADD CONSTRAINT warehouse_sub_containers_discipline_id_fkey FOREIGN KEY (discipline_id) REFERENCES disciplines(id) ON DELETE RESTRICT;
ALTER TABLE public.warehouse_sub_containers ADD CONSTRAINT warehouse_sub_containers_division_id_fkey FOREIGN KEY (division_id) REFERENCES company_divisions(id) ON DELETE RESTRICT;
ALTER TABLE public.warehouse_sub_containers ADD CONSTRAINT warehouse_sub_containers_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT;
ALTER TABLE public.warehouse_sub_containers ADD CONSTRAINT warehouse_sub_containers_responsible_person_profile_id_fkey FOREIGN KEY (responsible_person_profile_id) REFERENCES user_data(id) ON DELETE SET NULL;
ALTER TABLE public.warehouse_sub_containers ADD CONSTRAINT warehouse_sub_containers_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE RESTRICT;
ALTER TABLE public.warehouse_transfer_items ADD CONSTRAINT warehouse_transfer_items_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES inventory_item_brand_variants(id);
ALTER TABLE public.warehouse_transfer_items ADD CONSTRAINT warehouse_transfer_items_sub_container_id_fkey FOREIGN KEY (sub_container_id) REFERENCES warehouse_sub_containers(id) ON DELETE RESTRICT;
ALTER TABLE public.warehouse_transfer_items ADD CONSTRAINT warehouse_transfer_items_transfer_id_fkey FOREIGN KEY (transfer_id) REFERENCES warehouse_transfers(id) ON DELETE CASCADE;
ALTER TABLE public.warehouse_transfers ADD CONSTRAINT warehouse_transfers_approved_by_profile_id_fkey FOREIGN KEY (approved_by_profile_id) REFERENCES user_data(id);
ALTER TABLE public.warehouse_transfers ADD CONSTRAINT warehouse_transfers_cancelled_by_profile_id_fkey FOREIGN KEY (cancelled_by_profile_id) REFERENCES user_data(id);
ALTER TABLE public.warehouse_transfers ADD CONSTRAINT warehouse_transfers_created_by_profile_id_fkey FOREIGN KEY (created_by_profile_id) REFERENCES user_data(id);
ALTER TABLE public.warehouse_transfers ADD CONSTRAINT warehouse_transfers_dispatched_by_profile_id_fkey FOREIGN KEY (dispatched_by_profile_id) REFERENCES user_data(id);
ALTER TABLE public.warehouse_transfers ADD CONSTRAINT warehouse_transfers_from_sub_container_id_fkey FOREIGN KEY (from_sub_container_id) REFERENCES warehouse_sub_containers(id) ON DELETE RESTRICT;
ALTER TABLE public.warehouse_transfers ADD CONSTRAINT warehouse_transfers_from_warehouse_id_fkey FOREIGN KEY (from_warehouse_id) REFERENCES warehouses(id);
ALTER TABLE public.warehouse_transfers ADD CONSTRAINT warehouse_transfers_received_by_profile_id_fkey FOREIGN KEY (received_by_profile_id) REFERENCES user_data(id);
ALTER TABLE public.warehouse_transfers ADD CONSTRAINT warehouse_transfers_repair_vendor_id_fkey FOREIGN KEY (repair_vendor_id) REFERENCES repair_vendors(id) ON DELETE RESTRICT;
ALTER TABLE public.warehouse_transfers ADD CONSTRAINT warehouse_transfers_source_return_line_disposition_id_fkey FOREIGN KEY (source_return_line_disposition_id) REFERENCES return_line_inventory_dispositions(id) ON DELETE SET NULL;
ALTER TABLE public.warehouse_transfers ADD CONSTRAINT warehouse_transfers_to_sub_container_id_fkey FOREIGN KEY (to_sub_container_id) REFERENCES warehouse_sub_containers(id) ON DELETE RESTRICT;
ALTER TABLE public.warehouse_transfers ADD CONSTRAINT warehouse_transfers_to_warehouse_id_fkey FOREIGN KEY (to_warehouse_id) REFERENCES warehouses(id);
ALTER TABLE public.warehouse_transfers ADD CONSTRAINT warehouse_transfers_tool_unit_id_fkey FOREIGN KEY (tool_unit_id) REFERENCES tool_asset_units(id);
ALTER TABLE public.warehouses ADD CONSTRAINT warehouses_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;
ALTER TABLE public.warehouses ADD CONSTRAINT warehouses_repair_vendor_fk FOREIGN KEY (repair_vendor_id) REFERENCES repair_vendors(id) ON DELETE RESTRICT;
ALTER TABLE public.warranty_claims ADD CONSTRAINT warranty_claims_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES user_data(id);
ALTER TABLE public.warranty_claims ADD CONSTRAINT warranty_claims_linked_return_id_fkey FOREIGN KEY (linked_return_id) REFERENCES so_po_returns(id);
ALTER TABLE public.warranty_claims ADD CONSTRAINT warranty_claims_reported_by_fkey FOREIGN KEY (reported_by) REFERENCES user_data(id);
ALTER TABLE public.warranty_claims ADD CONSTRAINT warranty_claims_voided_by_fkey FOREIGN KEY (voided_by) REFERENCES user_data(id);
ALTER TABLE public.warranty_claims ADD CONSTRAINT warranty_claims_warranty_record_id_fkey FOREIGN KEY (warranty_record_id) REFERENCES warranty_records(id) ON DELETE RESTRICT;
ALTER TABLE public.warranty_number_counters ADD CONSTRAINT warranty_number_counters_division_id_fkey FOREIGN KEY (division_id) REFERENCES company_divisions(id) ON DELETE RESTRICT;
ALTER TABLE public.warranty_policies ADD CONSTRAINT warranty_policies_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_data(id) ON DELETE SET NULL;
ALTER TABLE public.warranty_records ADD CONSTRAINT warranty_records_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES inventory_item_brand_variants(id) ON DELETE SET NULL;
ALTER TABLE public.warranty_records ADD CONSTRAINT warranty_records_consumption_id_fkey FOREIGN KEY (consumption_id) REFERENCES consumption_entries(id) ON DELETE CASCADE;
ALTER TABLE public.warranty_records ADD CONSTRAINT warranty_records_consumption_line_id_fkey FOREIGN KEY (consumption_line_id) REFERENCES consumption_lines(id) ON DELETE CASCADE;
ALTER TABLE public.warranty_records ADD CONSTRAINT warranty_records_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT;
ALTER TABLE public.warranty_records ADD CONSTRAINT warranty_records_division_id_fkey FOREIGN KEY (division_id) REFERENCES company_divisions(id) ON DELETE RESTRICT;
ALTER TABLE public.warranty_records ADD CONSTRAINT warranty_records_origin_country_id_fkey FOREIGN KEY (origin_country_id) REFERENCES country_codes(id);
ALTER TABLE public.warranty_records ADD CONSTRAINT warranty_records_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES warranty_policies(id) ON DELETE RESTRICT;
ALTER TABLE public.warranty_records ADD CONSTRAINT warranty_records_sale_delivery_line_id_fkey FOREIGN KEY (sale_delivery_line_id) REFERENCES sale_delivery_lines(id) ON DELETE CASCADE;
ALTER TABLE public.warranty_records ADD CONSTRAINT warranty_records_sale_order_id_fkey FOREIGN KEY (sale_order_id) REFERENCES sale_orders(id) ON DELETE RESTRICT;
