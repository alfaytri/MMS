# Purchase Payments Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Purchase Payments so supplier names and PO links resolve correctly, add PO # / eye icon UX mirroring Invoice Payments, enable one-time bill attachment from both the Payments page and the Bills detail page, and backfill orphaned null payment IDs.

**Architecture:** Hook fix first (data layer), then PoDetailDialog prop extension, then new RPC + mutation hook, then UI components (AttachBillDialog), then wire everything into the two consumer pages. All linking logic runs inside a single Postgres transaction via an RPC — no partial state possible.

**Tech Stack:** Next.js 15, React, TypeScript, shadcn/ui (Dialog, Select, Button, Skeleton), TanStack Query v5, Supabase (RPC, PostgREST joins), Lucide icons

---

## Files

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/20260428200006_assign_missing_spay_ids.sql` | Create | Backfill SPAY- IDs for orphaned outgoing payments |
| `supabase/migrations/20260428200007_attach_payment_to_bill_rpc.sql` | Create | Atomic RPC: link payment to bill + recalculate payment_status |
| `src/hooks/useSupplierPayments.ts` | Modify | Fix supplier/PO resolution; add po_id, po_number, supplier_id fields; add useUnlinkedOutgoingPayments |
| `src/hooks/useSupplierBills.ts` | Modify | Add supplier_id to BillFilters |
| `src/hooks/useAttachPaymentToBill.ts` | Create | Mutation hook calling attach_payment_to_bill RPC |
| `src/components/purchase/PoDetailDialog.tsx` | Modify | Accept poId?: string prop; remove stub requirement from callers |
| `src/components/purchase/AttachBillDialog.tsx` | Create | Dual-mode dialog: attach-bill (payments page) / link-payment (bills page) |
| `src/app/(dashboard)/purchase/payments/page.tsx` | Modify | PO # column, eye icon, paperclip action, PoDetailDialog via poId |
| `src/components/purchase/BillDetailDocument.tsx` | Modify | Payment section with Link Payment button or read-only payment rows |

---

## Task 1: Data migration — backfill SPAY- IDs

**Files:**
- Create: `supabase/migrations/20260428200006_assign_missing_spay_ids.sql`

- [ ] **Step 1: Create the migration file**

Write to `supabase/migrations/20260428200006_assign_missing_spay_ids.sql`:

```sql
-- Assign SPAY-XXXXX payment IDs to outgoing payments that have none.
-- Uses regex '^SPAY-\d+$' to safely cast only clean numeric suffixes.
WITH max_seq AS (
  SELECT COALESCE(MAX(CAST(SUBSTRING(payment_id FROM 6) AS integer)), 0) AS n
  FROM payments
  WHERE payment_id ~ '^SPAY-\d+$'
),
numbered AS (
  SELECT id,
         ROW_NUMBER() OVER (ORDER BY date, created_at) AS rn
  FROM payments
  WHERE direction = 'outgoing'
    AND payment_id IS NULL
)
UPDATE payments p
SET payment_id = 'SPAY-' || LPAD((m.n + numbered.rn)::text, 5, '0')
FROM numbered, max_seq m
WHERE p.id = numbered.id;
```

- [ ] **Step 2: Apply to Supabase**

Run in Supabase SQL Editor (or `supabase db push`). Verify with:
```sql
SELECT id, payment_id, amount, date
FROM payments
WHERE direction = 'outgoing'
ORDER BY date DESC
LIMIT 10;
```
Expected: no rows have `payment_id = NULL`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260428200006_assign_missing_spay_ids.sql
git commit -m "fix(data): backfill SPAY- IDs for orphaned outgoing payments"
```

---

## Task 2: Supabase RPC — atomic attach_payment_to_bill

**Files:**
- Create: `supabase/migrations/20260428200007_attach_payment_to_bill_rpc.sql`

- [ ] **Step 1: Create the migration file**

Write to `supabase/migrations/20260428200007_attach_payment_to_bill_rpc.sql`:

