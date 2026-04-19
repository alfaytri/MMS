# Purchase & Sales Expansion — Design Spec

**Date:** 2026-04-19 (revised)
**Status:** Approved — revised after checklist review
**Scope:** C.1 Purchase expansion + C.2 Sales expansion (single document, two sequential implementation headers)

---

## Background

The existing MMS Purchase & Sales module has the core PO and SO flows built. The following transactional nodes are missing from the UI despite their DB tables existing (or needing minor additions):

**Purchase gaps:** RFQ UI, standalone Receivals page, Supplier Bills with 3-way match, Purchase Payments with payment plans.
**Sales gaps:** Delivery Notes, Customer Invoices (auto-generated from SO), Customer Payments, Credit Notes.

This spec covers both gaps in a single document. Implementation proceeds as C.1 (Purchase) first, then C.2 (Sales).

---

## Decisions Log

| # | Question | Decision |
|---|---|---|
| 1 | RFQ → PO link | Manual reference only — no auto-convert. "Reference on PO" copies RFQ # into PO notes field. |
| 2 | Bill creation | Three-way match: PO ↔ Receival ↔ Bill. Discrepancies flagged per line; must be resolved or accepted-with-note before approval. |
| 3 | Nav structure | Keep "Purchase & Sales" combined dropdown; expand sub-routes with PURCHASE / SALES section labels. |
| 4 | Invoice generation | Auto-generated from Sale Order confirmation. Delivery completion triggers `doc_status → ready_to_send`. If SO edited → invoice auto-regenerates with `needs_refresh` banner. |
| 5 | Credit notes | Manually created by accountant, linked to original invoice. Returns are independent — no auto-link. |
| 6 | Payments | Direct partial payments write straight to `payments` table (no plan required). Payment plans (scheduled installments) only for amounts ≥ threshold (default QAR 10,000). |
| 7 | Schema approach | Approach C: extend `invoices` + `payments` tables with `direction` + split `doc_status`/`payment_status` columns + DB views (`customer_invoices`, `supplier_bills`). Typed hooks query views. |
| 8 | Inventory nav | Deferred — not in scope for this spec. |

---

## Part 1: Data Model

### 1.0 Pre-existing tables (no CREATE needed)

These tables already exist in the production DB. The spec adds columns or builds UI on top of them — no CREATE TABLE required:

| Table | Already has |
|---|---|
| `rfqs` | id, supplier_id, status (draft/sent/quote_received/closed), expected_reply_date, notes |
| `rfq_line_items` | id, rfq_id FK, item_name, qty, unit, notes |
| `rfq_quotes` | id, rfq_id FK, supplier_name, validity_date, notes |
| `credit_notes` | id, invoice_id FK, customer_id FK, status (draft/sent/applied), reason, total_amount |
| `receivals` | id, purchase_order_id FK, status (pending_approval/approved/rejected) |
| `receival_items` | id, receival_id FK, brand_variant_id FK, qty_received |
| `sale_deliveries` | id, sale_order_id FK, status (pending/in_progress/completed/cancelled) |
| `invoices` | id, customer_id FK, status (to be replaced — see §1.1), total_amount, source enum |
| `invoice_line_items` | id, invoice_id FK, item details |
| `payments` | id, invoice_id FK, supplier_id FK, amount, method, payment_date |

### 1.1 Migration — `invoices` table

Status is split into two independent columns so approval lifecycle and payment state don't collide.

```sql
ALTER TABLE invoices
  -- Direction: AR = customer invoice, AP = supplier bill
  ADD COLUMN IF NOT EXISTS direction          TEXT NOT NULL DEFAULT 'ar'
    CHECK (direction IN ('ar', 'ap')),

  -- FK links
  ADD COLUMN IF NOT EXISTS supplier_id        UUID REFERENCES suppliers(id),
  ADD COLUMN IF NOT EXISTS purchase_order_id  UUID REFERENCES purchase_orders(id),
  ADD COLUMN IF NOT EXISTS receival_id        UUID REFERENCES receivals(id),
  ADD COLUMN IF NOT EXISTS sale_order_id      UUID REFERENCES sale_orders(id),
  ADD COLUMN IF NOT EXISTS sale_delivery_id   UUID REFERENCES sale_deliveries(id),

  -- Auto-regen flag
  ADD COLUMN IF NOT EXISTS needs_refresh      BOOLEAN NOT NULL DEFAULT false,

  -- Document / workflow status (replaces the old single status column)
  --   AR values: draft | ready_to_send | sent
  --   AP values: draft | pending_approval | approved | rejected
  ADD COLUMN IF NOT EXISTS doc_status         TEXT NOT NULL DEFAULT 'draft'
    CHECK (doc_status IN (
      'draft', 'ready_to_send', 'sent',
      'pending_approval', 'approved', 'rejected'
    )),

  -- Payment status (shared by AR and AP)
  ADD COLUMN IF NOT EXISTS payment_status     TEXT NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'partially_paid', 'paid', 'overdue'));

-- Remove the old combined status column once data is migrated
-- (run AFTER backfilling doc_status + payment_status from old status values)
-- ALTER TABLE invoices DROP COLUMN status;
```

