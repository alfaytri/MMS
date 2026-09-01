-- Tables — generated from live (staging) catalog 2026-09-02. UNVERIFIED (constructed, not pg_dump): test-apply before use.

CREATE TABLE public.activity_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  action text NOT NULL,
  details text,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  module text,
  severity audit_severity NOT NULL DEFAULT 'info'::audit_severity,
  performer_name text,
  old_data jsonb,
  new_data jsonb,
  CONSTRAINT activity_log_pkey PRIMARY KEY (id)
);

CREATE TABLE public.app_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  key text NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT app_settings_pkey PRIMARY KEY (id),
  CONSTRAINT app_settings_key_key UNIQUE (key)
);

CREATE TABLE public.approval_workflow_groups (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workflow text NOT NULL,
  group_label text NOT NULL DEFAULT 'Default'::text,
  group_order integer NOT NULL DEFAULT 1,
  mode text NOT NULL DEFAULT 'any_one'::text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT approval_workflow_groups_mode_check CHECK ((mode = ANY (ARRAY['any_one'::text, 'all_must'::text]))),
  CONSTRAINT approval_workflow_groups_workflow_check CHECK ((workflow = ANY (ARRAY['po'::text, 'inv_check'::text, 'stock_adj'::text, 'sales_margin'::text, 'sales_credit'::text, 'credit_group'::text, 'receival_edit'::text, 'consumption_edit'::text]))),
  CONSTRAINT approval_workflow_groups_pkey PRIMARY KEY (id)
);

CREATE TABLE public.approval_workflow_steps (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  workflow text NOT NULL,
  role_id uuid NOT NULL,
  step_key text NOT NULL,
  step_label text NOT NULL,
  step_order integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  is_conditional boolean NOT NULL DEFAULT false,
  condition_types text[] DEFAULT '{}'::text[],
  archived_at timestamp with time zone,
  archived_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  group_id uuid,
  CONSTRAINT positive_order CHECK ((step_order > 0)),
  CONSTRAINT workflow_approval_steps_workflow_check CHECK ((workflow = ANY (ARRAY['po'::text, 'inv_check'::text, 'stock_adj'::text, 'sales_margin'::text, 'sales_credit'::text, 'credit_group'::text, 'receival_edit'::text, 'consumption_edit'::text]))),
  CONSTRAINT workflow_approval_steps_pkey PRIMARY KEY (id),
  CONSTRAINT workflow_approval_steps_workflow_step_key_key UNIQUE (workflow, step_key)
);

CREATE TABLE public.bill_attachments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  bill_id uuid NOT NULL,
  storage_key text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid,
  uploaded_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT bill_attachments_pkey PRIMARY KEY (id)
);

CREATE TABLE public.bill_line_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  bill_id uuid NOT NULL,
  description text NOT NULL,
  qty integer DEFAULT 1,
  unit_price numeric DEFAULT 0,
  total numeric DEFAULT 0,
  match_status text,
  match_note text,
  created_at timestamp with time zone DEFAULT now(),
  brand_variant_id uuid,
  CONSTRAINT bill_line_items_match_status_check CHECK ((match_status = ANY (ARRAY['matched'::text, 'qty_discrepancy'::text, 'price_discrepancy'::text, 'unmatched'::text, 'accepted_with_note'::text]))),
  CONSTRAINT bill_line_items_qty_positive CHECK ((qty > 0)),
  CONSTRAINT bill_line_items_unit_price_non_neg CHECK ((unit_price >= (0)::numeric)),
  CONSTRAINT bill_line_items_pkey PRIMARY KEY (id)
);

CREATE TABLE public.bills (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  bill_number text NOT NULL,
  source_label text,
  payment_status invoice_payment_status NOT NULL DEFAULT 'unpaid'::invoice_payment_status,
  supplier_id uuid,
  purchase_order_id uuid,
  receival_id uuid,
  division_id uuid,
  issued_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date NOT NULL DEFAULT CURRENT_DATE,
  subtotal numeric,
  discount_amount numeric NOT NULL DEFAULT 0,
  discount_label text,
  total_amount numeric,
  paid_amount numeric,
  needs_refresh boolean NOT NULL DEFAULT false,
  notes text,
  pdf_url text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT bills_total_amount_non_negative CHECK (((total_amount IS NULL) OR (total_amount >= (0)::numeric))),
  CONSTRAINT bills_pkey PRIMARY KEY (id),
  CONSTRAINT bills_purchase_order_id_unique UNIQUE (purchase_order_id)
);

CREATE TABLE public.brands (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_ar text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT brands_pkey PRIMARY KEY (id)
);

CREATE TABLE public.cogs_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  brand_variant_id uuid NOT NULL,
  sale_delivery_id uuid,
  sale_order_id uuid,
  qty integer NOT NULL,
  unit_cost numeric NOT NULL,
  total_cost numeric NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  landed_cost_id uuid,
  notes text,
  source_type text NOT NULL DEFAULT 'sale'::text,
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
  CONSTRAINT cogs_entries_consumer_type_check CHECK (((consumer_type IS NULL) OR (consumer_type = ANY (ARRAY['custody'::text, 'internal'::text])))),
  CONSTRAINT cogs_entries_source_check CHECK ((NOT ((sale_delivery_id IS NOT NULL) AND (landed_cost_id IS NOT NULL)))),
  CONSTRAINT cogs_entries_pkey PRIMARY KEY (id)
);

CREATE TABLE public.companies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name_en text NOT NULL,
  name_ar text,
  cr_number text,
  vat_id text,
  default_currency character varying(3) NOT NULL DEFAULT 'QAR'::character varying,
  default_tax_rate numeric NOT NULL DEFAULT 0,
  logo_url text,
  address_en text,
  address_ar text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  stamp_url text,
  footer_motto text,
  currency_id uuid,
  CONSTRAINT companies_pkey PRIMARY KEY (id)
);

CREATE TABLE public.company_divisions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  name text NOT NULL,
  short_name text,
  color text NOT NULL DEFAULT '#2563eb'::text,
  css_classes text,
  company_name_en text,
  company_name_ar text,
  address_en text,
  address_ar text,
  logo_url text,
  stamp_url text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  footer_motto text,
  default_currency character varying(3) NOT NULL DEFAULT 'QAR'::character varying,
  default_tax_rate numeric NOT NULL DEFAULT 0,
  company_id uuid,
  name_ar text,
  address text,
  currency_id uuid,
  CONSTRAINT divisions_pkey PRIMARY KEY (id),
  CONSTRAINT divisions_slug_key UNIQUE (slug)
);

CREATE TABLE public.consumption_edit_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  consumption_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  review_comment text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT consumption_edit_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))),
  CONSTRAINT consumption_edit_requests_pkey PRIMARY KEY (id)
);

CREATE TABLE public.consumption_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ce_number text NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  source_warehouse_id uuid NOT NULL,
  source_sub_container_id uuid NOT NULL,
  consumer_type text NOT NULL,
  consumer_customer_id uuid,
  notes text,
  attachments text[] NOT NULL DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'draft'::text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  posted_by uuid,
  posted_at timestamp with time zone,
  cancelled_by uuid,
  cancelled_at timestamp with time zone,
  division_id uuid,
  consumer_sub_container_id uuid,
  milestone_id uuid,
  discipline_id uuid,
  code text,
  is_team_item boolean NOT NULL DEFAULT false,
  CONSTRAINT consumption_entries_consumer_type_check CHECK ((consumer_type = ANY (ARRAY['custody'::text, 'internal'::text]))),
  CONSTRAINT consumption_entries_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'posted'::text, 'cancelled'::text]))),
  CONSTRAINT consumption_entries_pkey PRIMARY KEY (id),
  CONSTRAINT consumption_entries_ce_number_key UNIQUE (ce_number)
);

CREATE TABLE public.consumption_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  consumption_id uuid NOT NULL,
  brand_variant_id uuid NOT NULL,
  item_name text NOT NULL,
  sku text,
  qty integer NOT NULL,
  unit_cost numeric,
  total_cost numeric DEFAULT ((qty)::numeric * unit_cost),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT consumption_lines_qty_check CHECK ((qty > 0)),
  CONSTRAINT consumption_lines_pkey PRIMARY KEY (id)
);

CREATE TABLE public.consumption_number_counters (
  consumer_type text NOT NULL,
  period text NOT NULL,
  last_seq integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT consumption_number_counters_consumer_type_check CHECK ((consumer_type = ANY (ARRAY['custody'::text, 'internal'::text]))),
  CONSTRAINT consumption_number_counters_pkey PRIMARY KEY (consumer_type, period)
);

