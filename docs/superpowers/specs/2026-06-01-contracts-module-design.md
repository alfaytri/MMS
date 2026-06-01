# Contracts Module â€” Design Specification (Part 1 of 3)

**Date:** 2026-06-01
**Branch:** `feature/contract-module`

---

## 1. Overview

The Contracts module manages the full lifecycle of service contracts â€” from quotation drafting through multi-level approval to active contract management with visit scheduling and payment tracking.

### 1.1 Two Workflows, One Data Model

1. **Contract Quotations** â€” An agent creates a quotation (building structure + services + pricing + payment terms). The quotation goes through: draft â†’ manager approval â†’ customer approval â†’ signed document upload â†’ activation.
2. **Live Contracts** â€” Once active, the contract tracks scheduled visits (generated from service frequencies), payment collection (fixed/milestone/completion), and can be cancelled with a reason.

Both workflows share a single `contracts` table. A quotation becomes a live contract by status transition (`approved` â†’ `active`). No data migration or table copy required.

### 1.2 Key Design Decisions

| Decision | Rationale |
|---|---|
| Single `contracts` table for entire lifecycle | No data duplication; status transition is just an UPDATE |
| Building tree stored as JSONB | Contract-specific, deeply nested, always read-as-whole; not queried independently |
| Services as relational table (`contract_services`) | Need to sum, filter, schedule individually |
| Milestones as relational table (`contract_milestones`) | Need independent row-level status updates |
| Schedule assignment happens **post-approval only** | Avoids blocking team timeslots during weeks-long approval process |
| Prices are **snapshots** frozen at creation | Master price changes don't retroactively alter existing contracts |
| Contract visits in `contract_visits` only (v1) | No coupling to `orders` table â€” clean separation |
| Discount is flat QAR on subtotal | Not percentage, not per-line |
| `sent` and `customer_pending` merged into `customer_pending` | No email delivery tracking exists |

### 1.3 Module Scope

| What | Count |
|---|---|
| Pages | 4 |
| Components | 15 |
| Hooks | 7 |
| New DB tables | 3 (`contract_services`, `contract_milestones`, `service_brands`) |
| Modified DB tables | 1 (`contracts` â€” new columns) |
| Existing tables used as-is | 4 (`contract_visits`, `contract_payments`, `pricing_factors`, `brands`) |

### 1.4 File Structure

```
src/
â”œâ”€â”€ app/(dashboard)/contracts/
â”‚   â”œâ”€â”€ page.tsx                              # View Live Contracts
â”‚   â”œâ”€â”€ quotations/
â”‚   â”‚   â””â”€â”€ page.tsx                          # View Contract Quotations
â”‚   â”œâ”€â”€ create-quotation/
â”‚   â”‚   â””â”€â”€ page.tsx                          # Create Contract Quotation
â”‚   â””â”€â”€ detail/
â”‚       â””â”€â”€ [contractId]/
â”‚           â””â”€â”€ page.tsx                      # Contract Detail (quotation view + live contract view)
â”‚
â”œâ”€â”€ components/contracts/
â”‚   â”œâ”€â”€ ContractQuotationCard.tsx              # Card for quotation list (~180 lines)
â”‚   â”œâ”€â”€ ContractCard.tsx                      # Expandable card for live contracts (~220 lines)
â”‚   â”œâ”€â”€ CancelContractDialog.tsx              # Cancellation confirmation (~50 lines)
â”‚   â”œâ”€â”€ ContractBuildingTree.tsx              # Recursive building tree renderer (~250 lines)
â”‚   â”œâ”€â”€ BuildingNodeDialog.tsx                # Add/edit building node dialog (~80 lines)
â”‚   â”œâ”€â”€ AreaServiceCard.tsx                   # Service card within tree/general (~120 lines)
â”‚   â”œâ”€â”€ ServiceMediaDialog.tsx                # Media viewer for service attachments (~150 lines)
â”‚   â”œâ”€â”€ ServiceScheduleSection.tsx            # Mini calendar + DnD team grid (~480 lines)
â”‚   â”œâ”€â”€ PaymentScheduleSection.tsx            # Fixed/milestone/completion modes (~200 lines)
â”‚   â”œâ”€â”€ ContractTermsSection.tsx              # Auto-collected T&C display (~220 lines)
â”‚   â”œâ”€â”€ AddContractServiceDialog.tsx          # 2-step service picker with pricing (~410 lines)
â”‚   â”œâ”€â”€ ContractQuotationShared.tsx           # SectionCard, EditButton, InfoRow, FieldDisplay (~100 lines)
â”‚   â”œâ”€â”€ WorkflowProgressBar.tsx               # Draftâ†’Reviewâ†’Customerâ†’Approved pills (~60 lines)
â”‚   â”œâ”€â”€ VisitSummarySection.tsx               # Read-only visit count summary (~80 lines)
â”‚   â””â”€â”€ SignedDocUploadBanner.tsx             # Signed contract upload component (~70 lines)
â”‚
â”œâ”€â”€ hooks/
â”‚   â”œâ”€â”€ useContractQuotations.ts              # Quotation list + pipeline value
â”‚   â”œâ”€â”€ useContracts.ts                       # Live contracts list + outstanding
â”‚   â”œâ”€â”€ useContractDetail.ts                  # Single contract + all relations
â”‚   â”œâ”€â”€ useCreateContractQuotation.ts         # Create mutation
â”‚   â”œâ”€â”€ useUpdateContract.ts                  # Update mutation + status transitions
â”‚   â”œâ”€â”€ useContractSchedule.ts                # Schedule assignment (post-approval)
â”‚   â””â”€â”€ useServiceBrands.ts                   # Brand-reliability lookup
â”‚
â””â”€â”€ lib/
    â””â”€â”€ contractStateMachine.ts               # Status transition validation + side effects
```

---

## 2. Database Schema

### 2.1 Status Enum Expansion

The existing `contract_status` enum has: `active`, `expiring_soon`, `overdue_payment`, `cancelled`, `completed`.

Add quotation-phase statuses:

```sql
ALTER TYPE contract_status ADD VALUE IF NOT EXISTS 'draft';
ALTER TYPE contract_status ADD VALUE IF NOT EXISTS 'manager_review';
ALTER TYPE contract_status ADD VALUE IF NOT EXISTS 'customer_pending';
ALTER TYPE contract_status ADD VALUE IF NOT EXISTS 'approved';
ALTER TYPE contract_status ADD VALUE IF NOT EXISTS 'rejected';
ALTER TYPE contract_status ADD VALUE IF NOT EXISTS 'expired';
```

**Full lifecycle (11 statuses):**

```
QUOTATION PHASE:
  draft â†’ manager_review â†’ customer_pending â†’ approved
                         â†˜ rejected (â†’ draft on "Edit")
                                              â†˜ rejected (â†’ draft on "Edit")
  Any quotation status â†’ expired (time-based, if end_date passes before activation)

LIVE PHASE:
  approved â†’ active (on signed doc upload + activation)
  active â†’ expiring_soon (auto, when end_date within 30 days)
  active â†’ overdue_payment (auto, when any payment past due)
  active â†’ completed (all visits done + all payments collected)
  active â†’ cancelled (manual, with reason)
  expiring_soon â†’ active (if renewed/extended)
  expiring_soon â†’ completed | cancelled
  overdue_payment â†’ active (payment received) | cancelled
```

**Status display configuration:**

| Status | Label | Color | Badge variant |
|---|---|---|---|
| `draft` | Draft | Gray | `muted` |
| `manager_review` | Manager Review | Yellow | `warning` |
| `customer_pending` | Awaiting Signature | Orange | `warning` |
| `approved` | Approved | Green | `success` |
| `rejected` | Rejected | Red | `destructive` |
| `expired` | Expired | Gray | `muted` |
| `active` | Active | Bold green | `success` |
| `expiring_soon` | Expiring Soon | Yellow | `warning` |
| `overdue_payment` | Overdue | Red | `destructive` |
| `completed` | Completed | Blue | `default` |
| `cancelled` | Cancelled | Gray | `muted` |

### 2.2 Modified `contracts` Table â€” New Columns

All new columns are nullable or have defaults so existing rows (if any) are unaffected.

```sql
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS quotation_number TEXT UNIQUE;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'direct';
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS building_tree JSONB NOT NULL DEFAULT '{"nodes":[]}';
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS discount NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS payment_mode TEXT NOT NULL DEFAULT 'fixed';
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS payment_frequency TEXT NOT NULL DEFAULT 'monthly';
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS signed_doc_url TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS terms_snapshot JSONB;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES profiles(id);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS rejected_reason TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES profiles(id);
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;
```

**Column reference:**

| Column | Type | Default | Purpose |
|---|---|---|---|
| `quotation_number` | TEXT UNIQUE | null | Display ID for quotation phase: `CTR-Q-2026-001` |
| `source_type` | TEXT | `'direct'` | `'site_visit'` or `'direct'` â€” label only, no linking |
| `building_tree` | JSONB | `{"nodes":[]}` | Nested structure: Complexâ†’Buildingâ†’Floorâ†’Area |
| `discount` | NUMERIC | 0 | Flat QAR discount subtracted from subtotal |
| `payment_mode` | TEXT | `'fixed'` | `'fixed'` / `'milestone'` / `'completion'` |
| `payment_frequency` | TEXT | `'monthly'` | For fixed mode: `'monthly'` / `'quarterly'` / `'semi_annual'` / `'annual'` |
| `notes` | TEXT | null | Free-text general notes |
| `signed_doc_url` | TEXT | null | Supabase Storage path for uploaded signed contract |
| `terms_snapshot` | JSONB | null | Frozen T&C captured at the moment of approval |
| `approved_by` | UUID FKâ†’profiles | null | Manager who approved the quotation |
| `approved_at` | TIMESTAMPTZ | null | When the quotation was approved |
| `sent_at` | TIMESTAMPTZ | null | When sent to customer for review |
| `created_by` | UUID FKâ†’profiles | null | Agent who created the quotation |
| `rejected_reason` | TEXT | null | Why the quotation was rejected |
| `rejected_by` | UUID FKâ†’profiles | null | Who rejected it |
| `rejected_at` | TIMESTAMPTZ | null | When it was rejected |

### 2.3 New Table: `contract_services`

Line items for services attached to a contract â€” both building-tree services and general (non-tree) services.

```sql
CREATE TABLE contract_services (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id         UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  service_id          UUID REFERENCES services(id),
  building_node_id    TEXT,
  service_name        TEXT NOT NULL,
  service_path        TEXT[] DEFAULT '{}',
  brand_id            UUID REFERENCES brands(id),
  brand_name          TEXT,
  reliability_factor  NUMERIC NOT NULL DEFAULT 1.0,
  condition           TEXT,
  condition_factor    NUMERIC NOT NULL DEFAULT 1.0,
  frequency           TEXT NOT NULL DEFAULT 'monthly',
  quantity            INT NOT NULL DEFAULT 1,
  base_price          NUMERIC NOT NULL DEFAULT 0,
  unit_price          NUMERIC NOT NULL DEFAULT 0,
  total_price         NUMERIC NOT NULL DEFAULT 0,
  divisions           TEXT[] DEFAULT '{}',
  note                TEXT,
  is_general          BOOLEAN NOT NULL DEFAULT false,
  sort_order          INT NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contract_services_contract ON contract_services(contract_id);
CREATE INDEX idx_contract_services_node ON contract_services(building_node_id);

ALTER TABLE contract_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read contract_services" ON contract_services FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert contract_services" ON contract_services FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update contract_services" ON contract_services FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete contract_services" ON contract_services FOR DELETE TO authenticated USING (true);
```

**Column details:**

| Column | Type | Purpose |
|---|---|---|
| `contract_id` | UUID FK | Parent contract |
| `service_id` | UUID FK | Reference to master services table (for T&C lookup) |
| `building_node_id` | TEXT | References `node.id` inside `contracts.building_tree` JSONB. NULL for general services (`is_general = true`) |
| `service_name` | TEXT | Snapshot of service name at time of addition |
| `service_path` | TEXT[] | Breadcrumb: `['Maintenance', 'AC', 'Split Unit Cleaning']` |
| `brand_id` | UUID FK | Selected brand (optional) |
| `brand_name` | TEXT | Snapshot of brand name |
| `reliability_factor` | NUMERIC | Snapshot of brand's reliability multiplier (1.0 = neutral) |
| `condition` | TEXT | `'good'` / `'fair'` / `'poor'` (optional) |
| `condition_factor` | NUMERIC | Snapshot of condition multiplier (1.0 = neutral) |
| `frequency` | TEXT | `'daily'` / `'weekly'` / `'bi_weekly'` / `'monthly'` / `'quarterly'` / `'semi_annual'` / `'annual'` |
| `quantity` | INT | Number of units |
| `base_price` | NUMERIC | **Snapshot** from master service at time of addition |
| `unit_price` | NUMERIC | **Snapshot**: `base_price Ã— reliability_factor Ã— condition_factor` |
| `total_price` | NUMERIC | `unit_price Ã— quantity` |
| `divisions` | TEXT[] | Which divisions this service belongs to |
| `note` | TEXT | Optional per-service note |
| `is_general` | BOOLEAN | `true` = general service (Section 4), `false` = attached to building tree node (Section 3) |
| `sort_order` | INT | Display ordering within node or general list |

**Price snapshot rule:** All pricing fields (`base_price`, `reliability_factor`, `condition_factor`, `unit_price`) are captured at the time the service is added to the contract. They do NOT update when the master service price, brand reliability, or condition factors change later. This protects the contract's pricing integrity for the life of the quotation/contract.

### 2.4 New Table: `contract_milestones`

For milestone-based payment mode. Each milestone represents a percentage of the contract total with a due date.

```sql
CREATE TABLE contract_milestones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  percentage  NUMERIC NOT NULL DEFAULT 0,
  amount      NUMERIC NOT NULL DEFAULT 0,
  due_date    DATE,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contract_milestones_contract ON contract_milestones(contract_id);

ALTER TABLE contract_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read contract_milestones" ON contract_milestones FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert contract_milestones" ON contract_milestones FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update contract_milestones" ON contract_milestones FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete contract_milestones" ON contract_milestones FOR DELETE TO authenticated USING (true);
```

**Validation rule:** The sum of all `percentage` values for a contract must equal exactly 100. The UI enforces this with a visual progress bar and red/green indicator. The `amount` is computed client-side as `contract_net_total Ã— percentage / 100` and stored for display convenience.

### 2.5 New Table: `service_brands`

Junction table linking brands to L1 (root-level) service categories with reliability ratings. Used by the AddContractServiceDialog to show brand options and their pricing multipliers.

```sql
CREATE TABLE service_brands (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id          UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  brand_id            UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  reliability_factor  NUMERIC NOT NULL DEFAULT 1.0,
  is_reliable         BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(service_id, brand_id)
);

CREATE INDEX idx_service_brands_service ON service_brands(service_id);
CREATE INDEX idx_service_brands_brand ON service_brands(brand_id);

ALTER TABLE service_brands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read service_brands" ON service_brands FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert service_brands" ON service_brands FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update service_brands" ON service_brands FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete service_brands" ON service_brands FOR DELETE TO authenticated USING (true);
```

**Usage:** When a user selects a leaf service in AddContractServiceDialog, the dialog finds the L1 (root) ancestor of that service and queries `service_brands WHERE service_id = L1_id`. This returns all brands applicable to that service category, each with a reliability factor.

### 2.6 Existing Tables Used As-Is

