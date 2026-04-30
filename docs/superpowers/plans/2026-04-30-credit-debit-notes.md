# Credit & Debit Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-generate Credit Notes on SO return restock and Debit Notes on PO return dispatch, expose both on a unified central page with PDF download.

**Architecture:** Extend the existing `credit_notes` table with a `note_type` column (`'credit'|'debit'`), a `source_return_id` FK, and summary totals. Credit notes are auto-created inside `useUpdateReturnStatus` after restock; debit notes inside `useUpdatePOReturnStatus` after dispatch. Both share one PDF component parameterised by type, and the central `/sales/credit-notes` page gains a type-switcher dropdown.

**Tech Stack:** Next.js 14, Supabase (postgres), @tanstack/react-query, @react-pdf/renderer 4.5, shadcn/ui, TypeScript

**Spec:** `docs/superpowers/specs/2026-04-30-credit-debit-notes-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/20260430190000_credit_debit_notes.sql` | Create | Schema changes to `credit_notes` |
| `src/types/database.types.ts` | Modify | Sync `credit_notes` Row/Insert types |
| `src/hooks/useCreditNotes.ts` | Modify | New fields, DN sequencing, `useDebitNotes`, filter by type |
| `src/hooks/usePurchaseReturns.ts` | Modify | Add condition to `POReturnItem`, auto-create DN on dispatch |
| `src/hooks/useSaleReturns.ts` | Modify | Auto-create CN on restock |
| `src/components/purchase/PoDetailDialog.tsx` | Modify | Condition Select per return item row |
| `src/components/sales/CreditDebitNotePdf.tsx` | Create | @react-pdf document component |
| `src/components/sales/CreditDebitNoteDownloadButton.tsx` | Create | PDFDownloadLink wrapper |
| `src/app/(dashboard)/sales/credit-notes/page.tsx` | Modify | Type switcher, debit columns, download action |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260430190000_credit_debit_notes.sql`

- [ ] **Step 1: Write migration file**

```sql
-- supabase/migrations/20260430190000_credit_debit_notes.sql

-- 1. Make invoice_id and customer_name nullable (debit notes have neither)
ALTER TABLE credit_notes
  ALTER COLUMN invoice_id   DROP NOT NULL,
  ALTER COLUMN customer_name DROP NOT NULL;

-- 2. Add new columns
ALTER TABLE credit_notes
  ADD COLUMN IF NOT EXISTS note_type         TEXT    NOT NULL DEFAULT 'credit',
  ADD COLUMN IF NOT EXISTS source_return_id  UUID    REFERENCES returns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_name     TEXT,
  ADD COLUMN IF NOT EXISTS original_total    NUMERIC,
  ADD COLUMN IF NOT EXISTS new_total         NUMERIC;

-- 3. Backfill existing rows
UPDATE credit_notes SET note_type = 'credit' WHERE note_type IS NULL;

-- 4. Index for the type switcher query
CREATE INDEX IF NOT EXISTS idx_credit_notes_type ON credit_notes(note_type);
```

- [ ] **Step 2: Apply migration**

```bash
npx supabase db push
```

Expected output includes: `Applying migration 20260430190000_credit_debit_notes.sql...`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260430190000_credit_debit_notes.sql
git commit -m "feat(db): add note_type, source_return_id, supplier_name, original_total, new_total to credit_notes"
```

---

## Task 2: Update TypeScript Types

**Files:**
- Modify: `src/types/database.types.ts`
- Modify: `src/hooks/useCreditNotes.ts`
- Modify: `src/hooks/usePurchaseReturns.ts`

- [ ] **Step 1: Update `database.types.ts` — credit_notes Row**

Find the `credit_notes` Row block (around line 826) and update:

```ts
// BEFORE (credit_notes Row):
invoice_id: string
customer_name: string

// AFTER (credit_notes Row):
invoice_id: string | null
customer_name: string | null
// ADD these after updated_at:
note_type: string
original_total: number | null
new_total: number | null
source_return_id: string | null
supplier_name: string | null
```

Also update the `Insert` block (around line 845):

```ts
// BEFORE (credit_notes Insert):
invoice_id: string
customer_name: string

// AFTER (credit_notes Insert):
invoice_id?: string | null
customer_name?: string | null
// ADD:
note_type?: string
original_total?: number | null
new_total?: number | null
source_return_id?: string | null
supplier_name?: string | null
```

- [ ] **Step 2: Update `CreditNote` type in `useCreditNotes.ts`**

Replace the existing `CreditNote` type:

```ts
export type CreditNote = {
  id: string
  credit_note_id: string
  invoice_id: string | null
  customer_name: string | null
  supplier_name: string | null
  note_type: 'credit' | 'debit'
  reason: string
  type: string
  status: CreditNoteStatus | null
  total_amount: number
  original_total: number | null
  new_total: number | null
  source_return_id: string | null
  line_items: NotePdfData | null
  created_at: string
  updated_at: string
  // joined
  invoice_display?: string | null
}
```

Add the `NotePdfData` types above `CreditNote`:

```ts
export type NoteLineItem = {
  item_name: string
  sku: string | null
  qty: number
  unit_price: number
  total: number
}

export type NoteDebitLineItem = NoteLineItem & {
  condition?: 'defective' | 'damaged' | 'other'
  condition_notes?: string | null
}

export type NotePdfData = {
  original_lines: NoteLineItem[]
  returned_lines: NoteDebitLineItem[]
}
```

- [ ] **Step 3: Update `POReturnItem` type in `usePurchaseReturns.ts`**

Replace existing `POReturnItem`:

```ts
export type POReturnItem = {
  item_name: string
  sku: string | null
  qty: number
  brand_variant_id: string | null
  condition: 'defective' | 'damaged' | 'other'
  condition_notes: string | null
}
```

- [ ] **Step 4: Commit**

```bash
git add src/types/database.types.ts src/hooks/useCreditNotes.ts src/hooks/usePurchaseReturns.ts
git commit -m "feat(types): extend CreditNote, add NoteLineItem types, add condition to POReturnItem"
```

