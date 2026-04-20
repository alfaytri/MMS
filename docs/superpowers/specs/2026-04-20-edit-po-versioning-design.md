# Edit PO Page — Versioning Design Spec

**Date:** 2026-04-20
**Status:** Approved

---

## Overview

Rebuild `/purchase/edit-po/[id]` from its current stub into a full edit experience that matches the Create PO layout but pre-filled with existing values. Every time an edited PO is submitted for approval, the previous state is frozen as a read-only version snapshot. The PO list always shows one row per PO number; versions are visible inside the PO detail.

---

## Database Schema

### 1. Add `version_number` to `purchase_orders`
```sql
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS version_number INT NOT NULL DEFAULT 1;
```
All existing POs start at v1.

### 2. New `po_versions` snapshot table
```sql
CREATE TABLE po_versions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id                UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  version_number       INT NOT NULL,
  submitted_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  supplier_id          TEXT NOT NULL,
  supplier_name        TEXT NOT NULL,
  currency             TEXT NOT NULL,
  exchange_rate        NUMERIC NOT NULL,
  subtotal             NUMERIC NOT NULL,
  discount_amount      NUMERIC NOT NULL DEFAULT 0,
  discount_label       TEXT,
  payment_terms        TEXT,
  payment_terms_notes  TEXT,
  payment_milestones   JSONB,
  delivery_terms       TEXT,
  delivery_terms_notes TEXT,
  expected_delivery    DATE,
  vendor_notes         TEXT,
  line_items           JSONB NOT NULL,
  UNIQUE (po_id, version_number)
);

ALTER TABLE po_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal users can manage po_versions"
  ON po_versions FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

`line_items` is a JSONB array matching `POLineItemDraft[]` shape — exactly what the form produces. Old versions are never mutated after creation.

---

## Data Flow

### Clicking "Edit" on a PO
- Navigate to `/purchase/edit-po/[id]`
- Fetch `purchase_orders` row + `po_line_items` + `po_versions` history
- No DB writes — no snapshot yet

### Clicking "Submit for Approval" (creates new version)
1. Write current `purchase_orders` values + current `po_line_items` into a new `po_versions` row at the current `version_number`
2. Update `purchase_orders` with the new form values
3. Increment `version_number` on `purchase_orders` (1 → 2, 2 → 3, etc.)
4. Delete old `po_approvals` for this PO, insert fresh ones based on new `approval_level`
5. Set `status = 'pending_approval'`

### Clicking "Save as Draft"
- Update `purchase_orders` + replace `po_line_items` in place
- No snapshot, no version increment
- Status unchanged

### Clicking "Restore to this version" on an old version tab
- Read `po_versions` row fields + `line_items` JSONB
- Regenerate `_key: crypto.randomUUID()` for each line item (client-only field)
- Pre-fill the edit form state with those values
- Switch to current version tab
- Nothing written to DB — restore is form pre-fill only

---

## UI Layout

### Sticky Header
```
← PO-00001 · v3          [ Save as Draft ]  [ Submit for Approval ]
   pending_approval
```
- PO number + current version shown as read-only badge
- Status badge below the PO number
- Buttons hidden when an old version tab is active

### Version Tab Strip (below header, sticky)
```
[ V1  18 Apr ]  [ V2  19 Apr ]  [ V3 — Current ✏️ ]
```
- Each past tab shows version number + submission date
- Current version tab labelled with pencil icon
- Single tab shown if PO has never been resubmitted

### Current Version Tab (editable)
- Identical layout to Create PO page — all 8 sections, same components
- Pre-filled with live `purchase_orders` + `po_line_items` values on load
- All fields editable (supplier, currency, line items, terms, discount — everything)

### Old Version Tab (read-only)
- Same layout with all inputs `disabled` / `readOnly`
- Orange info banner: `"You are viewing V1 — submitted 18 Apr 2026"`
- One action button: **"Restore to this version"**
- No save/submit buttons

---

## Components

### Reused unchanged
- `PoLineItemsEditor` — pre-filled via `value` prop
- `PoTermsSection` — pre-filled via `value` prop
- `AddSupplierDialog` — unchanged
- `ToolAssetLookup` / `InventoryItemLookup` — unchanged

### New: `PoVersionTabs`
```
props: versions: PoVersion[], currentVersionNumber: number,
       activeTab: number, onTabChange: (n: number) => void
```
Renders the tab strip. Pure display, no business logic.

### New: `PoVersionBanner`
```
props: version: PoVersion, onRestore: () => void
```
Orange read-only banner + "Restore to this version" button.

### Rewritten: `edit-po/[id]/page.tsx`
- Fetches PO via existing `usePurchaseOrder(id)`
- Fetches history via new `usePoVersions(id)`
- Local state mirrors Create PO page (supplier, lineItems, terms, discount, currency, exchangeRate)
- `useEffect` hydrates state from PO on load
- `activeTab` state controls which tab is shown
- Restore handler: hydrates state from a `PoVersion` snapshot, switches to current tab

### New hooks (in `usePurchaseOrders.ts`)
- `usePoVersions(poId)` — `SELECT * FROM po_versions WHERE po_id = ? ORDER BY version_number ASC`
- `useSubmitPoVersion()` — combined mutation: snapshot → update PO → increment version → reset approvals → set `pending_approval`
- `useSavePoAsDraft()` — in-place update (no snapshot), replaces current `useUpdatePO` call site

---

## Edge Cases

| Situation | Behaviour |
|---|---|
| `cancelled` PO | Edit button hidden in list; if navigated directly, read-only, no form |
| `pending_approval` PO | Editable; submitting v2 wipes old approvals and starts fresh chain |
| First submit (v1, no history yet) | `po_versions` has 0 rows; submit writes v1 snapshot, increments to v2 |
| Restore v1 while on v3 | Form pre-filled with v1 values; user submits normally to create v4 |
| Line items on restore | JSONB items get fresh `_key: crypto.randomUUID()` so editor works |
| Save as Draft on approved/received PO | In-place update, no version increment, status unchanged |
