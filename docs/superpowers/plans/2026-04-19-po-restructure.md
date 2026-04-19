# Purchase Orders Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move RFQ and Bills out of the nav dropdown and into the Purchase Orders page — as a header button (RFQ) and a row/dialog action (Create Bill).

**Architecture:** Four targeted edits: (1) strip two nav items, (2) add RFQ button + three-dot row actions to the PO list page, (3) add `initialPoId` prop to `BillFormDialog` so it can be pre-filled from a PO, (4) add "Create Bill" button to `PoDetailDialog`.

**Tech Stack:** Next.js 15 App Router, TypeScript, shadcn/ui (`DropdownMenu`), TanStack Query v5, Tailwind CSS.

**Design reference:** Approved in brainstorming session 2026-04-19.

---

## File Structure

**Modified files only — no new files created:**

```
src/components/layout/nav-config.ts          ← Task 1: remove RFQ + Bills items
src/app/(dashboard)/purchase/orders/page.tsx ← Task 2: RFQ button + three-dot row actions
src/components/purchase/BillFormDialog.tsx   ← Task 3: add initialPoId prop
src/components/purchase/PoDetailDialog.tsx   ← Task 4: add Create Bill button + callback
```

---

## Critical DB / Type Facts

- `BillFormDialog` currently has no props beyond `open`/`onOpenChange` — we add `initialPoId?: string`
- `PoDetailDialog` currently accepts `onEdit?: (po: PurchaseOrder) => void` — we add `onCreateBill?: (poId: string) => void`
- Existing `usePurchaseOrders` hook already returns `PurchaseOrder[]`; `PurchaseOrder.id` is the UUID to pass as `initialPoId`

---

## Task 1: Remove RFQ & Bills from Nav

**Files:**
- Modify: `src/components/layout/nav-config.ts`

- [ ] **Step 1: Read the PURCHASE group in `nav-config.ts`**

Confirm the exact two items to remove:
```typescript
{ label: 'RFQ',   href: '/purchase/rfq'   },
{ label: 'Bills', href: '/purchase/bills' },
```

- [ ] **Step 2: Delete those two lines**

The PURCHASE items array after the edit:
```typescript
{
  label: 'PURCHASE',
  items: [
    { label: 'Purchase Orders',   href: '/purchase/orders'   },
    { label: 'Receivals',         href: '/purchase/receivals' },
    { label: 'Purchase Payments', href: '/purchase/payments'  },
  ],
},
```

- [ ] **Step 3: TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | head -20
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
cd D:/MMS && git add src/components/layout/nav-config.ts && git commit -m "feat(nav): remove RFQ and Bills from Purchase dropdown — accessed via Purchase Orders page"
```

---

## Task 2: PO List Page — RFQ Button + Three-dot Row Actions

**Files:**
- Modify: `src/app/(dashboard)/purchase/orders/page.tsx`

### What changes

1. Add two buttons in the header: `RFQ` (outline) opens `RfqFormDialog`; `+ Create PO` (primary) navigates as today.
2. Replace the eye-icon `actions` column with a `DropdownMenu` (⋮) containing **View**, **Edit** (draft only), and **Create Bill**.
3. Add `BillFormDialog` rendered at page level, opened with the selected PO's id.

- [ ] **Step 1: Add new imports at the top of `orders/page.tsx`**

Add these imports (keep all existing imports):
```typescript
import { MoreHorizontal } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { RfqFormDialog } from '@/components/purchase/RfqFormDialog'
import { BillFormDialog } from '@/components/purchase/BillFormDialog'
```

Remove the `Eye` import (no longer used after replacing the icon button).

- [ ] **Step 2: Add two new state variables inside `PurchaseOrdersPage`**

Add after the existing `useState` declarations:
```typescript
const [rfqOpen, setRfqOpen] = useState(false)
const [billPoId, setBillPoId] = useState<string | null>(null)
```

- [ ] **Step 3: Replace the `actions` column definition**

Find and replace the `actions` column object (currently the last element in the `columns` array):

```typescript
{
  id: 'actions',
  cell: ({ row }) => {
    const po = row.original
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Row actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setDetailPO(po)}>
            View
          </DropdownMenuItem>
          {po.status === 'draft' && (
            <DropdownMenuItem onClick={() => router.push(`/purchase/edit-po/${po.id}`)}>
              Edit
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setBillPoId(po.id)}>
            Create Bill
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  },
},
```

- [ ] **Step 4: Replace the `PageHeader` actions prop**

Find the `actions` prop on `<PageHeader>` and replace:

```tsx
actions={
  <div className="flex gap-2">
    <Button variant="outline" onClick={() => setRfqOpen(true)}>
      RFQ
    </Button>
    <Button onClick={() => router.push('/purchase/create-po')}>
      + Create PO
    </Button>
  </div>
}
```

- [ ] **Step 5: Add `RfqFormDialog` and `BillFormDialog` at the bottom of the JSX return**

After the closing `</PoDetailDialog>` tag and before the closing `</div>`:

```tsx
<RfqFormDialog
  open={rfqOpen}
  onOpenChange={setRfqOpen}