---

## Task 3: Update `useCreditNotes.ts` — Sequencing & Debit Query

**Files:**
- Modify: `src/hooks/useCreditNotes.ts`

- [ ] **Step 1: Add `nextNoteId` helper and update `useCreditNotes` filter**

Replace the entire file content with:

```ts
// src/hooks/useCreditNotes.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type CreditNoteStatus = 'draft' | 'approved' | 'issued' | 'redeemed'

export type CreditNoteLine = {
  id: string
  credit_note_id: string
  invoice_line_id: string | null
  description: string
  qty: number
  unit_price: number
  total: number
  created_at: string
}

export type NoteLineItem = {
  item_name: string
  sku: string | null
  qty: number
  unit_price: number
  total: number
}

export type NoteDebitLineItem = NoteLineItem & {
  condition?: 'defective' | 'damaged' | 'other'
  condition_notes?: string | null
}

export type NotePdfData = {
  original_lines: NoteLineItem[]
  returned_lines: NoteDebitLineItem[]
}

export type CreditNote = {
  id: string
  credit_note_id: string
  invoice_id: string | null
  customer_name: string | null
  supplier_name: string | null
  note_type: 'credit' | 'debit'
  reason: string
  type: string
  status: CreditNoteStatus | null
  total_amount: number
  original_total: number | null
  new_total: number | null
  source_return_id: string | null
  line_items: NotePdfData | null
  created_at: string
  updated_at: string
  credit_note_lines?: CreditNoteLine[]
  // joined
  invoice_display?: string | null
}

export type CreateCreditNotePayload = {
  invoice_id: string
  customer_name: string
  reason: string
  lines: {
    invoice_line_id: string | null
    description: string
    qty: number
    unit_price: number
  }[]
}

/** Returns the next CN-XXXXX or DN-XXXXX id (max-based, collision-safe). */
export async function nextNoteId(type: 'credit' | 'debit'): Promise<string> {
  const supabase = createClient()
  const prefix = type === 'credit' ? 'CN-' : 'DN-'
  const { data } = await (supabase as any)
    .from('credit_notes')
    .select('credit_note_id')
    .ilike('credit_note_id', `${prefix}%`)
    .order('credit_note_id', { ascending: false })
    .limit(1)
    .maybeSingle()
  const last = data?.credit_note_id
    ? parseInt((data.credit_note_id as string).replace(prefix, ''), 10)
    : 0
  return `${prefix}${String(last + 1).padStart(5, '0')}`
}

export function useCreditNotes() {
  return useQuery({
    queryKey: ['credit-notes'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('credit_notes')
        .select('*, credit_note_lines(*), invoices(invoice_id)')
        .eq('note_type', 'credit')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map((cn: any) => ({
        ...cn,
        invoice_display: cn.invoices?.invoice_id ?? null,
      })) as CreditNote[]
    },
  })
}

export function useDebitNotes() {
  return useQuery({
    queryKey: ['debit-notes'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('credit_notes')
        .select('*')
        .eq('note_type', 'debit')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as CreditNote[]
    },
  })
}

export function useCreateCreditNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateCreditNotePayload) => {
      const supabase = createClient()
      const credit_note_id = await nextNoteId('credit')
      const totalAmount = payload.lines.reduce((s, l) => s + l.qty * l.unit_price, 0)

      const { data: cn, error } = await (supabase as any)
        .from('credit_notes')
        .insert({
          credit_note_id,
          invoice_id: payload.invoice_id,
          customer_name: payload.customer_name,
          reason: payload.reason,
          type: 'manual',
          note_type: 'credit',
          status: 'draft',
          total_amount: totalAmount,
        })
        .select()
        .single()
      if (error) throw error

      if (payload.lines.length > 0) {
        const { error: lErr } = await (supabase as any)
          .from('credit_note_lines')
          .insert(
            payload.lines.map((l) => ({
              credit_note_id: cn.id,
              invoice_line_id: l.invoice_line_id,
              description: l.description,
              qty: l.qty,
              unit_price: l.unit_price,
            }))
          )
        if (lErr) throw lErr
      }
      return cn as CreditNote
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['credit-notes'] }),
  })
}

export function useApplyCreditNote() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, invoiceId }: { id: string; invoiceId: string }) => {
      const supabase = createClient()
      const { data: cn } = await (supabase as any)
        .from('credit_notes')
        .select('total_amount, invoice_id')
        .eq('id', id)
        .single()

      const { data: payments } = await (supabase as any)
        .from('payments')
        .select('amount')
        .eq('invoice_id', invoiceId)
        .eq('direction', 'incoming')
      const alreadyPaid = (payments ?? []).reduce((s: number, p: any) => s + p.amount, 0)

      const { data: inv } = await (supabase as any)
        .from('invoices')
        .select('total_amount, customer_id')
        .eq('id', invoiceId)
        .single()
      const outstanding = (inv?.total_amount ?? 0) - alreadyPaid
      const cnTotal = cn?.total_amount ?? 0
      const excess = Math.max(0, cnTotal - outstanding)

      const { data: cpayMax } = await (supabase as any)
        .from('payments')
        .select('payment_id')
        .ilike('payment_id', 'CPAY-%')
        .order('payment_id', { ascending: false })
        .limit(1)
        .maybeSingle()
      const cpayLast = cpayMax?.payment_id ? parseInt(cpayMax.payment_id.replace('CPAY-', ''), 10) : 0
      const payment_id = `CPAY-${String(cpayLast + 1).padStart(5, '0')}`
      await (supabase as any).from('payments').insert({
        payment_id,
        invoice_id: invoiceId,
        amount: Math.min(cnTotal, outstanding),
        method: 'online',
        date: new Date().toISOString().split('T')[0],
        notes: `Credit note ${cn.credit_note_id ?? id} applied`,
        direction: 'incoming',
        status: 'completed',
      })

      if (excess > 0 && inv?.customer_id) {
        await (supabase as any).rpc('increment_credit_balance', {
          p_customer_id: inv.customer_id,
          p_amount: excess,
        })
      }

      await (supabase as any)
        .from('credit_notes')
        .update({ status: 'redeemed' })
        .eq('id', id)

      const newPaid = alreadyPaid + Math.min(cnTotal, outstanding)
      const newStatus =
        newPaid >= (inv?.total_amount ?? Infinity) ? 'paid' : 'partially_paid'
      await (supabase as any)
        .from('invoices')
        .update({ payment_status: newStatus })
        .eq('id', invoiceId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit-notes'] })
      queryClient.invalidateQueries({ queryKey: ['customer-invoices'] })
    },
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useCreditNotes.ts
git commit -m "feat(hooks): add nextNoteId helper, useDebitNotes, filter credit-notes by type"
```

