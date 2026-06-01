# Contracts Module — Design Specification

**Date:** 2026-06-01
**Status:** Draft → Approved
**Branch:** `feature/contract-module`

---

## Overview

The Contracts module manages the full lifecycle of service contracts — from quotation drafting through approval to active contract management with visit scheduling and payment tracking.

**Two workflows, one data model:**

1. **Contract Quotations** — draft → approval → customer sign-off
2. **Live Contracts** — visit scheduling, payment tracking, cancellation

Both share a single `contracts` table. A quotation becomes a live contract via status transition (`approved` → `active`).

**Key design decisions (from brainstorming):**

- Single `contracts` table for the entire lifecycle (no separate quotation table)
- Building tree stored as JSONB (contract-specific, read-as-whole)
- Services, milestones, payments, visits as proper relational tables
- Schedule assignment happens post-approval (not during quotation)
- Prices are snapshots frozen at creation time
- Contract visits stay in `contract_visits` only (no coupling to `orders` table in v1)

---

## 1. Database Schema

### 1.1 Enum Expansion

Replace the existing `contract_status` enum with a unified lifecycle enum:

```sql
-- Drop and recreate with full lifecycle
ALTER TYPE contract_status ADD VALUE IF NOT EXISTS 'draft';
ALTER TYPE contract_status ADD VALUE IF NOT EXISTS 'manager_review';
ALTER TYPE contract_status ADD VALUE IF NOT EXISTS 'customer_pending';
ALTER TYPE contract_status ADD VALUE IF NOT EXISTS 'approved';
ALTER TYPE contract_status ADD VALUE IF NOT EXISTS 'rejected';
ALTER TYPE contract_status ADD VALUE IF NOT EXISTS 'expired';
-- existing: active, expiring_soon, overdue_payment, cancelled, completed
```

Status lifecycle:
```
draft → manager_review → customer_pending → approved → active → expiring_soon → completed
                       ↘ rejected                    ↗          → overdue_payment
                         (→ draft on "Edit")                    → cancelled
                                            ↘ rejected
                                              (→ draft on "Edit")
         → expired (time-based)
```

Note: `sent` and `customer_pending` are merged into `customer_pending` since we have no email delivery tracking.

### 1.2 Modified `contracts` Table (New Columns)

| Column | Type | Purpose |
|---|---|---|
| `quotation_number` | `TEXT UNIQUE` | Display ID for quotation phase (CTR-Q-2026-001) |
| `source_type` | `TEXT DEFAULT 'direct'` | `'site_visit'` or `'direct'` |
| `building_tree` | `JSONB DEFAULT '{"nodes":[]}'` | Nested structure: Complex→Building→Floor→Area |
| `discount` | `NUMERIC DEFAULT 0` | Flat QAR discount applied to final subtotal |
| `payment_mode` | `TEXT DEFAULT 'fixed'` | `'fixed'`, `'milestone'`, `'completion'` |
| `payment_frequency` | `TEXT DEFAULT 'monthly'` | For fixed mode: `'monthly'`, `'quarterly'`, `'semi_annual'`, `'annual'` |
| `notes` | `TEXT` | General notes |
| `signed_doc_url` | `TEXT` | Storage path of uploaded signed contract |
| `terms_snapshot` | `JSONB` | Frozen T&C captured at approval time |
| `approved_by` | `UUID REFERENCES profiles(id)` | Manager who approved |
| `approved_at` | `TIMESTAMPTZ` | Approval timestamp |
| `sent_at` | `TIMESTAMPTZ` | When sent to customer |
| `created_by` | `UUID REFERENCES profiles(id)` | Agent who created |

### 1.3 New Table: `contract_services`

Line items for services attached to a contract (both building-tree services and general services).

