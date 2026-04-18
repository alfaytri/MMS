# Purchase & Sales Expansion — Design Spec

**Date:** 2026-04-18
**Status:** Approved
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
| 4 | Invoice generation | Auto-generated from Sale Order confirmation → Delivery completion triggers `ready_to_send`. If SO edited → invoice auto-regenerates with `needs_refresh` banner. |
| 5 | Credit notes | Manually created by accountant, linked to original invoice. Returns are independent — no auto-link. |
| 6 | Payments | Partial payments on both sides. Amount ≥ threshold (configurable, default QAR 10,000): structured installment schedule OR ad-hoc partial. Amount < threshold: full payment only. |
| 7 | Schema approach | Approach C: extend `invoices` + `payments` tables with `direction` column + DB views (`customer_invoices`, `supplier_bills`). Typed hooks query views. |
| 8 | Inventory nav | Deferred — not in scope for this spec. |

---

## Part 1: Data Model

### 1.1 Migration — `invoices` table additions

```sql
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS direction         TEXT NOT NULL DEFAULT 'ar'
    CHECK (direction IN ('ar', 'ap')),
  ADD COLUMN IF NOT EXISTS supplier_id       UUID REFERENCES suppliers(id),
  ADD COLUMN IF NOT EXISTS purchase_order_id UUID REFERENCES purchase_orders(id),
  ADD COLUMN IF NOT EXISTS receival_id       UUID REFERENCES receivals(id),
  ADD COLUMN IF NOT EXISTS sale_order_id     UUID REFERENCES sale_orders(id),
  ADD COLUMN IF NOT EXISTS sale_delivery_id  UUID REFERENCES sale_deliveries(id),
  ADD COLUMN IF NOT EXISTS needs_refresh     BOOLEAN NOT NULL DEFAULT false;

-- customers.credit_balance: stores excess credit when a credit note > outstanding balance
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS credit_balance NUMERIC(12,2) NOT NULL DEFAULT 0;
```

### 1.2 Migration — `invoice_line_items` table addition

```sql
ALTER TABLE invoice_line_items
  ADD COLUMN match_status TEXT
    CHECK (match_status IN (
      'matched', 'qty_discrepancy', 'price_discrepancy', 'unmatched', 'accepted_with_note'
    ));
-- NULL for AR rows; computed for AP rows at bill creation time.
-- 'accepted_with_note' = discrepancy acknowledged by accountant with a written reason.
```

### 1.3 Migration — `payments` table addition

```sql
ALTER TABLE payments
  ADD COLUMN direction TEXT NOT NULL DEFAULT 'incoming'
    CHECK (direction IN ('incoming', 'outgoing'));
-- incoming = customer pays us (AR); outgoing = we pay supplier (AP)
```

### 1.4 New tables

```sql
CREATE TABLE payment_plans (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id   UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  plan_type    TEXT NOT NULL CHECK (plan_type IN ('schedule', 'adhoc')),
  total_amount NUMERIC(12,2) NOT NULL,
  status       TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE payment_installments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id      UUID NOT NULL REFERENCES payment_plans(id) ON DELETE CASCADE,
  due_date     DATE,                            -- NULL for adhoc installments
  amount       NUMERIC(12,2) NOT NULL,
  paid_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'overdue', 'partial')),
  payment_id   UUID REFERENCES payments(id),   -- set when installment is settled
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);
```

### 1.5 DB Views

```sql
CREATE OR REPLACE VIEW customer_invoices AS
  SELECT * FROM invoices WHERE direction = 'ar';

CREATE OR REPLACE VIEW supplier_bills AS
  SELECT * FROM invoices WHERE direction = 'ap';
```

### 1.6 TypeScript types

```ts
// src/types/invoice.ts

export type ArInvoice = Invoice & {
  direction: 'ar'
  customer_id: string
  sale_order_id: string
  sale_delivery_id: string | null
  needs_refresh: boolean
}

export type ApInvoice = Invoice & {
  direction: 'ap'
  supplier_id: string
  purchase_order_id: string
  receival_id: string | null
}

export type MatchStatus =
  | 'matched'
  | 'qty_discrepancy'
  | 'price_discrepancy'
  | 'unmatched'
  | 'accepted_with_note'
```

### 1.7 Three-way match computation

When a Bill (AP invoice) is created against a PO:

