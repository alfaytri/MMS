# Bill Detail Page — Design Spec
**Date:** 2026-04-24  
**Status:** Approved  

---

## Overview

A full-page bill detail view at `/purchase/bills/[id]` that renders a professional, printable AP bill document alongside a left sidebar of display controls. Replaces the current bills list (which has no detail view) and connects to the existing PO detail dialog's "View Bill" button.

---

## Navigation & Routing

- **Route:** `/purchase/bills/[id]/page.tsx`
- **Entry points:**
  - `PoDetailDialog` — "View Bill (BILL-XXXXX)" button navigates to `/purchase/bills/[bill_id]` (already has first bill ID from `useBillsByPO`)
  - Bills list (`/purchase/bills`) — each table row becomes a clickable `<Link>` to `/purchase/bills/[id]`
- **Back navigation:** "Back to Bills" button returns to `/purchase/bills`
- No modal or popup — always a full page navigation

---

## Page Layout

Two-column layout: fixed left sidebar + scrollable document area.

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

On print (`@media print`): sidebar hidden entirely, document renders full-width as a clean A4 page.

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
| Toggle | Section shown in document |
|---|---|
| Receival Info | Table of received items with date and receival reference |
| Payment Plan | Installment schedule table (hidden if no plan exists) |
| Notes / Remarks | Internal notes text block |
| QR Code / Stamp | QR code box at document bottom, encodes bill ID |

### Print Button
At the bottom of the sidebar. Calls `window.print()`. Sidebar hides via `@media print { .bill-sidebar { display: none } }`.

---

## Bill Document

White card with shadow, A4-proportioned (`max-w-3xl`), centered in the document area. Sections top to bottom:

### 1. Header (always shown)
- **Left:** Division name (from sidebar dropdown, bold), Arabic division name (if available), division address
- **Right:** "فاتورة مشتريات" (large, Arabic), "Purchase Bill / Statement" (subtitle)
- Thin `<hr>` divider below

### 2. Meta Row (always shown)
- **Left:** PO number + PO date (e.g. `PO-2026-0001 · 05 Apr 2026`)
- **Right:** Print Date (rendered at page load), Bill # (e.g. `BILL-00001`), Due Date

### 3. Supplier Block (always shown)
- Label: "SUPPLIER / المورد" (small caps, muted)
- Supplier name (bold), contact_name, phone, email, address
- Data from `suppliers` joined on `invoices.supplier_id`

### 4. Line Items Table (always shown)
| # | Item | Qty Unit | Price | Total |
|---|---|---|---|---|
- Sourced from `invoice_line_items` joined on `invoices.id`
- Unit pulled from PO line item if available, else blank

### 5. Totals Block (always shown, right-aligned)
- Subtotal
- Grand Total (bold)
- Total (QAR)

### 6. Payment History (always shown)
- Table: Date, Method, Amount, Reference — from `payments` where `invoice_id = bill.id` and `direction = 'outgoing'`
- Empty state: "No payments recorded"
- Summary below table:
  - Total Amount (QAR)
  - Total Paid (green)
  - Balance (red if > 0)
  - Payment status badge (Unpaid / Partially Paid / Paid / Overdue)

### 7. Receival Info (toggleable, default ON)
- Table: Item, Qty Received, Unit, Receival Ref, Date
- Sourced from `receivals` + `receival_items` joined via `invoices.receival_id`
- Hidden if `receival_id` is null even when toggle is ON

### 8. Payment Plan (toggleable, default ON)
- Table: Installment #, Due Date, Amount, Status
- Sourced from `payment_plans` where `invoice_id = bill.id`
- Hidden if no payment plan exists even when toggle is ON

### 9. Notes / Remarks (toggleable, default ON)
- Plain text block showing `invoices.notes`
- Hidden if notes is null even when toggle is ON

### 10. QR Code / Stamp (toggleable, default ON)
- Placeholder box containing a QR code encoding the bill ID and bill number
- Rendered using a lightweight QR library (e.g. `qrcode.react`)

### 11. Footer (always shown)
- Left: Division name (same as header) · "هذا المستند تم إنشاؤه تلقائياً"
- Right: "This document was automatically generated · [ISO timestamp]"

---

## Data Layer

### Migration
```sql
ALTER TABLE divisions ADD COLUMN IF NOT EXISTS address TEXT;
```

### Hooks

| Hook | Source | Purpose |
|---|---|---|
| `useBillDetail(id)` | `invoices` + joins | Full bill with supplier, PO, line items |
| `useBillPayments(billId)` | `payments` | Outgoing payments for this bill |
| `useBillReceival(receivalId)` | `receivals` + `receival_items` | Receival detail for toggle |
| `usePaymentPlan(billId)` | `payment_plans` | Installment schedule for toggle |
| `useDivisions()` | `divisions` | Company dropdown (reuse existing) |

**`useBillDetail` query:**
```
invoices
  .select('*, invoice_line_items(*), suppliers(name, contact_name, phone, email, address), purchase_orders(po_number, created_date)')
  .eq('id', id)
  .eq('direction', 'ap')
  .single()
```

---

## Bills List Page Changes

- Each table row gets `className="cursor-pointer"` and `onClick={() => router.push('/purchase/bills/' + bill.id)}`
- Keep existing "Submit / Approve / Reject" inline action buttons — they stay on the list for now
- Keep the existing search and filter controls

---

## Files Affected

| File | Change |
|---|---|
| `supabase/migrations/YYYYMMDD_divisions_address.sql` | Add `address` to divisions |
| `src/hooks/useSupplierBills.ts` | Add `useBillDetail`, `useBillPayments`, `useBillReceival`, `usePaymentPlan` |
| `src/app/(dashboard)/purchase/bills/[id]/page.tsx` | New — full bill detail page |
| `src/app/(dashboard)/purchase/bills/page.tsx` | Make rows clickable |
| `src/components/purchase/PoDetailDialog.tsx` | Already done — navigates to `/purchase/bills/[id]` |

---

## Out of Scope

- Editing a bill from the detail page
- Approve / Reject / Submit actions on the detail page (future)
- Record Payment from the detail page (future)
- Arabic content for division names (shown if available, not required)