CREATE TABLE public.country_codes (
  id integer NOT NULL DEFAULT nextval('country_codes_id_seq'::regclass),
  code text NOT NULL,
  iso text NOT NULL,
  flag text NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 999,
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
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  credit_limit numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  max_days integer,
  default_payment_terms text,
  CONSTRAINT credit_groups_default_payment_terms_chk CHECK (((default_payment_terms IS NULL) OR (default_payment_terms = ANY (ARRAY['100% Advance'::text, '100% After Delivery'::text, '50/50'::text, 'Net 30'::text, 'Net 60'::text, 'Custom'::text])))),
  CONSTRAINT credit_groups_pkey PRIMARY KEY (id),
  CONSTRAINT credit_groups_name_key UNIQUE (name)
);

CREATE TABLE public.credit_note_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  credit_note_id uuid NOT NULL,
  invoice_line_id uuid,
  description text,
  qty numeric(10,2) NOT NULL,
  unit_price numeric(12,2) NOT NULL,
  total numeric(12,2) DEFAULT (qty * unit_price),
  created_at timestamp with time zone DEFAULT now(),
  sku text,
  line_type credit_debit_line_type NOT NULL DEFAULT 'returned'::credit_debit_line_type,
  condition text,
  condition_notes text,
  CONSTRAINT credit_note_lines_pkey PRIMARY KEY (id)
);

CREATE TABLE public.credit_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  credit_note_id text NOT NULL,
  invoice_id uuid,
  customer_name text,
  reason text NOT NULL,
  total_amount numeric NOT NULL DEFAULT 0,
  status credit_note_status DEFAULT 'open'::credit_note_status,
  refund_method text,
  refund_reference text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
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
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text,
  symbol text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT currencies_pkey PRIMARY KEY (id),
  CONSTRAINT currencies_code_key UNIQUE (code)
);

CREATE TABLE public.custom_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text DEFAULT 'bg-primary/15 text-primary border-primary/30'::text,
  permissions text[] NOT NULL DEFAULT '{}'::text[],
  is_system_admin boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  deleted_at timestamp with time zone,
  is_approval_slot boolean NOT NULL DEFAULT false,
  is_inventory_receiver boolean NOT NULL DEFAULT false,
  CONSTRAINT custom_roles_pkey PRIMARY KEY (id),
  CONSTRAINT custom_roles_name_key UNIQUE (name)
);

CREATE TABLE public.customer_credit_docs (
  customer_id uuid NOT NULL,
  cr_url text,
  establishment_id_url text,
  signed_credit_form_url text,
  CONSTRAINT customer_credit_docs_new_pkey PRIMARY KEY (customer_id)
);

CREATE TABLE public.customer_credit_group_approvals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  step_role text NOT NULL,
  step_order integer NOT NULL,
  status approval_status NOT NULL DEFAULT 'pending'::approval_status,
  decided_by uuid,
  decided_by_name text,
  decided_at timestamp with time zone,
  is_active boolean NOT NULL DEFAULT true,
  iteration integer NOT NULL DEFAULT 1,
  comment text,
  reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  force_approved boolean NOT NULL DEFAULT false,
  force_comment text,
  CONSTRAINT customer_credit_group_approvals_pkey PRIMARY KEY (id)
);

CREATE TABLE public.customer_credit_group_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  requested_group_id uuid NOT NULL,
  previous_group_id uuid,
  status credit_group_request_status NOT NULL DEFAULT 'pending'::credit_group_request_status,
  requested_by uuid,
  decided_by uuid,
  decided_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT customer_credit_group_requests_pkey PRIMARY KEY (id)
);

CREATE TABLE public.customer_phones (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL,
  phone character varying(20) NOT NULL,
  label character varying(50),
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT customer_phones_pkey PRIMARY KEY (id),
  CONSTRAINT customer_phones_phone_unique UNIQUE (phone)
);

CREATE TABLE public.customers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_ar text,
  email text,
  block_reason text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  credit_group_id uuid,
  entity_type customer_entity_type DEFAULT 'individual'::customer_entity_type,
  is_active boolean NOT NULL DEFAULT true,
  address text,
  latitude numeric,
  longitude numeric,
  CONSTRAINT customers_pkey PRIMARY KEY (id)
);

CREATE TABLE public.debit_note_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  debit_note_id uuid NOT NULL,
  description text,
  sku text,
  qty numeric NOT NULL,
  unit_price numeric NOT NULL,
  total numeric DEFAULT (qty * unit_price),
  line_type credit_debit_line_type NOT NULL DEFAULT 'returned'::credit_debit_line_type,
  condition text,
  condition_notes text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT debit_note_lines_pkey PRIMARY KEY (id)
);

CREATE TABLE public.debit_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  debit_note_id text NOT NULL,
  bill_id uuid,
  purchase_order_id uuid,
  supplier_name text,
  reason text NOT NULL,
  status credit_note_status DEFAULT 'open'::credit_note_status,
  total_amount numeric NOT NULL DEFAULT 0,
  original_total numeric,
  new_total numeric,
  source_return_id uuid,
  resolution_type text,
  pdf_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  reason_id uuid,
  supplier_id uuid,
  remaining_amount numeric,
  CONSTRAINT debit_notes_remaining_amount_non_negative CHECK (((remaining_amount IS NULL) OR (remaining_amount >= (0)::numeric))),
  CONSTRAINT debit_notes_resolution_type_check CHECK ((resolution_type = ANY (ARRAY['supplier_credit'::text, 'replacement'::text]))),
  CONSTRAINT debit_notes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.disciplines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT disciplines_pkey PRIMARY KEY (id),
  CONSTRAINT disciplines_name_key UNIQUE (name)
);

CREATE TABLE public.exchange_rate_change_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  document_type text NOT NULL,
  document_id uuid NOT NULL,
  old_rate numeric NOT NULL,
  new_rate numeric NOT NULL,
  reason text NOT NULL,
  changed_by uuid,
  changed_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT exchange_rate_change_log_document_type_check CHECK ((document_type = ANY (ARRAY['purchase_order'::text, 'sale_order'::text]))),
  CONSTRAINT exchange_rate_change_log_new_rate_positive CHECK ((new_rate > (0)::numeric)),
  CONSTRAINT exchange_rate_change_log_reason_len CHECK ((char_length(TRIM(BOTH FROM reason)) >= 5)),
  CONSTRAINT exchange_rate_change_log_pkey PRIMARY KEY (id)
);

CREATE TABLE public.fifo_cost_layers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
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
  source_currency text NOT NULL DEFAULT 'QAR'::text,
  source_exchange_rate numeric NOT NULL DEFAULT 1,
  sub_container_id uuid NOT NULL,
  CONSTRAINT fifo_cost_layers_pkey PRIMARY KEY (id)
);

CREATE TABLE public.inventory_attribute_definitions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL,
  attribute_key text NOT NULL,
  label_en text NOT NULL,
  label_ar text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT inventory_attribute_definitions_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_attribute_definitions_category_id_attribute_key_key UNIQUE (category_id, attribute_key)
);

CREATE TABLE public.inventory_attribute_options (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  definition_id uuid NOT NULL,
  value_en text NOT NULL,
  value_ar text,
  sort_order integer NOT NULL DEFAULT 0,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT inventory_attribute_options_pkey PRIMARY KEY (id)
);

CREATE TABLE public.inventory_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name_en text NOT NULL,
  name_ar text,
  sku text,
  type inventory_type NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  status text NOT NULL DEFAULT 'active'::text,
  sort_order integer NOT NULL DEFAULT 0,
  parent_id uuid,
  default_sub_container_id uuid,
  default_warranty_policy_id uuid,
  tool_tracking_mode tool_tracking_mode NOT NULL DEFAULT 'bulk'::tool_tracking_mode,
  is_team_item boolean NOT NULL DEFAULT false,
  CONSTRAINT inventory_categories_status_check CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text]))),
  CONSTRAINT inventory_categories_pkey PRIMARY KEY (id)
);

CREATE TABLE public.inventory_category_divisions (
  category_id uuid NOT NULL,
  division_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT inventory_category_divisions_pkey PRIMARY KEY (category_id, division_id)
);