/>

{billPoId && (
  <BillFormDialog
    open={!!billPoId}
    onOpenChange={(v) => { if (!v) setBillPoId(null) }}
    initialPoId={billPoId}
  />
)}
```

- [ ] **Step 6: TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | head -20
```

Expected: one or two errors about `initialPoId` not existing on `BillFormDialog` — that's fine, Task 3 fixes it. All other errors must be zero.

- [ ] **Step 7: Commit**

```bash
cd D:/MMS && git add "src/app/(dashboard)/purchase/orders/page.tsx" && git commit -m "feat(purchase): RFQ button + three-dot row actions (View/Edit/Create Bill) on PO list"
```

---

## Task 3: BillFormDialog — Add `initialPoId` Prop

**Files:**
- Modify: `src/components/purchase/BillFormDialog.tsx`

When `initialPoId` is provided, the dialog skips the PO-selector dropdown and starts with that PO pre-selected.

- [ ] **Step 1: Update the `Props` type**

Find:
```typescript
type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
}
```

Replace with:
```typescript
type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  initialPoId?: string
}
```

- [ ] **Step 2: Destructure the new prop in the component signature**

Find:
```typescript
export function BillFormDialog({ open, onOpenChange }: Props) {
```

Replace with:
```typescript
export function BillFormDialog({ open, onOpenChange, initialPoId }: Props) {
```

- [ ] **Step 3: Initialise `selectedPoId` from `initialPoId` when the dialog opens**

Find the existing `useEffect` that resets lines (the one with `[selectedPoId, selectedReceivalId, ...]` deps) and add a **new** `useEffect` above it:

```typescript
useEffect(() => {
  if (open && initialPoId) {
    setSelectedPoId(initialPoId)
  }
}, [open, initialPoId])
```

- [ ] **Step 4: Hide the PO selector when `initialPoId` is provided**

Find the PO `<Select>` block in the JSX. It currently looks like:
```tsx
<div className="space-y-1">
  <Label>Purchase Order *</Label>
  <Select value={selectedPoId} onValueChange={setSelectedPoId}>
    ...
  </Select>
</div>
```

Wrap it in a conditional so it only renders when there is no pre-selected PO:
```tsx
{!initialPoId && (
  <div className="space-y-1">
    <Label>Purchase Order *</Label>
    <Select value={selectedPoId} onValueChange={setSelectedPoId}>
      ...
    </Select>
  </div>
)}
```

If `initialPoId` is provided, show the pre-selected PO name as read-only text instead:
```tsx
{initialPoId && selectedPO && (
  <div className="space-y-1">
    <Label>Purchase Order</Label>
    <p className="text-sm font-medium border rounded-md px-3 py-2 bg-muted">
      {selectedPO.po_number} — {selectedPO.supplier_name}
    </p>
  </div>
)}
```

Place both blocks in the same position in the JSX (they are mutually exclusive).

- [ ] **Step 5: Reset `selectedPoId` on close when `initialPoId` is NOT set**

The existing `close` function resets state. Ensure it only resets `selectedPoId` when `initialPoId` is not provided:

Find the `close` function:
```typescript
const close = () => {
  setSelectedPoId(''); setSelectedReceivalId(''); setNotes(''); setLines([])
  onOpenChange(false)
}
```

Replace with:
```typescript
const close = () => {
  if (!initialPoId) setSelectedPoId('')
  setSelectedReceivalId('')
  setNotes('')
  setLines([])
  onOpenChange(false)
}
```