**`contract_visits`** (already exists):
```
id UUID PK, contract_id UUID FK, service_name TEXT, scheduled_date DATE,
team_id UUID FK (nullable), completed BOOLEAN DEFAULT false, created_at TIMESTAMPTZ
```
Indexes: `idx_contract_visits_contract`, `idx_contract_visits_date`

**`contract_payments`** (already exists):
```
id UUID PK, contract_id UUID FK, due_date DATE, amount NUMERIC,
status TEXT ('paid'/'pending'/'overdue'), created_at TIMESTAMPTZ
```

**`pricing_factors`** (already exists):
```
id UUID PK, category TEXT, label TEXT, label_ar TEXT, factor NUMERIC,
sort_order INT, division_id UUID FK, deleted_at TIMESTAMPTZ
```
Used for: condition factors (where `category = 'condition'`), e.g., Good (1.0), Fair (1.2), Poor (1.5)

**`brands`** (already exists):
```
id UUID PK, name TEXT, name_ar TEXT, sort_order INT
```

### 2.7 Building Tree JSONB Structure

The `contracts.building_tree` column stores a flat list of nodes with parent references. The UI reconstructs the tree client-side.

```json
{
  "nodes": [
    {
      "id": "n_abc123",
      "name": "Al Mirqab Tower",
      "type": "complex",
      "parentId": null
    },
    {
      "id": "n_def456",
      "name": "Building A",
      "type": "building",
      "parentId": "n_abc123"
    },
    {
      "id": "n_ghi789",
      "name": "Ground Floor",
      "type": "floor",
      "parentId": "n_def456"
    },
    {
      "id": "n_jkl012",
      "name": "Main Lobby",
      "type": "area",
      "parentId": "n_ghi789"
    },
    {
      "id": "n_mno345",
      "name": "Parking Level B1",
      "type": "area",
      "parentId": "n_def456"
    }
  ]
}
```

**Node types (hierarchy enforced client-side):**

| Type | Icon | Border color | Can contain |
|---|---|---|---|
| `complex` | Building2 | Blue (`border-blue-500`) | building, floor, area |
| `building` | Layers | Indigo (`border-indigo-500`) | floor, area |
| `floor` | MapPinned | Violet (`border-violet-500`) | area |
| `area` | MapPinned | Purple (`border-purple-500`) | nothing (leaf) |

**Node ID generation:** `n_${nanoid(8)}` â€” short random IDs, prefixed with `n_` for clarity.

**Application-level integrity rules:**
1. Before removing a node from `building_tree`, check if any `contract_services` rows have `building_node_id` matching that node's ID. If services exist: block deletion, show toast: "Remove or reassign {N} services before deleting this node."
2. Before removing a node that has children, block deletion: "Remove child nodes first." (Bottom-up deletion only.)
3. When updating `building_tree`, the entire JSONB is replaced (not patched). The UI maintains the full tree in React state and writes it back on save.

### 2.8 Contract ID Generation

Two display IDs:

| ID | Pattern | When generated | Example |
|---|---|---|---|
| `quotation_number` | `CTR-Q-{YYYY}-{NNN}` | On first save (draft) | `CTR-Q-2026-001` |
| `contract_id` | `CTR-{YYYY}-{NNN}` | On activation (â†’ active) | `CTR-2026-001` |

Sequential numbering per year. `quotation_number` is set immediately on creation. `contract_id` (the existing column) is set when the contract transitions from `approved` â†’ `active`.

Both are human-readable display IDs (not the UUID primary key).

### 2.9 Signed Document Upload

**Storage bucket:** `contract-documents` in Supabase Storage (create if not exists).

**Upload path:** `contracts/{contract_uuid}/signed_{timestamp}.{ext}`

**Accepted formats:** `.pdf`, `.doc`, `.docx`, `.png`, `.jpg`, `.jpeg`

**Max file size:** 10MB

**Flow:**
1. Contract reaches `approved` status
2. Upload banner appears with file input
3. Agent selects file â†’ client uploads to Supabase Storage
4. On success, `contracts.signed_doc_url` is updated with the storage path
5. Agent clicks "Activate Contract" â†’ status transitions to `active`

The `signed_doc_url` is stored as the Supabase Storage path (not a full URL). The UI generates a signed URL on-demand for viewing/downloading using `supabase.storage.from('contract-documents').createSignedUrl(path, 3600)`.

---

## 3. TypeScript Types

### 3.1 Contract Types

```typescript
// Status types
type ContractQuotationStatus = 'draft' | 'manager_review' | 'customer_pending' | 'approved' | 'rejected' | 'expired';
type ContractLiveStatus = 'active' | 'expiring_soon' | 'overdue_payment' | 'completed' | 'cancelled';
type ContractStatus = ContractQuotationStatus | ContractLiveStatus;

// Building tree
interface BuildingNode {
  id: string;           // n_{nanoid(8)}
  name: string;
  type: 'complex' | 'building' | 'floor' | 'area';
  parentId: string | null;
}

interface BuildingTree {
  nodes: BuildingNode[];
}

// Contract service (line item)
interface ContractService {
  id: string;
  contract_id: string;
  service_id: string | null;
  building_node_id: string | null;
  service_name: string;
  service_path: string[];
  brand_id: string | null;
  brand_name: string | null;
  reliability_factor: number;
  condition: 'good' | 'fair' | 'poor' | null;
  condition_factor: number;
  frequency: ServiceFrequency;
  quantity: number;
  base_price: number;
  unit_price: number;
  total_price: number;
  divisions: string[];
  note: string | null;
  is_general: boolean;
  sort_order: number;
}

type ServiceFrequency = 'daily' | 'weekly' | 'bi_weekly' | 'monthly' | 'quarterly' | 'semi_annual' | 'annual';

// Contract milestone
interface ContractMilestone {
  id: string;
  contract_id: string;
  name: string;
  percentage: number;
  amount: number;
  due_date: string | null;
  sort_order: number;
}

// Contract visit
interface ContractVisit {
  id: string;
  contract_id: string;
  service_name: string;
  scheduled_date: string;
  team_id: string | null;
  team_name?: string;       // joined from teams
  completed: boolean;
}

// Contract payment
interface ContractPayment {
  id: string;
  contract_id: string;
  due_date: string;
  amount: number;
  status: 'paid' | 'pending' | 'overdue';
}

// Full contract (detail view)
interface Contract {
  id: string;
  contract_id: string | null;     // set on activation
  quotation_number: string | null; // set on creation
  customer_id: string;
  customer_name: string;           // joined
  phone: string;                   // joined
  address: string;
  site_name: string;
  divisions: string[];
  services_summary: string;
  agent_name: string;
  source_type: 'site_visit' | 'direct';
  start_date: string;
  end_date: string;
  status: ContractStatus;
  building_tree: BuildingTree;
  discount: number;
  payment_mode: 'fixed' | 'milestone' | 'completion';
  payment_frequency: string;
  notes: string | null;
  signed_doc_url: string | null;
  terms_snapshot: object | null;
  monthly_value: number;
  total_value: number;
  total_visits: number;
  completed_visits: number;
  total_payments: number;
  paid_amount: number;
  has_signed_doc: boolean;
  area_count: number;
  approved_by: string | null;
  approved_at: string | null;
  sent_at: string | null;
  created_by: string | null;
  rejected_reason: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  cancelled_date: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
}

// Quotation card (list view â€” lighter than full Contract)
interface ContractQuotationSummary {
  id: string;
  quotation_number: string;
  status: ContractQuotationStatus;
  customer_name: string;
  site_name: string;
  phone: string;
  agent_name: string;
  divisions: string[];
  services_summary: string;
  start_date: string;
  end_date: string;
  total_value: number;
  monthly_value: number;
  payment_schedule: string;
  area_count: number;
  total_visits: number;
  has_signed_doc: boolean;
  created_at: string;
}

// Live contract card (list view)
interface LiveContractSummary {
  id: string;
  contract_id: string;
  status: ContractLiveStatus;
  customer_name: string;
  site_name: string;
  phone: string;
  agent_name: string;
  divisions: string[];
  services_summary: string;
  start_date: string;
  end_date: string;
  monthly_value: number;
  total_value: number;
  total_visits: number;
  completed_visits: number;
  upcoming_visits: { date: string; service_name: string; team_name?: string }[];
  total_payments: number;
  paid_amount: number;
  payments: ContractPayment[];
  payment_schedule: string;
  has_signed_doc: boolean;
  area_count: number;
  cancelled_date: string | null;
  cancel_reason: string | null;
}

// Service brand (for AddContractServiceDialog)
interface ServiceBrand {
  id: string;
  service_id: string;
  brand_id: string;
  brand_name: string;
  reliability_factor: number;
  is_reliable: boolean;
}

// Pending visit (before saving to DB)
interface PendingVisit {
  temp_id: string;          // nanoid for React key
  scheduled_date: string;
  service_name: string;
  team_id: string | null;
  notes: string;
}

// Filter types
interface QuotationFilters {
  status?: ContractQuotationStatus[];
  dateFrom?: string;
  dateTo?: string;
  contractNumber?: string;
  customer?: string;
  phone?: string;
  siteName?: string;
  agent?: string;
  sortBy?: 'date' | 'value';
  sortDir?: 'asc' | 'desc';
}

interface ContractFilters {
  status?: ContractLiveStatus[];
  contractNumber?: string;
  customer?: string;
  site?: string;
  agent?: string;
  sortBy?: 'endDate' | 'balance' | 'visits';
  sortDir?: 'asc' | 'desc';
}
```

---

## 4. Page 1: View Contract Quotations (`/contracts/quotations`)

**File:** `src/app/(dashboard)/contracts/quotations/page.tsx`
**Estimated:** ~360 lines

### 4.1 Layout Structure

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ PageHeader: "Contracts"      [Pipeline: 450K QAR]  [+ New Contract] â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ [Drafts 12] [Review 3] [Awaiting 5] [Active 8] [Expired 2]    â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ â–¼ Filters                                                       â”‚
â”‚ Created From [____] Created To [____] Contract# [____]          â”‚
â”‚ Customer [____] Phone [____] Site [____] Agent [â–¼____]          â”‚
â”‚ Sort: [Date â†‘â†“] [Value â†‘â†“]                                     â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”‚
â”‚ â”‚ ðŸŸ¡ CTR-Q-2026-001  [Manager Review] [Maint] [Clean]        â”‚ â”‚
â”‚ â”‚    Mohamed Al Thani Â· West Bay Tower Â· +974 7219 5504       â”‚ â”‚
â”‚ â”‚    AC maintenance, cleaning services...                      â”‚ â”‚
â”‚ â”‚                        150,000 QAR Â· 1yr â”‚ 12,500/mo        â”‚ â”‚
â”‚ â”‚                        Monthly â”‚ 24 areas â”‚ 48 visits        â”‚ â”‚
â”‚ â”‚                        Jan 2026 â€“ Dec 2026                   â”‚ â”‚
â”‚ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â”‚
â”‚ â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”‚
â”‚ â”‚ â¬œ CTR-Q-2026-002  [Draft] [Maint]                          â”‚ â”‚
â”‚ â”‚    ...                                                       â”‚ â”‚
â”‚ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â”‚
â”‚ (more cards...)                                                 â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### 4.2 Responsive Behavior

| Breakpoint | Layout |
|---|---|
| **Mobile (<640px)** | Counter chips scroll horizontally. Filter panel stacks to single column. Cards stack vertically â€” right-side pricing info moves below the main info. Pipeline badge wraps under title. |
| **Tablet (640-1024px)** | Counter chips wrap to 2 rows if needed. Filter panel 2-column grid. Cards show full layout but condense spacing. |
| **Desktop (1024-1920px)** | Full layout as shown above. Filter panel 3-column grid. |
| **Large (>1920px)** | Cards get more breathing room. Max-width container centered. 4-column filter grid. |

### 4.3 Header

**PageHeader:**
- Title: "Contracts" (bold, `text-2xl`)
- Pipeline badge: Computed from `SUM(total_value)` of all filtered quotations. Format: `Pipeline: {formatCurrency(value)} QAR`. Green background badge. Recalculates when filters change.
- "+ New Contract" button: Primary variant, navigates to `/contracts/create-quotation`. Only visible if user has `contracts.create` permission.

### 4.4 Counter Chips

Horizontal row of clickable filter chips. Each shows the status label + count of contracts in that status. Clicking toggles that status in the filter. Multiple can be active simultaneously.

| Chip | Status filter | Color when active | Count source |
|---|---|---|---|
| Drafts | `draft` | `bg-gray-100 text-gray-700` | Count where status = draft |
| Review | `manager_review` | `bg-yellow-100 text-yellow-700` | Count where status = manager_review |
| Awaiting | `customer_pending` | `bg-orange-100 text-orange-700` | Count where status = customer_pending |
| Active | `active` | `bg-green-100 text-green-700` | Count where status = active |
| Expired | `expired` | `bg-red-100 text-red-700` | Count where status = expired |

When no chips are selected, all quotation-phase statuses are shown. Counts are always visible regardless of which chips are active (they show the unfiltered count per status).

### 4.5 Filter Panel

Collapsible panel (default: collapsed). Toggle button: "Filters" with ChevronDown icon.

| Filter | Type | Placeholder | Query logic |
|---|---|---|---|
| Created From | Date picker | "From date" | `created_at >= value` |
| Created To | Date picker | "To date" | `created_at <= value` |
| Contract # | Text input | "CTR-Q-..." | `quotation_number ILIKE '%value%'` |
| Customer | Text input | "Customer name" | `customer_name ILIKE '%value%'` (joined) |
| Phone | Text input | "Phone number" | `phone ILIKE '%value%'` (joined) |
| Site Name | Text input | "Site name" | `site_name ILIKE '%value%'` |
| Agent | Select dropdown | "All agents" | `agent_name = value` |

Agent dropdown auto-populated from `profiles` where role has `contracts.create` permission.

**Sort toggles:** Two toggle buttons in the filter row.
- "Date â†‘â†“" â€” sorts by `created_at` (default: descending/newest first)
- "Value â†‘â†“" â€” sorts by `total_value`

### 4.6 Contract Quotation Card

Each card is a clickable row that navigates to `/contracts/detail/{id}`.

**Card layout:**