**Status mapping for existing rows (backfill):**

| Old `status` | New `doc_status` | New `payment_status` |
|---|---|---|
| draft | draft | unpaid |
| sent | sent | unpaid |
| partially_paid | sent | partially_paid |
| paid | sent | paid |
| overdue | sent | overdue |

### 1.2 Migration — `invoice_line_items`

```sql
ALTER TABLE invoice_line_items
  ADD COLUMN IF NOT EXISTS match_status TEXT
    CHECK (match_status IN (
      'matched', 'qty_discrepancy', 'price_discrepancy', 'unmatched', 'accepted_with_note'
    )),
  ADD COLUMN IF NOT EXISTS match_note TEXT;  -- required when match_status = 'accepted_with_note'
-- NULL for AR rows. Computed for AP rows at bill creation time.
```

### 1.3 Migration — `payments`

```sql
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'incoming'
    CHECK (direction IN ('incoming', 'outgoing'));
-- incoming = customer pays us (AR); outgoing = we pay supplier (AP)
```

### 1.4 Migration — `customers`

```sql
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS credit_balance NUMERIC(12,2) NOT NULL DEFAULT 0;
-- Stores excess credit when a credit note amount exceeds the invoice outstanding balance.
```

### 1.5 New tables

```sql
-- Credit note line items (one row per line being credited)
CREATE TABLE IF NOT EXISTS credit_note_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_id  UUID NOT NULL REFERENCES credit_notes(id) ON DELETE CASCADE,
  invoice_line_id UUID REFERENCES invoice_line_items(id),  -- source line (nullable for manual lines)
  description     TEXT NOT NULL,
  qty             NUMERIC(10,2) NOT NULL,
  unit_price      NUMERIC(12,2) NOT NULL,
  total           NUMERIC(12,2) GENERATED ALWAYS AS (qty * unit_price) STORED,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Scheduled payment plans (only for amounts >= PAYMENT_PLAN_THRESHOLD)
CREATE TABLE IF NOT EXISTS payment_plans (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  plan_type     TEXT NOT NULL CHECK (plan_type IN ('schedule', 'adhoc')),
  total_amount  NUMERIC(12,2) NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Individual installments within a plan
CREATE TABLE IF NOT EXISTS payment_installments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id      UUID NOT NULL REFERENCES payment_plans(id) ON DELETE CASCADE,
  due_date     DATE,                              -- NULL for adhoc type plans
  amount       NUMERIC(12,2) NOT NULL,
  paid_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'overdue', 'partial')),
  payment_id   UUID REFERENCES payments(id),     -- set when installment is settled
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);
```

### 1.6 DB Views

```sql
CREATE OR REPLACE VIEW customer_invoices AS
  SELECT * FROM invoices WHERE direction = 'ar';

CREATE OR REPLACE VIEW supplier_bills AS
  SELECT * FROM invoices WHERE direction = 'ap';
```

### 1.7 TypeScript types

