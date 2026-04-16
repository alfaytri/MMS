-- ═══════════════════════════════════════════════════════════
-- Supabase-Ready Schema for Field Service Management System
-- Generated from codebase type analysis
-- ═══════════════════════════════════════════════════════════

-- ─── ENUMS ───

CREATE TYPE division AS ENUM ('maintenance', 'cleaning', 'kitchen', 'pest-control');
CREATE TYPE team_division AS ENUM ('alfaytri-maintenance', 'alfaytri-kitchen', 'rsh');
CREATE TYPE team_tag AS ENUM ('normal', 'emergency', 'qc', 'site-visit');
CREATE TYPE employee_status AS ENUM ('active', 'vacation', 'archived', 'unassigned', 'on-task');
CREATE TYPE order_status AS ENUM ('scheduled', 'confirmed', 'in-progress', 'completed', 'pending-approval', 'cancelled', 'waitlist', 'pending-confirmation');
CREATE TYPE confirmation_status AS ENUM ('not_sent', 'sent', 'confirmed', 'no_response', 'manually_confirmed');
CREATE TYPE invoice_status AS ENUM ('draft', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled', 'void');
CREATE TYPE invoice_source AS ENUM ('order', 'contract', 'quotation');
CREATE TYPE payment_method AS ENUM ('online', 'pay_later', 'fawran', 'online_transfer', 'cheque', 'bank_transfer', 'cash', 'pos');
CREATE TYPE payment_status AS ENUM ('completed', 'pending', 'failed', 'refunded', 'processing');
CREATE TYPE quotation_status AS ENUM ('draft', 'sent', 'pending_approval', 'approved', 'customer_approved', 'rejected', 'expired', 'converted', 'cancelled');
CREATE TYPE contract_status AS ENUM ('active', 'expiring_soon', 'overdue_payment', 'cancelled', 'completed');
CREATE TYPE service_status AS ENUM ('active', 'inactive');
CREATE TYPE service_category AS ENUM ('Repair', 'Installation', 'Maintenance', 'Cleaning', 'Quick Service');
CREATE TYPE contract_type AS ENUM ('preventive', 'area', 'general');
CREATE TYPE service_type AS ENUM ('standard', 'configurable');
CREATE TYPE instruction_type AS ENUM ('pre-service', 'post-service');
CREATE TYPE instruction_content_type AS ENUM ('text', 'pdf');
CREATE TYPE inventory_type AS ENUM ('products', 'spare-parts', 'consumables', 'tools');
CREATE TYPE tool_status AS ENUM ('available', 'assigned', 'maintenance', 'retired');
CREATE TYPE tool_condition AS ENUM ('New', 'Good', 'Fair', 'Maintenance');
CREATE TYPE rfq_status AS ENUM ('draft', 'sent', 'received', 'cancelled');
CREATE TYPE po_status AS ENUM ('draft', 'pending_approval', 'approved', 'partially_received', 'received', 'cancelled');
CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE approval_role AS ENUM ('purchase_manager', 'accountant', 'owner');
CREATE TYPE shipment_status AS ENUM ('booked', 'in_transit', 'customs', 'delivered', 'delayed');
CREATE TYPE shipment_mode AS ENUM ('air', 'sea', 'land', 'manual');
CREATE TYPE transfer_status AS ENUM ('pending', 'in_transit', 'pending_approval', 'approved', 'rejected');
CREATE TYPE receival_status AS ENUM ('pending_approval', 'approved', 'rejected');
CREATE TYPE tl_order_type AS ENUM ('order', 'site-visit-single', 'site-visit-contract', 'contract', 'backwork', 'follow-up', 'qc');
CREATE TYPE qc_priority AS ENUM ('high', 'medium', 'low');
CREATE TYPE qc_schedule_status AS ENUM ('pending', 'in-progress', 'completed', 'missed');
CREATE TYPE reminder_channel AS ENUM ('Email', 'SMS', 'WhatsApp');
CREATE TYPE address_type AS ENUM ('blue-plate', 'google-coords');
CREATE TYPE message_source AS ENUM ('whatsapp', 'whatsapp_api', 'phone', 'sms', 'email');

-- ─── CUSTOMERS ───

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_ar TEXT,
  phone TEXT NOT NULL,
  email TEXT,
  customer_type TEXT DEFAULT 'individual', -- 'individual' | 'business'
  subscription_tag TEXT, -- 'Premium', 'Basic', 'Enterprise'
  is_blocked BOOLEAN DEFAULT false,
  block_reason TEXT,
  pending_balance NUMERIC DEFAULT 0,
  credit_limit NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
-- RLS: authenticated users can read/write based on role
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_name ON customers(name);

-- ─── CUSTOMER ADDRESSES ───

CREATE TABLE customer_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
  label TEXT NOT NULL,
  line TEXT NOT NULL,
  type address_type NOT NULL,
  country TEXT DEFAULT 'Qatar',
  tags TEXT[] DEFAULT '{}', -- 'MEP', 'Contract'
  blue_plate_unit TEXT,
  blue_plate_building TEXT,
  blue_plate_street TEXT,
  blue_plate_zone TEXT,
  coords_lat NUMERIC,
  coords_lng NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_customer_addresses_customer ON customer_addresses(customer_id);

-- ─── EMPLOYEES ───

CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_ar TEXT,
  phone TEXT NOT NULL,
  skills TEXT[] DEFAULT '{}',
  status employee_status DEFAULT 'active',
  team_id UUID, -- FK added after teams table
  avatar TEXT,
  join_date DATE NOT NULL,
  nationality TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_employees_status ON employees(status);
CREATE INDEX idx_employees_team ON employees(team_id);

-- ─── VEHICLES ───

CREATE TABLE vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  plate TEXT NOT NULL,
  team_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── SCHEDULES ───

CREATE TABLE schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  days JSONB NOT NULL, -- Record<number, DaySchedule>
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── TEAMS ───

CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  tag team_tag DEFAULT 'normal',
  vehicle_id UUID REFERENCES vehicles(id),
  schedule_id UUID REFERENCES schedules(id),
  schedule_start INT DEFAULT 7,
  schedule_end INT DEFAULT 17,
  division team_division NOT NULL,
  leader_id UUID REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add FK from employees to teams
ALTER TABLE employees ADD CONSTRAINT fk_employee_team FOREIGN KEY (team_id) REFERENCES teams(id);
ALTER TABLE vehicles ADD CONSTRAINT fk_vehicle_team FOREIGN KEY (team_id) REFERENCES teams(id);

-- ─── TEAM SCHEDULE ASSIGNMENTS ───

CREATE TABLE team_schedule_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
  schedule_id UUID REFERENCES schedules(id) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_tsa_team ON team_schedule_assignments(team_id);

-- ─── SERVICES (hierarchical, 4-level tree) ───

CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES services(id),
  name_en TEXT NOT NULL,
  name_ar TEXT,
  code TEXT,
  price NUMERIC,
  emergency_price NUMERIC,
  duration INT, -- minutes
  warranty INT, -- months
  category service_category,
  status service_status DEFAULT 'active',
  division division,
  service_type service_type DEFAULT 'standard',
  contract_type contract_type,
  price_unit TEXT,
  discount NUMERIC,
  brands_supported INT,
  includes_notes BOOLEAN DEFAULT false,
  spare_parts BOOLEAN DEFAULT false,
  qc_checklist BOOLEAN DEFAULT false,
  instructions BOOLEAN DEFAULT false,
  reminder_days INT,
  invoice_text_en TEXT,
  invoice_text_ar TEXT,
  booking_time_matrix JSONB, -- BookingTimeEntry[]
  inventory_items JSONB, -- {name, qty}[]
  components JSONB, -- ConfigComponent[] for configurable services
  tree_type TEXT DEFAULT 'normal', -- 'normal', 'contract', 'mobile', 'inventory', 'promotions'
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_services_parent ON services(parent_id);
CREATE INDEX idx_services_division ON services(division);
CREATE INDEX idx_services_status ON services(status);

-- ─── INSTRUCTIONS ───

CREATE TABLE instructions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en TEXT NOT NULL,
  name_ar TEXT,
  type instruction_type NOT NULL,
  content_type instruction_content_type DEFAULT 'text',
  content_preview TEXT,
  full_content TEXT,
  pdf_file_name TEXT,
  linked_service_ids UUID[] DEFAULT '{}',
  status service_status DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── ORDERS ───

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL UNIQUE, -- human-readable e.g. ORD-2026-0901
  customer_id UUID REFERENCES customers(id) NOT NULL,
  type TEXT DEFAULT 'order', -- 'order', 'site-visit', 'quotation'
  division division NOT NULL,
  status order_status DEFAULT 'scheduled',
  confirmation_status confirmation_status DEFAULT 'not_sent',
  confirmation_sent_at TIMESTAMPTZ,
  scheduled_date DATE NOT NULL,
  scheduled_end_date DATE,
  scheduled_time TEXT,
  visit_date DATE,
  total_amount NUMERIC DEFAULT 0,
  agent_name TEXT,
  notes TEXT,
  address TEXT,
  has_invoice BOOLEAN DEFAULT false,
  invoice_number TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_scheduled ON orders(scheduled_date);
CREATE INDEX idx_orders_order_id ON orders(order_id);

-- ─── ORDER SERVICES (line items) ───

CREATE TABLE order_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
  service_id UUID REFERENCES services(id),
  name TEXT NOT NULL,
  path TEXT[] DEFAULT '{}',
  qty INT DEFAULT 1,
  price NUMERIC DEFAULT 0,
  duration INT,
  configuration JSONB, -- ServiceConfigEntry[]
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_order_services_order ON order_services(order_id);

-- ─── ORDER TEAM ASSIGNMENTS ───

CREATE TABLE order_team_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
  team_id UUID REFERENCES teams(id) NOT NULL,
  services JSONB NOT NULL, -- {name, qty}[]
  scheduled_date DATE NOT NULL,
  time_slot TEXT,
  duration TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_ota_order ON order_team_assignments(order_id);

-- ─── ORDER LOG ───

CREATE TABLE order_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
  action TEXT NOT NULL,
  user_name TEXT,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_order_log_order ON order_log(order_id);

-- ─── INVOICES ───

CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id TEXT NOT NULL UNIQUE,
  customer_id UUID REFERENCES customers(id) NOT NULL,
  source invoice_source NOT NULL,
  source_id TEXT NOT NULL,
  source_label TEXT,
  issued_date DATE NOT NULL,
  due_date DATE NOT NULL,
  status invoice_status DEFAULT 'draft',
  subtotal NUMERIC DEFAULT 0,
  tax NUMERIC DEFAULT 0,
  total_amount NUMERIC DEFAULT 0,
  paid_amount NUMERIC DEFAULT 0,
  agent_name TEXT,
  division TEXT,
  notes TEXT,
  qb_synced BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_due_date ON invoices(due_date);

-- ─── INVOICE LINE ITEMS ───

CREATE TABLE invoice_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE NOT NULL,
  description TEXT NOT NULL,
  qty INT DEFAULT 1,
  unit_price NUMERIC DEFAULT 0,
  total NUMERIC DEFAULT 0,
  team_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── PAYMENTS ───

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id TEXT NOT NULL UNIQUE,
  invoice_id UUID REFERENCES invoices(id) NOT NULL,
  amount NUMERIC NOT NULL,
  method payment_method NOT NULL,
  status payment_status DEFAULT 'pending',
  date DATE NOT NULL,
  reference TEXT,
  cheque_number TEXT,
  cheque_date DATE,
  bank_name TEXT,
  transaction_id TEXT,
  agent_name TEXT,
  notes TEXT,
  qb_synced BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_payments_invoice ON payments(invoice_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_date ON payments(date);

-- ─── QUOTATIONS ───

CREATE TABLE quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id TEXT NOT NULL UNIQUE,
  customer_id UUID REFERENCES customers(id) NOT NULL,
  division TEXT,
  services_summary TEXT,
  agent_name TEXT,
  created_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  sent_date DATE,
  status quotation_status DEFAULT 'draft',
  total_amount NUMERIC DEFAULT 0,
  line_item_count INT DEFAULT 0,
  has_configurable BOOLEAN DEFAULT false,
  converted_order_id UUID REFERENCES orders(id),
  approved_by_manager BOOLEAN DEFAULT false,
  approved_by_customer BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_quotations_customer ON quotations(customer_id);
CREATE INDEX idx_quotations_status ON quotations(status);

-- ─── QUOTATION LOG ───

CREATE TABLE quotation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID REFERENCES quotations(id) ON DELETE CASCADE NOT NULL,
  action TEXT NOT NULL,
  user_name TEXT,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── CONTRACTS ───

CREATE TABLE contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id TEXT NOT NULL UNIQUE,
  customer_id UUID REFERENCES customers(id) NOT NULL,
  site_name TEXT NOT NULL,
  divisions TEXT[] DEFAULT '{}',
  services_summary TEXT,
  agent_name TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status contract_status DEFAULT 'active',
  monthly_value NUMERIC DEFAULT 0,
  total_value NUMERIC DEFAULT 0,
  total_visits INT DEFAULT 0,
  completed_visits INT DEFAULT 0,
  total_payments NUMERIC DEFAULT 0,
  paid_amount NUMERIC DEFAULT 0,
  payment_schedule TEXT,
  has_signed_doc BOOLEAN DEFAULT false,
  area_count INT DEFAULT 0,
  cancelled_date DATE,
  cancel_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_contracts_customer ON contracts(customer_id);
CREATE INDEX idx_contracts_status ON contracts(status);

-- ─── CONTRACT VISITS ───

CREATE TABLE contract_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID REFERENCES contracts(id) ON DELETE CASCADE NOT NULL,
  service_name TEXT NOT NULL,
  scheduled_date DATE NOT NULL,
  team_id UUID REFERENCES teams(id),
  completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_contract_visits_contract ON contract_visits(contract_id);
CREATE INDEX idx_contract_visits_date ON contract_visits(scheduled_date);

-- ─── CONTRACT PAYMENTS ───

CREATE TABLE contract_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID REFERENCES contracts(id) ON DELETE CASCADE NOT NULL,
  due_date DATE NOT NULL,
  amount NUMERIC NOT NULL,
  status TEXT DEFAULT 'pending', -- 'paid', 'pending', 'overdue'
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── INVENTORY CATEGORIES ───

CREATE TABLE inventory_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en TEXT NOT NULL,
  name_ar TEXT,
  sku TEXT,
  type inventory_type NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── INVENTORY ITEMS ───

CREATE TABLE inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES inventory_categories(id) NOT NULL,
  name_en TEXT NOT NULL,
  name_ar TEXT,
  sku TEXT NOT NULL,
  unit TEXT NOT NULL,
  cost_price NUMERIC DEFAULT 0,
  markup_percent NUMERIC,
  linked_services_count INT DEFAULT 0,
  total_stock INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_inventory_items_category ON inventory_items(category_id);
CREATE INDEX idx_inventory_items_sku ON inventory_items(sku);

-- ─── INVENTORY BRAND VARIANTS ───

CREATE TABLE inventory_brand_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID REFERENCES inventory_items(id) ON DELETE CASCADE NOT NULL,
  brand TEXT NOT NULL,
  code TEXT,
  cost_price NUMERIC DEFAULT 0,
  selling_price NUMERIC DEFAULT 0,
  stock_level INT DEFAULT 0,
  incoming INT DEFAULT 0,
  incoming_eta DATE,
  average_cost NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_brand_variants_item ON inventory_brand_variants(item_id);

-- ─── FIFO COST LAYERS ───

CREATE TABLE fifo_cost_layers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_variant_id UUID REFERENCES inventory_brand_variants(id) ON DELETE CASCADE NOT NULL,
  receival_id TEXT,
  receival_number TEXT,
  date DATE NOT NULL,
  qty INT NOT NULL,
  unit_cost NUMERIC NOT NULL,
  landed_cost_per_unit NUMERIC DEFAULT 0,
  total_unit_cost NUMERIC NOT NULL,
  remaining_qty INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_fifo_brand ON fifo_cost_layers(brand_variant_id);

-- ─── TOOL ASSETS ───

CREATE TABLE tool_asset_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES inventory_categories(id),
  name_en TEXT NOT NULL,
  name_ar TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE tool_asset_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID REFERENCES tool_asset_items(id) ON DELETE CASCADE NOT NULL,
  serial_number TEXT NOT NULL,
  brand TEXT NOT NULL,
  status tool_status DEFAULT 'available',
  assigned_to TEXT,
  condition tool_condition DEFAULT 'Good',
  expiry DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_tool_units_item ON tool_asset_units(item_id);

-- ─── INVENTORY GROUPS (kits) ───

CREATE TABLE inventory_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en TEXT NOT NULL,
  name_ar TEXT,
  items JSONB NOT NULL DEFAULT '[]', -- {itemId, itemName, qty}[]
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── WAREHOUSES ───

CREATE TABLE warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  location TEXT,
  manager_id UUID REFERENCES employees(id),
  item_count INT DEFAULT 0,
  total_value NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── RFQ ───

CREATE TABLE rfqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_number TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  status rfq_status DEFAULT 'draft',
  created_date DATE NOT NULL,
  due_date DATE NOT NULL,
  suppliers TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE rfq_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id UUID REFERENCES rfqs(id) ON DELETE CASCADE NOT NULL,
  item_name TEXT NOT NULL,
  sku TEXT,
  qty INT NOT NULL,
  unit TEXT NOT NULL,
  target_price NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE rfq_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id UUID REFERENCES rfqs(id) ON DELETE CASCADE NOT NULL,
  supplier_id TEXT NOT NULL,
  supplier_name TEXT NOT NULL,
  currency TEXT DEFAULT 'QAR',
  items JSONB NOT NULL, -- {lineItemId, unitPrice, leadTimeDays}[]
  total_amount NUMERIC DEFAULT 0,
  received_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── PURCHASE ORDERS ───

CREATE TABLE purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number TEXT NOT NULL UNIQUE,
  rfq_id UUID REFERENCES rfqs(id),
  supplier_id TEXT NOT NULL,
  supplier_name TEXT NOT NULL,
  status po_status DEFAULT 'draft',
  currency TEXT DEFAULT 'QAR',
  exchange_rate NUMERIC DEFAULT 1,
  subtotal NUMERIC DEFAULT 0,
  total_qar NUMERIC DEFAULT 0,
  created_date DATE NOT NULL,
  expected_delivery DATE,
  approval_level INT DEFAULT 1,
  warehouse_id UUID REFERENCES warehouses(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_po_status ON purchase_orders(status);

CREATE TABLE po_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE NOT NULL,
  item_name TEXT NOT NULL,
  sku TEXT,
  qty INT NOT NULL,
  received_qty INT DEFAULT 0,
  unit TEXT NOT NULL,
  unit_price NUMERIC NOT NULL,
  total_price NUMERIC NOT NULL,
  fifo_layers JSONB, -- {qty, unitCost, date, receivalId}[]
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE po_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE NOT NULL,
  role approval_role NOT NULL,
  status approval_status DEFAULT 'pending',
  approved_by TEXT,
  date DATE,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── RECEIVALS ───

CREATE TABLE receivals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receival_number TEXT NOT NULL UNIQUE,
  po_id UUID REFERENCES purchase_orders(id) NOT NULL,
  warehouse_id UUID REFERENCES warehouses(id) NOT NULL,
  received_by UUID REFERENCES employees(id),
  received_by_name TEXT,
  date DATE NOT NULL,
  status receival_status DEFAULT 'pending_approval',
  landed_cost_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE receival_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receival_id UUID REFERENCES receivals(id) ON DELETE CASCADE NOT NULL,
  po_line_item_id UUID REFERENCES po_line_items(id),
  item_name TEXT NOT NULL,
  sku TEXT,
  qty_received INT NOT NULL,
  unit_cost NUMERIC NOT NULL,
  is_free BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── WAREHOUSE TRANSFERS ───

CREATE TABLE warehouse_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_number TEXT NOT NULL UNIQUE,
  from_warehouse_id UUID REFERENCES warehouses(id) NOT NULL,
  to_warehouse_id UUID REFERENCES warehouses(id) NOT NULL,
  status transfer_status DEFAULT 'pending',
  created_by TEXT,
  created_by_name TEXT,
  approved_by TEXT,
  approved_by_name TEXT,
  date DATE NOT NULL,
  approved_date DATE,
  items JSONB NOT NULL, -- TransferItem[]
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── SHIPMENTS ───

CREATE TABLE shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_number TEXT NOT NULL,
  po_id UUID REFERENCES purchase_orders(id) NOT NULL,
  receival_id UUID REFERENCES receivals(id),
  mode shipment_mode NOT NULL,
  carrier TEXT NOT NULL,
  status shipment_status DEFAULT 'booked',
  origin TEXT,
  destination TEXT,
  etd DATE,
  eta DATE,
  events JSONB DEFAULT '[]', -- ShipmentTrackingEvent[]
  archived BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_shipments_po ON shipments(po_id);
CREATE INDEX idx_shipments_status ON shipments(status);

-- ─── LANDED COSTS ───

CREATE TABLE landed_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lc_number TEXT NOT NULL UNIQUE,
  description TEXT,
  total_amount NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'QAR',
  lines JSONB DEFAULT '[]', -- LandedCostLine[]
  attached_receival_ids UUID[] DEFAULT '{}',
  attached_po_ids UUID[] DEFAULT '{}',
  all_items_sold BOOLEAN DEFAULT false,
  date DATE NOT NULL,
  item_allocations JSONB, -- LandedCostItemAllocation[]
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── QC ───

CREATE TABLE qc_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID REFERENCES services(id),
  service_name TEXT,
  is_general BOOLEAN DEFAULT false,
  label TEXT NOT NULL,
  max_score INT DEFAULT 10,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE qc_team_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) NOT NULL,
  division division NOT NULL,
  current_score INT DEFAULT 0,
  total_inspections INT DEFAULT 0,
  last_inspection DATE,
  member_change_date DATE,
  previous_scores JSONB DEFAULT '[]',
  service_history TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_qc_scores_team ON qc_team_scores(team_id);

CREATE TABLE qc_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL,
  order_type TEXT DEFAULT 'one-time',
  team_id UUID REFERENCES teams(id) NOT NULL,
  service_name TEXT NOT NULL,
  scheduled_date DATE NOT NULL,
  status qc_schedule_status DEFAULT 'pending',
  priority qc_priority DEFAULT 'medium',
  reason TEXT,
  assigned_qc_team_id UUID REFERENCES teams(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_qc_schedule_date ON qc_schedule(scheduled_date);

CREATE TABLE qc_inspection_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_entry_id UUID REFERENCES qc_schedule(id) NOT NULL,
  order_id TEXT NOT NULL,
  team_id UUID REFERENCES teams(id) NOT NULL,
  qc_team_id UUID REFERENCES teams(id) NOT NULL,
  date DATE NOT NULL,
  service_checklist JSONB DEFAULT '[]',
  general_checklist JSONB DEFAULT '[]',
  total_score INT DEFAULT 0,
  max_possible_score INT DEFAULT 0,
  percentage INT DEFAULT 0,
  notes TEXT,
  images TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── REMINDERS ───

CREATE TABLE reminder_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  icon TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES reminder_categories(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  name_ar TEXT,
  description TEXT,
  template TEXT,
  channel reminder_channel DEFAULT 'Email',
  timing TEXT,
  status service_status DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── CHAT / CONTACT CENTER ───

CREATE TABLE chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) NOT NULL,
  last_message TEXT,
  last_message_at TIMESTAMPTZ,
  unread_count INT DEFAULT 0,
  channel message_source,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_chat_customer ON chat_conversations(customer_id);

CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES chat_conversations(id) ON DELETE CASCADE NOT NULL,
  text TEXT NOT NULL,
  from_type TEXT NOT NULL, -- 'agent' | 'customer'
  agent_name TEXT,
  source message_source NOT NULL,
  attachments JSONB, -- [{name, type, url}]
  call_metadata JSONB, -- {duration, direction, recordingStatus, recordingUrl}
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_chat_messages_conversation ON chat_messages(conversation_id);

-- ─── ACTIVITY LOG (teams) ───

CREATE TABLE activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  details TEXT,
  entity_type TEXT NOT NULL, -- 'employee', 'vehicle', 'team', 'schedule'
  entity_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_activity_log_entity ON activity_log(entity_type, entity_id);

-- ─── PROMOTIONS & VOUCHERS ───

CREATE TYPE promotion_rule_type AS ENUM ('percentage', 'fixed', 'buy_one_get_one', 'buy_x_get_y', 'buy_x_discount_get_y');
CREATE TYPE voucher_type AS ENUM ('single_use', 'multi_use', 'limited');
CREATE TYPE campaign_status AS ENUM ('active', 'scheduled', 'expired', 'disabled');

CREATE TABLE promotion_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  applicable_to TEXT DEFAULT 'all', -- 'all' | 'division' | 'service' | 'customer'
  divisions TEXT[],
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status campaign_status DEFAULT 'scheduled',
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE promotion_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES promotion_campaigns(id) ON DELETE CASCADE NOT NULL,
  type promotion_rule_type NOT NULL,
  service_ids TEXT[],
  discount_percent NUMERIC,
  discount_amount NUMERIC,
  free_service_id TEXT,
  free_service_name TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_promotion_rules_campaign ON promotion_rules(campaign_id);

CREATE TABLE vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  campaign_id UUID REFERENCES promotion_campaigns(id) ON DELETE SET NULL,
  type voucher_type DEFAULT 'single_use',
  usage_limit INT,
  usage_count INT DEFAULT 0,
  min_order_value NUMERIC,
  max_discount NUMERIC,
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_vouchers_code ON vouchers(code);

CREATE TABLE voucher_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id UUID REFERENCES vouchers(id) ON DELETE CASCADE NOT NULL,
  order_id TEXT NOT NULL,
  customer_name TEXT,
  discount_applied NUMERIC NOT NULL,
  redeemed_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_voucher_redemptions_voucher ON voucher_redemptions(voucher_id);

-- ═══════════════════════════════════════════════════════════
-- NOTE: RLS policies should be added per table based on 
-- authentication requirements. All tables should have
-- RLS enabled with appropriate policies.
-- ═══════════════════════════════════════════════════════════