```
â”Œâ”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ðŸŸ¡â”‚ CTR-Q-2026-001  [Manager Review] [Maint] [Clean] [âœ“ Signed] â”‚
â”‚  â”‚ Mohamed Al Thani Â· West Bay Tower Â· +974 7219 5504 Â· Ahmad   â”‚
â”‚  â”‚ AC maintenance, cleaning services, pest control              â”‚
â”‚  â”‚                                                              â”‚
â”‚  â”‚                               150,000 QAR Â· 1yr  12,500/mo  â”‚
â”‚  â”‚                               Monthly  [24 areas] [48 visits]â”‚
â”‚  â”‚                               Jan 2026 â€“ Dec 2026            â”‚
â””â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

**Left column (48px):**
- Status icon: 9Ã—9px rounded square, color from status config

**Main content:**
- **Row 1:** Quotation number (bold, `text-sm font-semibold`) + Status badge + Division badges (each colored by division config) + "âœ“ Signed" badge (only if `has_signed_doc = true`, green variant with CheckCircle icon)
- **Row 2:** Customer name Â· Site name Â· Phone Â· Agent name (all `text-sm text-muted-foreground`, separated by `Â·`)
- **Row 3:** Services summary (truncated to 1 line with `truncate`, `text-sm text-muted-foreground`)

**Right column (right-aligned, `min-w-[200px]`):**
- **Row 1:** Total value formatted (bold, `text-lg font-bold`) + duration badge (e.g., "1yr", "6mo")
- **Row 2:** Monthly value formatted + "/mo" suffix
- **Row 3:** Payment schedule label (e.g., "Monthly") + area count badge (Layers icon) + visit count badge (Calendar icon)
- **Row 4:** Date range (formatted: "Jan 2026 â€“ Dec 2026")

**Mobile (<640px) card layout:** Stack vertically. Status + quotation number on first line. Customer info below. Pricing info below that. Full width, no side column.

### 4.7 Empty States

| Condition | Display |
|---|---|
| No quotations at all | Centered: FileText icon (64px, muted) + "No contract quotations yet" + "Create your first contract quotation to get started." + Primary "New Contract" button |
| No results for current filters | Centered: Search icon (48px, muted) + "No quotations match your filters" + "Try adjusting your search criteria." + Ghost "Clear Filters" button |

### 4.8 Loading State

While `isLoading`:
- Counter chips show skeleton pulse bars (same width as typical chip)
- Pipeline badge shows skeleton
- Card area shows 3 skeleton card outlines (matching card height, pulsing)

---

## 5. Page 2: Create Contract Quotation (`/contracts/create-quotation`)

**File:** `src/app/(dashboard)/contracts/create-quotation/page.tsx`
**Estimated:** ~386 lines (page itself) + sub-components

This page is also used for **viewing** existing quotations when navigated to from `/contracts/detail/{id}`. When `contractId` is in the URL, it loads the existing contract. When no ID, it starts fresh.

### 5.1 Form Management

**Library:** `react-hook-form` with `mode: 'onChange'`

**Auto-save flow:**
1. User fills out sections and clicks "Save" â†’ creates contract as `draft` with generated `quotation_number`
2. After initial save, the URL updates to include the contract ID (via `router.replace`)
3. Background auto-save triggers every 30 seconds IF there are unsaved changes (dirty fields)
4. Auto-save uses `useUpdateContract` mutation (debounced)
5. Visual indicator in header bar: "Saved âœ“" (green, with CheckCircle) / "Saving..." (muted, with Loader2 spinning) / "Unsaved changes" (yellow, with AlertCircle)

**Section-level validation:**
- Each SectionCard has its own validation scope
- Sections with errors show a red left border + red badge with error count
- Errors display inline within each section (below the relevant field)
- The header "Send" button runs full validation before allowing status transition

### 5.2 Editable vs Read-Only by Status

| Status | Editable? | Which sections? |
|---|---|---|
| `draft` | Full edit | All sections |
| `rejected` | Full edit (after clicking "Edit") | All sections |
| `manager_review` | Read-only for agent | Manager sees Approve/Reject buttons only |
| `customer_pending` | Read-only | Agent records customer response via buttons |
| `approved` | Read-only | Only upload banner is interactive |
| `active` and beyond | Read-only | View mode only (no edit, no status buttons) |

When in read-only mode:
- All input fields become disabled or render as plain text
- "Edit" buttons on section cards are hidden
- "Add Service" buttons are hidden
- Building tree nodes are non-editable
- The page title changes from "Create Contract Quotation" to "View Contract Quotation"

### 5.3 Layout Structure â€” Full Page

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ [â†] Create Contract Quotation [Contract] [Direct] [Maint][Clean]      â”‚
â”‚     [âœ“ Draft] [â—‹ Manager Review] [â—‹ Customer Review] [â—‹ Approved]     â”‚
â”‚                                                     [Draft] [Save][Send]â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚                                                                         â”‚
â”‚ â”Œâ”€ Customer Information â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€[Edit]â”€â”€â” â”‚
â”‚ â”‚  Customer Name: [________________]   Phone: [+974â–¼][________]      â”‚ â”‚
â”‚ â”‚  Address: [_____________________________________________________]  â”‚ â”‚
â”‚ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â”‚
â”‚                                                                         â”‚
â”‚ â”Œâ”€ Contract Details â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”‚
â”‚ â”‚  Start Date: [ðŸ“… ________]    End Date: [ðŸ“… ________]              â”‚ â”‚
â”‚ â”‚  Duration: 12 months          Discount: [______] QAR               â”‚ â”‚
â”‚ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â”‚
â”‚                                                                         â”‚
â”‚ â”Œâ”€ Building Structure & Services â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€[Edit Structure]â”€â”€â” â”‚
â”‚ â”‚  â”Œâ”€ ðŸ¢ Al Mirqab Tower [complex] (3 services)                     â”‚ â”‚
â”‚ â”‚  â”‚  â”Œâ”€ ðŸ— Building A [building] (2 services)                      â”‚ â”‚
â”‚ â”‚  â”‚  â”‚  â”Œâ”€ ðŸ“ Ground Floor [floor] (1 service)                     â”‚ â”‚
â”‚ â”‚  â”‚  â”‚  â”‚  â”Œâ”€ ðŸ“ Main Lobby [area]                    [+ Add Svc]  â”‚ â”‚
â”‚ â”‚  â”‚  â”‚  â”‚  â”‚  â”Œâ”€ AC Split Cleaning Â· [Samsung] [Maint] [Good]      â”‚ â”‚
â”‚ â”‚  â”‚  â”‚  â”‚  â”‚  â”‚  Monthly Â· Qty 4 Ã— 250 QAR = 1,000 QAR    [Edit]  â”‚ â”‚
â”‚ â”‚  â”‚  â”‚  â”‚  â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€     â”‚ â”‚
â”‚ â”‚  â”‚  â”‚  â”‚  â””â”€â”€                                                      â”‚ â”‚
â”‚ â”‚  â”‚  â”‚  â””â”€â”€                                                         â”‚ â”‚
â”‚ â”‚  â”‚  â””â”€â”€                                                            â”‚ â”‚
â”‚ â”‚  â””â”€â”€                                                               â”‚ â”‚
â”‚ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â”‚
â”‚                                                                         â”‚
â”‚ â”Œâ”€ General Services â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€[+ Add General Service]â”€â”â”‚
â”‚ â”‚  (service cards, same style as above but flat list)                  â”‚â”‚
â”‚ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â”‚
â”‚                                                                         â”‚
â”‚ â”Œâ”€ Terms & Conditions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€[Expand All][Collapse All]â”€â”€â” â”‚
â”‚ â”‚  â–¸ Maintenance Division Terms                                      â”‚ â”‚
â”‚ â”‚  â–¸ Cleaning Division Terms                                         â”‚ â”‚
â”‚ â”‚  â–¸ Service: AC Split Unit Cleaning                                 â”‚ â”‚
â”‚ â”‚  â–¸ Service: Floor Mopping                                          â”‚ â”‚
â”‚ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â”‚
â”‚                                                                         â”‚
â”‚ â”Œâ”€ Visit Summary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”‚
â”‚ â”‚  âš  Tentative visit counts. Team assignment happens after approval. â”‚ â”‚
â”‚ â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”      â”‚ â”‚
â”‚ â”‚  â”‚ Service               â”‚ Frequency â”‚ Visits â”‚ Est. Durationâ”‚      â”‚ â”‚
â”‚ â”‚  â”‚ AC Split Cleaning     â”‚ Monthly   â”‚ 12     â”‚ 1hr each     â”‚      â”‚ â”‚
â”‚ â”‚  â”‚ Floor Mopping         â”‚ Weekly    â”‚ 52     â”‚ 30min each   â”‚      â”‚ â”‚
â”‚ â”‚  â”‚ Total                 â”‚           â”‚ 64     â”‚              â”‚      â”‚ â”‚
â”‚ â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜      â”‚ â”‚
â”‚ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â”‚
â”‚                                                                         â”‚
â”‚ â”Œâ”€ General Notes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”‚
â”‚ â”‚  [____________________________________________________________]    â”‚ â”‚
â”‚ â”‚  [____________________________________________________________]    â”‚ â”‚
â”‚ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â”‚
â”‚                                                                         â”‚
â”‚ â”Œâ”€ Payment Schedule â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”‚
â”‚ â”‚  [Fixed] [Milestone] [Completion]                                  â”‚ â”‚
â”‚ â”‚  Frequency: [Monthly â–¼]                                            â”‚ â”‚
â”‚ â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”                    â”‚ â”‚
â”‚ â”‚  â”‚  Payment Amount (monthly): 12,500 QAR      â”‚                    â”‚ â”‚
â”‚ â”‚  â”‚  12 payments over 12 months                 â”‚                    â”‚ â”‚
â”‚ â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜                    â”‚ â”‚
â”‚ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â”‚
â”‚                                                                         â”‚
â”‚ â”Œâ”€ Pricing Summary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”‚
â”‚ â”‚                                    Subtotal:    150,000 QAR        â”‚ â”‚
â”‚ â”‚                                    Discount:     -0 QAR            â”‚ â”‚
â”‚ â”‚                                    Net Total:   150,000 QAR        â”‚ â”‚
â”‚ â”‚                                    Monthly:      12,500 QAR        â”‚ â”‚
â”‚ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### 5.4 Responsive Behavior

| Breakpoint | Adaptations |
|---|---|
| **Mobile (<640px)** | Header bar wraps: back + title on row 1, badges on row 2, workflow pills on row 3, buttons on row 4. All sections full-width. Customer info section stacks to 1 column. Contract details stacks to 1 column. Building tree uses full-width indent (reduced indent: 12px per level instead of 24px). Payment schedule table scrolls horizontally. |
| **Tablet (640-1024px)** | Header bar wraps to 2 rows: title+badges on row 1, workflow+buttons on row 2. Sections 2-column where applicable. Building tree uses 20px indent. |
| **Desktop (1024-1920px)** | Full layout as above. Single-row header. 24px indent per tree level. |
| **Large (>1920px)** | Max-width container (1400px) centered. Extra padding. |

### 5.5 Header Bar (Sticky)

Sticks to top of page on scroll. White background with subtle bottom border. Single compact row on desktop.

**Elements (left to right):**
1. â† Back button (icon only, `h-9 w-9`) â†’ navigates to `/contracts/quotations`
2. Title: "Create Contract Quotation" or "View Contract Quotation" (based on editable state). `text-lg font-semibold`
3. "Contract" badge: Primary variant, static label
4. Source badge: "Site Visit" (blue) or "Direct" (gray) â€” clickable to toggle when in draft mode, static otherwise
5. Division selector: Row of clickable division badges. Each badge is a small colored chip (division color). Click toggles division on/off. At least one must remain selected. When toggled, the service tree filters by selected divisions.
6. **Workflow Progress Bar** (WorkflowProgressBar component):

```
[âœ“ Draft] â†’ [â— Manager Review] â†’ [â—‹ Customer] â†’ [â—‹ Approved]
```

Each step is a pill badge:
- Completed: green background, CheckCircle icon, white text
- Active (current status): primary background, white text
- Future: muted background, gray text
- If rejected: red "Rejected" badge replaces the active step

7. Status badge (right-aligned): Current status with color from status config
8. Action buttons (right-aligned, gap-2):

| Current status | Buttons shown |
|---|---|
| `draft` | "Save" (outline variant) + "Send for Review" (default variant, Send icon) |
| `rejected` (after clicking Edit) | "Save" (outline) + "Send for Review" (default) |
| `manager_review` | "Reject" (destructive variant) + "Approve" (success variant with CheckCircle) |
| `customer_pending` | "Customer Rejected" (destructive) + "Customer Approved" (success) |
| `approved` | No buttons (upload banner appears in content) |
| `active` + beyond | No buttons (view-only) |

### 5.6 Send Confirmation Dialog

Triggered when agent clicks "Send for Review" on a draft.

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  Send for Manager Approval?              â”‚
â”‚                                          â”‚
â”‚  This quotation will be sent to the      â”‚
â”‚  contract manager for review. You won't  â”‚
â”‚  be able to edit it until it's approved  â”‚
â”‚  or rejected.                            â”‚
â”‚                                          â”‚
â”‚              [Cancel]  [Send]            â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

**AlertDialog** from shadcn/ui. Cancel = ghost variant. Send = default variant.

On confirm: `useUpdateContract` mutation with `{ status: 'manager_review', sent_at: new Date() }`.

### 5.7 Signed Document Upload Banner (SignedDocUploadBanner)

Only renders when status = `approved`.

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  âœ…  Contract Approved â€” Upload signed contract to complete     â”‚
â”‚                                                                 â”‚
â”‚  [ðŸ“Ž Choose File]  signed_contract_v2.pdf                       â”‚
â”‚                                                                 â”‚
â”‚                              [Activate Contract â†’]              â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

- Green background (`bg-green-50 border-green-200`)
- FileCheck icon (green)
- File input: hidden `<input type="file">` triggered by styled button
- Accepted: `.pdf,.doc,.docx,.png,.jpg,.jpeg`
- Shows filename when selected
- "Activate Contract" button: enabled only when file is uploaded
- On click: uploads to Supabase Storage â†’ updates `signed_doc_url` â†’ transitions status to `active` â†’ generates `contract_id` (CTR-YYYY-NNN)

### 5.8 Section 1: Customer Information

**SectionCard** with "Customer Information" title and "Edit" button (pencil icon).

**Default state (not editing):** Display mode with read-only text fields.
**Edit state:** Input fields become editable.

| Field | Type | Span | Validation |
|---|---|---|---|
| Customer Name | Text input | 1 col | Required |
| Phone | PhoneInputWithCode | 1 col | Required. Uses `useCountryCodes()` for country code dropdown. Default code: +974. |
| Address | Textarea (2 rows) | 2 cols | Optional |

On edit: customer data is stored in form state. On save, written to `contracts.customer_name`, `contracts.phone`, `contracts.address` (these are flattened on the contract row, not FK references â€” the contract is a self-contained document).

### 5.9 Section 2: Contract Details

| Field | Type | Span | Validation |
|---|---|---|---|
| Start Date | Date picker (Calendar icon) | 1 col | Required. Cannot be in the past for new quotations. |
| End Date | Date picker (Calendar icon) | 1 col | Required. Must be after start date. |
| Duration | Read-only computed text | 1 col | Auto-computed: `differenceInMonths(endDate, startDate)` â†’ displays "12 months", "6 months", etc. Uses `date-fns`. |
| Discount (QAR) | Number input | 1 col | Optional. Non-negative. Flat amount. |

When start/end dates change:
- Duration recomputes automatically
- Visit summary section recalculates visit counts
- Payment schedule section recalculates amounts

### 5.10 Section 3: Building Structure & Services (ContractBuildingTree)

**Header:** "Building Structure & Services" title + "Edit Structure" button (toggles edit mode for the tree itself â€” adding/removing/renaming nodes)

**Component:** `ContractBuildingTree.tsx` (~250 lines)

**Props:**
```typescript
{
  buildingTree: BuildingTree;
  services: ContractService[];
  selectedDivisions: string[];
  editable: boolean;
  onTreeChange: (tree: BuildingTree) => void;
  onAddService: (nodeId: string) => void;
  onEditService: (serviceId: string) => void;
  onRemoveService: (serviceId: string) => void;
}
```

**Tree rendering (recursive):**
Each node renders as:

```
â”Œâ”€ [border-color] â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  [Icon] Node Name  [type badge]  [3 services]  [+ Add Service]   â”‚
â”‚                                                                    â”‚
â”‚  â”Œâ”€ Service Card 1 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”‚
â”‚  â”‚  Maintenance > AC > Split Unit Cleaning                    â”‚    â”‚
â”‚  â”‚  [Samsung] [Maint] [Good] [Monthly] [ðŸ“· 3]                â”‚    â”‚
â”‚  â”‚                          Qty 4 Ã— 250 QAR = 1,000 QAR [âœï¸] â”‚    â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â”‚
â”‚                                                                    â”‚
â”‚  â”Œâ”€ Child Node (indented) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
â”‚  â”‚  ...                                                        â”‚   â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