```sql
-- Atomic RPC: links a payment to a bill and recalculates payment_status.
-- Runs entirely in one transaction — partial state is impossible.
CREATE OR REPLACE FUNCTION attach_payment_to_bill(
  p_payment_id uuid,
  p_bill_id    uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_bill_total   numeric;
  v_total_paid   numeric;
  v_new_status   text;
BEGIN
  -- Link payment to bill
  UPDATE payments
  SET invoice_id = p_bill_id
  WHERE id = p_payment_id;

  -- Sum all outgoing payments now linked to this bill
  SELECT COALESCE(SUM(amount), 0)
    INTO v_total_paid
    FROM payments
   WHERE invoice_id = p_bill_id
     AND direction = 'outgoing';

  -- Get bill total
  SELECT total_amount
    INTO v_bill_total
    FROM invoices
   WHERE id = p_bill_id;

  -- Derive correct status
  v_new_status := CASE
    WHEN v_total_paid >= v_bill_total THEN 'paid'
    WHEN v_total_paid > 0             THEN 'partially_paid'
    ELSE                                   'unpaid'
  END;

  UPDATE invoices
  SET payment_status = v_new_status
  WHERE id = p_bill_id;
END;
$$;
```

- [ ] **Step 2: Apply to Supabase**

Run in Supabase SQL Editor (or `supabase db push`). Verify the function exists:
```sql
SELECT proname FROM pg_proc WHERE proname = 'attach_payment_to_bill';
```
Expected: one row returned.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260428200007_attach_payment_to_bill_rpc.sql
git commit -m "feat(db): add attach_payment_to_bill atomic RPC"
```

---

## Task 3: Fix useSupplierPayments hook

**Files:**
- Modify: `src/hooks/useSupplierPayments.ts`

- [ ] **Step 1: Replace the type definition and useSupplierPayments function**

In `src/hooks/useSupplierPayments.ts`, replace the `SupplierPayment` type and `useSupplierPayments` function with:

```ts
export type SupplierPayment = {
  id: string
  payment_id: string | null
  invoice_id: string | null       // null for PO-direct payments
  supplier_id?: string | null     // set on PO-direct payments
  amount: number
  method: string
  date: string
  reference: string | null
  notes: string | null
  direction: 'outgoing'
  status: string | null
  created_at: string | null
  // joined / resolved
  invoice_display?: string | null
  supplier_name?: string | null
  po_id?: string | null
  po_number?: string | null
}

export function useSupplierPayments(billId?: string) {
  return useQuery({
    queryKey: ['supplier-payments', billId],
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('payments')
        .select(`
          *,
          invoices(invoice_id, purchase_order_id, purchase_orders(id, po_number), suppliers(name)),
          suppliers(name)
        `)
        .eq('direction', 'outgoing')
        .order('date', { ascending: false })
      if (billId) q = q.eq('invoice_id', billId)
      const { data, error } = await q
      if (error) throw error

      // Batch-fetch POs for direct PO payments (source_type = 'purchase_order')
      const poIds: string[] = (data ?? [])
        .filter((p: any) => p.source_type === 'purchase_order' && p.source_id)
        .map((p: any) => p.source_id as string)

      const poMap: Record<string, { po_number: string; supplier_name: string | null }> = {}
      if (poIds.length > 0) {
        const { data: pos } = await (supabase as any)
          .from('purchase_orders')
          .select('id, po_number, suppliers(name)')
          .in('id', poIds)
        for (const po of pos ?? []) {
          poMap[po.id] = {
            po_number: po.po_number,
            supplier_name: po.suppliers?.name ?? null,
          }
        }
      }

      return (data ?? []).map((p: any) => {
        const poInfo = p.source_type === 'purchase_order' && p.source_id ? poMap[p.source_id] : null
        return {
          ...p,
          invoice_display:  p.invoices?.invoice_id ?? null,
          supplier_name:    p.invoices?.suppliers?.name
                            ?? p.suppliers?.name
                            ?? poInfo?.supplier_name
                            ?? null,
          po_id:            p.invoices?.purchase_orders?.id
                            ?? (p.source_type === 'purchase_order' ? p.source_id : null)
                            ?? null,
          po_number:        p.invoices?.purchase_orders?.po_number
                            ?? poInfo?.po_number
                            ?? null,
        } as SupplierPayment
      })
    },
  })
}
```

- [ ] **Step 2: Add useUnlinkedOutgoingPayments at the end of the file**

Append to `src/hooks/useSupplierPayments.ts` (after `useCreateSupplierPayment`):

```ts
export type UnlinkedPayment = {
  id: string
  payment_id: string | null
  amount: number
  method: string
  date: string
}