```sql
CREATE TABLE contract_services (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id     UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  service_id      UUID REFERENCES services(id),
  building_node_id TEXT,              -- references node.id in building_tree JSONB (NULL for general services)
  service_name    TEXT NOT NULL,
  service_path    TEXT[] DEFAULT '{}', -- breadcrumb: ['Maintenance', 'AC', 'Split Unit Cleaning']
  brand_id        UUID REFERENCES brands(id),
  brand_name      TEXT,               -- snapshot
  reliability_factor NUMERIC DEFAULT 1.0,
  condition       TEXT,               -- 'good', 'fair', 'poor'
  condition_factor NUMERIC DEFAULT 1.0,
  frequency       TEXT NOT NULL DEFAULT 'monthly', -- daily/weekly/bi_weekly/monthly/quarterly/semi_annual/annual
  quantity        INT NOT NULL DEFAULT 1,
  base_price      NUMERIC NOT NULL DEFAULT 0,      -- snapshot from service tree at creation
  unit_price      NUMERIC NOT NULL DEFAULT 0,      -- base × reliability × condition (snapshot)
  total_price     NUMERIC NOT NULL DEFAULT 0,      -- unit_price × quantity
  divisions       TEXT[] DEFAULT '{}',
  note            TEXT,
  is_general      BOOLEAN DEFAULT false,           -- true = not attached to building tree
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contract_services_contract ON contract_services(contract_id);
ALTER TABLE contract_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read contract_services" ON contract_services FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert contract_services" ON contract_services FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update contract_services" ON contract_services FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete contract_services" ON contract_services FOR DELETE TO authenticated USING (true);
```

**Price snapshot rule:** `base_price`, `reliability_factor`, `condition_factor`, and `unit_price` are captured at the time the service is added to the contract. They do NOT update if the master service price changes later. This protects the contract's pricing integrity.

### 1.4 New Table: `contract_milestones`

For milestone-based payment mode.

```sql
CREATE TABLE contract_milestones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  percentage  NUMERIC NOT NULL DEFAULT 0,
  amount      NUMERIC NOT NULL DEFAULT 0,   -- computed: contract total × percentage / 100
  due_date    DATE,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contract_milestones_contract ON contract_milestones(contract_id);
ALTER TABLE contract_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read contract_milestones" ON contract_milestones FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert contract_milestones" ON contract_milestones FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update contract_milestones" ON contract_milestones FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete contract_milestones" ON contract_milestones FOR DELETE TO authenticated USING (true);
```

### 1.5 New Table: `service_brands`