**Indent per level:** 24px on desktop, 16px on tablet, 12px on mobile.

**Node interactions:**
- **Click header** â†’ expand/collapse children (chevron rotates)
- **"+ Add Service" button** â†’ opens AddContractServiceDialog with `nodeId`
- **Node context menu** (right-click or "..." button in edit mode):
  - "Add Child Node" â†’ opens BuildingNodeDialog
  - "Rename" â†’ inline editing (click to edit name)
  - "Delete" â†’ blocked if node has services or children with services. Otherwise confirms and removes.

**BuildingNodeDialog (add/edit node):**

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  Add Node                                â”‚
â”‚                                          â”‚
â”‚  Name: [________________]                â”‚
â”‚                                          â”‚
â”‚  Type: [Building â–¼]                      â”‚
â”‚         Options filtered by parent type  â”‚
â”‚                                          â”‚
â”‚              [Cancel]  [Add]             â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

Type options filtered by parent:
- Under complex: building, floor, area
- Under building: floor, area
- Under floor: area
- Root level: complex, building

**AreaServiceCard (per service):**

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  Maintenance > AC > Split Unit Cleaning                       â”‚
â”‚  [Samsung âœ“]  [Maint] [Clean]  [Good 1.0Ã—]  [Monthly]  [ðŸ“· 3]â”‚
â”‚                              Qty 4 Ã— 250 QAR = 1,000 QAR [âœï¸]â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

Elements:
- **Service path:** breadcrumb from `service_path` array, joined by " > "
- **Brand badge:** brand name + reliability indicator ("âœ“" green if reliable, "âš " red if not)
- **Division badges:** colored chips per division
- **Condition badge:** "Good" (green), "Fair" (yellow), "Poor" (red) + factor value
- **Frequency badge:** muted chip with frequency label
- **Media count button:** camera icon + count â†’ opens ServiceMediaDialog
- **Price line:** `Qty {quantity} Ã— {formatCurrency(unit_price)} = {formatCurrency(total_price)}` (bold primary)
- **Edit button:** pencil icon â†’ opens AddContractServiceDialog in edit mode with pre-filled values

### 5.11 ServiceMediaDialog

Displays media attachments for a service (photos from site visits, voice notes, text notes).

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  Service Media â€” AC Split Unit Cleaning                    [Ã—]   â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ â”Œâ”€ Media List â”€â”€â”€â” â”‚  â”Œâ”€ Preview â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
â”‚ â”‚                 â”‚ â”‚  â”‚                                      â”‚  â”‚
â”‚ â”‚ ðŸ“· Photo 1     â”‚ â”‚  â”‚  [Image preview rendered here]       â”‚  â”‚
â”‚ â”‚   May 15, 2026 â”‚ â”‚  â”‚                                      â”‚  â”‚
â”‚ â”‚   by Ahmad     â”‚ â”‚  â”‚                                      â”‚  â”‚
â”‚ â”‚                 â”‚ â”‚  â”‚                                      â”‚  â”‚
â”‚ â”‚ ðŸ“ Note 1      â”‚ â”‚  â”‚                                      â”‚  â”‚
â”‚ â”‚   May 15, 2026 â”‚ â”‚  â”‚                                      â”‚  â”‚
â”‚ â”‚                 â”‚ â”‚  â”‚                                      â”‚  â”‚
â”‚ â”‚ ðŸŽ¤ Voice 1     â”‚ â”‚  â”‚                                      â”‚  â”‚
â”‚ â”‚   May 15, 2026 â”‚ â”‚  â”‚                                      â”‚  â”‚
â”‚ â”‚                 â”‚ â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â”‚
â”‚ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â”‚                                             â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

**Layout:** Dialog (lg size). Split: left sidebar (200px) scrollable list + right panel (remaining) preview area.

**Left sidebar items:** Each media item shows:
- Type icon: ðŸ“· Image / ðŸ“ Text / ðŸŽ¤ Voice
- Label (auto-generated or custom)
- Timestamp (formatted date)
- Author name
- Click to select â†’ loads in right preview

**Right preview by type:**
- **Image:** Rendered `<img>` with `object-contain`, max dimensions fill the panel
- **Text:** Formatted text block with timestamp header
- **Voice:** Waveform visualizer (simple CSS bars) + play/pause button + duration. Uses HTML5 `<audio>` element.

**Mobile (<640px):** Stacks vertically â€” media list on top, preview below. Dialog goes full-screen (`w-full h-full rounded-none`).

### 5.12 Section 4: General Services

Same AreaServiceCard component as Section 3, but displayed in a flat list (not nested in the tree). These services have `is_general = true` and `building_node_id = null`.

**Header:** "General Services" title + "+ Add General Service" button (opens AddContractServiceDialog with `nodeId = null, isGeneral = true`)

**Empty state:** "No general services added. Add services that apply to the entire contract."

### 5.13 Section 5: Terms & Conditions (ContractTermsSection)

**Component:** `ContractTermsSection.tsx` (~220 lines)

**Header:** "Terms & Conditions" + "Expand All" / "Collapse All" buttons

**Two groups:**

**1. Division Terms:**
For each selected division, a collapsible item:
```
â–¸ Maintenance Division Terms
  (expands to show division-level T&C text from the divisions table)
```

**2. Service Terms:**
Auto-collected: walks all `contract_services`, fetches each referenced service's `terms_and_conditions` field from the master `services` table.

```
â–¸ AC Split Unit Cleaning
  Maintenance > AC > Split Unit Cleaning
  (expands to show service T&C text)
```

**Indentation by tree depth:**
- L0 (top-level service): bold left border (`border-primary`, 3px)
- L1 (one level deep): lighter border (`border-primary/60`, 2px)
- L2+: lightest (`border-primary/30`, 1px)

Each item shows:
- Chevron (â–¸/â–¾) + Service name (bold)
- Breadcrumb path below name (`text-xs text-muted-foreground`)
- Expanded: full terms text rendered as prose

### 5.14 Section 6: Visit Summary (VisitSummarySection)

**Important:** This is a READ-ONLY summary during the quotation phase. No drag-and-drop, no team assignment. The full scheduling UI appears only post-approval on the Contract Detail page.

**Component:** `VisitSummarySection.tsx` (~80 lines)

**Warning banner:** Yellow background, AlertTriangle icon: "Tentative visit counts based on contract dates. Team assignment happens after approval."

**Table:**

| Service | Frequency | Visits | Est. Duration |
|---|---|---|---|
| AC Split Unit Cleaning | Monthly | 12 | 1hr each |
| Floor Mopping | Weekly | 52 | 30min each |
| Window Cleaning | Quarterly | 4 | 2hr each |
| **Total** | | **68** | |

Visit count computed per service: based on `frequency` and contract `start_date` to `end_date` using date-fns functions:

| Frequency | Calculation |
|---|---|
| daily | `differenceInDays(end, start)` |
| weekly | `differenceInWeeks(end, start)` |
| bi_weekly | `Math.floor(differenceInWeeks(end, start) / 2)` |
| monthly | `differenceInMonths(end, start)` |
| quarterly | `Math.floor(differenceInMonths(end, start) / 3)` |
| semi_annual | `Math.floor(differenceInMonths(end, start) / 6)` |
| annual | `Math.floor(differenceInMonths(end, start) / 12)` |

Duration sourced from master service's `duration` field (minutes).

### 5.15 Section 7: General Notes

Simple textarea, no border, muted background (`bg-muted/50`). Placeholder: "Add any general notes about this contract..."

Full width, 4 rows minimum height, auto-expands.

### 5.16 Section 8: Payment Schedule (PaymentScheduleSection)

**Component:** `PaymentScheduleSection.tsx` (~200 lines)

**Props:**
```typescript
{
  mode: 'fixed' | 'milestone' | 'completion';
  frequency: string;
  milestones: ContractMilestone[];
  contractTotal: number;   // net total after discount
  discount: number;
  startDate: string;
  endDate: string;
  editable: boolean;
  onChange: (updates: Partial<PaymentScheduleData>) => void;
}
```

**Mode selector:** 3 toggle buttons in a button group:
- "Fixed" (Calendar icon)
- "Milestone" (Flag icon)
- "Completion" (CheckCircle2 icon)

Active button: primary variant. Others: outline variant.

**Fixed mode display:**

```
  Frequency: [Monthly â–¼] [Quarterly] [Semi-Annual] [Annual]

  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
  â”‚  ðŸ’° Payment Amount (monthly): 12,500 QAR        â”‚  â† blue bg
  â”‚     12 payments over 12 months                   â”‚
  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

Frequency options as small toggle buttons. Amount computed: `netTotal / numberOfPeriods`. Periods computed from frequency and contract duration.

**Milestone mode display:**

```
  [+ Add Milestone]

  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
  â”‚ â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘â–‘  Total: 75%     â”‚  â† progress bar
  â”‚ (red if â‰  100%, green âœ“ if = 100%)                      â”‚
  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜

  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
  â”‚ #  â”‚ Milestone Name  â”‚  %   â”‚ Amount (QAR) â”‚ Due Date â”‚ Ã—â”‚
  â”‚ 1  â”‚ [Mobilization ] â”‚ [30] â”‚ 45,000       â”‚ [ðŸ“…____] â”‚ Ã—â”‚
  â”‚ 2  â”‚ [Mid-contract ] â”‚ [45] â”‚ 67,500       â”‚ [ðŸ“…____] â”‚ Ã—â”‚
  â”‚ 3  â”‚ [Completion   ] â”‚ [25] â”‚ 37,500       â”‚ [ðŸ“…____] â”‚ Ã—â”‚
  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

- Progress bar: stacked horizontal bar. Each milestone gets a segment with alternating colors (blue, indigo, violet, purple, pink â€” cycling). Segments proportional to percentage.
- Validation text: "Total: {sum}% â€” Must equal 100%". Red if sum â‰  100, green with âœ“ if sum = 100.
- Table columns: #, Milestone Name (editable text input), % (editable number input), Amount (computed, read-only: `netTotal Ã— % / 100`), Due Date (date picker), Remove button (Trash2 icon, destructive).
- "+ Add Milestone" button: adds a new row with empty name, 0%, no date.

**Completion mode display:**

```
  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
  â”‚  âš  Full payment due upon contract completion     â”‚  â† yellow bg
  â”‚     Total: 150,000 QAR                           â”‚
  â”‚     Due: Dec 31, 2026 (contract end date)        â”‚
  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

Yellow background card. Shows total value and due date = contract end date.

### 5.17 Section 9: Pricing Summary

Right-aligned summary box:

```
                              Subtotal:    150,000 QAR
                              Discount:     -5,000 QAR
                              â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
                              Net Total:   145,000 QAR
                              Monthly:      12,083 QAR