export function useUnlinkedOutgoingPayments(supplierId: string | null | undefined) {
  return useQuery({
    queryKey: ['unlinked-outgoing-payments', supplierId ?? null],
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('payments')
        .select('id, payment_id, amount, method, date')
        .eq('direction', 'outgoing')
        .is('invoice_id', null)
        .order('date', { ascending: false })
      if (supplierId) q = q.eq('supplier_id', supplierId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as UnlinkedPayment[]
    },
  })
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```
Expected: no errors. (Any callers that passed `invoice_id` as non-null string will now need `invoice_id: string | null` — the type is widened, so existing callers that assign it will still compile.)

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useSupplierPayments.ts
git commit -m "fix(hook): resolve supplier name and PO info for PO-direct payments"
```

---

## Task 4: Update PoDetailDialog to accept poId prop

**Files:**
- Modify: `src/components/purchase/PoDetailDialog.tsx`

- [ ] **Step 1: Update Props type**

Find and replace the Props type (lines 35–40):

```ts
type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  po?: PurchaseOrder | null
  poId?: string
  onEdit?: (po: PurchaseOrder) => void
}
```

- [ ] **Step 2: Update function signature and internal ID resolution**

Replace the function signature and the lines that use `po?.id` with a resolved ID:

```ts
export function PoDetailDialog({ open, onOpenChange, po, poId, onEdit }: Props) {
  const router = useRouter()
  const [paymentOpen, setPaymentOpen] = useState(false)

  const resolvedId = po?.id ?? poId ?? null

  const { data: fullPO, isLoading, isError } = usePurchaseOrder(open ? resolvedId : null)
  const { data: payments } = usePOPayments(open ? resolvedId : null)
  const { data: receivals } = usePOReceivalsByPO(open ? resolvedId : null)
  const { data: versions = [] } = usePoVersions(open ? resolvedId : null)
  const { data: activityLogs } = useActivityLog(
    open && resolvedId ? { module: 'purchase_orders', entity_id: resolvedId } : {}
  )
  const { data: existingBills = [] } = useBillsByPO(open ? resolvedId : null)
  const submitPO = useSubmitPOForApproval()
  const cancelPO = useCancelPO()

  const current = fullPO ?? po
```

- [ ] **Step 3: Add skeleton when only poId provided and still loading**

Find the line `return (` just before `<Dialog open={open}` and add a skeleton guard before it:

```ts
  // Show skeleton header while PO loads when only an ID was provided
  if (open && !current && isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-4xl sm:rounded-lg max-h-[95vh] flex flex-col">
          <div className="p-6 space-y-3">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-64" />
          </div>
        </DialogContent>
      </Dialog>
    )
  }
```

Add `Skeleton` import at the top of the file (it's already in shadcn/ui):
```ts
import { Skeleton } from '@/components/ui/skeleton'
```

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit
```
Expected: no errors. Existing callers pass `po={...}` which still works since `po` is now optional.

- [ ] **Step 5: Commit**

```bash
git add src/components/purchase/PoDetailDialog.tsx
git commit -m "feat(ui): PoDetailDialog accepts poId prop — no stub construction needed"
```

---

## Task 5: Add supplier_id filter to useSupplierBills

**Files:**
- Modify: `src/hooks/useSupplierBills.ts`

- [ ] **Step 1: Add supplier_id to BillFilters**

Find the `BillFilters` type and add the new field:

```ts
export type BillFilters = {
  search?: string
  doc_status?: ApInvoice['doc_status'] | ''
  payment_status?: ApInvoice['payment_status'] | ''
  supplier_id?: string
}
```

- [ ] **Step 2: Apply the filter in the query**

In `useSupplierBills`, after the existing `if (filters?.search)` block, add:

```ts
if (filters?.supplier_id) q = q.eq('supplier_id', filters.supplier_id)
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useSupplierBills.ts
git commit -m "feat(hook): add supplier_id filter to useSupplierBills"
```

---

## Task 6: New useAttachPaymentToBill hook

**Files:**
- Create: `src/hooks/useAttachPaymentToBill.ts`

- [ ] **Step 1: Create the file**

Write to `src/hooks/useAttachPaymentToBill.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export function useAttachPaymentToBill() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ paymentId, billId }: { paymentId: string; billId: string }) => {
      const supabase = createClient()
      const { error } = await (supabase as any).rpc('attach_payment_to_bill', {
        p_payment_id: paymentId,
        p_bill_id: billId,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-payments'] })
      queryClient.invalidateQueries({ queryKey: ['supplier-bills'] })
      queryClient.invalidateQueries({ queryKey: ['bill-view-model'] })
    },
  })
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useAttachPaymentToBill.ts
git commit -m "feat(hook): useAttachPaymentToBill — calls atomic Supabase RPC"
```

---

## Task 7: New AttachBillDialog component

**Files:**
- Create: `src/components/purchase/AttachBillDialog.tsx`

- [ ] **Step 1: Create the component**

Write to `src/components/purchase/AttachBillDialog.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useSupplierBills } from '@/hooks/useSupplierBills'
import { useUnlinkedOutgoingPayments } from '@/hooks/useSupplierPayments'
import { useAttachPaymentToBill } from '@/hooks/useAttachPaymentToBill'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 'attach-bill': called from Payments page — paymentId is set, user picks a bill */
  mode: 'attach-bill' | 'link-payment'
  paymentId?: string   // required when mode = 'attach-bill'
  billId?: string      // required when mode = 'link-payment'
  supplierId?: string | null
}