---

## Task 4: Condition Field in PO Return Dialog

**Files:**
- Modify: `src/components/purchase/PoDetailDialog.tsx`

- [ ] **Step 1: Update `returnItems` state type to include condition fields**

Find the line (around line 95):
```ts
const [returnItems, setReturnItems] = useState<(POReturnItem & { _max: number })[]>([])
```
No change needed — `POReturnItem` already has `condition` and `condition_notes` after Task 2.

Update `openCreateReturn` (around line 112) to seed default condition values:

```ts
function openCreateReturn() {
  const receivedLines = (fullPO?.po_line_items ?? []).filter((li) => li.received_qty > 0)
  setReturnItems(
    receivedLines.map((li) => ({
      item_name: li.item_name,
      sku: li.sku ?? null,
      qty: 0,
      brand_variant_id: li.brand_variant_id ?? null,
      condition: 'defective' as const,
      condition_notes: null,
      _max: li.received_qty,
    }))
  )
  const latestReceival = (receivals ?? []).slice().sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )[0]
  setReturnWarehouseId(latestReceival?.warehouse_id ?? '')
  setReturnDate(new Date().toISOString().split('T')[0])
  setReturnReason('')
  setReturnNotes('')
  setReturnCreateOpen(true)
}
```

- [ ] **Step 2: Update `handleCreatePOReturn` to pass condition**

Replace (around line 144):
```ts
items: items.map(({ item_name, sku, qty, brand_variant_id }) => ({ item_name, sku, qty, brand_variant_id })),
```
With:
```ts
items: items.map(({ item_name, sku, qty, brand_variant_id, condition, condition_notes }) => ({
  item_name, sku, qty, brand_variant_id, condition, condition_notes,
})),
```

- [ ] **Step 3: Add condition Select to each return item row in the dialog**

Find the return item rows section (around line 673). Replace the `<div key={idx} className="flex items-center gap-3 rounded-md border p-2">` block with:

```tsx
<div key={idx} className="rounded-md border p-2 space-y-2">
  <div className="flex items-center gap-3">
    <div className="flex-1 min-w-0">
      <div className="text-sm font-medium truncate">{item.item_name}</div>
      {item.sku && <div className="text-xs text-muted-foreground">{item.sku}</div>}
      <div className="text-xs text-muted-foreground">Max returnable: {item._max}</div>
    </div>
    <Input
      type="number"
      min="0"
      max={item._max}
      value={item.qty}
      onChange={(e) => {
        const updated = [...returnItems]
        updated[idx] = { ...updated[idx], qty: Math.min(item._max, Math.max(0, Number(e.target.value))) }
        setReturnItems(updated)
      }}
      className="w-20 text-right"
    />
  </div>
  <div className="flex items-center gap-2">
    <select
      value={item.condition}
      onChange={(e) => {
        const updated = [...returnItems]
        updated[idx] = { ...updated[idx], condition: e.target.value as 'defective' | 'damaged' | 'other', condition_notes: null }
        setReturnItems(updated)
      }}
      className="flex h-8 rounded-md border border-input bg-background px-2 py-1 text-xs"
    >
      <option value="defective">Defective</option>
      <option value="damaged">Damaged</option>
      <option value="other">Other</option>
    </select>
    {item.condition === 'other' && (
      <Input
        placeholder="Describe reason…"
        value={item.condition_notes ?? ''}
        onChange={(e) => {
          const updated = [...returnItems]
          updated[idx] = { ...updated[idx], condition_notes: e.target.value }
          setReturnItems(updated)
        }}
        className="flex-1 h-8 text-xs"
      />
    )}
  </div>
</div>
```

- [ ] **Step 4: Commit**

```bash
git add src/components/purchase/PoDetailDialog.tsx
git commit -m "feat(purchase): add condition field (Defective/Damaged/Other) to PO return items"
```

---

## Task 5: Auto-Create Credit Note on SO Return Restock

**Files:**
- Modify: `src/hooks/useSaleReturns.ts`

- [ ] **Step 1: Add the auto-create logic inside `useUpdateReturnStatus`**

Replace the entire `useUpdateReturnStatus` function with:

```ts
export function useUpdateReturnStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: SaleReturn['status'] }) => {
      const supabase = createClient()

      const { data: ret, error: fetchErr } = await (supabase as any)
        .from('returns')
        .select('source_id, return_number, items, reason')
        .eq('id', id)
        .single()
      if (fetchErr) throw fetchErr

      const { error } = await (supabase as any)
        .from('returns')
        .update({ status })
        .eq('id', id)
      if (error) throw error

      if (status === 'restocked') {
        const { error: rpcError } = await (supabase as any)
          .rpc('rpc_process_return_restock', { p_return_id: id })
        if (rpcError) throw rpcError

        // Auto-create credit note
        await createCreditNoteForReturn(supabase, id, ret)
      }

      return ret as { source_id: string; return_number: string }
    },
    onSuccess: (ret, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sale-returns'] })
      queryClient.invalidateQueries({ queryKey: ['sale-returns-by-so'] })
      queryClient.invalidateQueries({ queryKey: ['activity-log'] })
      queryClient.invalidateQueries({ queryKey: ['credit-notes'] })
      if (variables.status === 'restocked') {
        queryClient.invalidateQueries({ queryKey: ['brand-variants-v2'] })
      }
      const label: Record<SaleReturn['status'], string> = {
        pending:   'Return Marked Pending',
        received:  'Return Received',
        restocked: 'Return Restocked',
        closed:    'Return Closed',
        cancelled: 'Return Cancelled',
      }
      logActivity({
        action:    label[variables.status],
        module:    'sale_orders',
        entity_id: ret.source_id,
        details:   ret.return_number,
        severity:  'info',
      })
    },
  })
}
```

