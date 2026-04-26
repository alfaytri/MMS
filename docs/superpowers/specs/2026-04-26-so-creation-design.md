# SO Creation Design Spec
**Date:** 2026-04-26

---

## Overview

Rebuild the Sales Order creation flow to match the PO creation experience: typed line items editor, proper dedicated columns on `sale_orders`, credit-group-based auto-approval, and PDF quotation download. The current implementation stuffs settings and terms into the `notes` column as a workaround — this spec replaces that entirely with dedicated schema columns.

The work is split into two sub-projects that must be built in order:

1. **Credit Groups** — new master-data entity + FK on customers
2. **SO Creation Rebuild** — schema columns, rebuilt create page, credit approval RPC, PDF download

---

## Sub-Project 1: Credit Groups

### What

A new `credit_groups` table stores named credit tiers with a credit limit. Customers are linked to a credit group via `credit_group_id FK`. Where a customer has no credit group, SO creation is **blocked**.

### Schema

```sql
CREATE TABLE credit_groups (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL UNIQUE,          -- e.g. "Standard", "Premium", "VIP"
  credit_limit NUMERIC NOT NULL DEFAULT 0,    -- maximum cumulative open-SO value
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE customers
  ADD COLUMN credit_group_id UUID REFERENCES credit_groups(id);
```

### UI: Master Data → Credit Groups page

- Table: Name, Credit Limit, Customer Count (count of linked customers)
- Inline add-row: name + credit limit
- Edit in-place (click to edit), delete with confirmation (blocked if customers reference it)
- Customer record in existing Customers page gets a "Credit Group" dropdown column

### Rules

- A customer with `credit_group_id IS NULL` cannot create an SO — the create-SO page shows a blocking error: "This customer has no credit group assigned. Please assign a credit group in Master Data → Customers before creating an order."

---

## Sub-Project 2: SO Creation Rebuild

### 2a. Schema: Add dedicated columns to `sale_orders`

Replace the notes-packing workaround with explicit columns:

```sql
ALTER TABLE sale_orders
  ADD COLUMN currency               TEXT NOT NULL DEFAULT 'QAR',
  ADD COLUMN exchange_rate          NUMERIC NOT NULL DEFAULT 1,
  ADD COLUMN expected_delivery      DATE,
  ADD COLUMN payment_terms          TEXT,
  ADD COLUMN payment_terms_notes    TEXT,
  ADD COLUMN payment_milestones     JSONB,          -- [{label, percent}]
  ADD COLUMN delivery_terms         TEXT,
  ADD COLUMN delivery_terms_notes   TEXT,
  ADD COLUMN vendor_notes           TEXT,           -- renamed from customer_notes for consistency
  ADD COLUMN validity_days          INTEGER DEFAULT 30;

ALTER TABLE sale_order_lines
  ADD COLUMN line_type              TEXT NOT NULL DEFAULT 'products',
  ADD COLUMN unit                   TEXT NOT NULL DEFAULT 'pcs',
  ADD COLUMN tool_asset_item_id     UUID REFERENCES tool_asset_items(id),
  ADD COLUMN avg_cost               NUMERIC;
```

The existing `notes` column is kept (backwards compat) but the create/edit pages stop writing to it.

### 2b. SO Line Items Editor (`SoLineItemsEditor`)

Rebuild `src/components/sales/SoLineItemsEditor.tsx` to mirror `PoLineItemsEditor` exactly:

- Same 4 typed groups: **Products** (blue), **Spare Parts** (amber), **Consumables** (green), **Tools & Assets** (purple)
- `CascadeInventorySelector` for Products / Spare Parts / Consumables — populates `selling_price` (not `cost_price`)
- `ToolAssetLookup` for Tools & Assets
- Columns: Item Name / SKU / Qty / Unit / Unit Price / Total (no `free_qty` — purchase-only concept)
- `readOnly` prop for view mode (order detail dialogs)
- `currency` prop passed through to `formatCurrency` display
- Export type `SoLineItemRow = SOLineItemDraft & { _key: string; line_type: LineType }`

`LineType` and `TYPE_CONFIG` are defined locally in `SoLineItemsEditor` (not shared with PO — they are identical but kept independent to avoid coupling).

### 2c. Create SO Page rebuild

`src/app/(dashboard)/sales/create-so/page.tsx` — mirror the PO create page layout:

**Sticky header bar:**
- Left: `← Back` arrow
- Center: "New Sales Order"
- Right: `Save as Quotation` (draft) + `Confirm Order` buttons

**Body sections (scrollable):**
1. **Customer** — combobox with inline "Add Customer" (name, phone, email)
   - After customer selected: show credit group badge + available credit remaining
   - If no credit group: show blocking error inline, disable both save buttons
2. **Currency** — same currency/exchange-rate selector as PO
3. **Line Items** — new `SoLineItemsEditor` (typed groups)
4. **Discount** — fixed-amount discount with optional label (identical to PO)
5. **Summary** — subtotal / discount / grand total card
6. **Terms** — existing `SoTermsSection` (payment terms, delivery terms, customer notes) + new `validity_days` field (default 30)

**Save as Quotation** → creates SO with `status = 'quotation'`, calls credit check RPC (see 2d), auto-approves if within limit.

**Confirm Order** → validates, calls credit check RPC, on success sets `status = 'confirmed'`.

### 2d. Credit Check RPC

Server-side atomic function — no client-side balance math:

```sql
CREATE OR REPLACE FUNCTION check_and_reserve_so_credit(
  p_customer_id  UUID,
  p_so_amount    NUMERIC,
  p_so_id        UUID DEFAULT NULL   -- pass when editing an existing SO
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_credit_limit   NUMERIC;
  v_open_total     NUMERIC;
  v_available      NUMERIC;
  v_group_name     TEXT;
BEGIN
  -- Get credit limit from customer's credit group
  SELECT cg.credit_limit, cg.name
  INTO   v_credit_limit, v_group_name
  FROM   customers c
  JOIN   credit_groups cg ON cg.id = c.credit_group_id
  WHERE  c.id = p_customer_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('approved', false, 'reason', 'no_credit_group');
  END IF;

  -- Sum open SO totals for this customer (exclude current SO when editing)
  SELECT COALESCE(SUM(total), 0)
  INTO   v_open_total
  FROM   sale_orders
  WHERE  customer_id = p_customer_id
    AND  status IN ('quotation', 'confirmed', 'processing')
    AND  deleted_at IS NULL
    AND  (p_so_id IS NULL OR id != p_so_id);

  v_available := v_credit_limit - v_open_total;

  IF p_so_amount <= v_available THEN
    RETURN jsonb_build_object(
      'approved',      true,
      'auto_approved', true,
      'credit_limit',  v_credit_limit,
      'open_total',    v_open_total,
      'available',     v_available
    );
  ELSE
    RETURN jsonb_build_object(
      'approved',      false,
      'auto_approved', false,
      'reason',        'credit_exceeded',
      'credit_limit',  v_credit_limit,
      'open_total',    v_open_total,
      'available',     v_available
    );
  END IF;
END;
$$;
```

**Credit exceeded flow:**
- `approved: false` → SO is saved with `status = 'pending_approval'`
- Toast shown: "Order exceeds credit limit (available: QAR X,XXX). Sent for owner approval."
- Owner sees pending_approval SOs in an "Awaiting Approval" filter on the SO list page
- Owner can Approve (→ confirmed) or Reject (→ cancelled) from the existing SO detail dialog

### 2e. PDF Quotation Download

Using `@react-pdf/renderer` (client-side, no server route):

**Trigger:** "Download PDF" button on the SO detail dialog / create page after saving as quotation.

**Document structure:**
```
[Company Logo — from /public/logo.png]    QUOTATION
                                          No: QT-2026-XXXX
                                          Date: DD MMM YYYY

Bill To:
  [Customer Name]
  [Customer Phone / Email]

─────────────────────────────────────────────────────────────
Products
 #  Item Name     SKU       Qty   Unit   Unit Price    Total
 1  ...           ...       ...   ...    QAR XXX.XX    QAR XXX.XX

Spare Parts
 ...

─────────────────────────────────────────────────────────────
                               Subtotal      QAR X,XXX.XX
                               Discount      QAR    XX.XX
                               Grand Total   QAR X,XXX.XX

Payment Terms: [value]
Delivery Terms: [value]
Notes: [customer_notes]
Validity: 30 days from issue date

─────────────────────────────────────────────────────────────
[Footer: company name, phone, email]
```

**Component:** `src/components/sales/SoQuotationPdf.tsx` — exports a `<QuotationDocument>` React component that accepts `SaleOrder + lines` props.

**Usage:**
```tsx
import { PDFDownloadLink } from '@react-pdf/renderer'
import { QuotationDocument } from '@/components/sales/SoQuotationPdf'

<PDFDownloadLink document={<QuotationDocument so={so} lines={lines} />} fileName={`Quotation-${so.so_number}.pdf`}>
  {({ loading }) => loading ? 'Preparing…' : 'Download PDF'}
</PDFDownloadLink>
```

---

## Files Created / Modified

### Sub-Project 1
| File | Action |
|------|--------|
| `supabase/migrations/20260427000001_credit_groups.sql` | Create — `credit_groups` table, FK on customers |
| `src/hooks/useCreditGroups.ts` | Create — CRUD hooks |
| `src/app/(dashboard)/master-data/credit-groups/page.tsx` | Create — Credit Groups management page |
| `src/app/(dashboard)/master-data/customers/page.tsx` | Modify — add Credit Group column/dropdown |
| `src/components/layout/NavDropdown.tsx` (or nav config) | Modify — add Credit Groups to Master Data nav |

### Sub-Project 2
| File | Action |
|------|--------|
| `supabase/migrations/20260427000002_sale_orders_columns.sql` | Create — add dedicated columns |
| `supabase/migrations/20260427000003_rpc_check_so_credit.sql` | Create — credit check RPC |
| `src/components/sales/SoLineItemsEditor.tsx` | Rewrite — typed grouped editor |
| `src/app/(dashboard)/sales/create-so/page.tsx` | Rewrite — PO-style layout |
| `src/app/(dashboard)/sales/edit-so/[id]/page.tsx` | Modify — use new column shape |
| `src/hooks/useSaleOrders.ts` | Modify — add credit check call, new column types |
| `src/components/sales/SoQuotationPdf.tsx` | Create — PDF document component |
| `src/components/sales/SoDetailDialog.tsx` | Modify — add Download PDF button |

---

## Out of Scope

- Multi-warehouse delivery allocation (existing flow unchanged)
- SO edit history / audit log
- Customer portal / email sending
- Tax calculation (no VAT yet)