export function AttachBillDialog({ open, onOpenChange, mode, paymentId, billId, supplierId }: Props) {
  const [selectedId, setSelectedId] = useState<string>('')
  const attach = useAttachPaymentToBill()

  // attach-bill mode: fetch unpaid/partially_paid bills for this supplier
  const { data: bills = [], isLoading: loadingBills } = useSupplierBills(
    mode === 'attach-bill' ? { supplier_id: supplierId ?? undefined } : undefined
  )
  const availableBills = bills.filter(
    (b) => b.payment_status === 'unpaid' || b.payment_status === 'partially_paid'
  )

  // link-payment mode: fetch unlinked outgoing payments for this supplier
  const { data: payments = [], isLoading: loadingPayments } = useUnlinkedOutgoingPayments(
    mode === 'link-payment' ? supplierId : undefined
  )

  const isLoading = mode === 'attach-bill' ? loadingBills : loadingPayments
  const isEmpty   = mode === 'attach-bill' ? availableBills.length === 0 : payments.length === 0

  function handleOpenChange(v: boolean) {
    if (!v) setSelectedId('')
    onOpenChange(v)
  }

  async function handleConfirm() {
    if (!selectedId) return
    try {
      if (mode === 'attach-bill') {
        await attach.mutateAsync({ paymentId: paymentId!, billId: selectedId })
      } else {
        await attach.mutateAsync({ paymentId: selectedId, billId: billId! })
      }
      toast.success(mode === 'attach-bill' ? 'Bill attached to payment.' : 'Payment linked to bill.')
      handleOpenChange(false)
    } catch {
      toast.error('Failed to link. Please try again.')
    }
  }

  const title = mode === 'attach-bill' ? 'Attach Bill to Payment' : 'Link Payment to Bill'
  const emptyMsg = mode === 'attach-bill'
    ? 'No unpaid bills found for this supplier.'
    : 'No unlinked payments found for this supplier.'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4">Loading…</p>
        ) : isEmpty ? (
          <p className="text-sm text-muted-foreground py-4">{emptyMsg}</p>
        ) : (
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              {mode === 'attach-bill'
                ? availableBills.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.invoice_id ?? b.id} — {formatCurrency(b.total_amount ?? 0, 'QAR')} ({formatDate(b.created_at ?? '')})
                    </SelectItem>
                  ))
                : payments.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.payment_id ?? '—'} — {formatCurrency(p.amount, 'QAR')} ({formatDate(p.date)})
                    </SelectItem>
                  ))
              }
            </SelectContent>
          </Select>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!selectedId || attach.isPending}
            onClick={handleConfirm}
          >
            {attach.isPending ? 'Saving…' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/purchase/AttachBillDialog.tsx
git commit -m "feat(ui): AttachBillDialog — dual-mode bill/payment linker"
```

---

## Task 8: Update Purchase Payments page

**Files:**
- Modify: `src/app/(dashboard)/purchase/payments/page.tsx`

- [ ] **Step 1: Add new imports**

Replace the existing lucide import line (currently `import { Eye } from 'lucide-react'`) with:
```ts
import { Eye, Paperclip } from 'lucide-react'
```

Add two new imports after the existing import block:
```ts
import { PoDetailDialog } from '@/components/purchase/PoDetailDialog'
import { AttachBillDialog } from '@/components/purchase/AttachBillDialog'
```

- [ ] **Step 2: Add new state inside PaymentsPage**

After the existing `const [detailOpen, setDetailOpen] = useState(false)` line, add:

```ts
const [poDetailOpen, setPoDetailOpen]     = useState(false)
const [selectedPoId, setSelectedPoId]     = useState<string | null>(null)
const [attachBillOpen, setAttachBillOpen] = useState(false)
const [attachPaymentId, setAttachPaymentId] = useState<string | null>(null)
const [attachSupplierId, setAttachSupplierId] = useState<string | null>(null)
```

- [ ] **Step 3: Add PO # column and actions column to purchaseColumns**

Replace the existing `purchaseColumns` useMemo with:

```tsx
const purchaseColumns = useMemo<ColumnDef<SupplierPayment>[]>(() => [
  {
    accessorKey: 'payment_id',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Payment #" />,
    cell: ({ row }) => (
      <span className="font-mono text-sm font-medium">
        {row.original.payment_id ?? '—'}
      </span>
    ),
  },
  {
    id: 'supplier',
    header: 'Supplier',
    cell: ({ row }) => row.original.supplier_name ?? '—',
  },
  {
    id: 'po_number',
    header: 'PO #',
    cell: ({ row }) => {
      const po = row.original.po_number
      const poId = row.original.po_id
      if (!po || !poId) return <span className="text-muted-foreground">—</span>
      return (
        <button
          type="button"
          aria-label={`View PO ${po}`}
          onClick={() => { setSelectedPoId(poId); setPoDetailOpen(true) }}
          className="font-mono text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
        >
          {po}
        </button>
      )
    },
  },
  {
    id: 'bill',
    header: 'Bill #',
    cell: ({ row }) => row.original.invoice_display ?? '—',
  },
  {
    accessorKey: 'amount',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
    cell: ({ row }) => formatCurrency(row.original.amount, DEFAULT_CURRENCY),
  },
  {
    accessorKey: 'method',
    header: 'Method',
    cell: ({ row }) => (
      <Badge variant="outline" className="text-xs">
        {METHOD_LABELS[row.original.method] ?? row.original.method}
      </Badge>
    ),
  },
  {
    accessorKey: 'date',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
    cell: ({ row }) => formatDate(row.original.date),
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => {
      const p = row.original
      return (
        <div className="flex items-center gap-1">
          {p.po_id && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              aria-label="View purchase order"
              onClick={() => { setSelectedPoId(p.po_id!); setPoDetailOpen(true) }}
            >
              <Eye className="h-3.5 w-3.5" />
            </Button>
          )}
          {!p.invoice_id && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              aria-label="Attach bill"
              onClick={() => {
                setAttachPaymentId(p.id)
                setAttachSupplierId(p.supplier_id ?? null)
                setAttachBillOpen(true)
              }}
            >
              <Paperclip className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      )
    },
  },
], [])
```

- [ ] **Step 4: Add PoDetailDialog and AttachBillDialog to the JSX**

After the existing `<SoDetailDialog ... />` in the return JSX, add:

```tsx
<PoDetailDialog
  open={poDetailOpen}
  onOpenChange={setPoDetailOpen}
  poId={selectedPoId ?? undefined}
/>
<AttachBillDialog
  open={attachBillOpen}
  onOpenChange={setAttachBillOpen}
  mode="attach-bill"
  paymentId={attachPaymentId ?? undefined}
  supplierId={attachSupplierId}
/>
```

- [ ] **Step 5: Verify TypeScript**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/(dashboard)/purchase/payments/page.tsx
git commit -m "feat(ui): purchase payments — PO # link, eye icon, attach bill action"
```

---

## Task 9: Add Payment section to BillDetailDocument

**Files:**
- Modify: `src/components/purchase/BillDetailDocument.tsx`

- [ ] **Step 1: Add imports**

Add to the existing imports at the top of `BillDetailDocument.tsx`:

```ts
import { useState } from 'react'           // already imported via useEffect — add useState
import { AttachBillDialog } from './AttachBillDialog'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'  // already imported
```

Note: `useState` may already be imported — only add if missing.

- [ ] **Step 2: Add dialog state inside BillDetailDocument**

After the existing `const [origin, setOrigin] = useState('')` line, add:

```ts
const [attachOpen, setAttachOpen] = useState(false)
```

- [ ] **Step 3: Add Payment section to the JSX**

Append the following section to the document's JSX, after the related bills section and before the closing `</div>`:

```tsx
{/* Payment section — not printed */}
<BillDetailSection title="Payment" className="print:hidden">
  {payments.length > 0 ? (
    <div className="space-y-2">
      {payments.map((p) => (
        <div key={p.id} className="flex items-center justify-between text-sm border rounded-md px-3 py-2 bg-muted/40">
          <span className="font-mono font-medium">{p.payment_id}</span>
          <span>{formatCurrency(p.amount, currency)}</span>
          <span className="text-muted-foreground">{formatDate(p.date)}</span>
          <span className="capitalize text-muted-foreground">{p.method.replace(/_/g, ' ')}</span>
        </div>
      ))}
    </div>
  ) : (
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">No payment linked yet.</p>
      {bill.payment_status !== 'paid' && (
        <Button size="sm" variant="outline" onClick={() => setAttachOpen(true)}>
          Link Payment
        </Button>
      )}
    </div>
  )}
</BillDetailSection>

<AttachBillDialog
  open={attachOpen}
  onOpenChange={setAttachOpen}
  mode="link-payment"
  billId={bill.id}
  supplierId={bill.supplier_id ?? undefined}
/>
```

Also add `Button` to the imports if not already present:
```ts
import { Button } from '@/components/ui/button'
```

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/purchase/BillDetailDocument.tsx
git commit -m "feat(ui): bill detail — payment section with Link Payment button"
```

---

## Task 10: Update PROGRESS.md

- [ ] **Step 1: Update PROGRESS.md**

Add to top of `## ✅ Completed`:
```
- [2026-04-28] **Purchase Payments Enhancement (All Tasks)** — `src/hooks/useSupplierPayments.ts`, `src/hooks/useSupplierBills.ts`, `src/hooks/useAttachPaymentToBill.ts` (new), `src/components/purchase/AttachBillDialog.tsx` (new), `src/components/purchase/PoDetailDialog.tsx`, `src/components/purchase/BillDetailDocument.tsx`, `src/app/(dashboard)/purchase/payments/page.tsx`, `supabase/migrations/20260428200006_assign_missing_spay_ids.sql`, `supabase/migrations/20260428200007_attach_payment_to_bill_rpc.sql` — Fixed supplier/PO resolution for PO-direct payments; PO # column + eye icon on Purchase Payments; one-time bill attachment via atomic RPC from both Payments page and Bill detail; backfilled null SPAY- IDs
```

- [ ] **Step 2: Commit**

```bash
git add PROGRESS.md
git commit -m "docs: update PROGRESS.md — purchase payments enhancement complete"
```