CREATE TABLE public.inventory_check_approvals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  check_id uuid NOT NULL,
  step_order integer NOT NULL,
  step_role text NOT NULL,
  step_label text NOT NULL,
  profile_id uuid,
  profile_name text,
  status text NOT NULL DEFAULT 'pending'::text,
  action_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT inv_check_approvals_rejected_needs_notes_chk CHECK (((status <> 'rejected'::text) OR (COALESCE(TRIM(BOTH FROM notes), ''::text) <> ''::text))),
  CONSTRAINT inventory_check_approvals_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))),
  CONSTRAINT inventory_check_approvals_pkey PRIMARY KEY (id)
);

CREATE TABLE public.inventory_check_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  check_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  profile_name text NOT NULL,
  assigned_categories text[] NOT NULL DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'pending'::text,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT inventory_check_assignments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'completed'::text]))),
  CONSTRAINT inventory_check_assignments_pkey PRIMARY KEY (id)
);

CREATE TABLE public.inventory_check_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  check_id uuid NOT NULL,
  brand_variant_id uuid NOT NULL,
  item_name text NOT NULL,
  brand text NOT NULL,
  sku text,
  system_qty numeric NOT NULL DEFAULT 0,
  counted_qty numeric,
  is_counted boolean NOT NULL DEFAULT false,
  variance numeric DEFAULT (COALESCE(counted_qty, (0)::numeric) - system_qty),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  assignment_id uuid,
  category_name text,
  variance_type text,
  system_qty_at_close numeric,
  country_name text,
  CONSTRAINT inventory_check_items_pkey PRIMARY KEY (id)
);

CREATE TABLE public.inventory_check_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  check_id uuid NOT NULL,
  event_type inventory_check_event_type NOT NULL,
  profile_id uuid,
  profile_name text,
  meta jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT inventory_check_log_pkey PRIMARY KEY (id)
);

CREATE TABLE public.inventory_checks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  check_number text NOT NULL,
  warehouse_id uuid NOT NULL,
  warehouse_name text NOT NULL DEFAULT ''::text,
  status text NOT NULL DEFAULT 'draft'::text,
  reviewed_by_name text,
  reviewed_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  initiated_by_profile_id uuid,
  initiated_by_name text,
  started_at timestamp with time zone,
  sub_container_id uuid,
  CONSTRAINT inventory_checks_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'in_progress'::text, 'submitted'::text, 'reviewed'::text, 'pending_approval'::text, 'approved'::text, 'rejected'::text, 'completed'::text, 'cancelled'::text]))),
  CONSTRAINT inventory_checks_pkey PRIMARY KEY (id)
);

CREATE TABLE public.inventory_damaged_movements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  movement_type text NOT NULL,
  qty numeric NOT NULL,
  warehouse_id uuid NOT NULL,
  brand_variant_id uuid NOT NULL,
  unit_cost numeric NOT NULL DEFAULT 0,
  source_return_line_disposition_id uuid,
  source_transfer_id uuid,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  division_id uuid,
  CONSTRAINT inventory_damaged_movements_movement_type_check CHECK ((movement_type = ANY (ARRAY['restock_as_damaged_in'::text, 'send_for_repair_out'::text, 'return_from_repair_as_writeoff'::text, 'damaged_write_off'::text, 'damaged_adjust'::text]))),
  CONSTRAINT inventory_damaged_movements_qty_check CHECK ((qty > (0)::numeric)),
  CONSTRAINT inventory_damaged_movements_pkey PRIMARY KEY (id)
);

CREATE TABLE public.inventory_damaged_stock (
  warehouse_id uuid NOT NULL,
  brand_variant_id uuid NOT NULL,
  qty numeric NOT NULL DEFAULT 0,
  weighted_unit_cost numeric NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT inventory_damaged_stock_qty_check CHECK ((qty >= (0)::numeric)),
  CONSTRAINT inventory_damaged_stock_weighted_unit_cost_check CHECK ((weighted_unit_cost >= (0)::numeric)),
  CONSTRAINT inventory_damaged_stock_pkey PRIMARY KEY (warehouse_id, brand_variant_id)
);

CREATE TABLE public.inventory_damaged_stock_layers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL,
  brand_variant_id uuid NOT NULL,
  qty_received numeric NOT NULL,
  qty_remaining numeric NOT NULL,
  unit_cost numeric NOT NULL,
  source_return_line_id uuid,
  layered_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  division_id uuid,
  CONSTRAINT inventory_damaged_stock_layers_qty_received_check CHECK ((qty_received > (0)::numeric)),
  CONSTRAINT inventory_damaged_stock_layers_qty_remaining_check CHECK ((qty_remaining >= (0)::numeric)),
  CONSTRAINT inventory_damaged_stock_layers_unit_cost_check CHECK ((unit_cost >= (0)::numeric)),
  CONSTRAINT inventory_damaged_stock_layers_pkey PRIMARY KEY (id)
);

CREATE TABLE public.inventory_item_attributes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL,
  definition_id uuid NOT NULL,
  option_id uuid NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT inventory_item_attributes_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_item_attributes_item_id_definition_id_key UNIQUE (item_id, definition_id)
);

CREATE TABLE public.inventory_item_brand_variants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
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
  reserved_qty integer NOT NULL DEFAULT 0,
  linked_services_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active'::text,
  sort_order integer NOT NULL DEFAULT 0,
  reorder_point integer NOT NULL DEFAULT 0,
  damaged_qty integer NOT NULL DEFAULT 0,
  brand_id uuid,
  country_id integer,
  CONSTRAINT inventory_brand_variants_status_check CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text]))),
  CONSTRAINT inventory_brand_variants_pkey PRIMARY KEY (id)
);

CREATE TABLE public.inventory_item_divisions (
  item_id uuid NOT NULL,
  division_id uuid NOT NULL,
  category_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  tool_tracking_mode tool_tracking_mode,
  CONSTRAINT inventory_item_divisions_pkey PRIMARY KEY (item_id, division_id)
);

CREATE TABLE public.inventory_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
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
  status text NOT NULL DEFAULT 'active'::text,
  sort_order integer NOT NULL DEFAULT 0,
  default_sub_container_id uuid,
  default_warehouse_id uuid,
  image_url text,
  warranty_policy_id uuid,
  specification text,
  po_specification_default boolean NOT NULL DEFAULT false,
  is_team_item boolean,
  CONSTRAINT inventory_items_status_check CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text]))),
  CONSTRAINT inventory_items_pkey PRIMARY KEY (id)
);

CREATE TABLE public.inventory_stock_movements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  warehouse_id uuid,
  brand_variant_id uuid NOT NULL,
  item_name text NOT NULL,
  sku text,
  movement_type stock_movement_type NOT NULL,
  qty integer NOT NULL,
  unit_cost numeric NOT NULL DEFAULT 0,
  reference_type text,
  reference_id uuid,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  sub_container_id uuid NOT NULL,
  source_id uuid,
  CONSTRAINT inventory_stock_movements_pkey PRIMARY KEY (id)
);

CREATE TABLE public.invoice_line_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL,
  description text NOT NULL,
  qty integer DEFAULT 1,
  unit_price numeric DEFAULT 0,
  total numeric DEFAULT 0,
  team_name text,
  created_at timestamp with time zone DEFAULT now(),
  brand_variant_id uuid,
  CONSTRAINT invoice_line_items_qty_positive CHECK ((qty > 0)),
  CONSTRAINT invoice_line_items_unit_price_non_neg CHECK ((unit_price >= (0)::numeric)),
  CONSTRAINT invoice_line_items_pkey PRIMARY KEY (id)
);

CREATE TABLE public.landed_cost_item_allocations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  landed_cost_id uuid NOT NULL,
  brand_variant_id uuid,
  item_name text NOT NULL DEFAULT 'Item'::text,
  sku text,
  qty_received integer NOT NULL DEFAULT 0,
  qty_remaining_at_lc integer NOT NULL DEFAULT 0,
  sold_qty integer NOT NULL DEFAULT 0,
  original_unit_cost numeric NOT NULL DEFAULT 0,
  lc_per_unit numeric NOT NULL DEFAULT 0,
  updated_unit_cost numeric NOT NULL DEFAULT 0,
  allocated_lc_total numeric NOT NULL DEFAULT 0,
  inventory_portion numeric NOT NULL DEFAULT 0,
  cogs_portion numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT landed_cost_item_allocations_pkey PRIMARY KEY (id)
);

CREATE TABLE public.landed_cost_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  landed_cost_id uuid NOT NULL,
  description text NOT NULL DEFAULT ''::text,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'QAR'::text,
  exchange_rate numeric NOT NULL DEFAULT 1,
  created_at timestamp with time zone DEFAULT now(),
  bill_path text,
  currency_id uuid,
  CONSTRAINT landed_cost_lines_pkey PRIMARY KEY (id)
);

