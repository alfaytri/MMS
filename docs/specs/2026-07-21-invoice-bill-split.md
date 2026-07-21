# Invoice / Bill Table Split — Specification & Plan

**Date:** 2026-07-21
**Branch:** `feature/purchase-warehouse-core`
**Status:** DRAFT — awaiting review

---

## 1. Why Split?

The current `invoices` table holds **both** AR (Accounts Receivable = customer invoices) and AP (Accounts Payable = supplier bills) in a single table, distinguished by a `direction` column (`'ar'` | `'ap'`). This was expedient for v1, but the roadmap includes:

- **Contract invoices** (recurring AR from contracts)
- **Subscription invoices** (recurring AR from subscriptions)
- **Normal order invoices** (existing AR from sale orders)
- Potentially different AP sources

Keeping AR and AP together means every future source type adds nullable columns for both sides, the table grows bloated, and queries must always filter by `direction`. Splitting now gives each side a clean schema that can evolve independently.

---

## 2. Decisions (confirmed by user)

| Decision | Choice |
|---|---|
| Bill numbering format | `SUP-INV-NNNNN` (replaces current `{PO}-B{N}` format) |
| Source enum | Separate `bill_source` enum for bills (not shared with `invoice_source`) |
| `qb_synced` on bills | Skip — add later if QuickBooks AP sync is needed |
| Credit notes / debit notes | **Split** into separate `credit_notes` (AR) and `debit_notes` (AP) tables |

---

## 3. Current State — Single `invoices` Table

### 3.1 Column Classification

| Column | Type | AR? | AP? | Notes |
|---|---|---|---|---|
| `id` | uuid PK | Y | Y | |
| `invoice_id` | text (display number) | Y | Y | "INV-00001" for AR, "{PO}-B{N}" for AP |
| `direction` | enum `'ar'`/`'ap'` | — | — | **DROP** after split |
| `invoice_type` | enum `'cash'`/`'credit'` | Y | Y | |
| `source` | enum `'order'`/`'contract'`/`'quotation'` | Y | Y | Only `'order'` used today |
| `source_id` | text | Y | Y | |
| `source_label` | text | Y | Y | |
| `status` | enum (draft/void/cancelled) | Y | Y | Lifecycle status |
| `doc_status` | enum (draft/sent/approved/…) | Y | Y | Document workflow |
| `payment_status` | enum | Y | Y | |
| `customer_id` | uuid FK → customers | Y | — | Always NULL for AP |
| `supplier_id` | uuid FK → suppliers | — | Y | Always NULL for AR |
| `sale_order_id` | uuid FK → sale_orders | Y | — | |
| `sale_delivery_id` | uuid FK → sale_deliveries | Y | — | |
| `purchase_order_id` | uuid FK → purchase_orders | — | Y | |
| `receival_id` | uuid FK → receivals | — | Y | |
| `phone_id` | uuid FK → customer_phones | Y | — | Groups invoices by phone line |
| `division` | text | — | — | **DEAD** — never populated, replaced by `division_id` |
| `division_id` | uuid FK → company_divisions | Y | Y | |
| `issued_date` | date | Y | Y | |
| `due_date` | date | Y | Y | |
| `subtotal` | numeric | Y | Y | |
| `tax` | numeric | Y | Y | |
| `discount_amount` | numeric | Y | Y | |
| `discount_label` | text | Y | Y | |
| `total_amount` | numeric | Y | Y | |
| `paid_amount` | numeric | Y | Y | |
| `manually_paid` | boolean | Y | Y | |
| `needs_refresh` | boolean | Y | Y | |
| `agent_name` | text | Y | — | Sales agent; displayed on AR invoices page |
| `notes` | text | Y | Y | |
| `pdf_url` | text | Y | Y | |
| `qb_synced` | boolean | Y | — | QuickBooks sync; only used on AR invoices page |
| `dibsy_payment_id` | text | Y | — | Online payment gateway (AR only) |
| `dibsy_checkout_url` | text | Y | — | Online payment link (AR only) |
| `created_at` | timestamptz | Y | Y | |
| `updated_at` | timestamptz | Y | Y | |

### 3.2 Columns to DROP Entirely

| Column | Reason |
|---|---|
| `division` (text) | Legacy; never populated. `division_id` (uuid FK) is the replacement. |
| `direction` | Implicit after split — each table IS a direction. |

---

## 4. Proposed Schema