```

- Subtotal: `SUM(contract_services.total_price)` â€” all services
- Discount: flat QAR from `contracts.discount` (shown with minus sign)
- Net Total: subtotal - discount (bold, `text-lg font-bold`)
- Monthly: `netTotal / differenceInMonths(endDate, startDate)` â€” `text-sm text-muted-foreground`

All amounts formatted with `formatCurrency()` (thousands separator, 0 decimals).


# Contracts Module â€” Design Specification (Part 2 of 3)

---

## 6. AddContractServiceDialog (`AddContractServiceDialog.tsx`)

**Estimated:** ~410 lines

Two-step dialog for selecting and configuring a service to add to the contract. Used by both building-tree services (Section 3) and general services (Section 4).

### 6.1 Dialog Shell

- **Size:** `lg` (max-w-lg) on desktop, full-screen on mobile (<640px)
- **Title:** "Add Service" (or "Edit Service" when editing existing)
- **Step indicator:** "Step 1 of 2" / "Step 2 of 2" with a thin progress bar at the top

### 6.2 Step 1: Pick Service

N-level side-by-side cascading dropdowns (per project's dropdown pattern â€” see `feedback_dropdown_side_by_side.md`).

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  Add Service                                    Step 1 of 2  [Ã—] â”‚
â”‚  â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â” â”‚
â”‚                                                                   â”‚
â”‚  â”Œâ”€ Column 1 â”€â”€â”€â”€â” â”Œâ”€ Column 2 â”€â”€â”€â”€â” â”Œâ”€ Column 3 â”€â”€â”€â”€â”         â”‚
â”‚  â”‚ Service Type   â”‚ â”‚ Category      â”‚ â”‚ Service        â”‚         â”‚
â”‚  â”‚                â”‚ â”‚               â”‚ â”‚                â”‚         â”‚
â”‚  â”‚ â–º Maintenance  â”‚ â”‚ â–º AC          â”‚ â”‚   Split Unit   â”‚         â”‚
â”‚  â”‚   Cleaning     â”‚ â”‚   Plumbing    â”‚ â”‚   Cleaning     â”‚         â”‚
â”‚  â”‚   Pest Control â”‚ â”‚   Electrical  â”‚ â”‚   250 QAR      â”‚         â”‚
â”‚  â”‚                â”‚ â”‚               â”‚ â”‚   [preventive] â”‚         â”‚
â”‚  â”‚                â”‚ â”‚               â”‚ â”‚                â”‚         â”‚
â”‚  â”‚                â”‚ â”‚ â–º Painting    â”‚ â”‚   Window Unit  â”‚         â”‚
â”‚  â”‚                â”‚ â”‚               â”‚ â”‚   Cleaning     â”‚         â”‚
â”‚  â”‚                â”‚ â”‚               â”‚ â”‚   180 QAR      â”‚         â”‚
â”‚  â”‚                â”‚ â”‚               â”‚ â”‚   [preventive] â”‚         â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜         â”‚
â”‚                                                                   â”‚
â”‚  Path: Maintenance > AC > Split Unit Cleaning                     â”‚
â”‚                                                                   â”‚
â”‚  â”Œâ”€ Selected â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”‚
â”‚  â”‚  Split Unit Cleaning     250 QAR    [preventive]            â”‚ â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â”‚
â”‚                                                                   â”‚
â”‚                                              [Configure â†’]        â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

**Column behavior:**
- Column 1: Root services where `parent_id IS NULL` and `tree_type = 'contract'`
- Column 2: Children of selected Column 1 item
- Column 3: Children of selected Column 2 item (if they exist)
- If a node has no children, it's a leaf (selectable)
- Columns are independently scrollable (`overflow-y-auto`, max-height: 300px)
- Filter by selected divisions: `services.division` overlaps with `contract.divisions`

**Each option shows:**
- Name (`text-sm`)
- Price if it's a leaf (`text-xs text-muted-foreground`, formatted QAR)
- Contract type badge if set (`text-xs`, colored chip)

**Hover/tap behavior:**
- Desktop: hover a parent item to populate the next column. Click a leaf to select it.
- Mobile: first tap on parent shows next column. Tap on leaf selects it.

**Selected state:**
- Breadcrumb path shown below columns: "Maintenance > AC > Split Unit Cleaning"
- Selected service card shows: name + price + contract type badge
- "Configure â†’" button enabled only when a leaf service is selected

### 6.3 Step 2: Configure Service

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  Add Service                                    Step 2 of 2  [Ã—] â”‚
â”‚  â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â” â”‚
â”‚  [â† Back to selection]                                            â”‚
â”‚                                                                   â”‚
â”‚  â”Œâ”€ Selected Service â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”‚
â”‚  â”‚  Split Unit Cleaning  Â·  Maintenance > AC                   â”‚ â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â”‚
â”‚                                                                   â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”             â”‚
â”‚  â”‚ Frequency    â”‚ â”‚ Brand        â”‚ â”‚ Condition    â”‚             â”‚
â”‚  â”‚ [Monthly  â–¼] â”‚ â”‚ [Samsung  â–¼] â”‚ â”‚ [Good     â–¼] â”‚             â”‚
â”‚  â”‚              â”‚ â”‚ âœ“ Reliable   â”‚ â”‚ Factor: 1.0  â”‚             â”‚
â”‚  â”‚              â”‚ â”‚ Factor: 0.9  â”‚ â”‚              â”‚             â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜             â”‚
â”‚                                                                   â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”             â”‚
â”‚  â”‚ Quantity     â”‚ â”‚ Unit Price   â”‚ â”‚ Division     â”‚             â”‚
â”‚  â”‚ [    4     ] â”‚ â”‚ 225 QAR      â”‚ â”‚ [Maint    â–¼] â”‚             â”‚
â”‚  â”‚              â”‚ â”‚ (read-only)  â”‚ â”‚ [+ Clean   ] â”‚             â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜             â”‚
â”‚                                                                   â”‚
â”‚  â”Œâ”€ Price Breakdown â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”‚
â”‚  â”‚  Base Price:         250 QAR                                â”‚ â”‚
â”‚  â”‚  Ã— Reliability:      Ã—0.9  (Samsung â€” Reliable)             â”‚ â”‚
â”‚  â”‚  Ã— Condition:        Ã—1.0  (Good)                           â”‚ â”‚
â”‚  â”‚  â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€                              â”‚ â”‚
â”‚  â”‚  Unit Price:         225 QAR                                â”‚ â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â”‚
â”‚                                                                   â”‚
â”‚  Total: 4 Ã— 225 QAR = 900 QAR                                   â”‚
â”‚                                                                   â”‚
â”‚  Note: [________________________________]                         â”‚
â”‚                                                                   â”‚
â”‚                                    [Cancel]  [âœ“ Add Service]     â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

**Fields:**

| Field | Type | Behavior |
|---|---|---|
| **Frequency** | Select dropdown | Options: Daily, Weekly, Bi-Weekly, Monthly, Quarterly, Semi-Annual, Annual. Default: Monthly. |
| **Brand** | Select dropdown | Options from `useServiceBrands(L1_service_id)`. Each option shows brand name. Below dropdown: reliability badge ("âœ“ Reliable" green or "âš  Unreliable" red) + "Factor: {value}". Optional â€” can leave unselected (factor defaults to 1.0). |
| **Condition** | Select dropdown | Options from `pricing_factors WHERE category = 'condition'`. Each shows label + factor. Below dropdown: "Factor: {value}". Optional â€” defaults to 1.0. |
| **Quantity** | Number input | Min: 1. Default: 1. |
| **Unit Price** | Read-only display | Auto-computed: `base_price Ã— reliability_factor Ã— condition_factor`. Formatted QAR. Updates live as brand/condition change. |
| **Division** | Multi-select | From contract's selected divisions. At least one required. |

**Brand dropdown population:**
1. When a leaf service is selected in Step 1, find its L1 ancestor (root parent in the service tree)
2. Query `service_brands` where `service_id = L1_ancestor_id`
3. Join with `brands` table to get brand names
4. Present as dropdown options with reliability info

**If no brands exist** for the L1 service: Brand dropdown shows "No brands configured" (disabled, grayed out). Reliability factor stays 1.0.

**If no condition factors exist** in `pricing_factors`: Condition dropdown shows "No conditions configured" (disabled). Condition factor stays 1.0.

**Price Breakdown Panel:**
Only appears when brand or condition is selected (i.e., when any factor â‰  1.0). Shows the full calculation chain:

```
Base Price:     {base_price} QAR
Ã— Reliability:  Ã—{factor}  ({brand_name} â€” {Reliable/Unreliable})
Ã— Condition:    Ã—{factor}  ({condition_label})
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Unit Price:     {unit_price} QAR
```

**Total line:** `{quantity} Ã— {unit_price} QAR = {total_price} QAR` â€” bold, primary color.

**Note field:** Optional single-line text input. "Add a note about this service..."

**Buttons:**
- "Cancel" â€” closes dialog, no changes
- "âœ“ Add Service" (green variant, CheckCircle icon) â€” adds the service to the contract's form state

**On "Add Service" click:**
Creates a `ContractService` object with all fields populated (including snapshots of pricing). Adds to form state. Does NOT write to DB directly â€” saved when the contract form auto-saves or the user clicks Save.

**Edit mode:**
When editing an existing service (from AreaServiceCard's edit button), the dialog opens directly on Step 2 with all fields pre-filled. "Back to selection" is hidden. Button text changes to "âœ“ Update Service". On update, replaces the existing service in form state.

### 6.4 Responsive: AddContractServiceDialog

| Breakpoint | Layout |
|---|---|
| **Mobile (<640px)** | Full-screen dialog. Step 1: columns stack vertically (one at a time with back/forward navigation between levels). Step 2: fields stack to single column (each field full-width). |
| **Tablet (640-1024px)** | Centered dialog. Step 1: 2 visible columns (3rd scrolls into view). Step 2: 2-column grid for fields. |
| **Desktop (1024+)** | Standard centered dialog. Step 1: all 3 columns visible. Step 2: 3-column grid (2 rows). |

---

## 7. Page 3: View Live Contracts (`/contracts`)

**File:** `src/app/(dashboard)/contracts/page.tsx`
**Estimated:** ~256 lines

### 7.1 Layout Structure

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ PageHeader: "Contracts"               [Outstanding: 120K QAR]   â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ [Active 15] [Expiring 3] [Overdue 2] [Completed 20] [Cancelled 1] â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ â–¼ Filters                                                       â”‚
â”‚ Contract# [____] Customer [____] Site [____] Agent [â–¼____]      â”‚
â”‚ Sort: [End â†‘â†“] [Balance â†‘â†“] [Visits â†‘â†“]                       â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
â”‚ â”‚ ðŸŸ¢ CTR-2026-001 [Active] [Maint][Clean]                   â”‚   â”‚
â”‚ â”‚    Mohamed Al Thani Â· West Bay Tower                       â”‚   â”‚
â”‚ â”‚    Visits: â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–‘â–‘ 36/48 Â· 12 left Â· Next: Jun 15      â”‚   â”‚
â”‚ â”‚    Payments: â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–‘â–‘â–‘ 90K/150K Â· 60K left Â· 1 overdue    â”‚   â”‚
â”‚ â”‚    12,500/mo Â· 180 days left Â· Janâ€“Dec 2026            â–¼  â”‚   â”‚
â”‚ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â”‚
â”‚                                                                  â”‚
â”‚ â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”   â”‚
â”‚ â”‚ ðŸŸ¡ CTR-2026-002 [Expiring Soon] [Maint]                   â”‚   â”‚
â”‚ â”‚    ...                                                     â”‚   â”‚
â”‚ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜   â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### 7.2 Responsive Behavior

| Breakpoint | Layout |
|---|---|
| **Mobile (<640px)** | Counter chips scroll horizontally. Filter panel single-column. Cards: visits/payments progress bars stack vertically below info. Expanded state: 1-column (sections stack). |
| **Tablet (640-1024px)** | Counter chips wrap. Filter panel 2-column. Cards: condensed but single row. Expanded: 2-column grid (visits+payments left, details right). |
| **Desktop (1024-1920px)** | Full layout. Filter panel single row. Cards show all columns inline. Expanded: 3-column grid. |
| **Large (>1920px)** | Max-width container. Extra card padding. |

### 7.3 Header

- Title: "Contracts" (`text-2xl font-bold`)
- Outstanding badge: `Outstanding: {formatCurrency(total)} QAR` â€” red background badge. Computed: `SUM(total_payments - paid_amount)` across all filtered active contracts.

### 7.4 Counter Chips

Same pattern as quotations page. Clickable toggles.

| Chip | Status | Active color |
|---|---|---|
| Active | `active` | `bg-green-100 text-green-700` |
| Expiring | `expiring_soon` | `bg-yellow-100 text-yellow-700` |
| Overdue | `overdue_payment` | `bg-red-100 text-red-700` |
| Completed | `completed` | `bg-blue-100 text-blue-700` |
| Cancelled | `cancelled` | `bg-gray-100 text-gray-700` |

### 7.5 Filter Panel

Collapsible. Same pattern as quotations.

| Filter | Type | Query logic |
|---|---|---|
| Contract # | Text input | `contract_id ILIKE '%value%'` |
| Customer | Text input | `customer_name ILIKE '%value%'` |
| Site | Text input | `site_name ILIKE '%value%'` |
| Agent | Select dropdown | `agent_name = value` |

**Sort toggles:**
- "End â†‘â†“" â€” by `end_date`
- "Balance â†‘â†“" â€” by `(total_payments - paid_amount)` descending = most outstanding first
- "Visits â†‘â†“" â€” by `(total_visits - completed_visits)` descending = most remaining first

### 7.6 ContractCard (Expandable)

**Component:** `ContractCard.tsx` (~220 lines)

**Props:**
```typescript
{
  contract: LiveContractSummary;
  onViewFull: (id: string) => void;
  onCancel: (contract: LiveContractSummary) => void;
}
```

#### Collapsed State (single row, clickable to expand)

```
â”Œâ”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”
â”‚ðŸŸ¢â”‚ CTR-2026-001        â”‚ Visits                â”‚ Payments              â”‚ 12,500/mo        â”‚â–¼ â”‚
â”‚  â”‚ [Active] [M][C]     â”‚ â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–‘â–‘ 36/48      â”‚ â–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–ˆâ–‘â–‘â–‘ 90K/150K   â”‚ 180 days left    â”‚  â”‚
â”‚  â”‚ Mohamed Â· West Bay  â”‚ 12 left Â· Next Jun 15 â”‚ 60K left Â· 1 overdue â”‚ Janâ€“Dec 2026     â”‚  â”‚
â””â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”˜
```

**Column 1 â€” Status icon (48px):**
- 9Ã—9px rounded square, color from status config

**Column 2 â€” Info (flex-1, min-w-[200px]):**
- Row 1: Contract ID (bold) + Status badge + Division badges (short colored chips)
- Row 2: Customer name Â· Site name (`text-sm text-muted-foreground`)

**Column 3 â€” Visits Progress (200px):**
- Progress bar: `completed / total` ratio, green fill
- Below: `"{completed}/{total}"` text + `"{remaining} left"` + `"Next: {nextVisitDate}"` (formatted short date)
- If no visits: "No visits scheduled"

**Column 4 â€” Payments Progress (200px):**
- Progress bar: `paid / total` ratio, blue fill. Overdue portion in red.
- Below: `"{paidK}/{totalK}"` text + `"{remainingK} left"` + overdue count if > 0 (red text: "{N} overdue")
- If no payments: "No payments recorded"

**Column 5 â€” End Info (160px):**
- Row 1: Monthly value (`text-sm font-semibold`)
- Row 2: Days remaining (`text-xs text-muted-foreground`)
- Row 3: Date range (formatted)

**Column 6 â€” Chevron (32px):**
- ChevronDown icon, rotates on expand

#### Expanded State (3-column grid below collapsed row)

Appears below the collapsed row when chevron is clicked. Animated slide-down.

```
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ Upcoming Visits     â”‚ Payment Status         â”‚ Contract Details         â”‚
â”‚                     â”‚                        â”‚                          â”‚
â”‚ ðŸ“… Jun 15           â”‚ Jun 01 Â· 12,500 QAR    â”‚ Total: 150,000 QAR      â”‚
â”‚   AC Cleaning       â”‚   [Overdue] ðŸ”´         â”‚ Schedule: Monthly        â”‚
â”‚   [Team Alpha âœ“]    â”‚                        â”‚ Areas: 24                â”‚
â”‚                     â”‚ Jul 01 Â· 12,500 QAR    â”‚ Agent: Ahmad             â”‚
â”‚ ðŸ“… Jun 22           â”‚   [Pending] ðŸŸ¡         â”‚ Phone: +974 7219 5504   â”‚
â”‚   Floor Mopping     â”‚                        â”‚                          â”‚
â”‚   [Unassigned âš ]    â”‚ Aug 01 Â· 12,500 QAR    â”‚                          â”‚
â”‚                     â”‚   [Pending] ðŸŸ¡         â”‚                          â”‚
â”‚ ðŸ“… Jul 01           â”‚                        â”‚                          â”‚
â”‚   AC Cleaning       â”‚ Sep 01 Â· 12,500 QAR    â”‚                          â”‚
â”‚   [Team Alpha âœ“]    â”‚   [Paid] âœ…             â”‚                          â”‚
â”‚                     â”‚                        â”‚                          â”‚
â”‚ +6 more visits      â”‚                        â”‚                          â”‚
â”‚                     â”‚                        â”‚                          â”‚
â”‚ [View Full]         â”‚                        â”‚ [Cancel Contract]        â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

**Column 1: Upcoming Visits (flex-1):**
- Shows next 6 visits from `upcoming_visits[]`
- Each: date badge (formatted) + service name + team badge
  - Team assigned: green badge with team name + âœ“
  - Unassigned: yellow badge "Unassigned" + âš  icon
- If more than 6: "+{N} more visits" link
- "View Full" button (outline variant) â†’ navigates to `/contracts/detail/{id}`

**Column 2: Payment Status (flex-1):**
- Lists payments from `payments[]` (sorted by due_date)
- Each: due date + amount + status badge
  - Paid: green "Paid" badge with âœ“
  - Overdue: red "Overdue" badge
  - Pending: yellow "Pending" badge

**Column 3: Contract Details (flex-1):**
- Total Value: formatted QAR
- Schedule: payment frequency label
- Areas: count
- Agent: name
- Phone: formatted
- If cancelled: red box with cancel reason + cancelled date
- "Cancel Contract" button (destructive outline variant) â€” only for active contracts, only if user has `contracts.cancel` permission

**Expanded state responsive:**
- Mobile (<640px): single column, sections stack vertically
- Tablet (640-1024px): 2-column (visits+payments left col, details right col)
- Desktop: full 3-column grid

### 7.7 CancelContractDialog

**Component:** `CancelContractDialog.tsx` (~50 lines)

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  âš ï¸  Cancel Contract CTR-2026-001?                               â”‚
â”‚                                                                   â”‚
â”‚  This will cancel the contract for Mohamed Al Thani at           â”‚
â”‚  West Bay Tower. All upcoming visits will be removed.            â”‚
â”‚  This action cannot be undone.                                    â”‚
â”‚                                                                   â”‚
â”‚  Cancellation Reason:                                             â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”‚
â”‚  â”‚                                                             â”‚ â”‚
â”‚  â”‚ (required â€” button disabled until filled)                   â”‚ â”‚
â”‚  â”‚                                                             â”‚ â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â”‚
â”‚                                                                   â”‚
â”‚                          [Keep Contract]  [Cancel Contract]       â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

- AlertDialog with destructive styling
- Title includes contract ID
- Warning text mentions customer name + site name
- Textarea: required, min 10 characters. "Cancel Contract" button disabled until filled.
- "Keep Contract" â†’ closes dialog
- "Cancel Contract" (destructive variant) â†’ mutation:
  1. Update contract: `status = 'cancelled'`, `cancelled_date = now()`, `cancel_reason = text`
  2. Delete all future contract_visits (where `scheduled_date > today AND completed = false`)
  3. Log audit entry: action `contract_cancelled`, severity `critical`
  4. Invalidate queries, toast success

### 7.8 Empty States