- [ ] **Step 6: TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | head -20
```

Expected: zero errors.

- [ ] **Step 7: Commit**

```bash
cd D:/MMS && git add src/components/purchase/BillFormDialog.tsx && git commit -m "feat(purchase): BillFormDialog accepts initialPoId to pre-select PO and skip selector"
```

---

## Task 4: PoDetailDialog — Add "Create Bill" Button

**Files:**
- Modify: `src/components/purchase/PoDetailDialog.tsx`

Add a `onCreateBill` callback prop and a "Create Bill" button in the footer.

- [ ] **Step 1: Read the `Props` type at the top of `PoDetailDialog.tsx`**

Find the existing `Props` type and confirm its current shape:
```typescript
type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  po: PurchaseOrder | null
  onEdit?: (po: PurchaseOrder) => void
}
```

- [ ] **Step 2: Add `onCreateBill` to the `Props` type**

```typescript
type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  po: PurchaseOrder | null
  onEdit?: (po: PurchaseOrder) => void
  onCreateBill?: (poId: string) => void
}
```

- [ ] **Step 3: Destructure `onCreateBill` in the component signature**

Find:
```typescript
export function PoDetailDialog({ open, onOpenChange, po, onEdit }: Props) {
```

Replace with:
```typescript
export function PoDetailDialog({ open, onOpenChange, po, onEdit, onCreateBill }: Props) {
```

- [ ] **Step 4: Add "Create Bill" button in the footer action area**

Find the footer action div:
```typescript
<div className="shrink-0 flex flex-wrap gap-2 pt-2 border-t">
  {current.status === 'draft' && onEdit && (
    <Button variant="outline" size="sm" disabled={isLoading} onClick={() => { onEdit(current); onOpenChange(false) }}>
      Edit PO
    </Button>
  )}
  <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
    Close
  </Button>
</div>
```

Replace with:
```typescript
<div className="shrink-0 flex flex-wrap gap-2 pt-2 border-t">
  {current.status === 'draft' && onEdit && (
    <Button variant="outline" size="sm" disabled={isLoading} onClick={() => { onEdit(current); onOpenChange(false) }}>
      Edit PO
    </Button>
  )}
  {onCreateBill && (
    <Button variant="outline" size="sm" onClick={() => { onCreateBill(current.id); onOpenChange(false) }}>
      Create Bill
    </Button>
  )}
  <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
    Close
  </Button>
</div>
```

- [ ] **Step 5: Wire `onCreateBill` in `orders/page.tsx`**

Open `src/app/(dashboard)/purchase/orders/page.tsx` and find the `<PoDetailDialog>` component at the bottom. Add the `onCreateBill` prop:

```tsx
<PoDetailDialog
  open={!!detailPO}
  onOpenChange={(open) => { if (!open) setDetailPO(null) }}
  po={detailPO}
  onEdit={(po) => router.push(`/purchase/edit-po/${po.id}`)}
  onCreateBill={(poId) => { setDetailPO(null); setBillPoId(poId) }}
/>
```

- [ ] **Step 6: TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | head -20
```

Expected: zero errors.

- [ ] **Step 7: Final build check**

```bash
cd D:/MMS && npx next build 2>&1 | tail -20
```

Expected: build succeeds, all routes present.

- [ ] **Step 8: Commit**

```bash
cd D:/MMS && git add src/components/purchase/PoDetailDialog.tsx "src/app/(dashboard)/purchase/orders/page.tsx" && git commit -m "feat(purchase): Create Bill button on PO detail dialog — opens BillFormDialog pre-filled"
```

---

## Self-Review Checklist

| Requirement | Task | Status |
|---|---|---|
| Remove RFQ from nav dropdown | 1 | ✅ |
| Remove Bills from nav dropdown | 1 | ✅ |
| RFQ button on PO list header | 2 | ✅ |
| + Create PO button kept | 2 | ✅ |
| Three-dot row: View | 2 | ✅ |
| Three-dot row: Edit (draft only) | 2 | ✅ |
| Three-dot row: Create Bill | 2 | ✅ |
| BillFormDialog pre-selects PO via `initialPoId` | 3 | ✅ |
| BillFormDialog hides PO selector when pre-filled | 3 | ✅ |
| PoDetailDialog "Create Bill" button | 4 | ✅ |
| orders/page.tsx wires `onCreateBill` to open BillFormDialog | 4 | ✅ |