1. Load `po_line_items` for the PO → expected qty + agreed price per item.
2. Load `receival_items` for the linked receival → actual received qty per item.
3. User enters bill lines (supplier's invoice qty + price).
4. For each bill line, compute `match_status`:
   - `unmatched` if no receival found
   - `qty_discrepancy` if `bill.qty ≠ receival.qty_received`
   - `price_discrepancy` if `bill.unit_price ≠ po_line.unit_price`
   - `matched` if all agree
5. Persist `match_status` on `invoice_line_items`.
6. Bill status can only advance to `pending_approval` if all lines are `matched` OR accountant marks each discrepancy as `accepted_with_note`.

### 1.8 Invoice auto-regeneration logic (app-side)

```
On SO save (create or update):
  1. Find invoice WHERE sale_order_id = so.id AND status != 'paid'
  2. If found AND status IN ('sent', 'partially_paid', 'overdue'):
       - Rebuild invoice_line_items from so_lines
       - Set invoice.needs_refresh = true
       - DO NOT change status (accountant reviews before resending)
  3. If found AND status IN ('draft', 'ready_to_send'):
       - Rebuild invoice_line_items silently
       - Keep needs_refresh = false (not yet sent, no warning needed)
  4. If not found AND so.status = 'confirmed':
       - Create draft invoice (direction='ar', status='draft')
       - Create linked sale_deliveries record (status='pending')
```

---

## Part 2: Navigation

File to modify: `src/components/layout/nav-config.ts`

```
Purchase & Sales ▾
  ── PURCHASE ──────────────────────
  RFQ                          /purchase/rfq           NEW
  Purchase Orders              /purchase/orders        exists
  Receivals                    /purchase/receivals     NEW (promoted from Warehouses)
  Bills                        /purchase/bills         NEW
  Purchase Payments            /purchase/payments      NEW
  ─────────────────────────────────
  Approvals                    /purchase/approvals     exists
  Shipments                    /purchase/shipments     exists
  Landed Costs                 /purchase/landed-costs  exists
  Dead Stock                   /purchase/dead-stock    exists

  ── SALES ──────────────────────────
  Sale Orders                  /sales/orders           exists
  Deliveries                   /sales/deliveries       NEW
  Invoices                     /sales/invoices         NEW
  Payments                     /sales/payments         NEW
  Credit Notes                 /sales/credit-notes     NEW
  Returns                      /sales/returns          exists
```

- Remove top-level "Invoices (coming soon)" placeholder from nav.
- Section labels (`── PURCHASE ──`, `── SALES ──`) are non-clickable `<div>` dividers inside the dropdown.

---

## C.1 — Purchase Expansion

### Route: `/purchase/rfq`

**List page:**
- Table columns: RFQ #, Date, Supplier, Items (count), Status, Actions.
- Status chips: `draft` (grey) / `sent` (blue) / `quote_received` (amber) / `closed` (muted).
- Create RFQ button → opens form dialog.

**Create/Edit dialog:**
- Supplier picker (existing `useSuppliers` hook).
- Line items table: item name (free text), qty, unit, notes per line. Add/remove rows.
- Expected reply date field.
- Notes textarea.
- Actions: Save Draft / Mark as Sent.

**Detail view (drawer or page):**
- Shows RFQ details read-only.
- Quotes section: one card per supplier quote received (manually entered — supplier name, price per line, validity date, notes).
- "Reference on PO" button: opens Create PO with `notes` pre-filled as `"Ref: RFQ-[number]"`. No hard FK link.
- Status flow: `draft → sent → quote_received → closed`.

**Hooks:** `useRfqs`, `useCreateRfq`, `useUpdateRfq`, `useDeleteRfq` — query `rfqs` table.

---

### Route: `/purchase/receivals` (promoted)

**List page:**
- Table: Receival #, PO #, Supplier, Date, Items received, Status.
- Filter by status.

**Create receival:**
- Pick a PO (status: `approved` or `partially_received`).
- System pre-fills expected lines from `po_line_items`.
- User enters `qty_received` per line (≤ ordered qty).
- Submit → status `pending_approval`.

**Receival detail:**
- Shows PO lines vs received qty side-by-side.
- Approve / Reject actions (for users with approval permission).
- Approved receival: lines locked. Feeds 3-way match when linked bill is created.

**Hooks:** `useReceivals`, `useCreateReceival`, `useApproveReceival` — query `receivals` + `receival_items`.

---

### Route: `/purchase/bills`

**List page:**
- Table: Bill #, Supplier, PO #, Amount, Match Status (overall), Payment Status.
- Match status chip: `all_matched` (green) / `has_discrepancies` (amber) / `unmatched` (red).
- Payment status: `draft / pending_approval / approved / partially_paid / paid`.

**Create bill:**
- Pick an approved PO with at least one approved receival.
- Side-by-side 3-column table per line:
  - **Ordered** (from PO): item, qty, unit price.
  - **Received** (from receival): qty_received.
  - **Billed** (user enters): qty, unit price from supplier invoice.
- `match_status` badge computed live per line as user types.
- Discrepancy resolution: each flagged line shows "Accept with note" toggle + note field.
- Bill cannot be submitted if any line has unresolved `unmatched` status.

**Bill detail:**
- Shows 3-way match table read-only.
- Approval action (pending_approval → approved).
- Payment status + outstanding balance.
- "Add Payment" button → goes to `/purchase/payments/create?bill=[id]`.

**Hooks:** `useSupplierBills` (queries `supplier_bills` view), `useCreateBill`, `useApproveBill`.

---

### Route: `/purchase/payments`

**List page:**
- Table: Payment #, Supplier, Bill #, Amount, Method, Date, Status.

**Create payment:**
- Pick an approved bill → shows outstanding balance.
- Amount field + method (bank transfer / cash / cheque) + date + reference number.
- If `amount ≥ threshold` (configurable env var `PAYMENT_PLAN_THRESHOLD`, default 10000):
  - Toggle: "Pay in full" vs "Set up payment plan".
  - Schedule plan: add rows of (due_date, amount) until total = bill amount.
  - Ad-hoc plan: no dates needed; installments recorded as payments arrive.
- If `amount < threshold`: full payment only (no plan option shown).
- On save: creates `payment_plans` + `payment_installments` records (or single payment if no plan).

**Payment plan detail (on bill page):**
- Installment schedule table: Due Date, Amount, Paid Amount, Status.
- "Mark paid" per installment → links to a payment record.
- Bill status auto-updates as installments settle.

**Hooks:** `useSupplierPayments`, `useCreateSupplierPayment`, `usePaymentPlans`, `usePaymentInstallments`.

---

## C.2 — Sales Expansion

### Route: `/sales/deliveries`

**List page:**
- Table: Delivery #, SO #, Customer, Date, Items, Status.
- Status: `pending / in_progress / completed / cancelled`.

**Delivery detail:**
- Shows SO lines vs delivery lines. User enters `qty_delivered` per line.
- Partial delivery: remaining qty creates a follow-up delivery record automatically.
- "Mark as completed" → triggers invoice `status` to `ready_to_send` (if invoice exists and `needs_refresh = false`).

**Hooks:** `useSaleDeliveries`, `useUpdateDelivery`, `useCompleteDelivery`.

---

### Route: `/sales/invoices`

**List page:**
- Table: Invoice #, Customer, SO #, Amount, Payment Status.
- Status chips: `draft / ready_to_send / sent / partially_paid / paid / overdue`.
- Filter by status + customer + date range.

**Invoice detail:**
- Read-only line items (always mirrors SO — no manual editing).
- `needs_refresh` banner: *"This invoice was regenerated — Sale Order was modified on [date]. Review before resending."* + Dismiss button (clears `needs_refresh`).
- "Send to customer" → `status: sent`.
- Payment summary: Total | Paid | Outstanding.
- "Create Payment Plan" button (if outstanding ≥ threshold): define installment schedule.
- "Record Payment" button: ad-hoc partial or full payment.

**Hooks:** `useCustomerInvoices` (queries `customer_invoices` view), `useRegenerateInvoice`, `useSendInvoice`.

---

### Route: `/sales/payments`

**List page:**
- Table: Payment #, Customer, Invoice #, Amount, Method, Date.

**Create payment:**
- Pick a sent/overdue invoice → shows outstanding balance.
- Amount, method (bank transfer / cash / cheque / card), date, reference.
- If payment plan exists on invoice: show installment schedule; select which installment this settles (or "unallocated").
- Invoice status auto-updates: `partially_paid` while balance > 0; `paid` when balance = 0.

**Hooks:** `useCustomerPayments`, `useCreateCustomerPayment`.

---

### Route: `/sales/credit-notes`

**List page:**
- Table: CN #, Customer, Invoice #, Amount, Status.
- Status: `draft / sent / applied`.

**Create credit note:**
- Pick an original invoice (any status except `draft`).
- Credit lines: select invoice lines to credit, enter qty and unit price to credit (can be partial).
- Reason field (free text, required).
- On "Apply to invoice": reduces invoice outstanding balance by CN amount.
  - If credit > outstanding balance → excess stored as `customer.credit_balance` (subtract from next invoice).

**Hooks:** `useCreditNotes`, `useCreateCreditNote`, `useApplyCreditNote`.

---

### `/sales/orders` — updated behavior

No new page. Two code changes:

1. **On SO status change to `confirmed`:**
   - Create `sale_deliveries` record (`status: 'pending'`, `sale_order_id`).
   - Create `invoices` record (`direction: 'ar'`, `status: 'draft'`, `sale_order_id`, lines from SO).

2. **On SO line/price edit (any SO in `confirmed` or later):**
   - Find linked invoice.
   - Rebuild `invoice_line_items` from SO lines.
   - If `invoice.status` ∈ `{sent, partially_paid, overdue}`: set `needs_refresh = true`.
   - If `invoice.status` ∈ `{draft, ready_to_send}`: rebuild silently, keep `needs_refresh = false`.

---

## Part 3: Hooks Summary

| Hook file | Exports | Queries |
|---|---|---|
| `useRfqs.ts` | `useRfqs`, `useCreateRfq`, `useUpdateRfq`, `useDeleteRfq` | `rfqs`, `rfq_line_items` |
| `useReceivals.ts` | `useReceivals`, `useCreateReceival`, `useApproveReceival` | `receivals`, `receival_items` |
| `useSupplierBills.ts` | `useSupplierBills`, `useCreateBill`, `useApproveBill` | `supplier_bills` view + `invoice_line_items` |
| `useSupplierPayments.ts` | `useSupplierPayments`, `useCreateSupplierPayment` | `payments` (direction='outgoing') |
| `usePaymentPlans.ts` | `usePaymentPlans`, `useCreatePaymentPlan`, `usePaymentInstallments`, `useSettleInstallment` | `payment_plans`, `payment_installments` |
| `useSaleDeliveries.ts` | `useSaleDeliveries`, `useUpdateDelivery`, `useCompleteDelivery` | `sale_deliveries` |
| `useCustomerInvoices.ts` | `useCustomerInvoices`, `useRegenerateInvoice`, `useSendInvoice` | `customer_invoices` view + `invoice_line_items` |
| `useCustomerPayments.ts` | `useCustomerPayments`, `useCreateCustomerPayment` | `payments` (direction='incoming') |
| `useCreditNotes.ts` | `useCreditNotes`, `useCreateCreditNote`, `useApplyCreditNote` | `credit_notes` |

---

## Part 4: File Structure

```
src/
  app/(dashboard)/
    purchase/
      rfq/
        page.tsx                   NEW
      receivals/
        page.tsx                   NEW (promoted)
      bills/
        page.tsx                   NEW
      payments/
        page.tsx                   NEW
    sales/
      deliveries/
        page.tsx                   NEW
      invoices/
        page.tsx                   NEW
      payments/
        page.tsx                   NEW
      credit-notes/
        page.tsx                   NEW
  components/
    purchase/
      RfqFormDialog.tsx            NEW
      ReceivalFormDialog.tsx       NEW
      BillFormDialog.tsx           NEW — contains 3-way match table
      ThreeWayMatchTable.tsx       NEW — reusable match UI component
      SupplierPaymentDialog.tsx    NEW
      PaymentPlanDialog.tsx        NEW
    sales/
      DeliveryFormDialog.tsx       NEW
      InvoiceDetail.tsx            NEW — read-only invoice with regen banner
      CustomerPaymentDialog.tsx    NEW
      CreditNoteFormDialog.tsx     NEW
  hooks/
    useRfqs.ts                     NEW
    useReceivals.ts                NEW (currently in useWarehouseOperations)
    useSupplierBills.ts            NEW
    useSupplierPayments.ts         NEW
    usePaymentPlans.ts             NEW
    useSaleDeliveries.ts           NEW
    useCustomerInvoices.ts         NEW
    useCustomerPayments.ts         NEW
    useCreditNotes.ts              NEW
  types/
    invoice.ts                     NEW — ArInvoice, ApInvoice, MatchStatus types
supabase/
  migrations/
    20260418XXXXXX_purchase_sales_expansion.sql   NEW
```

---

## Out of Scope (deferred)

- Inventory module navigation restructure (deferred, separate spec).
- Service catalog module (separate spec).
- RFQ supplier portal / email sending integration.
- Automated overdue reminders (email/SMS for installments).
- QuickBooks / accounting sync for bills and invoices.
- AP/AR aging reports and dashboards.
- Multi-currency payments (current system uses single currency).