| Condition | Display |
|---|---|
| No live contracts | Centered: FileText icon + "No active contracts" + "Contracts will appear here once quotations are approved and activated." |
| No results for filters | Centered: Search icon + "No contracts match your filters" + "Clear Filters" button |

### 7.9 Loading State

- Counter chips: skeleton bars
- Outstanding badge: skeleton
- Cards: 3 skeleton card outlines matching collapsed card height

---

## 8. Page 4: Contract Detail (`/contracts/detail/[contractId]`)

**File:** `src/app/(dashboard)/contracts/detail/[contractId]/page.tsx`
**Estimated:** ~403 lines

This page serves **two purposes** based on the contract's status:

1. **Quotation view** (status in quotation phase) â†’ shows the same content as CreateContractQuotation but in view/edit mode with status-appropriate actions
2. **Live contract view** (status in live phase) â†’ shows visit generator + visit list + schedule assignment

### 8.1 Routing Logic

```typescript
// In the page component:
const { contractId } = useParams();
const { contract, services, visits, payments, milestones } = useContractDetail(contractId);

const isQuotationPhase = ['draft', 'manager_review', 'customer_pending', 'approved', 'rejected', 'expired']
  .includes(contract.status);
const isLivePhase = ['active', 'expiring_soon', 'overdue_payment', 'completed', 'cancelled']
  .includes(contract.status);

// Render different layouts based on phase
if (isQuotationPhase) return <QuotationDetailView ... />;
if (isLivePhase) return <LiveContractDetailView ... />;
```

### 8.2 Quotation Detail View

When a contract is in quotation phase, this page renders the same layout as CreateContractQuotation (Section 5) but loaded with existing data. All the edit/view mode rules from Section 5.2 apply based on the current status.

The "â† Back" button navigates to `/contracts/quotations`.

### 8.3 Live Contract Detail View â€” Layout

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ [â†] CTR-2026-001  [Active] [Maint] [Clean]                             â”‚
â”‚ ðŸ‘¤ Mohamed Al Thani  ðŸ¢ West Bay Tower  ðŸ’° 150,000 QAR                  â”‚
â”‚ ðŸ“… Jan 2026 â€“ Dec 2026  ðŸ“ 24 areas                                    â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ Visit Generator (272px)         â”‚ All Visits (48)                       â”‚
â”‚                                 â”‚                                       â”‚
â”‚ Service Name:                   â”‚ â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
â”‚ [AC maintenance, cleaning...]   â”‚ â”‚ â‘  Jun 15  AC Cleaning           â”‚  â”‚
â”‚                                 â”‚ â”‚   [Team Alpha â–¼]  [New]    [ðŸ—‘] â”‚  â”‚
â”‚ Frequency:                      â”‚ â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤  â”‚
â”‚ â—‹ Weekly  â—‹ Bi-weekly           â”‚ â”‚ â‘¡ Jun 22  Floor Mopping         â”‚  â”‚
â”‚ â— Monthly â—‹ Quarterly          â”‚ â”‚   [Select team â–¼] [New]    [ðŸ—‘] â”‚  â”‚
â”‚                                 â”‚ â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤  â”‚
â”‚ [ðŸª„ Auto-Generate Visits]       â”‚ â”‚ â‘¢ Jul 01  AC Cleaning           â”‚  â”‚
â”‚ [+ Add Single Visit]           â”‚ â”‚   [Team Alpha â–¼]  [New]    [ðŸ—‘] â”‚  â”‚
â”‚                                 â”‚ â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤  â”‚
â”‚ 12 pending visits               â”‚ â”‚ â‘£ Jul 15  Window Cleaning       â”‚  â”‚
â”‚ [ðŸ’¾ Create Tentative]           â”‚ â”‚   [Select team â–¼] [New]    [ðŸ—‘] â”‚  â”‚
â”‚                                 â”‚ â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤  â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€               â”‚ â”‚ ...                              â”‚  â”‚
â”‚ 36 existing visits              â”‚ â”‚                                  â”‚  â”‚
â”‚ 24 completed Â· 12 scheduled    â”‚ â”‚                                  â”‚  â”‚
â”‚                                 â”‚ â”‚                                  â”‚  â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
â”‚                                                                         â”‚
â”‚ â”Œâ”€ Service Schedule (only when active) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
â”‚ â”‚  (ServiceScheduleSection â€” mini calendar + DnD team grid)         â”‚  â”‚
â”‚ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### 8.4 Header

- "â† Back" button â†’ navigates to `/contracts` (live contracts list)
- Contract ID: bold `text-xl`
- Status badge (color from status config)
- Division badges (colored chips)
- Info row (icon + text pairs, `text-sm text-muted-foreground`):
  - ðŸ‘¤ User icon + customer name
  - ðŸ¢ Building2 icon + site name
  - ðŸ’° DollarSign icon + total value formatted
  - ðŸ“… Calendar icon + date range
  - ðŸ“ Layers icon + area count

**Mobile (<640px):** Info row wraps to 2 rows. Contract ID + status on first line, icons below.

### 8.5 Left Panel: Visit Generator (272px width)

**Service Name Input:**
- Text input, defaults to contract's `services_summary`
- Label: "Service Name"
- Used as the `service_name` value for generated visits

**Frequency Selector:**
- Radio group (vertical stack):
  - â—‹ Weekly â€” "Every 7 days"
  - â—‹ Bi-weekly â€” "Every 14 days"
  - â— Monthly â€” "Every month" (default)
  - â—‹ Quarterly â€” "Every 3 months"

**"Auto-Generate Visits" button:**
- Wand2 icon + "Auto-Generate Visits"
- Primary variant
- On click: calls `generateVisitDates(startDate, endDate, frequency)` helper
- Creates `PendingVisit[]` in local state:
  - `temp_id`: nanoid for React key
  - `scheduled_date`: computed from frequency
  - `service_name`: from service name input
  - `team_id`: null (unassigned)
  - `notes`: ""
- Toast: "Generated {N} visits"

**"Add Single Visit" button:**
- Plus icon + "Add Single Visit"
- Outline variant
- Adds one PendingVisit starting from contract start_date (or the day after the last pending visit)

**Pending Visits Count:**
- Badge: "{N} pending visits" (muted variant)
- Visible only when pending visits exist in local state

**"Create Tentative" button:**
- Save icon + "Create Tentative"
- Green/success variant
- **Disabled when:** no pending visits, or contract status is `completed`/`cancelled`
- **On click:**
  1. For each PendingVisit, inserts into `contract_visits` with `completed = false`
  2. Updates `contracts.total_visits` += count of new visits
  3. Clears local pending state
  4. Invalidates contract detail query
  5. Toast: "Created {N} tentative visits"

**Existing Visits Summary:**
- Separator line
- Badge: "{N} existing visits"
- Text: "{X} completed Â· {Y} scheduled" (`text-sm text-muted-foreground`)

**Only visible when contract status = `completed` or `cancelled`:**
- Gray overlay on the entire left panel
- Text: "Visit generation is disabled for {status} contracts"

### 8.6 Right Panel: Visit List (Scrollable)

**Header:** "All Visits ({totalCount})" â€” includes both pending (local state) and existing (DB) visits

**Visit list:** Scrollable container, max-height fills available viewport height.

Pending visits appear at the top (sorted by date), followed by existing visits (sorted by date).

**Each visit row:**

```
â”Œâ”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚â‘ â”‚ Jun 15, 2026   AC Cleaning   [Team Alpha â–¼]  [New]     [ðŸ—‘]  â”‚
â””â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

| Element | Pending visit | Existing visit |
|---|---|---|
| **Number badge** | Circular, primary color | Circular: green=completed, muted=scheduled, yellow=tentative |
| **Date** | Editable date input (`<input type="date">`) | Formatted text (read-only) |
| **Service name** | Text (from service name input) | Text (from DB) |
| **Team** | Dropdown (`<Select>`) from `useTeams()` filtered by contract divisions. Default: "Unassigned" (italic). | Badge: team name (green if assigned, italic "Unassigned" yellow if null) |
| **Status badge** | "New" (primary variant) | "Done" (green, completed=true), "Tentative" (yellow, completed=false) |
| **Remove** | Trash2 icon button (destructive, only for pending) | Hidden for existing |

**Visit row interactions:**
- **Pending visit date change:** updates local state
- **Pending visit team change:** updates local state via dropdown
- **Pending visit remove:** removes from local state (no DB call)
- **Existing visit team reassign:** only possible in ServiceScheduleSection (post-approval DnD grid)

**Mobile (<640px):** Split layout collapses. Visit generator panel goes above visit list (full width). Visit list below (full width, scrollable).

### 8.7 Post-Approval: ServiceScheduleSection

**Component:** `ServiceScheduleSection.tsx` (~480 lines)

Renders BELOW the split layout, only when `contract.status` is `active`, `expiring_soon`, or `overdue_payment`.

**Not rendered** for: quotation-phase statuses, `completed`, `cancelled`.

This is the most complex component in the module. See Section 9 (Part 3) for full specification.

### 8.8 Responsive: Contract Detail

| Breakpoint | Layout |
|---|---|
| **Mobile (<640px)** | No split layout. Visit generator full-width on top. Visit list full-width below (scrollable, max-h-[60vh]). ServiceScheduleSection stacks: calendar on top, team grid below (horizontal scroll). |
| **Tablet (640-1024px)** | Split layout maintained but left panel narrower (200px). Visit list takes remaining space. ServiceScheduleSection: calendar on left, grid on right (horizontal scroll for hours). |
| **Desktop (1024-1920px)** | Full split layout (272px + rest). ServiceScheduleSection: full calendar + full grid. |
| **Large (>1920px)** | Same as desktop with more breathing room. Max-width container. |

### 8.9 Empty States

| Condition | Display |
|---|---|
| No visits (pending or existing) | In visit list area: Calendar icon + "No visits yet" + "Use the Visit Generator to create visits for this contract." |
| Contract completed | Banner at top: CheckCircle + "This contract has been completed. All visits are done and payments collected." (green bg) |
| Contract cancelled | Banner at top: XCircle + "This contract was cancelled on {date}. Reason: {reason}" (red bg) |

---

## 9. ServiceScheduleSection (Post-Approval DnD Grid)

**Component:** `src/components/contracts/ServiceScheduleSection.tsx`
**Estimated:** ~480 lines
**Dependencies:** `@dnd-kit/core`, `@dnd-kit/sortable`, `date-fns`, `useTeams`, `useContractSchedule`

### 9.1 Overview

A mini calendar + drag-and-drop team assignment grid. Appears on the Contract Detail page only after the contract is activated. Allows operations staff to assign specific teams to specific time slots for each scheduled visit.

### 9.2 Layout

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ Service Schedule                                                        â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚ â—„ June 2026 â–º   â”‚ Wednesday, June 15, 2026                              â”‚
â”‚                  â”‚ 4 services Â· 2 assigned         [Push to Calendar]   â”‚
â”‚ Mo Tu We Th Fr  â”‚                                                       â”‚
â”‚  1  2  3  4  5  â”‚ Unassigned:                                           â”‚
â”‚  8  9 10 11 12  â”‚ â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”                    â”‚
â”‚ 15â—16 17 18 19  â”‚ â”‚ AC Cleaning  â”‚ â”‚ Floor Mop    â”‚                    â”‚
â”‚ 22 23 24 25 26  â”‚ â”‚ Main Lobby   â”‚ â”‚ Ground Floor â”‚                    â”‚
â”‚ 29 30           â”‚ â”‚ [Maint]      â”‚ â”‚ [Clean]      â”‚                    â”‚
â”‚                  â”‚ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜                    â”‚
â”‚ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ â”‚                                                       â”‚
â”‚ ðŸ“… Jun 15 (4) âœ“ â”‚ â”Œâ”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”  â”‚
â”‚ ðŸ“… Jun 22 (3)   â”‚ â”‚      â”‚ 7AM  â”‚ 8AM  â”‚ 9AM  â”‚ 10AM â”‚ 11AM â”‚ ...  â”‚  â”‚
â”‚ ðŸ“… Jul 01 (4) âœ“ â”‚ â”œâ”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”¤  â”‚
â”‚ ðŸ“… Jul 15 (2)   â”‚ â”‚Alpha â”‚      â”‚ [AC] â”‚      â”‚      â”‚      â”‚      â”‚  â”‚
â”‚ ðŸ“… Aug 01 (4) âœ“ â”‚ â”œâ”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”¤  â”‚
â”‚ ðŸ“… Aug 15 (3)   â”‚ â”‚Beta  â”‚      â”‚      â”‚      â”‚      â”‚      â”‚      â”‚  â”‚
â”‚ ...              â”‚ â”œâ”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”¤  â”‚
â”‚                  â”‚ â”‚Gamma â”‚      â”‚      â”‚[Flr] â”‚      â”‚      â”‚      â”‚  â”‚
â”‚ Legend:          â”‚ â””â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”˜  â”‚
â”‚ ðŸ”µ Has visits    â”‚                                                       â”‚
â”‚ ðŸŸ¡ Partial       â”‚                                                       â”‚
â”‚ ðŸŸ¢ All assigned  â”‚                                                       â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”´â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### 9.3 Left Panel: Mini Calendar (260px)

**Month navigation:** "â† June 2026 â†’" with ChevronLeft/ChevronRight buttons.

**Day grid:** 7 columns (Mo-Fr, or Mo-Su depending on locale). Each cell:
- Day number
- Color-coded dot indicator:
  - ðŸ”µ Blue dot: has visits on this day
  - ðŸŸ¡ Yellow dot: some visits assigned, some not
  - ðŸŸ¢ Green dot: all visits on this day have team assignments
  - No dot: no visits
- Selected day: primary background, white text
- Today: subtle border highlight

**Click day â†’ loads that day's services in the right panel.**

**Date list (below calendar):**
Scrollable list of the first 20 dates that have visits. Each row:
- Calendar icon + formatted date (e.g., "Jun 15")
- Service count badge: "(4)"
- Checkmark if all assigned on that date: "âœ“"
- Click â†’ same as clicking the day in the calendar

**Legend (bottom):**
- ðŸ”µ Blue = has visits
- ðŸŸ¡ Yellow = partially assigned
- ðŸŸ¢ Green = all assigned

### 9.4 Right Panel: Schedule View

**Header row:**
- Selected date: "Wednesday, June 15, 2026" (bold)
- Service count: "{N} services"
- Assigned count: "{M} assigned"
- "Push to Team Calendar" button (outline, CalendarPlus icon): pushes all assigned visits for this date to the main calendar/orders system. Disabled if any visits on this date are unassigned.

**Unassigned Services Pool:**
Horizontal row of draggable service chips. Each chip:
- Service name (truncated, `max-w-[180px]`)
- Location (building node name, `text-xs`)
- Division badge (colored chip)
- Background color: cycles through 5 colors (blue, green, orange, purple, pink) by index
- **Draggable:** uses `@dnd-kit` `useDraggable` hook

When all services are assigned, the pool is empty with text: "All services assigned for this date âœ“"

**Team Grid (time slot matrix):**

- **Rows:** Teams from `useTeams()`, filtered by contract's divisions
- **Columns:** Hour slots from 7 AM to 7 PM (12 columns). Each column = 1 hour.
- **Column header:** Hour label ("7AM", "8AM", ...)
- **Row header:** Team name (fixed left column, 100px)

**Each cell is a droppable target** (`useDroppable` from `@dnd-kit`):
- Empty cell: accepts drag. Shows subtle highlight on dragOver.
- Occupied cell: shows the assigned service as a colored block with service name. Cannot accept another drag.
- Each assigned block has an "Ã—" remove button on hover â†’ unassigns the service (returns to pool).

**Drag interaction:**
1. User picks up a service chip from the unassigned pool
2. Drags over the team grid
3. Valid drop targets highlight (cells for teams in matching divisions)
4. Drops on a teamÃ—hour cell
5. Service is assigned: `team_id = team.id`, `time_slot = hour`
6. Chip disappears from pool, colored block appears in cell
7. Calendar dot updates (blue â†’ yellow â†’ green)

**On drop mutation:**
- Calls `assignTeam(visitDate, serviceId, teamId, timeSlot)` from `useContractSchedule`
- Updates `contract_visits` row: sets `team_id` and adds a `time_slot` field (or stores in a schedule JSONB)
- Invalidates schedule query

**Remove (unassign):**
- Click "Ã—" on an assigned block
- Calls `unassignTeam(visitDate, serviceId)`
- Service chip reappears in unassigned pool
- Calendar dot updates

### 9.5 Date Generation Logic

Generates visit dates from contract start to end based on each service's frequency:

| Frequency | date-fns function | Step |
|---|---|---|
| `daily` | `addDays(date, 1)` | Every day |
| `weekly` | `addWeeks(date, 1)` | Every 7 days |
| `bi_weekly` | `addWeeks(date, 2)` | Every 14 days |
| `monthly` | `addMonths(date, 1)` | Every month (same day) |
| `quarterly` | `addMonths(date, 3)` | Every 3 months |
| `semi_annual` | `addMonths(date, 6)` | Every 6 months |
| `annual` | `addYears(date, 1)` | Every year |

Starting from `contract.start_date`, generate dates until `contract.end_date` (inclusive). Skip weekends if `contract.skip_weekends` is set (future enhancement â€” not in v1).

### 9.6 Responsive: ServiceScheduleSection

| Breakpoint | Layout |
|---|---|
| **Mobile (<640px)** | Calendar panel full-width on top. Team grid below with horizontal scroll. Unassigned pool wraps to multiple rows. Team column fixed, hour columns scroll. Touch: tap to select service, tap cell to assign (no drag on mobile). |
| **Tablet (640-1024px)** | Side-by-side layout maintained. Calendar 200px. Grid has horizontal scroll for hours. |
| **Desktop (1024+)** | Full layout. All 12 hour columns visible without scroll. |

**Mobile fallback (no drag):**
On touch devices (<640px), drag-and-drop is replaced with a tap-to-assign flow:
1. Tap a service chip â†’ it becomes "selected" (highlighted border)
2. Tap a teamÃ—hour cell â†’ assigns the selected service to that cell
3. Tap the selected chip again â†’ deselects

This avoids DnD usability issues on small screens.


# Contracts Module â€” Design Specification (Part 3 of 3)

---

## 10. Hooks & Data Flow

### 10.1 useContractQuotations

**File:** `src/hooks/useContractQuotations.ts`

Fetches contract quotations with filters and computed pipeline value.

```typescript
function useContractQuotations(filters?: QuotationFilters) {
  // Returns:
  return {
    data: ContractQuotationSummary[],
    pipelineValue: number,      // SUM(total_value) of all filtered quotations
    statusCounts: Record<ContractQuotationStatus, number>,  // for counter chips
    isLoading: boolean,
    isError: boolean,
    error: Error | null,
  }
}
```

**Query implementation:**
```typescript
const QUOTATION_STATUSES = ['draft', 'manager_review', 'customer_pending', 'approved', 'rejected', 'expired'];