- [ ] **Step 2: Add `createCreditNoteForReturn` helper above `useUpdateReturnStatus`**

Add this function before `useUpdateReturnStatus`:

```ts
async function createCreditNoteForReturn(
  supabase: any,
  returnId: string,
  ret: { source_id: string; return_number: string; items: SaleReturn['items']; reason: string }
) {
  // 1. Fetch SO lines for unit price lookup
  const { data: soLines } = await supabase
    .from('sale_order_lines')
    .select('item_name, sku, brand_variant_id, unit_price')
    .eq('sale_order_id', ret.source_id)
  const soLineArr: any[] = soLines ?? []

  // 2. Fetch linked invoice
  const { data: inv } = await supabase
    .from('invoices')
    .select('id, invoice_id, total_amount')
    .eq('sale_order_id', ret.source_id)
    .eq('direction', 'outgoing')
    .maybeSingle()

  // 3. Fetch customer name from SO
  const { data: soData } = await supabase
    .from('sale_orders')
    .select('customers(name)')
    .eq('id', ret.source_id)
    .single()
  const customerName: string = (soData?.customers as any)?.name ?? 'Unknown'

  // 4. Build returned lines — resolve unit price from SO lines
  const returnedLines = ret.items.map((item) => {
    const soLine = soLineArr.find(
      (l) =>
        (item.brand_variant_id && l.brand_variant_id === item.brand_variant_id) ||
        (item.sku && l.sku === item.sku) ||
        l.item_name === item.item_name
    )
    const unitPrice = soLine?.unit_price ?? 0
    return {
      item_name:  item.item_name,
      sku:        item.sku,
      qty:        item.qty,
      unit_price: unitPrice,
      total:      item.qty * unitPrice,
    }
  })

  // 5. Build original lines from SO
  const originalLines = soLineArr.map((l) => ({
    item_name:  l.item_name,
    sku:        l.sku ?? null,
    qty:        0,      // qty on original lines is informational; delivery qty not stored here
    unit_price: l.unit_price,
    total:      0,
  }))

  const cnTotal = returnedLines.reduce((s, l) => s + l.total, 0)
  const originalTotal = inv?.total_amount ?? 0
  const newTotal = originalTotal - cnTotal

  const { nextNoteId } = await import('@/hooks/useCreditNotes')
  const credit_note_id = await nextNoteId('credit')

  const pdfData = { original_lines: originalLines, returned_lines: returnedLines }

  const { data: cn, error: cnErr } = await supabase
    .from('credit_notes')
    .insert({
      credit_note_id,
      note_type:        'credit',
      invoice_id:       inv?.id ?? null,
      customer_name:    customerName,
      source_return_id: returnId,
      reason:           ret.reason,
      type:             'auto',
      status:           'issued',
      total_amount:     cnTotal,
      original_total:   originalTotal,
      new_total:        newTotal,
      line_items:       pdfData,
    })
    .select('id')
    .single()
  if (cnErr) throw cnErr

  // 6. Link return → credit note
  await supabase
    .from('returns')
    .update({ credit_note_id: cn.id })
    .eq('id', returnId)
}
```

- [ ] **Step 3: Add the import for `nextNoteId` at the top of the file**

Add to the imports at the top of `useSaleReturns.ts`:

```ts
import { nextNoteId } from '@/hooks/useCreditNotes'
```

And remove the dynamic import inside `createCreditNoteForReturn` — replace:
```ts
const { nextNoteId } = await import('@/hooks/useCreditNotes')
const credit_note_id = await nextNoteId('credit')
```
With:
```ts
const credit_note_id = await nextNoteId('credit')
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useSaleReturns.ts
git commit -m "feat(returns): auto-create credit note when SO return is restocked"
```

---

## Task 6: Auto-Create Debit Note on PO Return Dispatch

**Files:**
- Modify: `src/hooks/usePurchaseReturns.ts`

- [ ] **Step 1: Add import for `nextNoteId` at the top of the file**

Add to imports in `usePurchaseReturns.ts`:

```ts
import { nextNoteId } from '@/hooks/useCreditNotes'
```

- [ ] **Step 2: Add `createDebitNoteForReturn` helper before `useUpdatePOReturnStatus`**

```ts
async function createDebitNoteForReturn(
  supabase: any,
  returnId: string,
  ret: { source_id: string; return_number: string; items: POReturnItem[]; reason: string }
) {
  // 1. Fetch PO details
  const { data: po } = await supabase
    .from('purchase_orders')
    .select('supplier_name, total_qar, po_number, po_line_items(*)')
    .eq('id', ret.source_id)
    .single()
  const poLineArr: any[] = po?.po_line_items ?? []

  // 2. Build returned lines — resolve unit price from PO line items
  const returnedLines = ret.items.map((item) => {
    const poLine = poLineArr.find(
      (l) =>
        (item.brand_variant_id && l.brand_variant_id === item.brand_variant_id) ||
        (item.sku && l.sku === item.sku) ||
        l.item_name === item.item_name
    )
    const unitPrice = poLine?.unit_price ?? 0
    return {
      item_name:       item.item_name,
      sku:             item.sku,
      qty:             item.qty,
      unit_price:      unitPrice,
      total:           item.qty * unitPrice,
      condition:       item.condition,
      condition_notes: item.condition_notes,
    }
  })

  // 3. Build original lines from PO line items
  const originalLines = poLineArr.map((l) => ({
    item_name:  l.item_name,
    sku:        l.sku ?? null,
    qty:        l.qty,
    unit_price: l.unit_price,
    total:      l.total_price,
  }))

  const dnTotal = returnedLines.reduce((s, l) => s + l.total, 0)
  const originalTotal = po?.total_qar ?? 0
  const newTotal = originalTotal - dnTotal

  const credit_note_id = await nextNoteId('debit')
  const pdfData = { original_lines: originalLines, returned_lines: returnedLines }

  const { data: dn, error: dnErr } = await supabase
    .from('credit_notes')
    .insert({
      credit_note_id,
      note_type:        'debit',
      invoice_id:       null,
      customer_name:    null,
      supplier_name:    po?.supplier_name ?? null,
      source_return_id: returnId,
      reason:           ret.reason,
      type:             'auto',
      status:           'issued',
      total_amount:     dnTotal,
      original_total:   originalTotal,
      new_total:        newTotal,
      line_items:       pdfData,
    })
    .select('id')
    .single()
  if (dnErr) throw dnErr

  // 4. Link return → debit note
  await supabase
    .from('returns')
    .update({ credit_note_id: dn.id })
    .eq('id', returnId)
}
```