CREATE TABLE public.landed_costs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
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

CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
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

CREATE TABLE public.payment_bill_allocations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL,
  bill_id uuid NOT NULL,
  amount numeric NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT payment_bill_allocations_amount_check CHECK ((amount > (0)::numeric)),
  CONSTRAINT payment_bill_allocations_pkey PRIMARY KEY (id),
  CONSTRAINT payment_bill_allocations_payment_id_bill_id_key UNIQUE (payment_id, bill_id)
);

CREATE TABLE public.payment_installments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL,
  due_date date,
  amount numeric(12,2) NOT NULL,
  paid_amount numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending'::text,
  payment_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT payment_installments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'overdue'::text, 'partial'::text]))),
  CONSTRAINT payment_installments_pkey PRIMARY KEY (id)
);

CREATE TABLE public.payment_methods (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  requires_payment_link boolean NOT NULL DEFAULT false,
  is_cash_equivalent boolean NOT NULL DEFAULT false,
  CONSTRAINT payment_methods_pkey PRIMARY KEY (id),
  CONSTRAINT payment_methods_slug_key UNIQUE (slug)
);

CREATE TABLE public.payment_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  invoice_id uuid,
  plan_type text NOT NULL,
  total_amount numeric(12,2) NOT NULL,
  status text NOT NULL DEFAULT 'active'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  bill_id uuid,
  CONSTRAINT payment_plans_plan_type_check CHECK ((plan_type = ANY (ARRAY['schedule'::text, 'adhoc'::text]))),
  CONSTRAINT payment_plans_status_check CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'cancelled'::text]))),
  CONSTRAINT payment_plans_pkey PRIMARY KEY (id)
);

CREATE TABLE public.payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
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
  direction payment_direction NOT NULL DEFAULT 'incoming'::payment_direction,
  source_type payment_source_type,
  source_id uuid,
  supplier_id uuid,
  currency text NOT NULL DEFAULT 'QAR'::text,
  exchange_rate numeric NOT NULL DEFAULT 1,
  amount_qar numeric,
  deleted_at timestamp with time zone,
  customer_id uuid,
  bill_id uuid,
  credit_note_id uuid,
  currency_id uuid,
  method_id uuid,
  exchange_gain numeric NOT NULL DEFAULT 0,
  exchange_loss numeric NOT NULL DEFAULT 0,
  debit_note_id uuid,
  CONSTRAINT payments_pkey PRIMARY KEY (id),
  CONSTRAINT payments_payment_id_key UNIQUE (payment_id)
);

CREATE TABLE public.po_approval_chain_tiers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  chain_id uuid NOT NULL,
  rank integer NOT NULL,
  min_amount numeric NOT NULL,
  max_amount numeric,
  required_roles text[] NOT NULL,
  deleted_at timestamp with time zone,
  CONSTRAINT chk_amount_range CHECK (((max_amount IS NULL) OR (max_amount > min_amount))),
  CONSTRAINT chk_required_roles_nonempty CHECK ((cardinality(required_roles) > 0)),
  CONSTRAINT approval_chain_tiers_pkey PRIMARY KEY (id),
  CONSTRAINT approval_chain_tiers_chain_id_rank_key UNIQUE (chain_id, rank)
);

CREATE TABLE public.po_approval_chains (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  division_id uuid,
  name text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  archived_at timestamp with time zone,
  CONSTRAINT approval_chains_pkey PRIMARY KEY (id),
  CONSTRAINT approval_chains_division_id_key UNIQUE (division_id)
);

CREATE TABLE public.po_approvals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL,
  role text NOT NULL,
  status approval_status DEFAULT 'pending'::approval_status,
  approved_by text,
  date date,
  comment text,
  created_at timestamp with time zone DEFAULT now(),
  tier_rank integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT false,
  iteration integer NOT NULL DEFAULT 1,
  force_approved boolean NOT NULL DEFAULT false,
  force_comment text,
  CONSTRAINT po_approvals_rejected_needs_comment_chk CHECK (((status <> 'rejected'::approval_status) OR (COALESCE(TRIM(BOTH FROM comment), ''::text) <> ''::text))),
  CONSTRAINT po_approvals_pkey PRIMARY KEY (id)
);

CREATE TABLE public.po_edit_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  reason text NOT NULL,
  status po_edit_request_status NOT NULL DEFAULT 'pending'::po_edit_request_status,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  review_comment text,
  used_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT po_edit_requests_pkey PRIMARY KEY (id)
);

CREATE TABLE public.po_line_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
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
  free_qty integer NOT NULL DEFAULT 0,
  brand_id uuid,
  show_specification boolean NOT NULL DEFAULT false,
  division_id uuid,
  CONSTRAINT po_line_items_qty_positive CHECK ((qty > 0)),
  CONSTRAINT po_line_items_unit_price_non_neg CHECK ((unit_price >= (0)::numeric)),
  CONSTRAINT po_line_items_pkey PRIMARY KEY (id)
);

CREATE TABLE public.po_rfq_quote_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL,
  po_line_item_id uuid NOT NULL,
  quoted_price numeric NOT NULL DEFAULT 0,
  quoted_qty integer,
  notes text,
  CONSTRAINT po_rfq_quote_items_pkey PRIMARY KEY (id)
);

CREATE TABLE public.po_rfq_quotes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  currency text NOT NULL DEFAULT 'QAR'::text,
  total_amount numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'pending'::text,
  received_date date,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  currency_id uuid,
  CONSTRAINT po_rfq_quotes_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'received'::text, 'awarded'::text, 'rejected'::text]))),
  CONSTRAINT po_rfq_quotes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.po_version_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  po_version_id uuid NOT NULL,
  item_name text NOT NULL,
  sku text,
  qty integer NOT NULL DEFAULT 0,
  received_qty integer DEFAULT 0,
  unit text NOT NULL DEFAULT 'pcs'::text,
  unit_price numeric NOT NULL DEFAULT 0,
  total_price numeric NOT NULL DEFAULT 0,
  brand_variant_id uuid,
  free_qty integer NOT NULL DEFAULT 0,
  brand_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT po_version_lines_pkey PRIMARY KEY (id)
);

CREATE TABLE public.po_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL,
  version_number integer NOT NULL,
  submitted_at timestamp with time zone NOT NULL DEFAULT now(),
  submitted_by uuid,
  supplier_name text NOT NULL,
  currency text NOT NULL,
  exchange_rate numeric NOT NULL,
  subtotal numeric NOT NULL,
  discount_amount numeric NOT NULL DEFAULT 0,
  discount_label text,
  payment_terms text,
  payment_terms_notes text,
  payment_milestones jsonb,
  delivery_terms text,
  delivery_terms_notes text,
  expected_delivery date,
  vendor_notes text,
  snapshot_label text NOT NULL DEFAULT 'manual'::text,
  stage po_stage NOT NULL,
  supplier_id uuid,
  currency_id uuid,
  CONSTRAINT po_versions_pkey PRIMARY KEY (id)
);

CREATE TABLE public.project_disciplines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  discipline_id uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT project_disciplines_pkey PRIMARY KEY (id),
  CONSTRAINT project_disciplines_project_id_discipline_id_key UNIQUE (project_id, discipline_id)
);

CREATE TABLE public.project_milestones (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sub_container_id uuid NOT NULL,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  discipline_id uuid,
  CONSTRAINT project_milestones_pkey PRIMARY KEY (id)
);

CREATE TABLE public.projects (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_number text NOT NULL,
  name text NOT NULL,
  division_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  responsible_person_profile_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT projects_pkey PRIMARY KEY (id),
  CONSTRAINT projects_division_id_project_number_key UNIQUE (division_id, project_number)
);

CREATE TABLE public.purchase_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
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
  discount_amount numeric NOT NULL DEFAULT 0,
  discount_label text,
  created_by uuid,
  deleted_at timestamp with time zone,
  version_number integer NOT NULL DEFAULT 1,
  division_id uuid,
  po_type po_type NOT NULL DEFAULT 'draft'::po_type,
  pdf_rfq_url text,
  pdf_draft_url text,
  pdf_po_url text,
  pdf_confirmed_url text,
  pdf_payment_hash text,
  rfq_supplier_ids uuid[] DEFAULT '{}'::uuid[],
  supplier_id uuid,
  quote_deadline date,
  currency_id uuid,
  initial_exchange_rate numeric NOT NULL DEFAULT 1,
  initial_rate_captured_at timestamp with time zone,
  initial_rate_captured_by uuid,
  exchange_gain numeric NOT NULL DEFAULT 0,
  exchange_loss numeric NOT NULL DEFAULT 0,
  exchange_net numeric DEFAULT (COALESCE(exchange_gain, (0)::numeric) - COALESCE(exchange_loss, (0)::numeric)),
  show_specifications boolean NOT NULL DEFAULT true,
  division_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  CONSTRAINT purchase_orders_pkey PRIMARY KEY (id),
  CONSTRAINT purchase_orders_po_number_key UNIQUE (po_number)
);