const query = supabase
  .from('contracts')
  .select('*, profiles!created_by(full_name)')
  .in('status', filters?.status?.length ? filters.status : QUOTATION_STATUSES)
  .order(filters?.sortBy === 'value' ? 'total_value' : 'created_at', {
    ascending: filters?.sortDir === 'asc'
  });

// Apply text filters with ILIKE
if (filters?.contractNumber) query.ilike('quotation_number', `%${filters.contractNumber}%`);
if (filters?.customer)       query.ilike('customer_name', `%${filters.customer}%`);
if (filters?.phone)          query.ilike('phone', `%${filters.phone}%`);
if (filters?.siteName)       query.ilike('site_name', `%${filters.siteName}%`);
if (filters?.agent)          query.eq('agent_name', filters.agent);

// Date range
if (filters?.dateFrom) query.gte('created_at', filters.dateFrom);
if (filters?.dateTo)   query.lte('created_at', filters.dateTo);
```

**Pipeline value:** Computed client-side from the returned data: `data.reduce((sum, c) => sum + c.total_value, 0)`.

**Status counts:** Computed client-side from a separate unfiltered count query (or from the full data if pagination isn't needed yet).

**Query key:** `['contractQuotations', filters]`

### 10.2 useContracts

**File:** `src/hooks/useContracts.ts`

Fetches live contracts with progress data.

```typescript
function useContracts(filters?: ContractFilters) {
  return {
    data: LiveContractSummary[],
    outstandingTotal: number,   // SUM(total_payments - paid_amount) across all active
    statusCounts: Record<ContractLiveStatus, number>,
    isLoading: boolean,
    isError: boolean,
  }
}
```

**Query implementation:**
```typescript
const LIVE_STATUSES = ['active', 'expiring_soon', 'overdue_payment', 'completed', 'cancelled'];

const query = supabase
  .from('contracts')
  .select(`
    *,
    contract_visits(id, scheduled_date, service_name, team_id, completed, teams(name_en)),
    contract_payments(id, due_date, amount, status)
  `)
  .in('status', filters?.status?.length ? filters.status : LIVE_STATUSES);
```

**Sort logic:**
- `endDate`: `query.order('end_date', { ascending: sortDir === 'asc' })`
- `balance`: computed client-side, sort after fetch: `data.sort((a, b) => (b.total_payments - b.paid_amount) - (a.total_payments - a.paid_amount))`
- `visits`: computed client-side: `data.sort((a, b) => (b.total_visits - b.completed_visits) - (a.total_visits - a.completed_visits))`

**Outstanding total:** `data.filter(c => c.status === 'active').reduce((sum, c) => sum + (c.total_payments - c.paid_amount), 0)`

**Upcoming visits transformation:** For each contract, take the `contract_visits` join data, filter to `completed = false AND scheduled_date >= today`, sort by date, take first 6 for the expanded card view.

**Query key:** `['contracts', filters]`

### 10.3 useContractDetail

**File:** `src/hooks/useContractDetail.ts`

Fetches a single contract with all related data.

```typescript
function useContractDetail(contractId: string) {
  return {
    contract: Contract | null,
    services: ContractService[],
    visits: ContractVisit[],
    payments: ContractPayment[],
    milestones: ContractMilestone[],
    isLoading: boolean,
    isError: boolean,

    // Helper functions
    generateVisitDates: (startDate: string, endDate: string, frequency: ServiceFrequency) => PendingVisit[],
    createTentativeVisits: UseMutationResult,  // inserts contract_visits
    updateVisit: UseMutationResult,             // updates a single visit
    deleteVisit: UseMutationResult,             // deletes a pending visit
  }
}
```

**Query:**
```typescript
const { data: contract } = useQuery({
  queryKey: ['contractDetail', contractId],
  queryFn: async () => {
    const { data } = await supabase
      .from('contracts')
      .select(`
        *,
        contract_services(*),
        contract_visits(*, teams(name_en)),
        contract_payments(*),
        contract_milestones(*)
      `)
      .eq('id', contractId)
      .single();
    return data;
  }
});
```

**generateVisitDates helper:**
```typescript
function generateVisitDates(startDate: string, endDate: string, frequency: ServiceFrequency): PendingVisit[] {
  const visits: PendingVisit[] = [];
  let current = parseISO(startDate);
  const end = parseISO(endDate);
  const step = {
    daily: (d: Date) => addDays(d, 1),
    weekly: (d: Date) => addWeeks(d, 1),
    bi_weekly: (d: Date) => addWeeks(d, 2),
    monthly: (d: Date) => addMonths(d, 1),
    quarterly: (d: Date) => addMonths(d, 3),
    semi_annual: (d: Date) => addMonths(d, 6),
    annual: (d: Date) => addYears(d, 1),
  }[frequency];

  while (current <= end) {
    visits.push({
      temp_id: nanoid(),
      scheduled_date: format(current, 'yyyy-MM-dd'),
      service_name: '',  // filled by caller
      team_id: null,
      notes: '',
    });
    current = step(current);
  }
  return visits;
}
```

**createTentativeVisits mutation:**
```typescript
useMutation({
  mutationFn: async (visits: PendingVisit[]) => {
    const rows = visits.map(v => ({
      contract_id: contractId,
      service_name: v.service_name,
      scheduled_date: v.scheduled_date,
      team_id: v.team_id,
      completed: false,
    }));
    const { error } = await supabase.from('contract_visits').insert(rows);
    if (error) throw error;

    // Update total_visits count on contract
    await supabase.from('contracts').update({
      total_visits: (contract.total_visits || 0) + visits.length
    }).eq('id', contractId);
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['contractDetail', contractId] });
  }
});
```

**Query key:** `['contractDetail', contractId]`

### 10.4 useCreateContractQuotation

**File:** `src/hooks/useCreateContractQuotation.ts`

Creates a new contract quotation (draft).

```typescript
function useCreateContractQuotation() {
  return useMutation({
    mutationFn: async (data: CreateContractInput) => {
      // 1. Generate quotation number
      const quotationNumber = await generateQuotationNumber();

      // 2. Insert contract
      const { data: contract, error } = await supabase
        .from('contracts')
        .insert({
          quotation_number: quotationNumber,
          status: 'draft',
          source_type: data.sourceType,
          customer_name: data.customerName,
          phone: data.phone,
          address: data.address,
          site_name: data.siteName,
          divisions: data.divisions,
          start_date: data.startDate,
          end_date: data.endDate,
          discount: data.discount,
          payment_mode: data.paymentMode,
          payment_frequency: data.paymentFrequency,
          building_tree: data.buildingTree,
          notes: data.notes,
          monthly_value: data.monthlyValue,
          total_value: data.totalValue,
          agent_name: data.agentName,
          created_by: data.createdBy,
          area_count: data.areaCount,
          services_summary: data.servicesSummary,
        })
        .select()
        .single();
      if (error) throw error;

      // 3. Insert services
      if (data.services.length > 0) {
        const serviceRows = data.services.map((s, i) => ({
          contract_id: contract.id,
          service_id: s.serviceId,
          building_node_id: s.buildingNodeId,
          service_name: s.serviceName,
          service_path: s.servicePath,
          brand_id: s.brandId,
          brand_name: s.brandName,
          reliability_factor: s.reliabilityFactor,
          condition: s.condition,
          condition_factor: s.conditionFactor,
          frequency: s.frequency,
          quantity: s.quantity,
          base_price: s.basePrice,
          unit_price: s.unitPrice,
          total_price: s.totalPrice,
          divisions: s.divisions,
          note: s.note,
          is_general: s.isGeneral,
          sort_order: i,
        }));
        await supabase.from('contract_services').insert(serviceRows);
      }

      // 4. Insert milestones (if milestone mode)
      if (data.paymentMode === 'milestone' && data.milestones?.length > 0) {
        const milestoneRows = data.milestones.map((m, i) => ({
          contract_id: contract.id,
          name: m.name,
          percentage: m.percentage,
          amount: m.amount,
          due_date: m.dueDate,
          sort_order: i,
        }));
        await supabase.from('contract_milestones').insert(milestoneRows);
      }

      // 5. Log activity
      await logActivity({
        action: 'contract_created',
        entity_type: 'contract',
        entity_id: contract.id,
        details: { quotation_number: quotationNumber, customer: data.customerName },
      });

      return contract;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contractQuotations'] });
    }
  });
}

// Quotation number generator
async function generateQuotationNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const { count } = await supabase
    .from('contracts')
    .select('id', { count: 'exact', head: true })
    .ilike('quotation_number', `CTR-Q-${year}-%`);
  const seq = String((count || 0) + 1).padStart(3, '0');
  return `CTR-Q-${year}-${seq}`;
}
```

### 10.5 useUpdateContract

**File:** `src/hooks/useUpdateContract.ts`

Updates contract fields and handles status transitions with validation.

```typescript
function useUpdateContract() {
  return useMutation({
    mutationFn: async ({ contractId, updates, newStatus }: UpdateContractInput) => {
      // Validate status transition if changing
      if (newStatus) {
        const { data: current } = await supabase
          .from('contracts')
          .select('status')
          .eq('id', contractId)
          .single();

        if (!isValidTransition(current.status, newStatus)) {
          throw new Error(`Invalid transition: ${current.status} â†’ ${newStatus}`);
        }

        updates.status = newStatus;

        // Side effects per transition
        await applyTransitionSideEffects(contractId, current.status, newStatus, updates);
      }

      // Update contract
      const { error } = await supabase
        .from('contracts')
        .update(updates)
        .eq('id', contractId);
      if (error) throw error;

      // Update services if provided
      if (updates.services) {
        // Delete existing, re-insert (simpler than diff)
        await supabase.from('contract_services').delete().eq('contract_id', contractId);
        if (updates.services.length > 0) {
          await supabase.from('contract_services').insert(
            updates.services.map((s, i) => ({ ...s, contract_id: contractId, sort_order: i }))
          );
        }
      }

      // Update milestones if provided
      if (updates.milestones !== undefined) {
        await supabase.from('contract_milestones').delete().eq('contract_id', contractId);
        if (updates.milestones.length > 0) {
          await supabase.from('contract_milestones').insert(
            updates.milestones.map((m, i) => ({ ...m, contract_id: contractId, sort_order: i }))
          );
        }
      }
    },
    onSuccess: (_, { contractId }) => {
      queryClient.invalidateQueries({ queryKey: ['contractDetail', contractId] });
      queryClient.invalidateQueries({ queryKey: ['contractQuotations'] });
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
    }
  });
}
```

### 10.6 useContractSchedule

**File:** `src/hooks/useContractSchedule.ts`

Manages team assignment for contract visits (post-approval).

```typescript
function useContractSchedule(contractId: string) {
  return {
    // Generated dates with assignment status
    scheduleDates: ScheduleDate[],   // { date, services: { serviceId, serviceName, teamId?, timeSlot? }[], allAssigned }
    isLoading: boolean,

    // Mutations
    assignTeam: UseMutationResult,   // (visitId, teamId, timeSlot) â†’ updates contract_visits
    unassignTeam: UseMutationResult, // (visitId) â†’ clears team_id on contract_visits
  }
}

interface ScheduleDate {
  date: string;
  services: {
    visitId: string;
    serviceName: string;
    location: string;           // building node name
    division: string;
    teamId: string | null;
    teamName: string | null;
    timeSlot: string | null;    // "09:00"
  }[];
  allAssigned: boolean;          // all services have teamId
}
```

**assignTeam mutation:**
```typescript
useMutation({
  mutationFn: async ({ visitId, teamId, timeSlot }: AssignInput) => {
    await supabase.from('contract_visits').update({
      team_id: teamId,
      // time_slot stored in a future column or via a schedule JSONB
    }).eq('id', visitId);
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['contractSchedule', contractId] });
  }
});
```

### 10.7 useServiceBrands

**File:** `src/hooks/useServiceBrands.ts`

Fetches brands linked to a service for the AddContractServiceDialog.

```typescript
function useServiceBrands(serviceId: string | null) {
  return useQuery({
    queryKey: ['serviceBrands', serviceId],
    queryFn: async () => {
      if (!serviceId) return [];
      const { data } = await supabase
        .from('service_brands')
        .select('*, brands(name, name_ar)')
        .eq('service_id', serviceId);
      return (data || []).map(sb => ({
        id: sb.id,
        service_id: sb.service_id,
        brand_id: sb.brand_id,
        brand_name: sb.brands.name,
        reliability_factor: sb.reliability_factor,
        is_reliable: sb.is_reliable,
      }));
    },
    enabled: !!serviceId,
  });
}
```

---

## 11. State Machine & Transition Side Effects

**File:** `src/lib/contractStateMachine.ts`

### 11.1 Valid Transitions

```typescript
const VALID_TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  draft:            ['manager_review'],
  manager_review:   ['customer_pending', 'rejected'],
  customer_pending: ['approved', 'rejected'],
  approved:         ['active'],
  rejected:         ['draft'],
  expired:          [],                    // terminal (time-based)
  active:           ['expiring_soon', 'overdue_payment', 'completed', 'cancelled'],
  expiring_soon:    ['active', 'completed', 'cancelled'],
  overdue_payment:  ['active', 'cancelled'],
  completed:        [],                    // terminal
  cancelled:        [],                    // terminal
};

