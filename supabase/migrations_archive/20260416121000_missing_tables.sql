-- ═══════════════════════════════════════════════════════════
-- Missing tables: core config, users/RBAC, sales, suppliers,
-- warehouse extras, notifications, QB, audits
-- Source: Old Schema/*.md (live snapshot 2026-03-25/26)
-- ═══════════════════════════════════════════════════════════

-- ─── ENSURE set_updated_at TRIGGER FUNCTION EXISTS ───
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── MISSING ENUMS ───

DO $$ BEGIN
  CREATE TYPE user_type AS ENUM ('internal', 'customer', 'employee');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE sale_order_status AS ENUM (
    'quotation', 'confirmed', 'in_progress', 'delivered', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE sale_delivery_status AS ENUM (
    'pending', 'in_progress', 'delivered', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE return_source_type AS ENUM ('sale_order', 'order');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE return_status AS ENUM ('pending', 'received', 'restocked', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE approval_source_type AS ENUM ('sale_order', 'order');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE approval_type AS ENUM ('margin', 'credit');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE credit_note_status AS ENUM ('draft', 'approved', 'issued', 'redeemed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE notification_category AS ENUM (
    'order', 'contract', 'invoice', 'payment', 'system', 'reminder'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE notification_channel AS ENUM ('whatsapp', 'sms', 'email', 'push');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE notification_trigger AS ENUM (
    'manual', 'scheduled', 'event', 'reminder'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE notification_status AS ENUM ('sent', 'failed', 'pending', 'delivered');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── COMPANIES ───

CREATE TABLE IF NOT EXISTS companies (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en             TEXT NOT NULL,
  name_ar             TEXT,
  cr_number           TEXT,
  vat_id              TEXT,
  default_currency    VARCHAR(3) NOT NULL DEFAULT 'QAR',
  default_tax_rate    NUMERIC NOT NULL DEFAULT 0,
  logo_url            TEXT,
  address_en          TEXT,
  address_ar          TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID REFERENCES auth.users(id)
);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can insert companies" ON companies FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admin can update companies" ON companies FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Internal users can read companies" ON companies FOR SELECT TO authenticated USING (true);

CREATE TRIGGER trg_companies_updated_at BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── PROFILES ───
-- Mirrors auth.users. division_id FK added after divisions table.

CREATE TABLE IF NOT EXISTS profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id    UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  user_type       user_type NOT NULL DEFAULT 'internal',
  full_name       TEXT NOT NULL,
  full_name_ar    TEXT,
  phone           TEXT,
  email           TEXT,
  avatar_url      TEXT,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID,
  cx_extension    TEXT,
  division_id     UUID
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all profiles" ON profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Users can read own profile" ON profiles FOR SELECT TO authenticated USING (auth_user_id = auth.uid());
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE TO authenticated USING (auth_user_id = auth.uid());
CREATE POLICY "Users can create own profile" ON profiles FOR INSERT TO authenticated WITH CHECK (auth_user_id = auth.uid());

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── DIVISIONS ───

CREATE TABLE IF NOT EXISTS divisions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  short_name        TEXT,
  color             TEXT NOT NULL DEFAULT '#2563eb',
  css_classes       TEXT,
  company_name_en   TEXT,
  company_name_ar   TEXT,
  address_en        TEXT,
  address_ar        TEXT,
  logo_url          TEXT,
  stamp_url         TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID REFERENCES profiles(id),
  footer_motto      TEXT,
  default_currency  VARCHAR(3) NOT NULL DEFAULT 'QAR',
  default_tax_rate  NUMERIC NOT NULL DEFAULT 0,
  company_id        UUID REFERENCES companies(id)
);

ALTER TABLE divisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can delete divisions" ON divisions FOR DELETE TO authenticated USING (true);
CREATE POLICY "Admin can insert divisions" ON divisions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admin can update divisions" ON divisions FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Internal users can read divisions" ON divisions FOR SELECT TO authenticated USING (true);

CREATE TRIGGER trg_divisions_updated_at BEFORE UPDATE ON divisions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Add FK for profiles.division_id -> divisions
ALTER TABLE profiles
  ADD CONSTRAINT profiles_division_id_fkey
  FOREIGN KEY (division_id) REFERENCES divisions(id);

-- ─── CUSTOM ROLES ───

CREATE TABLE IF NOT EXISTS custom_roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  color       TEXT DEFAULT 'bg-primary/15 text-primary border-primary/30',
  permissions TEXT[] NOT NULL DEFAULT '{}',
  is_system   BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES profiles(id),
  deleted_at  TIMESTAMPTZ
);

ALTER TABLE custom_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage custom_roles" ON custom_roles FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Internal users can view custom_roles" ON custom_roles FOR SELECT TO authenticated USING (deleted_at IS NULL);

CREATE TRIGGER set_custom_roles_updated_at BEFORE UPDATE ON custom_roles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── USER CUSTOM ROLES ───

CREATE TABLE IF NOT EXISTS user_custom_roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES profiles(id),
  role_id     UUID NOT NULL REFERENCES custom_roles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES profiles(id),
  UNIQUE (profile_id, role_id)
);

ALTER TABLE user_custom_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage user_custom_roles" ON user_custom_roles FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Internal users can view user_custom_roles" ON user_custom_roles FOR SELECT TO authenticated USING (true);

-- ─── USER DIVISIONS ───

CREATE TABLE IF NOT EXISTS user_divisions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES profiles(id),
  division_id UUID NOT NULL REFERENCES divisions(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES profiles(id)
);

ALTER TABLE user_divisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage user_divisions" ON user_divisions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Internal users can view user_divisions" ON user_divisions FOR SELECT TO authenticated USING (true);

-- ─── PHONE LINES 3CX ───

CREATE TABLE IF NOT EXISTS phone_lines_3cx (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label         TEXT NOT NULL,
  number        TEXT NOT NULL,
  is_emergency  BOOLEAN NOT NULL DEFAULT false,
  cx_dn         TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID REFERENCES profiles(id),
  division_id   UUID REFERENCES divisions(id)
);

ALTER TABLE phone_lines_3cx ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can delete phone lines" ON phone_lines_3cx FOR DELETE TO authenticated USING (true);
CREATE POLICY "Admins can insert phone lines" ON phone_lines_3cx FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins can update phone lines" ON phone_lines_3cx FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Internal users can read phone lines" ON phone_lines_3cx FOR SELECT TO authenticated USING (true);

CREATE TRIGGER trg_phone_lines_updated_at BEFORE UPDATE ON phone_lines_3cx
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── PHONE LINE PERMISSIONS 3CX ───

CREATE TABLE IF NOT EXISTS phone_line_permissions_3cx (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    UUID NOT NULL REFERENCES profiles(id),
  phone_line_id UUID NOT NULL REFERENCES phone_lines_3cx(id),
  can_call      BOOLEAN NOT NULL DEFAULT true,
  can_receive   BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID REFERENCES profiles(id),
  UNIQUE (profile_id, phone_line_id)
);

ALTER TABLE phone_line_permissions_3cx ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage line permissions" ON phone_line_permissions_3cx FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Internal users can view line permissions" ON phone_line_permissions_3cx FOR SELECT TO authenticated USING (true);

-- ─── APP SETTINGS ───

CREATE TABLE IF NOT EXISTS app_settings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT NOT NULL UNIQUE,
  value       JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can insert app_settings" ON app_settings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admin can update app_settings" ON app_settings FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Internal users can read app_settings" ON app_settings FOR SELECT TO authenticated USING (true);

-- ─── DOCUMENT TERMS ───

CREATE TABLE IF NOT EXISTS document_terms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type TEXT NOT NULL,
  content_ar    TEXT NOT NULL DEFAULT '',
  content_en    TEXT NOT NULL DEFAULT '',
  created_by    UUID REFERENCES profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  division_id   UUID REFERENCES divisions(id)
);

ALTER TABLE document_terms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage document_terms" ON document_terms FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Internal can select document_terms" ON document_terms FOR SELECT TO authenticated USING (true);

CREATE TRIGGER trg_document_terms_updated_at BEFORE UPDATE ON document_terms
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── REASON LISTS ───

CREATE TABLE IF NOT EXISTS reason_lists (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category    TEXT NOT NULL,
  label       TEXT NOT NULL,
  active      BOOLEAN DEFAULT true,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES profiles(id),
  deleted_at  TIMESTAMPTZ,
  division_ids UUID[]
);

ALTER TABLE reason_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage reason_lists" ON reason_lists FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Internal can select reason_lists" ON reason_lists FOR SELECT TO authenticated USING (true);

CREATE TRIGGER trg_reason_lists_updated_at BEFORE UPDATE ON reason_lists
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── PRICING FACTORS ───

CREATE TABLE IF NOT EXISTS pricing_factors (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category    TEXT NOT NULL,
  label       TEXT NOT NULL,
  label_ar    TEXT,
  factor      NUMERIC NOT NULL DEFAULT 1.0,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES profiles(id),
  division_id UUID REFERENCES divisions(id),
  deleted_at  TIMESTAMPTZ
);

ALTER TABLE pricing_factors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users can delete pricing_factors" ON pricing_factors FOR DELETE TO authenticated USING (true);
CREATE POLICY "Internal users can insert pricing_factors" ON pricing_factors FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Internal users can read pricing_factors" ON pricing_factors FOR SELECT TO authenticated USING (true);
CREATE POLICY "Internal users can update pricing_factors" ON pricing_factors FOR UPDATE TO authenticated USING (true);

CREATE TRIGGER set_pricing_factors_updated_at BEFORE UPDATE ON pricing_factors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── NOTIFICATION TEMPLATES ───

CREATE TABLE IF NOT EXISTS notification_templates (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                    TEXT NOT NULL UNIQUE,
  wati_template_name      TEXT NOT NULL DEFAULT '',
  description             TEXT,
  media_type              TEXT NOT NULL DEFAULT 'none',
  has_buttons             BOOLEAN NOT NULL DEFAULT false,
  button_type             TEXT,
  button_url_suffix_param TEXT,
  param_count             INTEGER NOT NULL DEFAULT 0,
  param_names             JSONB DEFAULT '[]',
  is_active               BOOLEAN NOT NULL DEFAULT true,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by              UUID REFERENCES profiles(id)
);

ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage notification_templates" ON notification_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Internal users can read notification_templates" ON notification_templates FOR SELECT TO authenticated USING (true);

CREATE TRIGGER trg_notification_templates_updated_at BEFORE UPDATE ON notification_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── NOTIFICATION CONFIG ───

CREATE TABLE IF NOT EXISTS notification_config (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                TEXT NOT NULL UNIQUE,
  label               TEXT NOT NULL,
  label_ar            TEXT,
  category            TEXT NOT NULL,
  trigger_type        TEXT NOT NULL,
  timing_description  TEXT,
  template_slug       TEXT NOT NULL REFERENCES notification_templates(slug),
  is_active           BOOLEAN NOT NULL DEFAULT true,
  requires_portal     BOOLEAN NOT NULL DEFAULT false,
  portal_purpose      TEXT,
  has_media_followup  BOOLEAN NOT NULL DEFAULT false,
  media_description   TEXT,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID REFERENCES profiles(id)
);

ALTER TABLE notification_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage notification_config" ON notification_config FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Internal users can read notification_config" ON notification_config FOR SELECT TO authenticated USING (true);

CREATE TRIGGER trg_notification_config_updated_at BEFORE UPDATE ON notification_config
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── SUPPLIERS ───

CREATE TABLE IF NOT EXISTS suppliers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  category      TEXT,
  contact_name  TEXT,
  phone         TEXT,
  email         TEXT,
  address       TEXT,
  notes         TEXT,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID REFERENCES profiles(id)
);

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users can insert suppliers" ON suppliers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Internal users can update suppliers" ON suppliers FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Internal users can view suppliers" ON suppliers FOR SELECT TO authenticated USING (true);

CREATE TRIGGER trg_suppliers_updated_at BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── PAYMENT SESSIONS ───

CREATE TABLE IF NOT EXISTS payment_sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dibsy_payment_id    TEXT UNIQUE,
  customer_id         UUID NOT NULL REFERENCES customers(id),
  amount              NUMERIC NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'QAR',
  status              TEXT NOT NULL DEFAULT 'open',
  checkout_url        TEXT,
  redirect_url        TEXT,
  receipt_sent        BOOLEAN NOT NULL DEFAULT false,
  dibsy_response      JSONB,
  invoice_allocations JSONB NOT NULL DEFAULT '[]',
  created_by          UUID REFERENCES profiles(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE payment_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users can manage payment sessions" ON payment_sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER set_payment_sessions_updated_at BEFORE UPDATE ON payment_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── CREDIT NOTES ───

CREATE TABLE IF NOT EXISTS credit_notes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_id   TEXT NOT NULL UNIQUE,
  invoice_id       UUID NOT NULL REFERENCES invoices(id),
  customer_name    TEXT NOT NULL,
  phone            TEXT,
  type             TEXT NOT NULL DEFAULT 'full',
  reason           TEXT NOT NULL,
  line_items       JSONB DEFAULT '[]',
  total_amount     NUMERIC NOT NULL DEFAULT 0,
  status           credit_note_status DEFAULT 'draft',
  approved_by      TEXT,
  refund_method    payment_method,
  refund_reference TEXT,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID REFERENCES profiles(id)
);

ALTER TABLE credit_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal can insert credit_notes" ON credit_notes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Internal can select credit_notes" ON credit_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Internal can update credit_notes" ON credit_notes FOR UPDATE TO authenticated USING (true);

CREATE TRIGGER trg_credit_notes_updated_at BEFORE UPDATE ON credit_notes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── SALE ORDERS ───

CREATE TABLE IF NOT EXISTS sale_orders (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  so_number                TEXT NOT NULL UNIQUE,
  customer_id              UUID NOT NULL REFERENCES customers(id),
  status                   sale_order_status DEFAULT 'quotation',
  subtotal                 NUMERIC DEFAULT 0,
  tax                      NUMERIC DEFAULT 0,
  total                    NUMERIC DEFAULT 0,
  deleted_at               TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by               UUID REFERENCES profiles(id),
  notes                    TEXT,
  discount_amount          NUMERIC DEFAULT 0,
  discount_label           TEXT,
  created_by_name          TEXT,
  discount_type            TEXT DEFAULT 'fixed',
  discount_amount_resolved NUMERIC DEFAULT 0,
  voucher_id               UUID REFERENCES vouchers(id),
  campaign_id              UUID REFERENCES promotion_campaigns(id)
);

ALTER TABLE sale_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal can insert sale_orders" ON sale_orders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Internal can select sale_orders" ON sale_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Internal can update sale_orders" ON sale_orders FOR UPDATE TO authenticated USING (true);

CREATE TRIGGER set_updated_at_sale_orders BEFORE UPDATE ON sale_orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── SALE ORDER LINES ───

CREATE TABLE IF NOT EXISTS sale_order_lines (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_order_id    UUID NOT NULL REFERENCES sale_orders(id),
  item_id          TEXT,
  item_name        TEXT NOT NULL,
  sku              TEXT,
  qty              INTEGER NOT NULL DEFAULT 1,
  unit_price       NUMERIC NOT NULL DEFAULT 0,
  total            NUMERIC NOT NULL DEFAULT 0,
  delivered_qty    INTEGER DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID REFERENCES profiles(id),
  brand_variant_id UUID REFERENCES inventory_brand_variants(id)
);

ALTER TABLE sale_order_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal can insert sale_order_lines" ON sale_order_lines FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Internal can select sale_order_lines" ON sale_order_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "Internal can update sale_order_lines" ON sale_order_lines FOR UPDATE TO authenticated USING (true);

-- ─── SALE DELIVERIES ───

CREATE TABLE IF NOT EXISTS sale_deliveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_number TEXT NOT NULL UNIQUE,
  sale_order_id   UUID NOT NULL REFERENCES sale_orders(id),
  warehouse_id    UUID NOT NULL REFERENCES warehouses(id),
  warehouse_name  TEXT,
  date            DATE NOT NULL,
  items           JSONB NOT NULL DEFAULT '[]',
  status          sale_delivery_status DEFAULT 'pending',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES profiles(id),
  created_by_name TEXT
);

ALTER TABLE sale_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal can insert sale_deliveries" ON sale_deliveries FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Internal can select sale_deliveries" ON sale_deliveries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Internal can update sale_deliveries" ON sale_deliveries FOR UPDATE TO authenticated USING (true);

CREATE TRIGGER set_updated_at_sale_deliveries BEFORE UPDATE ON sale_deliveries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── RETURNS (unified) ───

CREATE TABLE IF NOT EXISTS returns (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_number        TEXT NOT NULL,
  source_type          return_source_type NOT NULL,
  source_id            UUID NOT NULL,
  date                 DATE NOT NULL DEFAULT CURRENT_DATE,
  reason               TEXT NOT NULL DEFAULT '',
  items                JSONB NOT NULL DEFAULT '[]',
  restock_warehouse_id UUID REFERENCES warehouses(id),
  credit_note_id       UUID REFERENCES credit_notes(id),
  notes                TEXT,
  status               return_status NOT NULL DEFAULT 'pending',
  division_id          UUID REFERENCES divisions(id),
  created_by           UUID REFERENCES profiles(id),
  created_by_name      TEXT DEFAULT '',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at           TIMESTAMPTZ
);

CREATE UNIQUE INDEX returns_return_number_unique ON returns(return_number) WHERE deleted_at IS NULL;

ALTER TABLE returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal can select returns" ON returns FOR SELECT TO authenticated USING (true);
CREATE POLICY "Internal can insert returns" ON returns FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Internal can update returns" ON returns FOR UPDATE TO authenticated USING (true);

CREATE TRIGGER trg_returns_updated_at BEFORE UPDATE ON returns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── APPROVAL REQUESTS ───

CREATE TABLE IF NOT EXISTS approval_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type     approval_source_type NOT NULL,
  source_id       UUID NOT NULL,
  approval_type   approval_type NOT NULL,
  status          approval_status DEFAULT 'pending',
  requested_by    UUID REFERENCES profiles(id),
  decided_by      UUID REFERENCES profiles(id),
  decided_by_name TEXT,
  reason          TEXT,
  comment         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal can select approval_requests" ON approval_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "Internal can insert approval_requests" ON approval_requests FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Internal can update approval_requests" ON approval_requests FOR UPDATE TO authenticated USING (true);

CREATE TRIGGER trg_approval_requests_updated_at BEFORE UPDATE ON approval_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── WAREHOUSE MANAGER LOG ───

CREATE TABLE IF NOT EXISTS warehouse_manager_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id  UUID NOT NULL REFERENCES warehouses(id),
  manager_id    UUID NOT NULL REFERENCES employees(id),
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  removed_at    TIMESTAMPTZ,
  assigned_by   UUID REFERENCES profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE warehouse_manager_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users can insert warehouse manager log" ON warehouse_manager_log FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Internal users can update warehouse manager log" ON warehouse_manager_log FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Internal users can view warehouse manager log" ON warehouse_manager_log FOR SELECT TO authenticated USING (true);

CREATE TRIGGER set_warehouse_manager_log_updated_at BEFORE UPDATE ON warehouse_manager_log
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── STOCK ADJUSTMENTS ───

CREATE TABLE IF NOT EXISTS stock_adjustments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id      UUID NOT NULL REFERENCES warehouses(id),
  brand_variant_id  UUID NOT NULL REFERENCES inventory_brand_variants(id),
  adjustment_type   TEXT NOT NULL,
  qty               NUMERIC NOT NULL,
  reason            TEXT NOT NULL,
  notes             TEXT,
  photo_urls        TEXT[],
  status            TEXT NOT NULL DEFAULT 'pending_approval',
  requested_by      UUID REFERENCES profiles(id),
  requested_by_name TEXT,
  approved_by       UUID REFERENCES profiles(id),
  approved_by_name  TEXT,
  approved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID REFERENCES profiles(id),
  deleted_at        TIMESTAMPTZ
);

ALTER TABLE stock_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users can create adjustments" ON stock_adjustments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Internal users can update adjustments" ON stock_adjustments FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Internal users can view adjustments" ON stock_adjustments FOR SELECT TO authenticated USING (true);

CREATE TRIGGER set_stock_adjustments_updated_at BEFORE UPDATE ON stock_adjustments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── INVENTORY CHECKS ───

CREATE TABLE IF NOT EXISTS inventory_checks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_number      TEXT NOT NULL,
  warehouse_id      UUID NOT NULL REFERENCES warehouses(id),
  warehouse_name    TEXT NOT NULL DEFAULT '',
  status            TEXT NOT NULL DEFAULT 'draft',
  submitted_by      UUID REFERENCES profiles(id),
  submitted_by_name TEXT,
  submitted_at      TIMESTAMPTZ,
  reviewed_by       UUID REFERENCES profiles(id),
  reviewed_by_name  TEXT,
  reviewed_at       TIMESTAMPTZ,
  review_notes      TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID REFERENCES profiles(id)
);

ALTER TABLE inventory_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users can manage inventory_checks" ON inventory_checks FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER set_inventory_checks_updated_at BEFORE UPDATE ON inventory_checks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── INVENTORY CHECK ITEMS ───

CREATE TABLE IF NOT EXISTS inventory_check_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id         UUID NOT NULL REFERENCES inventory_checks(id),
  brand_variant_id UUID NOT NULL REFERENCES inventory_brand_variants(id),
  item_name        TEXT NOT NULL,
  brand            TEXT NOT NULL,
  sku              TEXT,
  system_qty       NUMERIC NOT NULL DEFAULT 0,
  counted_qty      NUMERIC,
  is_counted       BOOLEAN NOT NULL DEFAULT false,
  variance         NUMERIC GENERATED ALWAYS AS (COALESCE(counted_qty, 0) - system_qty) STORED,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE inventory_check_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users can manage inventory_check_items" ON inventory_check_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER set_inventory_check_items_updated_at BEFORE UPDATE ON inventory_check_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── NOTIFICATION TRAIL ───

CREATE TABLE IF NOT EXISTS notification_trail (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_type   TEXT NOT NULL,
  notification_label  TEXT NOT NULL,
  category            notification_category NOT NULL,
  channel             notification_channel NOT NULL,
  recipient_name      TEXT NOT NULL,
  recipient_phone     TEXT NOT NULL,
  trigger_type        notification_trigger NOT NULL,
  trigger_detail      TEXT,
  order_id            TEXT,
  status              notification_status NOT NULL,
  error_message       TEXT,
  message_preview     TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID REFERENCES profiles(id),
  provider            TEXT,
  external_message_id TEXT,
  delivery_status     TEXT
);

ALTER TABLE notification_trail ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal can insert notification_trail" ON notification_trail FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Internal can select notification_trail" ON notification_trail FOR SELECT TO authenticated USING (true);

-- ─── SYNC STATE ───

CREATE TABLE IF NOT EXISTS sync_state (
  id                 TEXT PRIMARY KEY DEFAULT 'singleton',
  last_3cx_sync_at   TIMESTAMPTZ DEFAULT '2020-01-01 00:00:00+00',
  last_wati_sync_at  TIMESTAMPTZ DEFAULT '2020-01-01 00:00:00+00',
  last_whapi_sync_at TIMESTAMPTZ DEFAULT '2020-01-01 00:00:00+00',
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users can manage sync_state" ON sync_state FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER trg_sync_state_updated_at BEFORE UPDATE ON sync_state
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── QB ACCOUNTS ───

CREATE TABLE IF NOT EXISTS qb_accounts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qb_id                TEXT NOT NULL,
  name                 TEXT NOT NULL,
  acct_num             TEXT,
  account_type         TEXT NOT NULL,
  account_sub_type     TEXT,
  classification       TEXT NOT NULL,
  fully_qualified_name TEXT,
  active               BOOLEAN NOT NULL DEFAULT true,
  current_balance      NUMERIC,
  qb_company           TEXT NOT NULL DEFAULT 'alfaytri',
  synced_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (qb_id, qb_company)
);

ALTER TABLE qb_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage qb_accounts" ON qb_accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Internal can select qb_accounts" ON qb_accounts FOR SELECT TO authenticated USING (true);

-- ─── QB ITEMS ───

CREATE TABLE IF NOT EXISTS qb_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  qb_id               TEXT NOT NULL,
  name                TEXT NOT NULL,
  type                TEXT,
  income_account_ref  TEXT,
  expense_account_ref TEXT,
  active              BOOLEAN NOT NULL DEFAULT true,
  qb_company          TEXT NOT NULL DEFAULT 'alfaytri',
  synced_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (qb_id, qb_company)
);

ALTER TABLE qb_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage qb_items" ON qb_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Internal can select qb_items" ON qb_items FOR SELECT TO authenticated USING (true);

-- ─── QB DIVISION MAPPINGS ───

CREATE TABLE IF NOT EXISTS qb_division_mappings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  division      TEXT NOT NULL,
  mapping_type  TEXT NOT NULL,
  mapping_key   TEXT,
  qb_account_id UUID REFERENCES qb_accounts(id),
  qb_item_id    UUID REFERENCES qb_items(id),
  qb_company    TEXT NOT NULL DEFAULT 'alfaytri',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (division, mapping_type, mapping_key, qb_company)
);

ALTER TABLE qb_division_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage qb_division_mappings" ON qb_division_mappings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Internal can select qb_division_mappings" ON qb_division_mappings FOR SELECT TO authenticated USING (true);

CREATE TRIGGER trg_qb_division_mappings_updated_at BEFORE UPDATE ON qb_division_mappings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── WEBHOOK LOGS ───

CREATE TABLE IF NOT EXISTS webhook_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source        TEXT NOT NULL,
  event_type    TEXT,
  payload       JSONB NOT NULL,
  status_code   INTEGER,
  processed     BOOLEAN DEFAULT false,
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID REFERENCES profiles(id)
);

ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can view webhook_logs" ON webhook_logs FOR SELECT TO authenticated USING (true);