CREATE TABLE public.reason_list_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT reason_list_categories_slug_check CHECK ((slug ~ '^[a-z][a-z0-9_]*$'::text)),
  CONSTRAINT reason_list_categories_pkey PRIMARY KEY (id),
  CONSTRAINT reason_list_categories_slug_key UNIQUE (slug)
);

CREATE TABLE public.reason_lists (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  category text NOT NULL,
  label text NOT NULL,
  active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  deleted_at timestamp with time zone,
  division_ids uuid[],
  CONSTRAINT reason_lists_pkey PRIMARY KEY (id)
);

CREATE TABLE public.receival_edit_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  receival_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  approved_by uuid,
  rejection_note text,
  expires_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  approved_at timestamp with time zone,
  CONSTRAINT receival_edit_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'completed'::text, 'expired'::text]))),
  CONSTRAINT receival_edit_requests_pkey PRIMARY KEY (id)
);

CREATE TABLE public.receival_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
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
  id uuid NOT NULL DEFAULT gen_random_uuid(),
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
  is_replacement boolean NOT NULL DEFAULT false,
  source_debit_note_id uuid,
  source_type receival_source_type NOT NULL DEFAULT 'purchase'::receival_source_type,
  carved_from_layer_id uuid,
  division_id uuid,
  CONSTRAINT receivals_pkey PRIMARY KEY (id),
  CONSTRAINT receivals_receival_number_key UNIQUE (receival_number)
);

CREATE TABLE public.repair_vendors (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  address text,
  notes text,
  virtual_warehouse_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  sub_container_id uuid NOT NULL,
  CONSTRAINT repair_vendors_pkey PRIMARY KEY (id),
  CONSTRAINT repair_vendors_name_uq UNIQUE (name)
);

CREATE TABLE public.return_line_customer_resolutions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  return_line_id uuid NOT NULL,
  resolution_type text NOT NULL,
  qty numeric NOT NULL,
  sale_delivery_id uuid,
  credit_note_id uuid,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT return_line_customer_resolutions_link_matches_type CHECK (
CASE resolution_type
    WHEN 'replacement'::text THEN ((sale_delivery_id IS NOT NULL) AND (credit_note_id IS NULL))
    WHEN 'refund'::text THEN ((sale_delivery_id IS NULL) AND (credit_note_id IS NOT NULL))
    WHEN 'store_credit'::text THEN ((sale_delivery_id IS NULL) AND (credit_note_id IS NOT NULL))
    ELSE NULL::boolean
END),
  CONSTRAINT return_line_customer_resolutions_qty_check CHECK ((qty > (0)::numeric)),
  CONSTRAINT return_line_customer_resolutions_resolution_type_check CHECK ((resolution_type = ANY (ARRAY['refund'::text, 'replacement'::text, 'store_credit'::text]))),
  CONSTRAINT return_line_customer_resolutions_pkey PRIMARY KEY (id)
);

CREATE TABLE public.return_line_inventory_dispositions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  return_line_id uuid NOT NULL,
  disposition_type text NOT NULL,
  qty numeric NOT NULL,
  inventory_stock_movement_id uuid,
  warehouse_transfer_id uuid,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT return_line_inventory_dispositions_disposition_type_check CHECK ((disposition_type = ANY (ARRAY['write_off'::text, 'restock_as_damaged'::text, 'send_for_repair'::text]))),
  CONSTRAINT return_line_inventory_dispositions_link_matches_type CHECK (
CASE disposition_type
    WHEN 'write_off'::text THEN ((inventory_stock_movement_id IS NOT NULL) AND (warehouse_transfer_id IS NULL))
    WHEN 'restock_as_damaged'::text THEN ((inventory_stock_movement_id IS NULL) AND (warehouse_transfer_id IS NULL))
    WHEN 'send_for_repair'::text THEN (inventory_stock_movement_id IS NULL)
    ELSE NULL::boolean
END),
  CONSTRAINT return_line_inventory_dispositions_qty_check CHECK ((qty > (0)::numeric)),
  CONSTRAINT return_line_inventory_dispositions_pkey PRIMARY KEY (id)
);

CREATE TABLE public.return_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL,
  brand_variant_id uuid,
  item_name text NOT NULL DEFAULT 'Item'::text,
  sku text,
  qty integer NOT NULL DEFAULT 0,
  condition text,
  condition_notes text,
  created_at timestamp with time zone DEFAULT now(),
  receival_item_id uuid,
  sale_delivery_line_id uuid,
  consumption_line_id uuid,
  CONSTRAINT return_lines_provenance_required CHECK (((receival_item_id IS NOT NULL) OR (sale_delivery_line_id IS NOT NULL) OR (consumption_line_id IS NOT NULL))),
  CONSTRAINT return_lines_pkey PRIMARY KEY (id)
);

CREATE TABLE public.sale_deliveries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  delivery_number text NOT NULL,
  sale_order_id uuid NOT NULL,
  warehouse_id uuid,
  warehouse_name text,
  date date NOT NULL,
  status sale_delivery_status DEFAULT 'pending'::sale_delivery_status,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  created_by_name text,
  type sale_delivery_type NOT NULL DEFAULT 'standard'::sale_delivery_type,
  return_id uuid,
  pdf_url text,
  source_credit_note_id uuid,
  CONSTRAINT sale_deliveries_pkey PRIMARY KEY (id),
  CONSTRAINT sale_deliveries_delivery_number_key UNIQUE (delivery_number)
);

CREATE TABLE public.sale_delivery_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sale_delivery_id uuid NOT NULL,
  brand_variant_id uuid,
  item_name text NOT NULL DEFAULT 'Item'::text,
  sku text,
  qty_delivered integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT sale_delivery_lines_pkey PRIMARY KEY (id)
);

CREATE TABLE public.sale_order_approvals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  source_type approval_source_type NOT NULL,
  source_id uuid NOT NULL,
  approval_type approval_type NOT NULL,
  status approval_status DEFAULT 'pending'::approval_status,
  requested_by uuid,
  decided_by uuid,
  decided_by_name text,
  reason text,
  comment text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  step_role text,
  step_order integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT false,
  iteration integer NOT NULL DEFAULT 1,
  decided_at timestamp with time zone,
  force_approved boolean NOT NULL DEFAULT false,
  force_comment text,
  CONSTRAINT approval_requests_pkey PRIMARY KEY (id)
);

CREATE TABLE public.sale_order_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sale_order_id uuid NOT NULL,
  item_name text NOT NULL,
  sku text,
  qty integer NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  delivered_qty integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  brand_variant_id uuid,
  line_type text NOT NULL DEFAULT 'products'::text,
  unit text NOT NULL DEFAULT 'pcs'::text,
  avg_cost numeric NOT NULL DEFAULT 0,
  CONSTRAINT sale_order_lines_qty_positive CHECK ((qty > 0)),
  CONSTRAINT sale_order_lines_unit_price_non_neg CHECK ((unit_price >= (0)::numeric)),
  CONSTRAINT sale_order_lines_pkey PRIMARY KEY (id)
);

CREATE TABLE public.sale_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  so_number text NOT NULL,
  customer_id uuid NOT NULL,
  status sale_order_status DEFAULT 'quotation'::sale_order_status,
  subtotal numeric DEFAULT 0,
  tax numeric DEFAULT 0,
  total numeric DEFAULT 0,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  notes text,
  discount_amount numeric DEFAULT 0,
  discount_label text,
  created_by_name text,
  discount_type text DEFAULT 'fixed'::text,
  discount_amount_resolved numeric DEFAULT 0,
  voucher_id uuid,
  campaign_id uuid,
  currency text NOT NULL DEFAULT 'QAR'::text,
  exchange_rate numeric NOT NULL DEFAULT 1,
  expected_delivery date,
  payment_terms text,
  payment_terms_notes text,
  payment_milestones jsonb,
  delivery_terms text,
  delivery_terms_notes text,
  customer_notes text,
  validity_days integer NOT NULL DEFAULT 30,
  division_id uuid,
  quotation_pdf_url text,
  currency_id uuid,
  initial_exchange_rate numeric NOT NULL DEFAULT 1,
  initial_rate_captured_at timestamp with time zone,
  initial_rate_captured_by uuid,
  total_qar numeric,
  exchange_gain numeric NOT NULL DEFAULT 0,
  exchange_loss numeric NOT NULL DEFAULT 0,
  exchange_net numeric DEFAULT (COALESCE(exchange_gain, (0)::numeric) - COALESCE(exchange_loss, (0)::numeric)),
  CONSTRAINT sale_orders_pkey PRIMARY KEY (id),
  CONSTRAINT sale_orders_so_number_key UNIQUE (so_number)
);