- [ ] **Step 3: Update `useUpdatePOReturnStatus` — expand select and call helper**

In `useUpdatePOReturnStatus`, find the fetch at the top of `mutationFn`:

```ts
const { data: ret, error: fetchErr } = await (supabase as any)
  .from('returns')
  .select('return_number, dispatched_at')
  .eq('id', id)
  .single()
```

Replace with:

```ts
const { data: ret, error: fetchErr } = await (supabase as any)
  .from('returns')
  .select('return_number, dispatched_at, source_id, items, reason')
  .eq('id', id)
  .single()
```

Then, after the `rpc_process_po_return_dispatch` succeeds (after the `if (rpcErr)` block closes), add:

```ts
// Auto-create debit note
await createDebitNoteForReturn(supabase as any, id, {
  source_id:     ret.source_id,
  return_number: ret.return_number,
  items:         ret.items as POReturnItem[],
  reason:        ret.reason,
})
```

- [ ] **Step 4: Invalidate debit-notes query in `onSuccess`**

In `useUpdatePOReturnStatus` `onSuccess`, after the existing invalidations add:

```ts
if (variables.status === 'dispatched') {
  queryClient.invalidateQueries({ queryKey: ['debit-notes'] })
}
```

- [ ] **Step 5: Commit**

```bash
git add src/hooks/usePurchaseReturns.ts
git commit -m "feat(returns): auto-create debit note when PO return is dispatched"
```

---

## Task 7: PDF Component

**Files:**
- Create: `src/components/sales/CreditDebitNotePdf.tsx`

- [ ] **Step 1: Create the file**