Links brands to L1 service categories with reliability ratings.

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
ALTER TABLE service_brands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read service_brands" ON service_brands FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert service_brands" ON service_brands FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update service_brands" ON service_brands FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete service_brands" ON service_brands FOR DELETE TO authenticated USING (true);
```

### 1.6 Existing Tables (Used As-Is)

- **`contract_visits`** — id, contract_id, service_name, scheduled_date, team_id, completed, created_at
- **`contract_payments`** — id, contract_id, due_date, amount, status ('paid'/'pending'/'overdue'), created_at
- **`pricing_factors`** — category, label, factor, division_id (condition factors where category='condition')
- **`brands`** — name, name_ar, sort_order

### 1.7 Building Tree JSONB Structure

```json
{
  "nodes": [
    { "id": "n1", "name": "Tower A", "type": "complex", "parentId": null },
    { "id": "n2", "name": "Building 1", "type": "building", "parentId": "n1" },
    { "id": "n3", "name": "Floor 1", "type": "floor", "parentId": "n2" },
    { "id": "n4", "name": "Lobby", "type": "area", "parentId": "n3" }
  ]
}
```

Node types: `complex`, `building`, `floor`, `area`

**Application-level integrity rule:** Before removing a node from `building_tree`, the UI must check if any `contract_services` rows reference that node via `building_node_id`. If services exist on that node, block deletion and show a warning: "Remove or reassign X services before deleting this node."

---

## 2. Pages & Routes

### Route Structure

| Route | Page | Purpose |
|---|---|---|
| `/contracts` | ViewContracts | Live contracts list (active, expiring, overdue, etc.) |
| `/contracts/quotations` | ViewContractQuotations | Quotation list (draft, review, awaiting, etc.) |
| `/contracts/create-quotation` | CreateContractQuotation | Quotation creation form (9 sections) |
| `/contracts/detail/[contractId]` | ContractDetail | Single contract view + visit generator |

### 2.1 View Contract Quotations (`/contracts/quotations`)

**Header:**
- Page title: "Contracts"
- Pipeline Value badge: total value of filtered contracts in QAR (e.g., "Pipeline: 450K QAR")
- "+ New Contract" button → navigates to `/contracts/create-quotation`

**Counter chips** (clickable status filters):
| Chip | Status filter | Color |
|---|---|---|
| Drafts | `draft` | Muted gray |
| Review | `manager_review` | Warning yellow |
| Awaiting | `customer_pending` | Warning orange |
| Active | `active` | Success green |
| Expired | `expired` | Destructive red |

**Filter panel** (collapsible):
- Created From / Created To (date pickers)
- Contract # (text)
- Customer (text)
- Phone (text)
- Site Name (text)
- Agent (dropdown, auto-populated from profiles)

**Sort toggles:** Date ↑↓, Value ↑↓

**Contract Quotation Cards** (card list, not DataTable):
Each card displays:
- Status icon (color-coded square)
- Contract ID (e.g., CTR-Q-2026-001)
- Status badge
- Division badges (color-coded short names)
- "Signed" badge (if `has_signed_doc = true`, green with checkmark)
- Customer name, site name, phone, agent
- Services summary text
- Right side: Total value (QAR) + duration (e.g., "1yr"), monthly value, payment schedule, area count badge, visit count badge, date range

Click → navigates to `/contracts/detail/{id}`

### 2.2 Create Contract Quotation (`/contracts/create-quotation`)

Single scrollable page. Uses `react-hook-form` with section-level validation.

**Auto-save:** After initial "Save as Draft", background auto-save every 30 seconds via `useUpdateContract`. Visual indicator shows save status (Saved / Saving... / Unsaved changes).

**Header bar** (compact, single row, sticky):
- ← Back button
- Title: "Create Contract Quotation" (or "View" if not editable)
- "Contract" badge (primary)
- Source badge: "Site Visit" or "Direct"
- Division selector: clickable division badges to toggle divisions on/off
- Workflow Progress Bar: 4 pill badges — Draft → Manager Review → Customer Review → Approved
  - Completed steps: green ✓
  - Active step: primary
  - Future steps: muted
  - If rejected: red "Rejected" badge
- Status badge (right side, color-coded)

**Header action buttons** (conditional by status):
| Status | Buttons |
|---|---|
| `draft` or `rejected` | Save (outline) + Send (triggers confirmation dialog → sets to `manager_review`) |
| `manager_review` | Reject (red) + Approve (green) — manager actions. Approve → sets to `customer_pending` |
| `customer_pending` | Rejected (red) + Approved (green) — customer response recording |
| `rejected` | Edit — reverts to `draft` |
| `approved` | Signed contract upload banner appears |

**Send Confirmation Dialog:**
AlertDialog: "Send for Manager Approval?" / "This quotation will be sent to the contract manager for review." / Cancel | Send

**Signed Contract Upload Banner:**
Only appears when status = `approved`. Green background with FileCheck icon. "Contract Approved — Upload signed contract to complete." File input accepts .pdf, .doc, .docx, .png, .jpg. Shows uploaded filename.

#### Section 1: Customer Information
SectionCard with "Edit" button. 2-column grid:
- Customer name
- Phone (PhoneInputWithCode)
- Address (spans 2 columns)

#### Section 2: Contract Details
2-column grid:
- Start Date (calendar picker)
- End Date (calendar picker)
- Duration (computed, read-only, e.g., "12 months")
- Discount (QAR) — flat amount input

#### Section 3: Building Structure & Services
- "Edit Structure" button in header
- ContractBuildingTree component (recursive)
- Each node: name, type icon + badge, services count, color-coded left border
- "Add Service" button per node → opens AddContractServiceDialog
- Expand/collapse via click
- AreaServiceCard per service: path, brand badge, division badges, condition badge, frequency badge, qty × price = total

#### Section 4: General Services
Same service cards as Section 3 but `is_general = true`, not nested in tree. "Add General Service" button.

#### Section 5: Terms & Conditions (ContractTermsSection)
- "Expand All" / "Collapse All" buttons
- Division Terms: per selected division, shows division-level T&C text
- Service Terms: auto-collected from the service tree — walks contract_services, pulls T&C from master service records
- Indented by tree depth, breadcrumb path, expandable

#### Section 6: Visit Summary (NOT full schedule)
**Important:** During the quotation phase, this section only shows a read-only summary of visit counts per frequency — NOT the drag-and-drop scheduling grid. Team assignment happens post-approval on the Contract Detail page.

Display:
- Table: Service name | Frequency | Visits (computed from date range) | Est. duration
- Total visits count
- Warning banner: "Tentative visit counts based on contract dates. Team assignment happens after approval."

#### Section 7: General Notes
Free-text textarea (muted background)

#### Section 8: Payment Schedule (PaymentScheduleSection)
- **Mode selector:** Fixed | Milestone | Completion (3 toggle buttons)
- **Fixed mode:** Frequency selector (monthly/quarterly/semi-annual/annual) + blue card showing computed payment amount + total duration
- **Milestone mode:** "+ Add Milestone" button + progress bar (stacked % visualization with alternating colors) + validation (must = 100%) + editable table (name, %, amount [computed], due date, remove)
- **Completion mode:** Yellow card: "Full payment due upon contract completion" + total value + due date = end date

#### Section 9: Pricing Summary
Right-aligned:
- Subtotal (sum of all contract_services.total_price)
- Discount (flat QAR)
- Net Total
- Monthly equivalent

### 2.3 View Live Contracts (`/contracts`)

**Header:**
- Page title: "Contracts"
- Outstanding badge: total outstanding payments (sum of unpaid amounts)

**Counter chips:**
| Chip | Status | Color |
|---|---|---|
| Active | `active` | Success green |
| Expiring | `expiring_soon` | Warning yellow |
| Overdue | `overdue_payment` | Destructive red |
| Completed | `completed` | Primary blue |
| Cancelled | `cancelled` | Muted gray |

**Filter panel:** Contract #, Customer, Site, Agent

**Sort toggles:** End date ↑↓, Balance ↑↓, Visits ↑↓

**ContractCard** (expandable):
- **Collapsed:** Status icon | Contract ID + badges + customer + site + divisions | Visits progress bar (X/Y + remaining + next visit) | Payments progress bar (XK/YK + remaining + overdue count) | Monthly value + days remaining + date range | Chevron
- **Expanded** (3-column grid):
  - Col 1: Upcoming visits (next 6) — date badge + service name + team badge (green=assigned, yellow=unassigned) + "+X more" link
  - Col 2: Payment entries — date + amount + status badge (Paid/Overdue/Pending)
  - Col 3: Contract details — total value, schedule, areas, agent, phone, cancel reason (if cancelled)
  - "View Full" button → `/contracts/detail/{id}`
  - "Cancel" button → opens CancelContractDialog

**CancelContractDialog:**
AlertDialog (destructive). Title: "Cancel Contract {contractId}?" Warning text about irreversibility. Required cancellation reason textarea. "Keep Contract" | "Cancel Contract" (destructive). On confirm: status → cancelled, sets cancelled_date + cancel_reason, audit log entry.

### 2.4 Contract Detail (`/contracts/detail/[contractId]`)

**Header:**
- ← Back button (returns to quotations list or live contracts based on status)
- Contract ID (bold) + Status badge + Division badges
- Info row: Customer, Site, Value, Date range, Area count

**Split layout:**

**Left Panel (272px): Visit Generator**
- Service Name input (defaults to contract's servicesSummary)
- Frequency selector: Weekly | Bi-weekly | Monthly | Quarterly
- "Auto-Generate Visits" button (Wand2 icon): generates PendingVisit[] based on frequency × date range
- "Add Single Visit" button
- Pending visits count badge + "Create Tentative" button (green)
  - Creates `contract_visits` rows with status scheduled, team_id null
  - Updates contract's total_visits count
- Existing visits summary: "{N} existing visits" — "{X} completed · {Y} scheduled"

**Right Panel: Visit List (scrollable)**
- Header: "All Visits ({count})"
- Each row: Visit number badge (color by status) | Editable date (pending) or formatted date (existing) | Service name | Team dropdown (pending) or badge (existing) | Status badge (New/Done/Tentative) | Remove button (pending only)

**Post-Approval Schedule Assignment:**
When contract status is `active`, the Visit Generator panel gains the full ServiceScheduleSection with:
- Mini calendar (left, 260px) with color-coded day dots
- Team assignment grid (right) with draggable service chips + droppable team×hour cells
- Uses `@dnd-kit` following the same pattern as OrderFormPanel's TeamCalendarPanel
- "Push to Team Calendar" button per day

---

## 3. Components

### 3.1 File Structure

```
src/
├── app/(dashboard)/contracts/
│   ├── page.tsx                          # View Live Contracts
│   ├── quotations/page.tsx               # View Contract Quotations
│   ├── create-quotation/page.tsx         # Create Contract Quotation
│   └── detail/[contractId]/page.tsx      # Contract Detail
├── components/contracts/
│   ├── ContractQuotationCard.tsx          # Card for quotation list
│   ├── ContractCard.tsx                  # Expandable card for live contracts
│   ├── CancelContractDialog.tsx          # Cancellation dialog
│   ├── ContractBuildingTree.tsx          # Recursive building tree renderer
│   ├── AreaServiceCard.tsx               # Service card within tree/general
│   ├── ServiceScheduleSection.tsx        # Mini calendar + DnD team grid (post-approval)
│   ├── PaymentScheduleSection.tsx        # Fixed/milestone/completion modes
│   ├── ContractTermsSection.tsx          # Auto-collected T&C
│   ├── AddContractServiceDialog.tsx      # 2-step service picker with pricing
│   ├── ContractQuotationShared.tsx       # SectionCard, EditButton, InfoRow, FieldDisplay
│   ├── WorkflowProgressBar.tsx           # Draft→Review→Customer→Approved pills
│   └── VisitSummarySection.tsx           # Read-only visit count summary (quotation phase)
├── hooks/
│   ├── useContractQuotations.ts          # Quotation list + pipeline value
│   ├── useContracts.ts                   # Live contracts list + outstanding
│   ├── useContractDetail.ts             # Single contract + visits + payments + milestones
│   ├── useCreateContractQuotation.ts    # Create mutation
│   ├── useUpdateContract.ts             # Update mutation + status transitions
│   ├── useContractSchedule.ts           # Schedule assignment (post-approval)
│   └── useServiceBrands.ts             # Brand-reliability lookup for service
└── lib/
    └── contractStateMachine.ts          # Status transition validation