CREATE TABLE public.shipments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
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
  is_syncing boolean NOT NULL DEFAULT false,
  CONSTRAINT shipments_pkey PRIMARY KEY (id)
);

CREATE TABLE public.so_invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
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
  needs_refresh boolean NOT NULL DEFAULT false,
  payment_status invoice_payment_status NOT NULL DEFAULT 'unpaid'::invoice_payment_status,
  invoice_type invoice_type NOT NULL DEFAULT 'credit'::invoice_type,
  discount_amount numeric NOT NULL DEFAULT 0,
  discount_label text,
  pdf_url text,
  division_id uuid,
  CONSTRAINT invoices_pkey PRIMARY KEY (id),
  CONSTRAINT invoices_invoice_id_key UNIQUE (invoice_id),
  CONSTRAINT so_invoices_sale_order_id_unique UNIQUE (sale_order_id)
);

CREATE TABLE public.so_po_returns (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  return_number text NOT NULL,
  source_type return_source_type NOT NULL,
  source_id uuid NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  reason text NOT NULL DEFAULT ''::text,
  restock_warehouse_id uuid,
  credit_note_id uuid,
  notes text,
  status return_status NOT NULL DEFAULT 'pending'::return_status,
  division_id uuid,
  created_by uuid,
  created_by_name text DEFAULT ''::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
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
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  adjustment_id uuid NOT NULL,
  step_order integer NOT NULL,
  step_role text NOT NULL,
  step_label text NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  profile_id uuid,
  profile_name text,
  action_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  force_approved boolean NOT NULL DEFAULT false,
  force_comment text,
  CONSTRAINT stock_adjustment_approvals_status_chk CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))),
  CONSTRAINT stock_adjustment_approvals_pkey PRIMARY KEY (id),
  CONSTRAINT stock_adjustment_approvals_adjustment_id_step_order_key UNIQUE (adjustment_id, step_order)
);

CREATE TABLE public.stock_adjustments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL,
  brand_variant_id uuid NOT NULL,
  adjustment_type stock_adjustment_type NOT NULL,
  qty numeric NOT NULL,
  reason text NOT NULL,
  notes text,
  photo_urls text[],
  status text NOT NULL DEFAULT 'pending_approval'::text,
  requested_by uuid,
  requested_by_name text,
  approved_by_name text,
  approved_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  source_check_id uuid,
  source_check_item_id uuid,
  sub_container_id uuid NOT NULL,
  source_pile text NOT NULL DEFAULT 'good'::text,
  tool_unit_id uuid,
  CONSTRAINT stock_adjustments_source_pile_check CHECK ((source_pile = ANY (ARRAY['good'::text, 'damaged'::text]))),
  CONSTRAINT stock_adjustments_status_check CHECK ((status = ANY (ARRAY['pending_approval'::text, 'approved'::text, 'rejected'::text]))),
  CONSTRAINT stock_adjustments_pkey PRIMARY KEY (id)
);

CREATE TABLE public.storage_cleanup_failures (
  id bigint NOT NULL DEFAULT nextval('storage_cleanup_failures_id_seq'::regclass),
  occurred_at timestamp with time zone NOT NULL DEFAULT now(),
  bucket text NOT NULL,
  path text NOT NULL,
  source_table text,
  source_id text,
  error_text text,
  CONSTRAINT storage_cleanup_failures_pkey PRIMARY KEY (id)
);

CREATE TABLE public.suppliers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text,
  contact_name text,
  phone text,
  email text,
  address text,
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  currency_id uuid,
  supplier_type text DEFAULT 'local'::text,
  country text,
  country_id integer,
  division_id uuid,
  CONSTRAINT suppliers_supplier_type_check CHECK ((supplier_type = ANY (ARRAY['local'::text, 'international'::text]))),
  CONSTRAINT suppliers_pkey PRIMARY KEY (id)
);

CREATE TABLE public.tool_asset_units (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  item_id uuid,
  serial_number text,
  brand text,
  condition tool_condition DEFAULT 'Good'::tool_condition,
  status tool_status DEFAULT 'available'::tool_status,
  expiry date,
  assigned_to uuid,
  created_at timestamp with time zone DEFAULT now(),
  receival_item_id uuid,
  is_placeholder boolean NOT NULL DEFAULT false,
  division_id uuid,
  current_custody_location_id uuid,
  lifecycle_type tool_lifecycle_type NOT NULL DEFAULT 'new'::tool_lifecycle_type,
  unit_cost numeric,
  pending_scrap boolean NOT NULL DEFAULT false,
  CONSTRAINT tool_asset_units_pkey PRIMARY KEY (id)
);

CREATE TABLE public.tool_check_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  division_id uuid NOT NULL,
  initiated_by uuid,
  initiated_at timestamp with time zone NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'in_progress'::text,
  completed_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tool_check_sessions_status_check CHECK ((status = ANY (ARRAY['in_progress'::text, 'completed'::text]))),
  CONSTRAINT tool_check_sessions_pkey PRIMARY KEY (id)
);

CREATE TABLE public.tool_unit_assignments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL,
  custody_location_id uuid NOT NULL,
  assigned_at timestamp with time zone NOT NULL DEFAULT now(),
  released_at timestamp with time zone,
  release_reason text,
  assigned_by uuid,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  returned_to_warehouse_id uuid,
  CONSTRAINT tool_unit_assignments_release_reason_check CHECK ((release_reason = ANY (ARRAY['moved'::text, 'returned'::text, 'scrapped'::text, 'sent_for_repair'::text]))),
  CONSTRAINT tool_unit_assignments_pkey PRIMARY KEY (id)
);

CREATE TABLE public.tool_unit_inspections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL,
  custody_location_id uuid,
  inspected_at timestamp with time zone NOT NULL DEFAULT now(),
  inspected_by uuid,
  verdict text NOT NULL,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  session_id uuid,
  CONSTRAINT tool_unit_inspections_verdict_check CHECK ((verdict = ANY (ARRAY['good'::text, 'bad'::text, 'under_repair'::text]))),
  CONSTRAINT tool_unit_inspections_pkey PRIMARY KEY (id)
);

CREATE TABLE public.user_company_divisions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL,
  division_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT user_divisions_pkey PRIMARY KEY (id)
);

CREATE TABLE public.user_custom_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL,
  role_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  approval_scopes text[],
  CONSTRAINT user_custom_roles_approval_scopes_chk CHECK (((approval_scopes IS NULL) OR (approval_scopes <@ ARRAY['po'::text, 'inv_check'::text, 'stock_adj'::text, 'sales_margin'::text, 'sales_credit'::text, 'credit_group'::text]))),
  CONSTRAINT user_custom_roles_pkey PRIMARY KEY (id),
  CONSTRAINT user_custom_roles_profile_id_role_id_key UNIQUE (profile_id, role_id)
);

CREATE TABLE public.user_data (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL,
  user_type user_type NOT NULL DEFAULT 'internal'::user_type,
  full_name text NOT NULL,
  full_name_ar text,
  phone text,
  email text,
  avatar_url text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  must_change_password boolean NOT NULL DEFAULT false,
  is_division_manager boolean NOT NULL DEFAULT false,
  title text NOT NULL DEFAULT 'Mr.'::text,
  threecx_extension text,
  has_contact_centre_access boolean NOT NULL DEFAULT false,
  active_division_id uuid,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_auth_user_id_key UNIQUE (auth_user_id)
);

CREATE TABLE public.warehouse_item_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL,
  requested_by uuid,
  requester_name text,
  dest_sub_container_id uuid,
  dest_name text,
  item_name text NOT NULL,
  qty numeric NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'pending'::text,
  resolved_by uuid,
  resolved_at timestamp with time zone,
  resolution_note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  request_group_id uuid,
  CONSTRAINT warehouse_item_requests_qty_check CHECK ((qty > (0)::numeric)),
  CONSTRAINT warehouse_item_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'fulfilled'::text, 'dismissed'::text]))),
  CONSTRAINT warehouse_item_requests_pkey PRIMARY KEY (id)
);