```ts
// src/types/invoice.ts

export type DocStatus = 'draft' | 'ready_to_send' | 'sent' | 'pending_approval' | 'approved' | 'rejected'
export type PaymentStatus = 'unpaid' | 'partially_paid' | 'paid' | 'overdue'
export type MatchStatus = 'matched' | 'qty_discrepancy' | 'price_discrepancy' | 'unmatched' | 'accepted_with_note'

// AR invoice (direction = 'ar') — customer-facing
export type ArInvoice = Invoice & {
  direction: 'ar'
  customer_id: string
  sale_order_id: string
  sale_delivery_id: string | null
  doc_status: 'draft' | 'ready_to_send' | 'sent'
  payment_status: PaymentStatus
  needs_refresh: boolean
}

// AP bill (direction = 'ap') — supplier-facing
export type ApInvoice = Invoice & {
  direction: 'ap'
  supplier_id: string
  purchase_order_id: string
  receival_id: string | null
  doc_status: 'draft' | 'pending_approval' | 'approved' | 'rejected'
  payment_status: PaymentStatus
}
```

### 1.8 Three-way match computation

When a Bill (AP invoice) is created against a PO:

1. Load `po_line_items` for the PO → expected qty + agreed unit price per line.
2. Load `receival_items` for the linked approved receival → `qty_received` per line.
3. User enters bill lines (supplier's invoice qty + price per line).
4. For each bill line, compute `match_status` live as user types:
   - `unmatched` — no receival found for this PO line at all
   - `qty_discrepancy` — `bill.qty ≠ receival.qty_received`
   - `price_discrepancy` — `bill.unit_price ≠ po_line.unit_price`
   - `matched` — all three values agree
5. Accountant may click "Accept with note" on any flagged line → sets `match_status = 'accepted_with_note'`, requires `match_note` text.
6. Bill can only advance to `doc_status = 'pending_approval'` when every line is `matched` OR `accepted_with_note`. Any `unmatched` or unresolved discrepancy blocks submission.
7. Persist `match_status` + `match_note` on `invoice_line_items`.

### 1.9 Invoice auto-regeneration logic (app-side — invoice math only)

This function handles ONLY the invoice. Delivery creation lives in the SO confirmed handler (see `/sales/orders` section).

```
function syncInvoiceToSalesOrder(soId):
  invoice = find invoice WHERE sale_order_id = soId AND payment_status != 'paid'

  if invoice exists:
    if invoice.doc_status IN ('sent') OR invoice.payment_status IN ('partially_paid', 'overdue'):
      rebuild invoice_line_items from so_lines
      set invoice.needs_refresh = true
      // DO NOT change doc_status — accountant must review before resending

    if invoice.doc_status IN ('draft', 'ready_to_send') AND invoice.payment_status = 'unpaid':
      rebuild invoice_line_items silently
      keep needs_refresh = false  // not yet sent, no warning needed

  if invoice does not exist AND so.doc_status = 'confirmed':
    create invoice (direction='ar', doc_status='draft', payment_status='unpaid', sale_order_id)
    create invoice_line_items from so_lines
    // Delivery record is NOT created here — see SO confirmed handler
```

### 1.10 Payment routing rules

Two mutually exclusive paths:

**Path A — Direct payment** (always available regardless of amount):
- Creates one row in `payments` table directly.
- Supports both full payment and partial payment (any amount ≤ outstanding balance).
- No `payment_plans` or `payment_installments` rows created.
- Outstanding balance = `invoice.total_amount − SUM(payments.amount WHERE invoice_id = invoice.id)`.
- Invoice `payment_status` updates automatically: `partially_paid` while balance > 0, `paid` when balance = 0.

**Path B — Payment plan** (only offered when outstanding balance ≥ `PAYMENT_PLAN_THRESHOLD`, default QAR 10,000):
- Creates `payment_plans` row + one or more `payment_installments` rows.
- `plan_type = 'schedule'`: accountant defines due dates and amounts upfront.
- `plan_type = 'adhoc'`: installments have no due dates — added as payments arrive.
- Each installment, when settled, creates a `payments` row and sets `installment.payment_id`.
- Invoice `payment_status` updates as installments settle.

**UI rule**: for any invoice/bill, the payment dialog always shows "Pay now" (Path A). If outstanding ≥ threshold, a secondary "Set up payment plan" option appears. Both are available simultaneously — a partial direct payment can coexist with a plan on the same invoice.

---

## Part 2: Navigation

File to modify: `src/components/layout/nav-config.ts`

```
Purchase & Sales ▾
  ── PURCHASE ──────────────────────  ← non-clickable divider label
  RFQ                          /purchase/rfq           NEW
  Purchase Orders              /purchase/orders        exists
  Receivals                    /purchase/receivals     NEW (promoted from Warehouses)
  Bills                        /purchase/bills         NEW
  Purchase Payments            /purchase/payments      NEW
  ─────────────────────────────────   ← thin HR separator
  Approvals                    /purchase/approvals     exists
  Shipments                    /purchase/shipments     exists
  Landed Costs                 /purchase/landed-costs  exists
  Dead Stock                   /purchase/dead-stock    exists

  ── SALES ──────────────────────────  ← non-clickable divider label
  Sale Orders                  /sales/orders           exists
  Deliveries                   /sales/deliveries       NEW
  Invoices                     /sales/invoices         NEW
  Payments                     /sales/payments         NEW
  Credit Notes                 /sales/credit-notes     NEW
  Returns                      /sales/returns          exists
```

- **Remove** top-level "Invoices (coming soon)" placeholder from the main nav bar.
- Section labels (`── PURCHASE ──`, `── SALES ──`) rendered as non-clickable `<div>` elements inside the dropdown, styled as uppercase muted text with a bottom border.
- All 8 new routes listed above are accounted for.

---

## C.1 — Purchase Expansion

### Route: `/purchase/rfq`

**List page:**
- Table columns: RFQ #, Date, Supplier, Items (count), Status, Actions.
- Status chips: `draft` (grey) / `sent` (blue) / `quote_received` (amber) / `closed` (muted).
- Create RFQ button → opens `RfqFormDialog`.

**RfqFormDialog (create/edit):**
- Supplier picker (existing `useSuppliers` hook).
- Expected reply date (date picker, required).
- Line items editor: item name (free text), qty, unit, notes per line. Add/remove rows.
- Notes textarea.
- Save Draft / Mark as Sent actions.

**RFQ detail view:**
- Shows RFQ fields read-only.
- Quotes section: one card per supplier quote manually entered (supplier name, price per line, validity date, notes).
- "Reference on PO" button: navigates to `/purchase/orders/create` with `?rfq_ref=RFQ-[number]` query param, which pre-fills the PO's `notes` field with `"Ref: RFQ-[number]"`. No FK link.
- Status flow: `draft → sent → quote_received → closed`.

**Hooks:** `useRfqs`, `useCreateRfq`, `useUpdateRfq`, `useDeleteRfq` — query `rfqs` + `rfq_line_items` + `rfq_quotes`.

---

### Route: `/purchase/receivals`

Promoted from Warehouse Operations to its own top-level Purchase route.

**List page:**
- Table: Receival #, PO #, Supplier, Date, Items received (count), Status.
- Filter by status (`pending_approval / approved / rejected`).

**Create receival (ReceivalFormDialog):**
- Pick a PO with `doc_status = 'approved'` or PO `status = 'partially_received'`.
- System pre-fills expected lines from `po_line_items` (item name, ordered qty, unit).
- User enters `qty_received` per line (validated: ≤ ordered qty).
- Submit → `receival.status = 'pending_approval'`.

**Receival detail:**
- Side-by-side: Ordered qty (from PO) vs Received qty (entered).
- Approve / Reject actions (permission-gated).
- Approved receival: line quantities locked. Feeds 3-way match when a Bill is created against this PO.

**Hooks:** `useReceivals`, `useCreateReceival`, `useApproveReceival` — query `receivals` + `receival_items`.

---

### Route: `/purchase/bills`

**List page:**
- Table: Bill #, Supplier, PO #, Amount, Match Status, Approval Status, Payment Status.
- Match status chip: `all_matched` (green) / `has_discrepancies` (amber) / `has_unmatched` (red).
- Approval status: `draft / pending_approval / approved / rejected`.
- Payment status: `unpaid / partially_paid / paid`.

**Create bill (BillFormDialog — contains ThreeWayMatchTable):**
- Pick an approved PO that has at least one approved receival.
- **ThreeWayMatchTable** — 3-column view per line:
  - **Ordered** (read-only from PO): item, qty, unit price.
  - **Received** (read-only from receival): qty_received.
  - **Billed** (user enters): qty, unit price from supplier's physical invoice.
- `match_status` badge computed live per line as user types (see §1.8).
- Discrepancy resolution per flagged line: "Accept with note" toggle — requires `match_note` text.
- Submit blocked if any line remains `unmatched` without a note.

**Bill detail:**
- ThreeWayMatchTable rendered read-only.
- Approval action (`pending_approval → approved / rejected`).
- Payment summary: Total | Paid | Outstanding.
- "Pay Now" button → opens `SupplierPaymentDialog` pre-loaded with this bill.
- "Set up Payment Plan" button (visible if outstanding ≥ threshold) → opens `PaymentPlanDialog`.

**Hooks:** `useSupplierBills` (queries `supplier_bills` view), `useCreateBill`, `useApproveBill`.

---

### Route: `/purchase/payments`

**List page:**
- Table: Payment #, Supplier, Bill #, Amount, Method, Date, Type (Direct / Plan Installment).

**SupplierPaymentDialog:**
- Pick an approved bill → shows outstanding balance.
- Amount (≤ outstanding, default = full outstanding).
- Method: bank transfer / cash / cheque.
- Date + reference number.
- **Path A — Direct:** saves one `payments` row (`direction = 'outgoing'`). Available for any amount.
- **Path B — Plan:** shown only when outstanding ≥ `PAYMENT_PLAN_THRESHOLD`. Mutually exclusive toggle. Creates `payment_plans` + `payment_installments` rows instead.

**PaymentPlanDialog:**
- `plan_type` toggle: Schedule (with due dates) / Ad-hoc (no due dates).
- Schedule: add rows of (due_date, amount); total must equal outstanding.
- Ad-hoc: just sets up the plan record; installments are added as payments arrive.
- Each installment settled via "Mark paid" → creates `payments` row, sets `installment.payment_id`.

**Bill `payment_status` auto-update:**
- `unpaid` → `partially_paid` when SUM(paid) > 0 but < total.
- `partially_paid` → `paid` when SUM(paid) = total.

**Hooks:** `useSupplierPayments`, `useCreateSupplierPayment`, `usePaymentPlans`, `useCreatePaymentPlan`, `usePaymentInstallments`, `useSettleInstallment`.

---

## C.2 — Sales Expansion

### Route: `/sales/deliveries`

**List page:**
- Table: Delivery #, SO #, Customer, Date, Items (count), Status.
- Status chips: `pending` / `in_progress` / `completed` / `cancelled`.

**Delivery detail (DeliveryFormDialog):**
- Shows SO lines vs delivery lines side-by-side.
- User enters `qty_delivered` per line.
- **Partial delivery:** if any line's `qty_delivered < so_line.qty`, system auto-creates a follow-up `sale_deliveries` record for the remaining qty (status: `pending`).
- "Mark as completed" action:
  - Sets `sale_delivery.status = 'completed'`.
  - If linked invoice exists and `needs_refresh = false`: sets `invoice.doc_status = 'ready_to_send'`.
  - If `needs_refresh = true`: leaves `doc_status` as-is; banner on invoice tells accountant to review first.

**Hooks:** `useSaleDeliveries`, `useUpdateDelivery`, `useCompleteDelivery`.

---

### Route: `/sales/invoices`

**List page:**
- Table: Invoice #, Customer, SO #, Amount, Doc Status, Payment Status.
- Doc status chips: `draft` (grey) / `ready_to_send` (blue) / `sent` (green).
- Payment status chips: `unpaid` (grey) / `partially_paid` (amber) / `paid` (green) / `overdue` (red).
- Filters: doc status, payment status, customer, date range.

**Invoice detail (InvoiceDetail — read-only component):**
- Line items table: mirrors SO lines exactly. **No manual editing of lines.**
- `needs_refresh` banner (shown when `needs_refresh = true`):
  > *"This invoice was regenerated — the Sale Order was modified on [date]. Review the changes before resending."*
  > [Dismiss] button → clears `needs_refresh`, no other change.
- "Send to customer" button (shown when `doc_status = 'ready_to_send'`): sets `doc_status = 'sent'`.
- Payment summary bar: Total | Paid | Outstanding.
- "Pay Now" → `CustomerPaymentDialog` (Path A direct payment).
- "Set up Payment Plan" → `PaymentPlanDialog` (Path B, shown only when outstanding ≥ threshold).

**Hooks:** `useCustomerInvoices` (queries `customer_invoices` view), `useSendInvoice`, `useDismissRefresh`.

---

### Route: `/sales/payments`

**List page:**
- Table: Payment #, Customer, Invoice #, Amount, Method, Date, Type (Direct / Plan Installment).

**CustomerPaymentDialog:**
- Pick a `sent` or `overdue` invoice → shows outstanding balance.
- Amount + method (bank transfer / cash / cheque / card) + date + reference.
- **If a payment plan exists on the invoice:** show installment table; accountant selects which installment this payment settles, or marks as "Unallocated" (reduces balance but not tied to an installment).
- **No payment plan:** direct payment (Path A) — creates one `payments` row (`direction = 'incoming'`).
- Invoice `payment_status` auto-updates: `partially_paid` while balance > 0, `paid` when balance = 0.

**Hooks:** `useCustomerPayments`, `useCreateCustomerPayment`.

---

### Route: `/sales/credit-notes`

**List page:**
- Table: CN #, Customer, Invoice #, Amount, Status.
- Status chips: `draft` / `sent` / `applied`.

**CreditNoteFormDialog:**
- Pick an original invoice (any `doc_status` except `draft`).
- **Credit lines editor:** select invoice lines to credit; enter qty and unit price to credit per line (can be partial — e.g. credit 2 of 5 invoiced units). Each row stores in `credit_note_lines`.
- Reason field (free text, required).
- Save Draft / Send actions.

**Apply credit note:**
- "Apply to invoice" action (available on `sent` credit notes):
  - Reduces invoice outstanding balance by CN total.
  - If `CN total > outstanding balance`: excess stored in `customers.credit_balance` (to be applied to the customer's next invoice).
  - Sets `credit_note.status = 'applied'`.

**Hooks:** `useCreditNotes`, `useCreateCreditNote`, `useApplyCreditNote` — query `credit_notes` + `credit_note_lines`.

---

### `/sales/orders` — updated behavior

No new page. Two behavior changes added to the existing SO save/update flow:

**1. On SO `doc_status` change to `confirmed`:**
```
- Create sale_deliveries record (status='pending', sale_order_id=so.id)
- Call syncInvoiceToSalesOrder(so.id)  ← creates draft invoice + lines
```

**2. On any SO line/price/qty edit (for SOs in `confirmed` or later status):**
```
- Call syncInvoiceToSalesOrder(so.id)  ← rebuilds or flags invoice
```

The `syncInvoiceToSalesOrder` function is defined in §1.9 and handles ONLY the invoice. The delivery record is created once here, not inside the sync function.

---

## Part 3: Hooks Summary

| Hook file | Exports | Queries |
|---|---|---|
| `useRfqs.ts` | `useRfqs`, `useCreateRfq`, `useUpdateRfq`, `useDeleteRfq` | `rfqs`, `rfq_line_items`, `rfq_quotes` |
| `useReceivals.ts` | `useReceivals`, `useCreateReceival`, `useApproveReceival` | `receivals`, `receival_items` |
| `useSupplierBills.ts` | `useSupplierBills`, `useCreateBill`, `useApproveBill` | `supplier_bills` view, `invoice_line_items` |
| `useSupplierPayments.ts` | `useSupplierPayments`, `useCreateSupplierPayment` | `payments` (direction='outgoing') |
| `usePaymentPlans.ts` | `usePaymentPlans`, `useCreatePaymentPlan`, `usePaymentInstallments`, `useSettleInstallment` | `payment_plans`, `payment_installments` |
| `useSaleDeliveries.ts` | `useSaleDeliveries`, `useUpdateDelivery`, `useCompleteDelivery` | `sale_deliveries` |
| `useCustomerInvoices.ts` | `useCustomerInvoices`, `useSendInvoice`, `useDismissRefresh` | `customer_invoices` view, `invoice_line_items` |
| `useCustomerPayments.ts` | `useCustomerPayments`, `useCreateCustomerPayment` | `payments` (direction='incoming') |
| `useCreditNotes.ts` | `useCreditNotes`, `useCreateCreditNote`, `useApplyCreditNote` | `credit_notes`, `credit_note_lines` |

---

## Part 4: File Structure

```
src/
  app/(dashboard)/
    purchase/
      rfq/
        page.tsx                       NEW
      receivals/
        page.tsx                       NEW  (promoted from Warehouse Ops)
      bills/
        page.tsx                       NEW
      payments/
        page.tsx                       NEW
    sales/
      deliveries/
        page.tsx                       NEW
      invoices/
        page.tsx                       NEW
      payments/
        page.tsx                       NEW
      credit-notes/
        page.tsx                       NEW
  components/
    purchase/
      RfqFormDialog.tsx                NEW
      ReceivalFormDialog.tsx           NEW
      BillFormDialog.tsx               NEW  (contains ThreeWayMatchTable)
      ThreeWayMatchTable.tsx           NEW  (reusable — shows Ordered/Received/Billed per line)
      SupplierPaymentDialog.tsx        NEW
      PaymentPlanDialog.tsx            NEW  (shared by Purchase + Sales)
    sales/
      DeliveryFormDialog.tsx           NEW
      InvoiceDetail.tsx                NEW  (read-only, needs_refresh banner)
      CustomerPaymentDialog.tsx        NEW
      CreditNoteFormDialog.tsx         NEW
  hooks/
    useRfqs.ts                         NEW
    useReceivals.ts                    NEW  (extracted from useWarehouseOperations)
    useSupplierBills.ts                NEW
    useSupplierPayments.ts             NEW
    usePaymentPlans.ts                 NEW
    useSaleDeliveries.ts               NEW
    useCustomerInvoices.ts             NEW
    useCustomerPayments.ts             NEW
    useCreditNotes.ts                  NEW
  types/
    invoice.ts                         NEW  (ArInvoice, ApInvoice, DocStatus, PaymentStatus, MatchStatus)
  lib/
    invoiceSync.ts                     NEW  (syncInvoiceToSalesOrder function — §1.9)
supabase/
  migrations/
    20260419000000_purchase_sales_expansion.sql   NEW
```

---

## Checklist Status

| # | Item | Status |
|---|---|---|
| 1.1 | rfqs, rfq_line_items, credit_notes noted as pre-existing | ✅ §1.0 |
| 1.2 | credit_note_lines CREATE TABLE | ✅ §1.5 |
| 1.3 | invoices column additions (direction, FKs, needs_refresh) | ✅ §1.1 |
| 1.4 | Status split: doc_status + payment_status | ✅ §1.1 |
| 1.5 | match_status enum + match_note on invoice_line_items | ✅ §1.2 |
| 1.6 | payments.direction column | ✅ §1.3 |
| 1.7 | payment_plans + payment_installments tables | ✅ §1.5 |
| 1.8 | customers.credit_balance column | ✅ §1.4 |
| 1.9 | customer_invoices + supplier_bills views | ✅ §1.6 |
| 1.10 | TypeScript types (ArInvoice, ApInvoice, etc.) | ✅ §1.7 |
| 2.1 | Auto-regen: delivery creation removed from sync function | ✅ §1.9 |
| 2.2 | needs_refresh = true on SO edit after sent | ✅ §1.9 |
| 3.1 | "Invoices (coming soon)" removed from top nav | ✅ Part 2 |
| 3.2 | Non-clickable PURCHASE / SALES dividers | ✅ Part 2 |
| 3.3 | All 8 new routes in nav | ✅ Part 2 |
| 4.1 | RFQ: list, dialog, detail, "Reference on PO" | ✅ C.1 |
| 4.2 | Receivals: pre-fill from PO, qty_received logging | ✅ C.1 |
| 4.3 | Bills: ThreeWayMatchTable, Accept-with-note toggle | ✅ C.1 |
| 4.4 | Ad-hoc payments bypass payment_plans (Path A direct) | ✅ §1.10 + C.1 |
| 5.1 | Deliveries: partial delivery auto-creates follow-up record | ✅ C.2 |
| 5.2 | Invoices: read-only, needs_refresh banner + Dismiss | ✅ C.2 |
| 5.3 | Sales payments: handles plan installment allocation | ✅ C.2 |
| 5.4 | Credit notes: excess → customers.credit_balance | ✅ C.2 |
| 6.1 | All 9 hook sets listed | ✅ Part 3 |
| 6.2 | File tree: ThreeWayMatchTable, hooks, types, migration | ✅ Part 4 |

---

## Out of Scope (deferred)

- Inventory module navigation restructure (separate spec).
- Service catalog module (separate spec).
- RFQ supplier portal / email sending integration.
- Automated overdue reminders (email/SMS for installments).
- QuickBooks / accounting sync for bills and invoices.
- AP/AR aging reports and dashboards.
- Multi-currency payments (current system uses single currency).