### 4.1 `invoices` Table (AR only — rebuilt)

```sql
CREATE TABLE public.invoices (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id          text NOT NULL,            -- INV-00001
  invoice_type        invoice_type NOT NULL DEFAULT 'credit',
  source              invoice_source NOT NULL,  -- 'order','contract','quotation'
  source_id           text NOT NULL,
  source_label        text,
  status              invoice_status,
  doc_status          invoice_doc_status NOT NULL,
  payment_status      invoice_payment_status NOT NULL DEFAULT 'unpaid',
  customer_id         uuid REFERENCES customers(id),
  sale_order_id       uuid REFERENCES sale_orders(id),
  sale_delivery_id    uuid REFERENCES sale_deliveries(id),
  phone_id            uuid REFERENCES customer_phones(id),
  division_id         uuid REFERENCES company_divisions(id),
  issued_date         date NOT NULL,
  due_date            date NOT NULL,
  subtotal            numeric,
  tax                 numeric,
  discount_amount     numeric NOT NULL DEFAULT 0,
  discount_label      text,
  total_amount        numeric,
  paid_amount         numeric,
  manually_paid       boolean NOT NULL DEFAULT false,
  needs_refresh       boolean NOT NULL DEFAULT false,
  agent_name          text,
  notes               text,
  pdf_url             text,
  qb_synced           boolean,
  dibsy_payment_id    text,
  dibsy_checkout_url  text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);
```

**Dropped vs. current:** `direction`, `supplier_id`, `purchase_order_id`, `receival_id`, `division` (text).

### 4.2 `bills` Table (AP only — new)

```sql
CREATE TABLE public.bills (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_number         text NOT NULL,            -- SUP-INV-00001
  bill_type           invoice_type NOT NULL DEFAULT 'credit',
  source              bill_source NOT NULL,     -- separate enum
  source_id           text NOT NULL,
  source_label        text,
  status              invoice_status,
  doc_status          invoice_doc_status NOT NULL,
  payment_status      invoice_payment_status NOT NULL DEFAULT 'unpaid',
  supplier_id         uuid REFERENCES suppliers(id),
  purchase_order_id   uuid REFERENCES purchase_orders(id),
  receival_id         uuid REFERENCES receivals(id),
  division_id         uuid REFERENCES company_divisions(id),
  issued_date         date NOT NULL,
  due_date            date NOT NULL,
  subtotal            numeric,
  tax                 numeric,
  discount_amount     numeric NOT NULL DEFAULT 0,
  discount_label      text,
  total_amount        numeric,
  paid_amount         numeric,
  manually_paid       boolean NOT NULL DEFAULT false,
  needs_refresh       boolean NOT NULL DEFAULT false,
  notes               text,
  pdf_url             text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);
```

**Dropped vs. current:** `direction`, `customer_id`, `sale_order_id`, `sale_delivery_id`, `phone_id`, `agent_name`, `qb_synced`, `dibsy_payment_id`, `dibsy_checkout_url`, `division` (text).

### 4.3 `bill_line_items` Table (new)

```sql
CREATE TABLE public.bill_line_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id       uuid NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  description   text NOT NULL,
  qty           numeric,
  unit_price    numeric,
  total         numeric,
  match_status  text,        -- 3-way matching (AP-specific)
  match_note    text,        -- 3-way matching (AP-specific)
  created_at    timestamptz DEFAULT now()
);
```

Existing `invoice_line_items` stays for AR. After migration:
- DROP `match_status`, `match_note` from `invoice_line_items` (moved to `bill_line_items`)

### 4.4 New `bill_source` Enum

```sql
CREATE TYPE bill_source AS ENUM ('order');
-- Currently only 'order' (from PO). Extend later as needed.
```

The existing `invoice_source` enum keeps its values (`'order'`, `'contract'`, `'quotation'`).

### 4.5 `debit_notes` Table (AP — new, split from `credit_notes`)

Current `credit_notes` table holds both AR credit notes (`note_type='credit'`) and AP debit notes (`note_type='debit'`). Splitting them:

```sql
CREATE TABLE public.debit_notes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debit_note_id       text NOT NULL,            -- DN-00001
  bill_id             uuid REFERENCES bills(id),
  purchase_order_id   uuid REFERENCES purchase_orders(id),
  supplier_name       text,
  reason              text NOT NULL,
  type                text NOT NULL DEFAULT 'manual',
  status              credit_note_status,       -- reuse same enum
  total_amount        numeric NOT NULL DEFAULT 0,
  original_total      numeric,
  new_total           numeric,
  source_return_id    uuid REFERENCES returns(id),
  resolution_type     text,                     -- 'supplier_credit','replacement'
  notes               text,
  pdf_url             text,
  phone               text,
  approved_by         uuid REFERENCES profiles(id),
  created_by          uuid REFERENCES profiles(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
```

**Dropped vs. `credit_notes`:** `note_type` (implicit), `invoice_id` (replaced by `bill_id`), `customer_name`, `refund_method`, `refund_reference` (AR-only resolution fields).

**Renamed:** `credit_note_id` → `debit_note_id`.

After migration, `credit_notes` cleanup:
- DROP `supplier_name`, `purchase_order_id`, `note_type` (always 'credit' now)
- `resolution_type` values: keep `'refund'`, `'replacement'`, `'store_credit'`; drop `'supplier_credit'` (moved to debit_notes)

### 4.6 `debit_note_lines` Table (new)

```sql
CREATE TABLE public.debit_note_lines (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debit_note_id       uuid NOT NULL REFERENCES debit_notes(id) ON DELETE CASCADE,
  bill_line_id        uuid REFERENCES bill_line_items(id),
  description         text,
  sku                 text,
  qty                 numeric NOT NULL,
  unit_price          numeric NOT NULL,
  total               numeric,
  line_type           text NOT NULL DEFAULT 'original',
  condition           text,
  condition_notes     text,
  created_at          timestamptz DEFAULT now()
);
```

After migration, `credit_note_lines` cleanup:
- Rename `invoice_line_id` → stays as-is (already correct for AR)

---

## 5. Related Tables — Migration Plan

### 5.1 `payments` Table

Currently: `payments.invoice_id` FK → `invoices(id)` + polymorphic `source_type`/`source_id`.

After split:
- **Keep** `invoice_id` FK → `invoices(id)` for AR payments
- **Add** `bill_id uuid REFERENCES bills(id)` for AP payments
- Add `source_type` value `'bill'` to the `payment_source_type` enum
- **Migrate**: for outgoing payments with `invoice_id` set → copy to `bill_id`, NULL out `invoice_id`

### 5.2 `payment_bill_allocations` Table

Currently: `bill_id` FK → `invoices(id)`.

After split:
- **Change** FK: `bill_id` → `bills(id)`
- ID values are preserved (bills get same UUIDs as their source AP invoice rows)

### 5.3 `payment_plans` Table

Currently: `invoice_id` FK → `invoices(id)`.

After split:
- **Keep** `invoice_id` for AR payment plans
- **Add** `bill_id uuid REFERENCES bills(id)` for AP payment plans
- **Migrate**: AP-linked payment plans → copy `invoice_id` → `bill_id`, NULL out `invoice_id`

---

## 6. Views — Recreate

| View | Current | After Split |
|---|---|---|
| `customer_invoices` | `SELECT * FROM invoices WHERE direction='ar'` | `SELECT * FROM invoices` (no filter needed) |
| `supplier_bills` | `SELECT * FROM invoices WHERE direction='ap'` | `SELECT * FROM bills` (column renames: `invoice_id` → `bill_number`) |
| `customer_credit_summary` | `customer_credit_used()` reads AR invoices | Update to query `invoices` directly (no direction filter) |

---

## 7. RPCs / Triggers — Full Rewrite List

### 7.1 RPCs to Rewrite

| RPC | Change |
|---|---|
| `generate_invoice_from_so` | Remove `direction='ar'` INSERT; drop direction col from INSERT |
| `allocate_payment_to_bill` | Change `invoices` → `bills` |
| `recalculate_ar_invoice_payment_status` | Remove direction filter |
| `mark_overdue_invoices` | Split: `mark_overdue_invoices()` (AR) + `mark_overdue_bills()` (AP) |
| `get_invoice_summary` | Query `invoices` only (was already AR) |
| `get_customer_pending_balances` | Query `invoices` (already AR-centric) |
| `rpc_financial_dashboard` | `invoices` for AR totals, `bills` for AP totals |
| `rpc_purchase_aging_report` | `bills` instead of `invoices WHERE direction='ap'` |
| `rpc_sales_aging_report` | `invoices` instead of `invoices WHERE direction='ar'` |
| `rpc_customer_statement_v2` | `invoices` (already AR-only) |
| `customer_credit_used` | `invoices` (already AR-only) |