CREATE TABLE public.warehouse_reorder_points (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL,
  brand_variant_id uuid NOT NULL,
  reorder_point integer NOT NULL DEFAULT 0,
  last_notified_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT warehouse_reorder_points_pkey PRIMARY KEY (id),
  CONSTRAINT warehouse_reorder_points_warehouse_id_brand_variant_id_key UNIQUE (warehouse_id, brand_variant_id)
);

CREATE TABLE public.warehouse_responsible_persons (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT warehouse_responsible_persons_pkey PRIMARY KEY (id),
  CONSTRAINT warehouse_field_rps_warehouse_id_profile_id_key UNIQUE (warehouse_id, profile_id)
);

CREATE TABLE public.warehouse_stock_allocations (
  warehouse_id uuid NOT NULL,
  brand_variant_id uuid NOT NULL,
  allocated_qty integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
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
  qty integer NOT NULL DEFAULT 0,
  avg_cost numeric NOT NULL DEFAULT 0,
  total_value numeric NOT NULL DEFAULT 0,
  category_name text,
  subcategory_name text,
  item_type text,
  allocated_qty integer NOT NULL DEFAULT 0,
  available_qty integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  sub_container_id uuid NOT NULL,
  CONSTRAINT warehouse_stock_summary_pkey PRIMARY KEY (warehouse_id, sub_container_id, brand_variant_id)
);

CREATE TABLE public.warehouse_sub_containers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  warehouse_id uuid NOT NULL,
  division_id uuid,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  team_id uuid,
  responsible_person_profile_id uuid,
  project_id uuid,
  discipline_id uuid,
  CONSTRAINT warehouse_sub_containers_pkey PRIMARY KEY (id),
  CONSTRAINT warehouse_sub_containers_warehouse_division_name_uniq UNIQUE NULLS NOT DISTINCT (warehouse_id, division_id, name)
);

CREATE TABLE public.warehouse_transfer_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL,
  brand_variant_id uuid NOT NULL,
  item_name text NOT NULL,
  sku text,
  requested_qty integer NOT NULL,
  unit_cost numeric NOT NULL DEFAULT 0,
  dispatched_qty integer,
  received_qty integer,
  shrinkage_qty integer NOT NULL DEFAULT 0,
  shrinkage_reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  sub_container_id uuid NOT NULL,
  returned_qty integer NOT NULL DEFAULT 0,
  CONSTRAINT warehouse_transfer_items_pkey PRIMARY KEY (id)
);

CREATE TABLE public.warehouse_transfers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
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
  transfer_kind text NOT NULL DEFAULT 'good_stock'::text,
  repair_vendor_id uuid,
  source_return_line_disposition_id uuid,
  expected_return_date date,
  repair_cost numeric,
  from_sub_container_id uuid NOT NULL,
  to_sub_container_id uuid NOT NULL,
  request_group_id uuid,
  tool_unit_id uuid,
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
END),
  CONSTRAINT warehouse_transfers_pkey PRIMARY KEY (id),
  CONSTRAINT warehouse_transfers_transfer_number_key UNIQUE (transfer_number)
);

CREATE TABLE public.warehouses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location text,
  item_count integer DEFAULT 0,
  total_value numeric DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  is_virtual boolean NOT NULL DEFAULT false,
  repair_vendor_id uuid,
  company_id uuid,
  warehouse_kind text NOT NULL DEFAULT 'general'::text,
  is_project_warehouse boolean NOT NULL DEFAULT false,
  can_transfer_custody boolean NOT NULL DEFAULT false,
  latitude numeric,
  longitude numeric,
  CONSTRAINT warehouses_kind_check CHECK ((warehouse_kind = ANY (ARRAY['general'::text, 'repair'::text, 'custody'::text]))),
  CONSTRAINT warehouses_pkey PRIMARY KEY (id)
);

CREATE TABLE public.warranty_claim_counters (
  division_id uuid NOT NULL,
  next_value integer NOT NULL DEFAULT 1,
  CONSTRAINT warranty_claim_counters_pkey PRIMARY KEY (division_id)
);

CREATE TABLE public.warranty_claims (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  claim_number text NOT NULL,
  warranty_record_id uuid NOT NULL,
  warranty_type warranty_source_type NOT NULL,
  status warranty_claim_status NOT NULL DEFAULT 'open'::warranty_claim_status,
  issue_description text NOT NULL,
  reported_by uuid,
  reported_at timestamp with time zone NOT NULL DEFAULT now(),
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
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  claim_qty integer NOT NULL,
  CONSTRAINT warranty_claims_claim_qty_positive CHECK ((claim_qty > 0)),
  CONSTRAINT warranty_claims_decision_check CHECK ((decision = ANY (ARRAY['covered'::text, 'rejected'::text]))),
  CONSTRAINT warranty_claims_resolution_type_check CHECK ((resolution_type = ANY (ARRAY['replacement'::text, 'credit'::text, 'refund'::text, 'repair'::text]))),
  CONSTRAINT warranty_claims_pkey PRIMARY KEY (id),
  CONSTRAINT warranty_claims_claim_number_key UNIQUE (claim_number)
);

CREATE TABLE public.warranty_number_counters (
  source_type warranty_source_type NOT NULL,
  division_id uuid NOT NULL,
  next_value integer NOT NULL DEFAULT 1,
  CONSTRAINT warranty_number_counters_next_value_check CHECK ((next_value > 0)),
  CONSTRAINT warranty_number_counters_pkey PRIMARY KEY (source_type, division_id)
);

CREATE TABLE public.warranty_policies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  duration_months integer NOT NULL,
  coverage_type text NOT NULL,
  starts_from text NOT NULL DEFAULT 'delivery_date'::text,
  terms_en text,
  terms_ar text,
  void_conditions text[] NOT NULL DEFAULT '{}'::text[],
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT warranty_policies_coverage_type_check CHECK ((coverage_type = ANY (ARRAY['none'::text, 'parts_only'::text, 'parts_and_labor'::text, 'replacement_only'::text]))),
  CONSTRAINT warranty_policies_duration_months_check CHECK ((duration_months >= 0)),
  CONSTRAINT warranty_policies_starts_from_check CHECK ((starts_from = ANY (ARRAY['delivery_date'::text, 'invoice_date'::text]))),
  CONSTRAINT warranty_policies_pkey PRIMARY KEY (id),
  CONSTRAINT warranty_policies_name_key UNIQUE (name)
);

CREATE TABLE public.warranty_records (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
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
  void_conditions_snapshot text[] NOT NULL DEFAULT '{}'::text[],
  starts_from_snapshot text NOT NULL DEFAULT 'delivery_date'::text,
  start_date date NOT NULL,
  end_date date NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  source_type warranty_source_type NOT NULL DEFAULT 'sale'::warranty_source_type,
  origin_country_id integer,
  origin_name_snapshot text,
  consumption_id uuid,
  consumption_line_id uuid,
  CONSTRAINT warranty_records_coverage_type_snapshot_check CHECK ((coverage_type_snapshot = ANY (ARRAY['none'::text, 'parts_only'::text, 'parts_and_labor'::text, 'replacement_only'::text]))),
  CONSTRAINT warranty_records_duration_months_snapshot_check CHECK ((duration_months_snapshot >= 0)),
  CONSTRAINT warranty_records_end_after_start CHECK ((end_date >= start_date)),
  CONSTRAINT warranty_records_qty_check CHECK ((qty > 0)),
  CONSTRAINT warranty_records_source_xor CHECK ((((sale_delivery_line_id IS NOT NULL) AND (consumption_line_id IS NULL)) OR ((sale_delivery_line_id IS NULL) AND (consumption_line_id IS NOT NULL)))),
  CONSTRAINT warranty_records_starts_from_snapshot_check CHECK ((starts_from_snapshot = ANY (ARRAY['delivery_date'::text, 'invoice_date'::text]))),
  CONSTRAINT warranty_records_pkey PRIMARY KEY (id),
  CONSTRAINT warranty_records_sale_delivery_line_id_key UNIQUE (sale_delivery_line_id),
  CONSTRAINT warranty_records_warranty_number_key UNIQUE (warranty_number)
);