```tsx
// src/components/sales/CreditDebitNotePdf.tsx
'use client'

import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer'
import type { NotePdfData, NoteLineItem, NoteDebitLineItem } from '@/hooks/useCreditNotes'
import type { PdfCompanyInfo } from './InvoicePdf'

Font.register({
  family: 'Cairo',
  fonts: [
    { src: '/fonts/Cairo-Regular.ttf', fontWeight: 400 },
    { src: '/fonts/Cairo-Regular.ttf', fontWeight: 700 },
  ],
})

function fmt(amount: number) {
  return `QAR ${amount.toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const s = StyleSheet.create({
  page:        { fontFamily: 'Cairo', fontSize: 9, padding: 40, color: '#111827' },
  headerRow:   { flexDirection: 'row', marginBottom: 24 },
  companyCol:  { width: '50%' },
  companyBrand:{ fontSize: 16, fontFamily: 'Cairo', fontWeight: 700, color: '#1d4ed8', marginBottom: 6 },
  companyLine: { fontSize: 8, color: '#6b7280', marginBottom: 3 },
  noteCol:     { width: '50%', alignItems: 'flex-end' },
  docTitle:    { fontSize: 22, fontFamily: 'Cairo', fontWeight: 700, color: '#1d4ed8', marginBottom: 8 },
  metaRow:     { flexDirection: 'row', marginBottom: 3 },
  metaKey:     { width: 70, fontSize: 8, color: '#6b7280' },
  metaVal:     { fontSize: 8, fontFamily: 'Cairo', fontWeight: 700 },
  divider:     { borderBottomWidth: 0.5, borderBottomColor: '#d1d5db', marginVertical: 14 },
  billRow:     { flexDirection: 'row', marginBottom: 18 },
  billLeft:    { width: '50%' },
  billRight:   { width: '50%', alignItems: 'flex-end' },
  sectionLbl:  { fontSize: 7, fontFamily: 'Cairo', fontWeight: 700, color: '#6b7280',
                 textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5 },
  billName:    { fontSize: 11, fontFamily: 'Cairo', fontWeight: 700, marginBottom: 2 },
  billSub:     { fontSize: 8, color: '#6b7280' },
  tableHead:   { flexDirection: 'row', backgroundColor: '#f3f4f6', paddingVertical: 5,
                 paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: '#e5e7eb' },
  tableRow:    { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 6,
                 borderBottomWidth: 0.5, borderBottomColor: '#e5e7eb' },
  c_item:      { width: '35%', fontSize: 8 },
  c_sku:       { width: '15%', fontSize: 8, color: '#6b7280' },
  c_qty:       { width: '10%', fontSize: 8, textAlign: 'right' },
  c_cond:      { width: '15%', fontSize: 8, color: '#6b7280' },
  c_price:     { width: '12%', fontSize: 8, textAlign: 'right' },
  c_total:     { width: '13%', fontSize: 8, textAlign: 'right', fontFamily: 'Cairo', fontWeight: 700 },
  sectionTitle:{ fontSize: 9, fontFamily: 'Cairo', fontWeight: 700, color: '#374151',
                 marginBottom: 4, marginTop: 8 },
  totRow:      { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 3 },
  totLbl:      { width: 110, fontSize: 9, color: '#6b7280', textAlign: 'right', paddingRight: 10 },
  totVal:      { width: 110, fontSize: 9, textAlign: 'right' },
  newTotLbl:   { width: 110, fontSize: 11, fontFamily: 'Cairo', fontWeight: 700,
                 textAlign: 'right', paddingRight: 10 },
  newTotVal:   { width: 110, fontSize: 11, fontFamily: 'Cairo', fontWeight: 700, textAlign: 'right' },
  newTotRow:   { flexDirection: 'row', justifyContent: 'flex-end', paddingTop: 5,
                 marginTop: 4, borderTopWidth: 0.5, borderTopColor: '#d1d5db' },
  footer:      { position: 'absolute', bottom: 24, left: 40, right: 40,
                 flexDirection: 'row', justifyContent: 'space-between',
                 borderTopWidth: 0.5, borderTopColor: '#e5e7eb', paddingTop: 6 },
  footerTxt:   { fontSize: 7, color: '#9ca3af' },
})

export interface CreditDebitNotePdfProps {
  noteId: string           // CN-00001 or DN-00001
  noteType: 'credit' | 'debit'
  partyName: string        // customer or supplier
  referenceNumber: string  // invoice # or PO #
  returnNumber: string     // SR- or PR-
  reason: string
  createdAt: string
  pdfData: NotePdfData
  originalTotal: number
  newTotal: number
  company?: PdfCompanyInfo
}

export function CreditDebitNoteDocument({
  noteId, noteType, partyName, referenceNumber, returnNumber,
  reason, createdAt, pdfData, originalTotal, newTotal, company,
}: CreditDebitNotePdfProps) {
  const companyName    = company?.name      ?? 'Al Faytri Group'
  const companyAddress = company?.address   ?? 'Doha, Qatar'
  const companyVat     = company?.vat_id    ?? null
  const companyCr      = company?.cr_number ?? null
  const docTitle       = noteType === 'credit' ? 'CREDIT NOTE' : 'DEBIT NOTE'
  const partyLabel     = noteType === 'credit' ? 'Customer' : 'Supplier'
  const refLabel       = noteType === 'credit' ? 'Invoice #' : 'PO #'
  const deductedTotal  = pdfData.returned_lines.reduce((s, l) => s + l.total, 0)

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* Header */}
        <View style={s.headerRow}>
          <View style={s.companyCol}>
            <Text style={s.companyBrand}>{companyName}</Text>
            {companyAddress && <Text style={s.companyLine}>{companyAddress}</Text>}
            {companyCr      && <Text style={s.companyLine}>CR: {companyCr}</Text>}
            {companyVat     && <Text style={s.companyLine}>VAT: {companyVat}</Text>}
          </View>
          <View style={s.noteCol}>
            <Text style={s.docTitle}>{docTitle}</Text>
            <View style={s.metaRow}>
              <Text style={s.metaKey}>{noteType === 'credit' ? 'CN #' : 'DN #'}</Text>
              <Text style={s.metaVal}>{noteId}</Text>
            </View>
            <View style={s.metaRow}>
              <Text style={s.metaKey}>Date</Text>
              <Text style={s.metaVal}>{fmtDate(createdAt)}</Text>
            </View>
            <View style={s.metaRow}>
              <Text style={s.metaKey}>Return #</Text>
              <Text style={s.metaVal}>{returnNumber}</Text>
            </View>
          </View>
        </View>

        <View style={s.divider} />

        {/* Party / Reference */}
        <View style={s.billRow}>
          <View style={s.billLeft}>
            <Text style={s.sectionLbl}>{partyLabel}</Text>
            <Text style={s.billName}>{partyName}</Text>
          </View>
          <View style={s.billRight}>
            <Text style={s.sectionLbl}>{refLabel}</Text>
            <Text style={s.billName}>{referenceNumber}</Text>
            <Text style={s.billSub}>Reason: {reason}</Text>
          </View>
        </View>

        <View style={s.divider} />

        {/* Original Items */}
        <Text style={s.sectionTitle}>Original Items</Text>
        <View style={s.tableHead}>
          <Text style={s.c_item}>Item</Text>
          <Text style={s.c_sku}>SKU</Text>
          <Text style={s.c_qty}>Qty</Text>
          <Text style={s.c_price}>Unit Price</Text>
          <Text style={s.c_total}>Total</Text>
        </View>
        {pdfData.original_lines.map((line, idx) => (
          <View key={idx} style={s.tableRow}>
            <Text style={s.c_item}>{line.item_name}</Text>
            <Text style={s.c_sku}>{line.sku ?? '—'}</Text>
            <Text style={s.c_qty}>{line.qty}</Text>
            <Text style={s.c_price}>{fmt(line.unit_price)}</Text>
            <Text style={s.c_total}>{fmt(line.total)}</Text>
          </View>
        ))}

        <View style={s.divider} />

        {/* Returned Items */}
        <Text style={s.sectionTitle}>Returned Items</Text>
        <View style={s.tableHead}>
          <Text style={s.c_item}>Item</Text>
          <Text style={s.c_sku}>SKU</Text>
          <Text style={s.c_qty}>Qty</Text>
          {noteType === 'debit' && <Text style={s.c_cond}>Condition</Text>}
          <Text style={s.c_price}>Unit Price</Text>
          <Text style={s.c_total}>Value</Text>
        </View>
        {pdfData.returned_lines.map((line, idx) => {
          const dl = line as NoteDebitLineItem
          return (
            <View key={idx} style={s.tableRow}>
              <Text style={s.c_item}>{line.item_name}</Text>
              <Text style={s.c_sku}>{line.sku ?? '—'}</Text>
              <Text style={s.c_qty}>{line.qty}</Text>
              {noteType === 'debit' && (
                <Text style={s.c_cond}>
                  {dl.condition === 'other' ? (dl.condition_notes ?? 'Other') : (dl.condition ?? '—')}
                </Text>
              )}
              <Text style={s.c_price}>{fmt(line.unit_price)}</Text>
              <Text style={s.c_total}>{fmt(line.total)}</Text>
            </View>
          )
        })}

        <View style={s.divider} />

        {/* Summary Totals */}
        <View style={s.totRow}>
          <Text style={s.totLbl}>Original Total</Text>
          <Text style={s.totVal}>{fmt(originalTotal)}</Text>
        </View>
        <View style={s.totRow}>
          <Text style={s.totLbl}>{noteType === 'credit' ? 'Credit Amount' : 'Debit Amount'}</Text>
          <Text style={s.totVal}>- {fmt(deductedTotal)}</Text>
        </View>
        <View style={s.newTotRow}>
          <Text style={s.newTotLbl}>New Total</Text>
          <Text style={s.newTotVal}>{fmt(newTotal)}</Text>
        </View>

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerTxt}>{companyName} — {docTitle} {noteId}</Text>
          <Text style={s.footerTxt} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>

      </Page>
    </Document>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/sales/CreditDebitNotePdf.tsx
