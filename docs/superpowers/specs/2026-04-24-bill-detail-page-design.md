# Bill Detail Page — Design Spec
**Date:** 2026-04-24  
**Status:** Approved (v2 — post code review)

---

## Overview

A full-page bill detail view at `/purchase/bills/[id]` that renders a professional, printable AP bill document alongside a left sidebar of display controls. Replaces the current bills list (which has no detail view) and connects to the existing PO detail dialog's "View Bill" button.

---

## Navigation & Routing

- **Route:** `/purchase/bills/[id]/page.tsx`
- **Entry points:**
  - `PoDetailDialog` — "View Bill (BILL-XXXXX)" button navigates to `/purchase/bills/[bill_id]`
  - Bills list (`/purchase/bills`) — each table row becomes a clickable link to `/purchase/bills/[id]`
- **Back navigation:** "Back to Bills" button returns to `/purchase/bills`
- No modal or popup — always a full page navigation

---

## Page Layout

Two-column layout: fixed left sidebar (~280px) + scrollable document area.

```
┌─────────────────────┬──────────────────────────────────────────────┐
│  LEFT SIDEBAR       │  BILL DOCUMENT                               │
│  ~280px fixed       │  flex-1, scrollable, centered A4 card        │
│                     │                                              │
│  Company dropdown   │  [Document content]                          │
│  ─────────────────  │                                              │
│  Document Options   │                                              │
│  [Always ON list]   │                                              │
│  ─────────────────  │                                              │
│  Toggle switches    │                                              │
│  ─────────────────  │                                              │
│  [Print button]     │                                              │
└─────────────────────┴──────────────────────────────────────────────┘
```

**On print** (`@media print`):
- Sidebar hidden entirely (`display: none`)
- Document renders full-width as a clean A4 page
- `tr { page-break-inside: avoid }` — prevents rows splitting across pages
- `thead { display: table-header-group }` — repeats table header on every page
- `tfoot { display: table-footer-group }`

---

## Left Sidebar

### Company Selector
A `<Select>` dropdown at the top of the sidebar. Pulls all active divisions from the `divisions` table (ordered by `sort_order`). Default: first active division. Selecting a division updates the document header company name and footer text live.

### Always-On Sections (labels only, no toggle)
- Company Header
- Supplier Info
- Line Items
- Totals
- Payment History

### Toggleable Sections (shadcn `Switch`, all ON by default)
Toggle state is persisted in `URLSearchParams` so views are shareable and survive navigation:

| Toggle | URL param | Section shown in document |
|---|---|---|
| Receival Info | `showReceival` | Table of received items with date and receival reference |
| Payment Plan | `showPaymentPlan` | Installment schedule table (hidden if no plan exists) |
| Notes / Remarks | `showNotes` | Internal notes text block (hidden if notes is null) |
| QR Code / Stamp | `showQR` | QR code box at document bottom, encodes bill ID |

Default: all params absent = all sections shown.

### Print Button
At the bottom of the sidebar. Calls `window.print()`. Sidebar hides via print stylesheet.

---

## Bill Document

White card with shadow, A4-proportioned (`max-w-3xl`), centered in the document area.

### Status Watermark
A large diagonal text watermark overlaid on the document background, derived from `doc_status` + `payment_status`:
- `doc_status = 'draft'` → "DRAFT" (grey)
- `payment_status = 'paid'` → "PAID" (green)
- `payment_status = 'overdue'` → "OVERDUE" (red)
- Otherwise → no watermark

Implemented via absolute-positioned `<div>` with `opacity-10 rotate-[-30deg] text-8xl font-black pointer-events-none select-none`.

### Sections (top to bottom)

**1. Header (always shown)**
- Left: Division name (from sidebar dropdown, bold), division address (rendered with `whitespace-pre-line` to support multi-line)
- Right: "فاتورة مشتريات" (large, Arabic, fixed), "Purchase Bill / Statement" (fixed subtitle)
- Thin `<hr>` divider below

**2. Meta Row (always shown)**
- Left: PO number + PO date (e.g. `PO-2026-0001 · 05 Apr 2026`)
- Right: Print Date (rendered at page load), Bill # (e.g. `BILL-00001`), Due Date

**3. Supplier Block (always shown)**
- Label: "SUPPLIER / المورد" (small caps, muted)
- Supplier name (bold), contact_name, phone, email, address
- Data from `suppliers` joined on `invoices.supplier_id`

**4. Line Items Table (always shown)**
| # | Item | Qty Unit | Price | Total |
|---|---|---|---|---|
- Sourced from `invoice_line_items` joined on `invoices.id`
- All amounts displayed using existing `formatCurrency(amount, currency)` utility
- Currency from `purchase_orders.currency` (display as-stored, no conversion)