-- ── Foreign keys (added last so table order doesn't matter) ──
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
ALTER TABLE public.customer_credit_docs ADD CONSTRAINT customer_credit_docs_new_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
ALTER TABLE public.customer_credit_group_approvals ADD CONSTRAINT customer_credit_group_approvals_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES user_data(id);
ALTER TABLE public.customer_credit_group_approvals ADD CONSTRAINT customer_credit_group_approvals_request_id_fkey FOREIGN KEY (request_id) REFERENCES customer_credit_group_requests(id) ON DELETE CASCADE;
ALTER TABLE public.customer_credit_group_requests ADD CONSTRAINT customer_credit_group_requests_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
ALTER TABLE public.customer_credit_group_requests ADD CONSTRAINT customer_credit_group_requests_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES user_data(id);
ALTER TABLE public.customer_credit_group_requests ADD CONSTRAINT customer_credit_group_requests_previous_group_id_fkey FOREIGN KEY (previous_group_id) REFERENCES credit_groups(id);
ALTER TABLE public.customer_credit_group_requests ADD CONSTRAINT customer_credit_group_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES user_data(id);
ALTER TABLE public.customer_credit_group_requests ADD CONSTRAINT customer_credit_group_requests_requested_group_id_fkey FOREIGN KEY (requested_group_id) REFERENCES credit_groups(id);
ALTER TABLE public.customer_phones ADD CONSTRAINT customer_phones_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
ALTER TABLE public.customers ADD CONSTRAINT customers_credit_group_id_fkey FOREIGN KEY (credit_group_id) REFERENCES credit_groups(id);
ALTER TABLE public.debit_note_lines ADD CONSTRAINT debit_note_lines_debit_note_id_fkey FOREIGN KEY (debit_note_id) REFERENCES debit_notes(id) ON DELETE CASCADE;
ALTER TABLE public.debit_notes ADD CONSTRAINT debit_notes_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES bills(id);
ALTER TABLE public.debit_notes ADD CONSTRAINT debit_notes_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id);
ALTER TABLE public.debit_notes ADD CONSTRAINT debit_notes_reason_id_fkey FOREIGN KEY (reason_id) REFERENCES reason_lists(id);
ALTER TABLE public.debit_notes ADD CONSTRAINT debit_notes_source_return_id_fkey FOREIGN KEY (source_return_id) REFERENCES so_po_returns(id);
ALTER TABLE public.debit_notes ADD CONSTRAINT debit_notes_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id);
ALTER TABLE public.exchange_rate_change_log ADD CONSTRAINT exchange_rate_change_log_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES user_data(id);
ALTER TABLE public.fifo_cost_layers ADD CONSTRAINT fifo_cost_layers_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES inventory_item_brand_variants(id) ON DELETE RESTRICT;
ALTER TABLE public.fifo_cost_layers ADD CONSTRAINT fifo_cost_layers_receival_id_fkey FOREIGN KEY (receival_id) REFERENCES receivals(id);
ALTER TABLE public.fifo_cost_layers ADD CONSTRAINT fifo_cost_layers_sub_container_id_fkey FOREIGN KEY (sub_container_id) REFERENCES warehouse_sub_containers(id) ON DELETE RESTRICT;
ALTER TABLE public.fifo_cost_layers ADD CONSTRAINT fifo_cost_layers_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES warehouses(id);
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
ALTER TABLE public.landed_cost_item_allocations ADD CONSTRAINT landed_cost_item_alloc_brand_variant_id_fkey FOREIGN KEY (brand_variant_id) REFERENCES inventory_item_brand_variants(id);
ALTER TABLE public.landed_cost_item_allocations ADD CONSTRAINT landed_cost_item_allocations_landed_cost_id_fkey FOREIGN KEY (landed_cost_id) REFERENCES landed_costs(id) ON DELETE CASCADE;
ALTER TABLE public.landed_cost_lines ADD CONSTRAINT landed_cost_lines_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES currencies(id);
ALTER TABLE public.landed_cost_lines ADD CONSTRAINT landed_cost_lines_landed_cost_id_fkey FOREIGN KEY (landed_cost_id) REFERENCES landed_costs(id) ON DELETE CASCADE;
ALTER TABLE public.landed_costs ADD CONSTRAINT landed_costs_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES currencies(id);
ALTER TABLE public.notifications ADD CONSTRAINT notifications_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES user_data(id) ON DELETE CASCADE;
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
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_created_by_profiles_fkey FOREIGN KEY (created_by) REFERENCES user_data(id) ON DELETE SET NULL;
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES currencies(id);
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_division_id_fkey FOREIGN KEY (division_id) REFERENCES company_divisions(id) ON DELETE RESTRICT;
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_initial_rate_captured_by_fkey FOREIGN KEY (initial_rate_captured_by) REFERENCES user_data(id);
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id);
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES warehouses(id);
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
ALTER TABLE public.shipments ADD CONSTRAINT shipments_po_id_fkey FOREIGN KEY (po_id) REFERENCES purchase_orders(id);
ALTER TABLE public.shipments ADD CONSTRAINT shipments_receival_id_fkey FOREIGN KEY (receival_id) REFERENCES receivals(id);
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
ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_country_id_fkey FOREIGN KEY (country_id) REFERENCES country_codes(id);
ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_data(id);
ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_currency_id_fkey FOREIGN KEY (currency_id) REFERENCES currencies(id);
ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_division_id_fkey FOREIGN KEY (division_id) REFERENCES company_divisions(id) ON DELETE SET NULL;
ALTER TABLE public.tool_asset_units ADD CONSTRAINT tool_asset_units_current_custody_location_id_fkey FOREIGN KEY (current_custody_location_id) REFERENCES warehouse_sub_containers(id);
ALTER TABLE public.tool_asset_units ADD CONSTRAINT tool_asset_units_division_id_fkey FOREIGN KEY (division_id) REFERENCES company_divisions(id);
ALTER TABLE public.tool_asset_units ADD CONSTRAINT tool_asset_units_item_id_fkey FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE SET NULL;
ALTER TABLE public.tool_asset_units ADD CONSTRAINT tool_asset_units_receival_item_id_fkey FOREIGN KEY (receival_item_id) REFERENCES receival_items(id) ON DELETE SET NULL;
ALTER TABLE public.tool_check_sessions ADD CONSTRAINT tool_check_sessions_division_id_fkey FOREIGN KEY (division_id) REFERENCES company_divisions(id);
ALTER TABLE public.tool_unit_assignments ADD CONSTRAINT tool_unit_assignments_custody_location_id_fkey FOREIGN KEY (custody_location_id) REFERENCES warehouse_sub_containers(id);
ALTER TABLE public.tool_unit_assignments ADD CONSTRAINT tool_unit_assignments_returned_to_warehouse_id_fkey FOREIGN KEY (returned_to_warehouse_id) REFERENCES warehouses(id);
ALTER TABLE public.tool_unit_assignments ADD CONSTRAINT tool_unit_assignments_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES tool_asset_units(id) ON DELETE CASCADE;
ALTER TABLE public.tool_unit_inspections ADD CONSTRAINT tool_unit_inspections_custody_location_id_fkey FOREIGN KEY (custody_location_id) REFERENCES warehouse_sub_containers(id);
ALTER TABLE public.tool_unit_inspections ADD CONSTRAINT tool_unit_inspections_session_id_fkey FOREIGN KEY (session_id) REFERENCES tool_check_sessions(id);
ALTER TABLE public.tool_unit_inspections ADD CONSTRAINT tool_unit_inspections_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES tool_asset_units(id) ON DELETE CASCADE;
ALTER TABLE public.user_company_divisions ADD CONSTRAINT user_divisions_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_data(id);
ALTER TABLE public.user_company_divisions ADD CONSTRAINT user_divisions_division_id_fkey FOREIGN KEY (division_id) REFERENCES company_divisions(id);
ALTER TABLE public.user_company_divisions ADD CONSTRAINT user_divisions_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES user_data(id);
ALTER TABLE public.user_custom_roles ADD CONSTRAINT user_custom_roles_created_by_fkey FOREIGN KEY (created_by) REFERENCES user_data(id);
ALTER TABLE public.user_custom_roles ADD CONSTRAINT user_custom_roles_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES user_data(id);
ALTER TABLE public.user_custom_roles ADD CONSTRAINT user_custom_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES custom_roles(id) ON DELETE CASCADE;
ALTER TABLE public.user_data ADD CONSTRAINT profiles_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.user_data ADD CONSTRAINT user_data_active_division_id_fkey FOREIGN KEY (active_division_id) REFERENCES company_divisions(id) ON DELETE SET NULL;
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