```

### 3.2 ContractBuildingTree

Recursive tree renderer for the building structure.

**Props:** `{ nodes: BuildingNode[], services: ContractService[], onAddService: (nodeId) => void, onRemoveNode: (nodeId) => void, editable: boolean }`

**Node types and icons:**
| Type | Icon | Border color |
|---|---|---|
| complex | Building2 | Blue |
| building | Layers | Indigo |
| floor | MapPinned | Violet |
| area | MapPinned | Purple |

**Behaviors:**
- Click node → expand/collapse children
- "Add Service" button → opens AddContractServiceDialog with the node's ID
- Services for each node rendered as AreaServiceCard children
- Deletion blocked if node has services (show warning toast)
- Add node: dropdown to select type, text input for name

### 3.3 AddContractServiceDialog (2-step)

**Step 1: Pick Service**
- N-level side-by-side cascading dropdowns (up to 3 columns)
- Filters by `tree_type = 'contract'` and selected divisions
- Each option shows: name, price (QAR), contract type badge
- Breadcrumb path below selections
- "Configure →" button (enabled on leaf selection)

**Step 2: Configure Service**
- Selected service summary card
- 6-field grid:
  1. **Frequency:** Daily / Weekly / Bi-Weekly / Monthly / Quarterly / Semi-Annual / Annual
  2. **Brand:** dropdown from `service_brands` for the L1 parent service. Shows "✓ Reliable" (green) or "⚠ Unreliable" (red) badge with factor value
  3. **Condition:** dropdown from `pricing_factors` where category='condition'. Shows factor value
  4. **Quantity:** number input
  5. **Unit Price (QAR):** auto-computed = base × reliability × condition. Read-only display
  6. **Division:** multi-select from available divisions

- **Price Breakdown Panel** (appears when brand or condition selected):
  Base Price → × Reliability Factor (X.X) → × Condition Factor (X.X) → Final Unit Price

- Total: qty × unitPrice = total QAR
- Note field (optional)
- "Add Service" button

### 3.4 PaymentScheduleSection

**Props:** `{ mode, frequency, milestones, contractTotal, startDate, endDate, onChange }`

**Fixed mode:**
- Frequency selector: Monthly / Quarterly / Semi-Annual / Annual
- Blue card: "Payment Amount ({frequency}): {amount} QAR" computed as `(total - discount) / numberOfPeriods`

**Milestone mode:**
- "+ Add Milestone" button
- Stacked progress bar showing milestone percentages with alternating colors
- Validation: "Total: X% — Must equal 100%" (red if ≠ 100%, green ✓ if = 100%)
- Editable table: #, Name (text), % (number), Amount (computed: total × %), Due Date (picker), Remove (button)

**Completion mode:**
- Yellow card: "Full payment due upon contract completion"
- Shows total value + due date (= contract end date)

### 3.5 ServiceScheduleSection (Post-Approval Only)

Only renders when contract status is `active` or later.

**Left panel (260px): Mini Calendar**
- Month navigation (← →)
- 7-column day grid with color-coded dots:
  - 🔵 Blue = has visits
  - 🟡 Yellow = partially assigned
  - 🟢 Green = all assigned
- Click day → loads services for that day in right panel
- Below: scrollable date list (first 20) with service count + ✓ if all assigned

**Right panel: Team Assignment Grid**
- Header: selected date + service count + assigned count + "Push to Team Calendar" button
- Unassigned services pool: draggable chips (service path, location, division badge, color-coded)
- Team grid: rows = teams (from useTeams, filtered by contract divisions), columns = hour slots (7AM–7PM)
- Drag chip → drop on team+hour to assign
- Assigned services appear as colored blocks with remove (X) button

**Date generation logic:**
Based on each service's frequency:
- Daily: addDays
- Weekly: addWeeks(1)
- Bi-Weekly: addWeeks(2)
- Monthly: addMonths(1)
- Quarterly: addMonths(3)
- Semi-Annual: addMonths(6)
- Annual: addYears(1)

Generates from contract start_date to end_date.

### 3.6 ContractTermsSection

- "Expand All" / "Collapse All" buttons
- **Division Terms:** collapsible items per selected division, shows division-level T&C text
- **Service Terms:** walks contract_services, finds all referenced service IDs, fetches their `terms_and_conditions` field from master services table
  - Indented by tree depth: L0 = bold primary border, L1 = lighter, L2 = lightest
  - Shows breadcrumb path
  - Expandable to show full terms text

---

## 4. Hooks & Data Flow

### 4.1 useContractQuotations

```typescript
useContractQuotations(filters?: {
  status?: string[]
  dateFrom?: string
  dateTo?: string
  contractNumber?: string
  customer?: string
  phone?: string
  siteName?: string
  agent?: string
  sortBy?: 'date' | 'value'
  sortDir?: 'asc' | 'desc'
})
```

Returns: `{ data: ContractQuotation[], pipelineValue: number, isLoading, isError }`

Query: `contracts` where status IN (`draft`, `manager_review`, `customer_pending`, `approved`, `rejected`, `expired`) + filters applied.

### 4.2 useContracts

```typescript
useContracts(filters?: {
  status?: string[]
  contractNumber?: string
  customer?: string
  site?: string
  agent?: string
  sortBy?: 'endDate' | 'balance' | 'visits'
  sortDir?: 'asc' | 'desc'
})
```

Returns: `{ data: LiveContract[], outstandingTotal: number, isLoading, isError }`

Query: `contracts` where status IN (`active`, `expiring_soon`, `overdue_payment`, `completed`, `cancelled`) + joins to `contract_visits` (counts) and `contract_payments` (sums).

### 4.3 useContractDetail

```typescript
useContractDetail(contractId: string)
```

Returns: `{ contract, services, visits, payments, milestones, isLoading }` + helper functions:
- `generateVisitDates(startDate, endDate, frequency)` → PendingVisit[]
- `createTentativeVisits(visits[])` — mutation inserting contract_visits
- `updateVisit(visitId, updates)` — mutation
- `deleteVisit(visitId)` — mutation

### 4.4 useCreateContractQuotation

Mutation that:
1. Generates quotation number: `CTR-Q-{YYYY}-{NNN}` (sequential)
2. Inserts `contracts` row with status = `draft`
3. Inserts `contract_services` rows
4. Inserts `contract_milestones` rows (if milestone mode)
5. Returns created contract ID

### 4.5 useUpdateContract

Mutation for updates + status transitions. Validates transitions via `contractStateMachine.ts`:

```typescript
const VALID_TRANSITIONS: Record<string, string[]> = {
  draft:            ['manager_review'],
  manager_review:   ['customer_pending', 'rejected'],
  customer_pending: ['approved', 'rejected'],
  approved:         ['active'],
  rejected:         ['draft'],
  active:           ['expiring_soon', 'overdue_payment', 'completed', 'cancelled'],
  expiring_soon:    ['active', 'completed', 'cancelled'],
  overdue_payment:  ['active', 'cancelled'],
}
```

### 4.6 useServiceBrands

```typescript
useServiceBrands(serviceId: string)
```

Returns: `{ brands: ServiceBrand[], isLoading }`

Query: `service_brands` joined with `brands` where `service_id = L1 parent of selected service`.

### 4.7 useContractSchedule

```typescript
useContractSchedule(contractId: string)
```

Returns: `{ scheduleDates, assignTeam, unassignTeam }`

- `scheduleDates`: generated visit dates with assignment status
- `assignTeam(visitDate, serviceId, teamId, timeSlot)` — mutation
- `unassignTeam(visitDate, serviceId)` — mutation

---

## 5. Navigation

Update `src/components/layout/nav-config.ts`:
- Remove `comingSoon: true` from Contracts entry
- Add nav groups:

```typescript
{
  label: 'Contracts',
  icon: 'FileText',
  permission: 'contracts.view',
  groups: [
    {
      items: [
        { label: 'Quotations', href: '/contracts/quotations', permission: 'contracts.quotations.view' },
        { label: 'Live Contracts', href: '/contracts', permission: 'contracts.view' },
        { label: 'New Contract', href: '/contracts/create-quotation', permission: 'contracts.create' },
      ]
    }
  ]
}
```

---

## 6. Pricing Rules

### Price Calculation
```
unit_price = base_price × reliability_factor × condition_factor
line_total = unit_price × quantity
subtotal   = SUM(all line_totals)
net_total  = subtotal - discount
monthly    = net_total / contract_duration_months
```

### Snapshot Policy
All pricing fields on `contract_services` are frozen at the time the service is added:
- `base_price` — copied from master service at creation
- `reliability_factor` — from `service_brands` at creation
- `condition_factor` — from `pricing_factors` at creation
- `unit_price` — computed once and stored

If the master service price changes later, existing contracts are not affected.

### Discount
`contracts.discount` is a flat QAR amount subtracted from the subtotal. Applied after all line items are summed.

---

## 7. Form Management

### Auto-Save Strategy
- On first "Save", create the contract as `draft` and get back the contract ID
- After that, auto-save every 30 seconds (debounced) via `useUpdateContract`
- Visual indicator in header: "Saved ✓" / "Saving..." / "Unsaved changes"
- Uses `react-hook-form` with `mode: 'onChange'` for section-level validation
- Each section validates independently; red border on sections with errors

### Validation Rules
| Field | Rule |
|---|---|
| Customer name | Required |
| Phone | Required, valid format |
| Start date | Required, not in past |
| End date | Required, after start date |
| Building tree | At least one node (if source = site_visit) |
| Services | At least one service |
| Payment milestones | Must sum to 100% (milestone mode) |
| Cancellation reason | Required (cancel dialog) |

---

## 8. Permissions

| Permission | Who | What |
|---|---|---|
| `contracts.view` | All authenticated | View live contracts |
| `contracts.quotations.view` | All authenticated | View quotations |
| `contracts.create` | Agents, Managers | Create new quotation |
| `contracts.approve` | Managers | Approve/reject quotation |
| `contracts.cancel` | Managers | Cancel active contract |
| `contracts.schedule` | Agents, Managers | Assign teams to visits |

---

## 9. Audit Logging

All status transitions and key actions logged via `logActivity()`:

| Action | Severity | Details |
|---|---|---|
| `contract_created` | info | Contract ID, customer, agent |
| `contract_sent_for_review` | info | Contract ID |
| `contract_approved` | info | Contract ID, approved_by |
| `contract_rejected` | warning | Contract ID, reason |
| `contract_activated` | info | Contract ID, signed_doc |
| `contract_cancelled` | critical | Contract ID, reason, cancelled_by |
| `visit_created` | info | Visit date, service, team |
| `payment_recorded` | info | Amount, date |