### 7.2 Trigger Functions to Rewrite

| Trigger | Change |
|---|---|
| `invoice_recompute_paid_fn` (on `payments`) | Keep for AR; create `bill_recompute_paid_fn` for AP |
| `payments_redirect_to_invoice_fn` | Keep as-is (AR only) |
| `invoices_invalidate_pdf_cache_fn` | Keep; create equivalent for `bills` |
| `invoice_line_items_invalidate_parent_pdf_fn` | Keep; create for `bill_line_items` → `bills` |

---

## 8. Code Changes — File-by-File

### 8.1 Hooks

| File | Direction | Change |
|---|---|---|
| `useInvoices.ts` | AR | Remove `.eq('direction', 'ar')` |
| `useCustomerInvoices.ts` | AR | View updated; minimal hook changes |
| `useSupplierBills.ts` | AP | `.from('invoices')` → `.from('bills')`; `invoice_id` → `bill_number`; `.eq('direction','ap')` removed; `invoice_line_items` → `bill_line_items`; bill number format → `SUP-INV-NNNNN` |
| `useCustomerPayments.ts` | AR | No change (already AR) |
| `useCreditNotes.ts` | AR+AP | Split: AR credit notes stay on `credit_notes`; AP debit notes move to `debit_notes` table. `useDebitNotes()` → `.from('debit_notes')`; `useResolveDebitNote*()` → `.from('debit_notes')` |
| `useAgingDrillDown.ts` | AP | `invoices` → `bills` |
| `useUnlinkedArInvoices.ts` | AR | Remove direction filter |
| `useSaleOrders.ts` | AR | Remove direction filter |
| `useSaleDeliveries.ts` | AR | No change needed |
| `useSaleReturns.ts` | AR | Remove direction filter |
| `usePayments.ts` | Both | Add `bill_id` for AP payments |
| `useAttachPaymentToBill.ts` | AP | RPC params unchanged (FK change is DB-side) |

### 8.2 Lib Files

| File | Direction | Change |
|---|---|---|
| `invoiceSync.ts` | AR | Remove `direction: 'ar'` from INSERT |
| `generate-invoice-pdf.ts` | AR | No change |
| `generate-bill-pdf.ts` | AP | `invoices` → `bills`; `invoice_line_items` → `bill_line_items` |
| `generate-credit-debit-note-pdf.ts` | Both | Debit note path: join `debit_notes` + `bills` instead of `credit_notes` + `invoices` |
| `contact-center/repos/orders.ts` | Agnostic | Check if AR or AP; update accordingly |

### 8.3 API Routes

| File | Direction | Change |
|---|---|---|
| `payments/dibsy/create-invoice-link/route.ts` | AR | Remove direction references |
| `payments/dibsy/create-customer-batch-payment/route.ts` | AR | Same |
| `payments/dibsy/webhook/route.ts` | AR | Same |
| `pay/[invoiceId]/page.tsx` | AR | Same |

### 8.4 Types

| File | Change |
|---|---|
| `types/invoice.ts` | Remove `direction`; create `Bill` and `DebitNote` types |
| `types/database.types.ts` | Regenerate |

### 8.5 Components (minimal changes — direction-specific already)

- Bill components: `invoice_id` display → `bill_number`
- Debit note components: `.from('credit_notes')` → `.from('debit_notes')`
- Invoice components: no changes

---

## 9. Enum Changes

| Enum | Change |
|---|---|
| `invoice_direction` | **DROP** |
| `invoice_source` | **KEEP** for AR (`'order'`, `'contract'`, `'quotation'`) |
| `bill_source` | **CREATE** for AP (`'order'`) |
| `invoice_type` | **KEEP** shared (`'cash'`, `'credit'`) |
| `invoice_status` | **KEEP** shared |
| `invoice_doc_status` | **KEEP** shared |
| `invoice_payment_status` | **KEEP** shared |

---

## 10. RLS Policies

### `invoices` (AR)
Keep existing — remove direction references from UPDATE void guard.

### `bills` (AP)
Mirror invoice policies: SELECT/INSERT/DELETE open to authenticated; UPDATE with void guard.

### `bill_line_items`
Mirror `invoice_line_items` policies.

### `debit_notes`
Mirror `credit_notes` policies.