function isValidTransition(from: ContractStatus, to: ContractStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}
```

### 11.2 Transition Side Effects

Each status transition triggers specific side effects:

| Transition | Side effects |
|---|---|
| `draft â†’ manager_review` | Set `sent_at = now()`. Log: `contract_sent_for_review` (info). |
| `manager_review â†’ customer_pending` | Set `approved_by = currentUserId`, `approved_at = now()`. Log: `contract_approved_by_manager` (info). |
| `manager_review â†’ rejected` | Set `rejected_by = currentUserId`, `rejected_at = now()`, `rejected_reason = reason`. Log: `contract_rejected` (warning). |
| `customer_pending â†’ approved` | Log: `contract_customer_approved` (info). |
| `customer_pending â†’ rejected` | Set `rejected_by = currentUserId`, `rejected_at = now()`, `rejected_reason = reason`. Log: `contract_rejected` (warning). |
| `rejected â†’ draft` | Clear rejection fields: `rejected_by = null`, `rejected_at = null`, `rejected_reason = null`. Log: `contract_reverted_to_draft` (info). |
| `approved â†’ active` | Generate `contract_id` (CTR-YYYY-NNN). Capture `terms_snapshot` (freeze T&C). Generate `contract_payments` rows based on payment mode/frequency. Set `has_signed_doc = true`. Log: `contract_activated` (info). |
| `active â†’ cancelled` | Set `cancelled_date = now()`, `cancel_reason = reason`. Delete future visits. Log: `contract_cancelled` (critical). |
| `active â†’ completed` | Log: `contract_completed` (info). |

### 11.3 Payment Generation on Activation

When transitioning `approved â†’ active`, generate `contract_payments` rows:

**Fixed mode:**
```typescript
const periods = calculatePeriods(startDate, endDate, paymentFrequency);
const paymentAmount = netTotal / periods.length;

const payments = periods.map(periodEnd => ({
  contract_id: contractId,
  due_date: periodEnd,
  amount: paymentAmount,
  status: 'pending',
}));
```

Period calculation:
- Monthly: each month-end from start to end
- Quarterly: every 3 months
- Semi-Annual: every 6 months
- Annual: every 12 months

**Milestone mode:**
```typescript
const payments = milestones.map(m => ({
  contract_id: contractId,
  due_date: m.due_date,
  amount: m.amount,
  status: 'pending',
}));
```

**Completion mode:**
```typescript
const payments = [{
  contract_id: contractId,
  due_date: endDate,
  amount: netTotal,
  status: 'pending',
}];
```

### 11.4 Contract ID Generation on Activation

```typescript
async function generateContractId(): Promise<string> {
  const year = new Date().getFullYear();
  const { count } = await supabase
    .from('contracts')
    .select('id', { count: 'exact', head: true })
    .not('contract_id', 'is', null)
    .ilike('contract_id', `CTR-${year}-%`);
  const seq = String((count || 0) + 1).padStart(3, '0');
  return `CTR-${year}-${seq}`;
}
```

---

## 12. Pricing Rules

### 12.1 Price Calculation Formula

```
unit_price  = base_price Ã— reliability_factor Ã— condition_factor
line_total  = unit_price Ã— quantity
subtotal    = SUM(all line_totals)  â€” both building-tree and general services
net_total   = subtotal - discount
monthly     = net_total / duration_months
```

### 12.2 Snapshot Policy

All pricing fields on `contract_services` are **frozen at the time the service is added**:

| Field | Source | When captured |
|---|---|---|
| `base_price` | `services.price` from master table | When service added via dialog |
| `reliability_factor` | `service_brands.reliability_factor` | When brand selected in dialog |
| `condition_factor` | `pricing_factors.factor` | When condition selected in dialog |
| `unit_price` | Computed: base Ã— reliability Ã— condition | When dialog "Add Service" clicked |
| `brand_name` | `brands.name` | When brand selected |

**These values do NOT update** if the master service price, brand reliability, or condition factors change later. The contract is a self-contained pricing document.

### 12.3 Discount Rules

- `contracts.discount` is a **flat QAR amount**
- Applied to the **subtotal** (sum of all service line totals)
- Not per-line, not percentage-based
- Cannot exceed subtotal (UI validation: `discount <= subtotal`)
- Default: 0

### 12.4 Monthly Value Calculation

```typescript
const durationMonths = differenceInMonths(parseISO(endDate), parseISO(startDate));
const monthlyValue = durationMonths > 0 ? netTotal / durationMonths : netTotal;
```

Stored on `contracts.monthly_value` for display and sorting.

### 12.5 Value Updates

When any of these change, recalculate and update:
- Service added/removed/modified â†’ recalc subtotal â†’ recalc net_total â†’ recalc monthly
- Discount changed â†’ recalc net_total â†’ recalc monthly
- Dates changed â†’ recalc monthly (same total, different duration)
- Payment milestones â†’ recalc milestone amounts (percentage Ã— net_total)

All calculations happen **client-side** in the form state. Written to DB on save/auto-save.

---

## 13. Navigation Update

**File:** `src/components/layout/nav-config.ts`

Update the existing Contracts nav entry:

```typescript
{
  label: 'Contracts',
  icon: 'FileText',
  // Remove: comingSoon: true,
  permission: 'contracts.view',
  groups: [
    {
      items: [
        {
          label: 'Quotations',
          href: '/contracts/quotations',
          permission: 'contracts.quotations.view',
        },
        {
          label: 'Live Contracts',
          href: '/contracts',
          permission: 'contracts.view',
        },
        {
          label: 'New Contract',
          href: '/contracts/create-quotation',
          permission: 'contracts.create',
        },
      ],
    },
  ],
}
```

---

## 14. Permissions

### 14.1 Permission Definitions

| Permission key | Who has it | What it allows |
|---|---|---|
| `contracts.view` | All authenticated users | View live contracts list |
| `contracts.quotations.view` | All authenticated users | View quotations list |
| `contracts.create` | Agents, Managers, Admins | Create new contract quotation |
| `contracts.edit` | Agents (own), Managers, Admins | Edit draft/rejected quotations |
| `contracts.approve` | Managers, Admins | Approve or reject quotations (manager_review status) |
| `contracts.activate` | Managers, Admins | Upload signed doc and activate contract |
| `contracts.cancel` | Managers, Admins | Cancel an active contract |
| `contracts.schedule` | Agents, Managers, Admins | Assign teams to contract visits |

### 14.2 Permission Checks in UI

| Location | Check | Effect if denied |
|---|---|---|
| Nav "New Contract" item | `contracts.create` | Item hidden |
| "+ New Contract" button (quotations list) | `contracts.create` | Button hidden |
| Approve/Reject buttons (manager_review) | `contracts.approve` | Buttons hidden |
| Activate button (approved status) | `contracts.activate` | Upload banner hidden |
| Cancel button (live contract card) | `contracts.cancel` | Button hidden |
| Team assignment grid | `contracts.schedule` | Grid is read-only (no drag) |
| Edit button on draft quotation | `contracts.edit` | Button hidden |

---

## 15. Audit Logging

All status transitions and key actions logged via `logActivity()` utility.

### 15.1 Log Entries

| Action | Trigger | Severity | Details logged |
|---|---|---|---|
| `contract_created` | Draft saved for first time | `info` | quotation_number, customer_name, agent_name, total_value |
| `contract_sent_for_review` | Draft â†’ manager_review | `info` | quotation_number, sent_at |
| `contract_approved_by_manager` | manager_review â†’ customer_pending | `info` | quotation_number, approved_by (name) |
| `contract_rejected` | manager_review â†’ rejected OR customer_pending â†’ rejected | `warning` | quotation_number, rejected_by (name), rejected_reason |
| `contract_customer_approved` | customer_pending â†’ approved | `info` | quotation_number |
| `contract_reverted_to_draft` | rejected â†’ draft | `info` | quotation_number |
| `contract_activated` | approved â†’ active | `info` | contract_id (newly generated), signed_doc_url, total_value, payment_count |
| `contract_cancelled` | active â†’ cancelled | `critical` | contract_id, cancel_reason, cancelled_by (name), remaining_visits_deleted, outstanding_payments |
| `contract_completed` | active â†’ completed | `info` | contract_id, total_visits_completed, total_paid |
| `visit_created` | Tentative visits generated | `info` | contract_id, visit_count, frequency |
| `visit_team_assigned` | Team assigned via DnD grid | `info` | contract_id, visit_date, team_name, service_name |
| `payment_status_updated` | Payment marked as paid | `info` | contract_id, payment_id, amount, new_status |

### 15.2 Activity Log Location

Activity logs stored in the existing `activity_log` table (used by other modules). Filtered by `entity_type = 'contract'` for contract-specific views.

---

## 16. Error Handling

### 16.1 Network Errors

| Scenario | Handling |
|---|---|
| Supabase query fails | Show toast: "Failed to load contracts. Please try again." + retry button. Component shows error state with RefreshCw icon. |
| Save/update fails | Show toast: "Failed to save. Your changes are preserved locally." Auto-save indicator shows "Save failed" (red). Retry on next auto-save cycle. |
| File upload fails | Show toast: "Upload failed. Please try again." Upload banner shows error state. File input remains interactive. |
| Status transition fails | Show toast: "Could not update contract status. Please try again." Buttons remain enabled. |

### 16.2 Validation Errors

| Scenario | Handling |
|---|---|
| Required field empty on "Send" | Section border turns red. Inline error messages below empty fields. Toast: "Please fill in all required fields before sending." Scroll to first error. |
| Milestone total â‰  100% | Red text below progress bar: "Total: {sum}% â€” Must equal 100%". "Send" button blocked. |
| Discount > subtotal | Inline error below discount field: "Discount cannot exceed subtotal ({subtotal} QAR)". Net total shows 0, not negative. |
| End date before start date | Inline error: "End date must be after start date". Duration shows "Invalid". |
| No services added | On "Send": toast "Add at least one service before sending for review." |

### 16.3 Concurrent Edit Conflicts

Since auto-save writes every 30 seconds, two users could potentially edit the same draft. Mitigation:
- `updated_at` column is checked before save: if `updated_at` in DB is newer than what the client last fetched, show a conflict dialog: "This quotation was modified by another user. Reload to see their changes?"
- Buttons: "Reload" (refreshes data) / "Overwrite" (saves anyway)

---

## 17. Loading & Empty States Summary

### 17.1 Loading States

| Page/Component | Loading display |
|---|---|
| Quotations list | 3 skeleton cards + skeleton chips + skeleton pipeline badge |
| Live contracts list | 3 skeleton cards + skeleton chips + skeleton outstanding badge |
| Contract detail | Full-page skeleton: header skeleton + left panel skeleton + right panel skeleton (5 row outlines) |
| AddContractServiceDialog Step 1 | Skeleton columns (3 columns of skeleton rows) |
| AddContractServiceDialog Step 2 | Skeleton field grid (6 skeleton inputs) |
| ServiceScheduleSection | Calendar skeleton + grid skeleton (3 rows Ã— 12 columns of skeleton cells) |
| PaymentScheduleSection | Skeleton toggle buttons + skeleton card |
| ContractTermsSection | 4 skeleton collapsible rows |

### 17.2 Empty States

| Component | Condition | Display |
|---|---|---|
| Quotation list | No quotations exist | FileText icon (64px) + "No contract quotations yet" + "Create your first contract quotation to get started." + "New Contract" button |
| Quotation list | Filters return nothing | Search icon (48px) + "No quotations match your filters" + "Clear Filters" button |
| Live contracts list | No live contracts | FileText icon + "No active contracts" + "Contracts will appear here once quotations are approved and activated." |
| Live contracts list | Filters return nothing | Search icon + "No contracts match your filters" + "Clear Filters" button |
| Building tree | No nodes | TreePine icon + "No building structure defined" + "Click 'Edit Structure' to add buildings, floors, and areas." |
| General services | No general services | Wrench icon + "No general services added" + "Add services that apply to the entire contract." |
| Visit list | No visits | Calendar icon + "No visits yet" + "Use the Visit Generator to create visits." |
| Unassigned pool (schedule) | All assigned | CheckCircle icon + "All services assigned for this date âœ“" (green text) |
| Service brands dropdown | No brands configured | Dropdown shows "No brands configured" (disabled) |
| Terms section | No terms found | "No terms and conditions found for the selected services and divisions." |

---

## 18. Supabase Storage Setup

### 18.1 New Storage Bucket

Create a `contract-documents` bucket for signed contract uploads:

```sql
-- Run via Supabase dashboard or migration
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'contract-documents',
  'contract-documents',
  false,  -- private bucket, requires auth
  10485760,  -- 10MB limit
  ARRAY['application/pdf', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/png', 'image/jpeg']
);
```

### 18.2 Storage Policies

```sql
-- Authenticated users can upload
CREATE POLICY "Authenticated users can upload contract documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'contract-documents');

-- Authenticated users can view
CREATE POLICY "Authenticated users can view contract documents"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'contract-documents');

-- Only managers can delete
CREATE POLICY "Managers can delete contract documents"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'contract-documents');
```

### 18.3 Upload Path Convention

```
contract-documents/
  â””â”€â”€ {contract_uuid}/
      â””â”€â”€ signed_{timestamp}.{ext}
```

Example: `contract-documents/a1b2c3d4.../signed_1717200000.pdf`

---

## 19. Migration Summary

All schema changes will be in a single migration file: `supabase/migrations/YYYYMMDDHHMMSS_contracts_module.sql`

**Changes:**
1. Add new values to `contract_status` enum
2. Add new columns to `contracts` table
3. Create `contract_services` table + indexes + RLS
4. Create `contract_milestones` table + indexes + RLS
5. Create `service_brands` table + indexes + RLS
6. Create `contract-documents` storage bucket + policies

**Applied via:** `npx supabase db push` (per CLAUDE.md)

---

## 20. Module Boundary â€” What's NOT in Scope

To keep the module focused, these are explicitly deferred:

| Item | Reason | When |
|---|---|---|
| Contract â†’ Order integration | Contract visits don't create `orders` rows in v1 | Phase 2 |
| Email notifications for status changes | No email system built yet | Phase 2 |
| Contract renewal/extension flow | Active â†’ renewed with new dates | Phase 2 |
| PDF quotation export | Generate PDF from quotation data | Phase 2 |
| Customer portal (self-service approval) | Requires external auth | Phase 2 |
| Contract templates (pre-filled quotations) | Nice-to-have, not critical | Phase 2 |
| Site visit â†’ Contract data import | Auto-fill from site-visit order | Phase 2 |
| Weekend/holiday skip in visit generation | Requires company calendar config | Phase 2 |