git commit -m "feat(pdf): add CreditDebitNoteDocument component"
```

---

## Task 8: Download Button Component

**Files:**
- Create: `src/components/sales/CreditDebitNoteDownloadButton.tsx`

- [ ] **Step 1: Create the file**

```tsx
// src/components/sales/CreditDebitNoteDownloadButton.tsx
'use client'

import { PDFDownloadLink } from '@react-pdf/renderer'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'
import { CreditDebitNoteDocument } from './CreditDebitNotePdf'
import { useCompanies } from '@/hooks/useCompanies'
import type { CreditNote } from '@/hooks/useCreditNotes'

interface Props {
  note: CreditNote
  referenceNumber: string  // invoice_id string or PO number
  returnNumber: string     // SR-XXXXX or PR-XXXXX
}

export function CreditDebitNoteDownloadButton({ note, referenceNumber, returnNumber }: Props) {
  const { data: companies } = useCompanies()
  const c = companies?.find((co) => co.is_active) ?? companies?.[0]
  const company = c ? {
    name:      c.name_en,
    address:   c.address_en ?? null,
    vat_id:    c.vat_id ?? null,
    cr_number: c.cr_number ?? null,
  } : undefined

  const pdfData = note.line_items ?? { original_lines: [], returned_lines: [] }
  const partyName = note.note_type === 'credit'
    ? (note.customer_name ?? '—')
    : (note.supplier_name ?? '—')
  const prefix = note.note_type === 'credit' ? 'CreditNote' : 'DebitNote'
  const fileName = `${prefix}-${note.credit_note_id}.pdf`

  return (
    <PDFDownloadLink
      document={
        <CreditDebitNoteDocument
          noteId={note.credit_note_id}
          noteType={note.note_type}
          partyName={partyName}
          referenceNumber={referenceNumber}
          returnNumber={returnNumber}
          reason={note.reason}
          createdAt={note.created_at}
          pdfData={pdfData}
          originalTotal={note.original_total ?? 0}
          newTotal={note.new_total ?? 0}
          company={company}
        />
      }
      fileName={fileName}
    >
      {({ loading }: { loading: boolean }) => (
        <Button variant="outline" size="sm" disabled={loading} className="gap-1.5">
          <Download className="h-3.5 w-3.5" />
          {loading ? 'Preparing…' : 'PDF'}
        </Button>
      )}
    </PDFDownloadLink>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/sales/CreditDebitNoteDownloadButton.tsx
git commit -m "feat(pdf): add CreditDebitNoteDownloadButton wrapper"
```

---

## Task 9: Update Central Page

**Files:**
- Modify: `src/app/(dashboard)/sales/credit-notes/page.tsx`

- [ ] **Step 1: Replace the full page file**

```tsx
// src/app/(dashboard)/sales/credit-notes/page.tsx
'use client'

import { useState, useMemo } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { DataTable } from '@/components/shared/DataTable'
import { DataTableColumnHeader } from '@/components/shared/DataTableColumnHeader'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { CreditNoteFormDialog } from '@/components/sales/CreditNoteFormDialog'
import { CreditDebitNoteDownloadButton } from '@/components/sales/CreditDebitNoteDownloadButton'
import {
  useCreditNotes,
  useDebitNotes,
  useApplyCreditNote,
  type CreditNote,
  type CreditNoteStatus,
} from '@/hooks/useCreditNotes'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

const STATUS_CONFIG: Record<CreditNoteStatus, { label: string; className: string }> = {
  draft:    { label: 'Draft',    className: 'bg-slate-100 text-slate-700' },
  approved: { label: 'Approved', className: 'bg-blue-100 text-blue-700' },
  issued:   { label: 'Issued',   className: 'bg-amber-100 text-amber-700' },
  redeemed: { label: 'Redeemed', className: 'bg-green-100 text-green-700' },
}

export default function CreditNotesPage() {
  const [noteType, setNoteType] = useState<'credit' | 'debit'>('credit')
  const [createOpen, setCreateOpen] = useState(false)
  const [applyTarget, setApplyTarget] = useState<CreditNote | null>(null)

  const { data: creditNotes = [], isLoading: cnLoading } = useCreditNotes()
  const { data: debitNotes  = [], isLoading: dnLoading  } = useDebitNotes()
  const applyCreditNote = useApplyCreditNote()

  const rows    = noteType === 'credit' ? creditNotes : debitNotes
  const loading = noteType === 'credit' ? cnLoading   : dnLoading

  const creditColumns = useMemo<ColumnDef<CreditNote>[]>(() => [
    {
      accessorKey: 'credit_note_id',
      header: ({ column }) => <DataTableColumnHeader column={column} title="CN #" />,
      cell: ({ row }) => <span className="font-mono text-sm font-medium">{row.getValue('credit_note_id')}</span>,
    },
    {
      accessorKey: 'customer_name',
      header: 'Customer',
      cell: ({ row }) => row.original.customer_name ?? '—',
    },
    {
      id: 'invoice',
      header: 'Invoice #',
      cell: ({ row }) => row.original.invoice_display ?? '—',
    },
    {
      id: 'return_ref',
      header: 'Return #',
      cell: () => '—',  // populated once source_return joined; placeholder for now
    },
    {
      accessorKey: 'total_amount',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
      cell: ({ row }) => formatCurrency(row.getValue('total_amount'), 'QAR'),
    },
    {
      accessorKey: 'new_total',
      header: 'New Total',
      cell: ({ row }) => {
        const v = row.original.new_total
        return v != null ? formatCurrency(v, 'QAR') : '—'
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const s = (row.getValue('status') ?? 'draft') as CreditNoteStatus
        const cfg = STATUS_CONFIG[s] ?? STATUS_CONFIG.draft
        return <Badge className={cn('text-xs', cfg.className)}>{cfg.label}</Badge>
      },
    },
    {
      accessorKey: 'created_at',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Created" />,
      cell: ({ row }) => formatDate(row.getValue('created_at')),
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const note = row.original
        return (
          <div className="flex items-center gap-2">
            {note.line_items && (
              <CreditDebitNoteDownloadButton
                note={note}
                referenceNumber={note.invoice_display ?? note.invoice_id ?? '—'}
                returnNumber="—"
              />
            )}
            {(note.status === 'issued' || note.status === 'approved') && (
              <Button variant="outline" size="sm" onClick={() => setApplyTarget(note)}>
                Apply
              </Button>
            )}
          </div>
        )
      },
    },
  ], [])

  const debitColumns = useMemo<ColumnDef<CreditNote>[]>(() => [
    {
      accessorKey: 'credit_note_id',
      header: ({ column }) => <DataTableColumnHeader column={column} title="DN #" />,
      cell: ({ row }) => <span className="font-mono text-sm font-medium">{row.getValue('credit_note_id')}</span>,
    },
    {
      accessorKey: 'supplier_name',
      header: 'Supplier',
      cell: ({ row }) => row.original.supplier_name ?? '—',
    },
    {
      id: 'return_ref',
      header: 'Return #',
      cell: () => '—',
    },
    {
      accessorKey: 'total_amount',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Debit Amount" />,
      cell: ({ row }) => formatCurrency(row.getValue('total_amount'), 'QAR'),
    },
    {
      accessorKey: 'new_total',
      header: 'New PO Total',
      cell: ({ row }) => {
        const v = row.original.new_total
        return v != null ? formatCurrency(v, 'QAR') : '—'
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const s = (row.getValue('status') ?? 'issued') as CreditNoteStatus
        const cfg = STATUS_CONFIG[s] ?? STATUS_CONFIG.issued
        return <Badge className={cn('text-xs', cfg.className)}>{cfg.label}</Badge>
      },
    },
    {
      accessorKey: 'created_at',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Created" />,
      cell: ({ row }) => formatDate(row.getValue('created_at')),
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const note = row.original
        if (!note.line_items) return null
        return (
          <CreditDebitNoteDownloadButton
            note={note}
            referenceNumber="—"
            returnNumber="—"
          />
        )
      },
    },
  ], [])

  return (
    <PageWrapper>
      <PageHeader
        title="Credit & Debit Notes"
        description="Auto-generated notes from customer and supplier returns"
        actions={
          noteType === 'credit' ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-2" /> Create Credit Note
            </Button>
          ) : null
        }
      />

      <div className="mb-4 w-48">
        <Select value={noteType} onValueChange={(v) => setNoteType(v as 'credit' | 'debit')}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="credit">Credit Notes</SelectItem>
            <SelectItem value="debit">Debit Notes</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={noteType === 'credit' ? creditColumns : debitColumns}
        data={rows}
        isLoading={loading}
      />

      {noteType === 'credit' && (
        <CreditNoteFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      )}

      {applyTarget && (
        <ConfirmDialog
          open
          title="Apply Credit Note?"
          description={`Apply ${applyTarget.credit_note_id} (${formatCurrency(applyTarget.total_amount, 'QAR')}) to invoice ${applyTarget.invoice_display ?? applyTarget.invoice_id ?? ''}? Any excess will be stored as customer credit balance.`}
          confirmLabel="Apply"
          onConfirm={async () => {
            if (!applyTarget.invoice_id) return
            await applyCreditNote.mutateAsync({ id: applyTarget.id, invoiceId: applyTarget.invoice_id })
            toast.success('Credit note applied')
            setApplyTarget(null)
          }}
          onOpenChange={(v) => { if (!v) setApplyTarget(null) }}
        />
      )}
    </PageWrapper>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(dashboard)/sales/credit-notes/page.tsx
git commit -m "feat(ui): credit & debit notes central page with type switcher and PDF download"
```

---

## Self-Review Checklist

- [x] **Spec §2 (data model)** — Task 1 adds all 5 columns + nullability changes
- [x] **Spec §2.2 (DN numbering)** — `nextNoteId('debit')` in Task 3 uses DN- prefix
- [x] **Spec §2.3 (condition fields)** — Task 2 updates `POReturnItem`; Task 4 adds UI
- [x] **Spec §3.1 (CN auto-creation)** — Task 5 hooks into `restocked` transition
- [x] **Spec §3.2 (DN auto-creation)** — Task 6 hooks into `dispatched` transition
- [x] **Spec §4 (condition Select in dialog)** — Task 4 updates `PoDetailDialog`
- [x] **Spec §5 (PDF layout)** — Task 7 matches Invoice PDF style with two item sections + summary
- [x] **Spec §6 (central page)** — Task 9 adds switcher, both column sets, download button
- [x] **Spec §7 (SO dialog link)** — Covered by central page; direct link in SoDetailDialog is out-of-scope for now (noted in spec §9)
- [x] **Type consistency** — `NoteLineItem`, `NoteDebitLineItem`, `NotePdfData` defined in Task 2/3 and used identically in Tasks 5, 6, 7, 8
- [x] **`nextNoteId` import** — Tasks 5 and 6 both import from `@/hooks/useCreditNotes`