**5. Totals Block (always shown, right-aligned)**
- Subtotal — from `invoices.subtotal` (DB value, not re-calculated)
- Grand Total (bold) — from `invoices.total_amount` (DB value)
- Total (QAR) — same value, formatted with `formatCurrency`

**6. Payment History (always shown)**
- Table: Date, Method, Amount, Reference — from `payments` where `invoice_id = bill.id` and `direction = 'outgoing'`
- Empty state: "No payments recorded"
- Summary below table:
  - Total Amount — `invoices.total_amount`
  - Total Paid (green) — `invoices.paid_amount`
  - Balance (red if > 0) — `total_amount - paid_amount` (single subtraction of two DB-stored values)
  - Payment status badge (Unpaid / Partially Paid / Paid / Overdue)

**7. Receival Info (toggleable, default ON)**
- Table: Item, Qty Received, Unit, Receival Ref, Date
- Sourced from `receivals` + `receival_items` via `invoices.receival_id`
- Skipped entirely (no render, no fetch) if `receival_id` is null

**8. Payment Plan (toggleable, default ON)**
- Table: Installment #, Due Date, Amount, Status
- Sourced from `payment_plans` where `invoice_id = bill.id`
- Skipped entirely if no plan exists

**9. Notes / Remarks (toggleable, default ON)**
- Plain text block showing `invoices.notes`
- Skipped entirely if notes is null

**10. QR Code / Stamp (toggleable, default ON)**
- QR code box encoding bill ID + bill number
- Rendered using `qrcode.react` library

**11. Related Bills Alert (shown when PO has multiple bills)**
- If `useBillsByPO(po_id)` returns more than one bill, show an info alert:
  `"This PO has [n] bills: BILL-00001 · BILL-00002"` with each as a clickable link
- Positioned below the header, above the supplier block

**12. Footer (always shown)**
- Left: Division name (same as header) · "هذا المستند تم إنشاؤه تلقائياً"
- Right: "This document was automatically generated · [ISO timestamp]"

---

## Data Layer

### Migration
```sql
ALTER TABLE divisions ADD COLUMN IF NOT EXISTS address TEXT;
-- Note: TRN/VAT registration number deferred to multi-country expansion phase
```

### Single ViewModel Hook: `useBillViewModel(id)`

Replaces the four separate hooks with one coordinated fetch to avoid UI waterfall/flicker. Uses `Promise.all` for parallel requests:

```typescript
const [bill, payments, paymentPlan] = await Promise.all([
  supabase
    .from('invoices')
    .select('*, invoice_line_items(*), suppliers(name,contact_name,phone,email,address), purchase_orders(po_number,created_date,currency)')
    .eq('id', id).eq('direction', 'ap').single(),
  supabase
    .from('payments')
    .select('*')
    .eq('invoice_id', id).eq('direction', 'outgoing'),
  supabase
    .from('payment_plans')
    .select('*')
    .eq('invoice_id', id)
])
// receival fetched separately only if bill.receival_id is non-null
```

All totals (`subtotal`, `total_amount`, `paid_amount`) are used directly from the database — no frontend summation.

### Supporting Hooks (reused)
- `useBillsByPO(poId)` — already exists, used for Related Bills alert
- `useDivisions()` — already exists, used for company dropdown

---

## Component Hierarchy

```
BillDetailContainer        — data fetching, loading/error states, URL param toggle state
  ├── BillSidebar          — <Select> company dropdown + <Switch> controls + Print button
  └── BillDocument         — A4 wrapper, status watermark, print stylesheet
        └── DocumentSection — reusable section wrapper (consistent spacing, page-break-avoid)
```

`BillDocument` uses a print stylesheet class (not `react-to-print`) — `window.print()` is sufficient.

---

## Bills List Page Changes

- Each table row gets `className="cursor-pointer"` and `onClick={() => router.push('/purchase/bills/' + bill.id)}`
- Keep existing "Submit / Approve / Reject" inline action buttons — they stay on the list for now
- Keep existing search and filter controls

---

## Files Affected

| File | Change |
|---|---|
| `supabase/migrations/YYYYMMDD_divisions_address.sql` | Add `address` to divisions |
| `src/hooks/useSupplierBills.ts` | Add `useBillViewModel` |
| `src/app/(dashboard)/purchase/bills/[id]/page.tsx` | New — full bill detail page |
| `src/app/(dashboard)/purchase/bills/page.tsx` | Make rows clickable |
| `src/components/purchase/PoDetailDialog.tsx` | Already done — navigates to `/purchase/bills/[id]` |

---

## Out of Scope

- Editing a bill from the detail page
- Approve / Reject / Submit actions on the detail page (future)
- Record Payment from the detail page (future)
- TRN / VAT Registration Number on divisions (deferred to multi-country phase)
- `react-to-print` library — `window.print()` with print stylesheet is sufficient
- Currency conversion — amounts displayed as stored, in their original currency