### `debit_note_lines`
Mirror `credit_note_lines` policies.

---

## 11. Implementation Plan — Task Order

### Phase 1: Database Migration (single atomic SQL transaction)

| # | Action |
|---|---|
| 1 | Create `bill_source` enum |
| 2 | Create `bills` table |
| 3 | Create `bill_line_items` table |
| 4 | Create `debit_notes` table |
| 5 | Create `debit_note_lines` table |
| 6 | Migrate AP invoice data → `bills` (preserve UUIDs so FK references stay valid) |
| 7 | Migrate AP line items → `bill_line_items` |
| 8 | Migrate AP debit notes → `debit_notes` (from `credit_notes WHERE note_type='debit'`) |
| 9 | Migrate debit note lines → `debit_note_lines` |
| 10 | Add `bill_id` FK column to `payments`, `payment_plans` |
| 11 | Populate `bill_id` on `payments` / `payment_plans` (where the linked invoice was AP) |
| 12 | Drop+recreate `payment_bill_allocations` FK: `invoices(id)` → `bills(id)` |
| 13 | Delete migrated AP debit note lines from `credit_note_lines` |
| 14 | Delete migrated AP debit notes from `credit_notes` |
| 15 | Delete migrated AP line items from `invoice_line_items` |
| 16 | Delete migrated AP rows from `invoices` |
| 17 | Clean up `credit_notes`: DROP `supplier_name`, `purchase_order_id`, `note_type` |
| 18 | Clean up `invoices`: DROP `direction`, `supplier_id`, `purchase_order_id`, `receival_id`, `division` (text) |
| 19 | Clean up `invoice_line_items`: DROP `match_status`, `match_note` |
| 20 | Enable RLS + create policies on `bills`, `bill_line_items`, `debit_notes`, `debit_note_lines` |
| 21 | Recreate views: `customer_invoices`, `supplier_bills` |
| 22 | Rewrite all RPCs (§7.1) |
| 23 | Rewrite/create all triggers (§7.2) |
| 24 | DROP `invoice_direction` enum |

### Phase 2: Code Changes

| Task | Files | Description |
|---|---|---|
| T1 | `types/invoice.ts` | Create `Bill`, `DebitNote` types; update `Invoice`, `CreditNote` |
| T2 | `useSupplierBills.ts` | `.from('bills')`, `bill_number`, `bill_line_items`, `SUP-INV-NNNNN` numbering |
| T3 | `useCreditNotes.ts` | Split: debit note functions → `.from('debit_notes')` / `debit_note_lines` |
| T4 | `useInvoices.ts`, `useCustomerInvoices.ts`, `useUnlinkedArInvoices.ts` | Remove direction filters |
| T5 | `useSaleOrders.ts`, `useSaleReturns.ts` | Remove direction filters |
| T6 | `invoiceSync.ts` | Remove `direction` from INSERT |
| T7 | `useAgingDrillDown.ts` | `invoices` → `bills` |
| T8 | `usePayments.ts` | Add `bill_id` for outgoing payments |
| T9 | `generate-bill-pdf.ts` | Query `bills` + `bill_line_items` |
| T10 | `generate-credit-debit-note-pdf.ts` | Debit path: `debit_notes` + `bills` |
| T11 | Dibsy API routes | Remove direction references |
| T12 | Bill components | `invoice_id` → `bill_number` display |
| T13 | Debit note components | `credit_notes` → `debit_notes` |

### Phase 3: Cleanup

| Task | Description |
|---|---|
| C1 | Regenerate `database.types.ts` + re-append helper aliases |
| C2 | Copy migration to `migrations-staging/` |
| C3 | Full app smoke test |

---

## 12. Risk Assessment

| Risk | Mitigation |
|---|---|
| Data loss during migration | Single transaction — rolls back on error |
| Broken FK references | Bills preserve original UUIDs from AP invoices — all FK pointers stay valid during migration, re-pointed before delete |
| Payment reconciliation | AR trigger kept; new AP trigger created; both tested |
| Invoice numbering gap | `COUNT(*) + 1` on AR-only table works correctly; existing numbers preserved as text |
| Views break code | Redefined to point at new tables; `.from('supplier_bills')` keeps working |
| Credit note split | Debit note data migrated with UUID preservation; `nextNoteId('debit')` updated to query `debit_notes` |
| Supabase health | Must verify project is healthy before `db push` |
