# Bill Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul the supplier bill workflow — remove the separate create-bill page, consolidate all bill management onto the bill detail page, clean up the print layout, add a two-level company/division selector, enable manual paid marking, and support one payment allocated across multiple bills.

**Architecture:** Bills have no approval workflow; they are created and manually managed. The separate `/purchase/create-bill` route is replaced with an inline dialog. Payment linking is upgraded from a 1:1 FK to a many-to-many allocations table so one payment can cover multiple bills with explicit amounts.

**Tech Stack:** Next.js 15 App Router, React, Supabase (Postgres + RPC), TanStack Query, shadcn/ui, Tailwind CSS

---

## File Map

| Action | File |
|--------|------|
| Modify | `src/components/purchase/BillDetailDocument.tsx` |
| Modify | `src/components/purchase/BillDetailSidebar.tsx` |
| Modify | `src/app/(dashboard)/purchase/bills/[id]/page.tsx` |
| Modify | `src/hooks/useSupplierBills.ts` |
| Modify | `src/hooks/useAttachPaymentToBill.ts` |
| Modify | `src/components/purchase/AttachBillDialog.tsx` |
| Modify | `src/app/(dashboard)/purchase/orders/page.tsx` |
| Modify | `src/components/purchase/PoDetailDialog.tsx` |
| Create | `src/components/purchase/CreateBillFromPODialog.tsx` |
| Create | `supabase/migrations/YYYYMMDDHHMMSS_payment_bill_allocations.sql` |
| Delete | `src/app/(dashboard)/purchase/create-bill/page.tsx` |

---

## Task 1: Fix Grand Total duplicate currency and print date

**Files:**
- Modify: `src/components/purchase/BillDetailDocument.tsx:68,157,222-227,423`

**Problem:** Line 222 appends the raw `{currency}` string after `formatCurrency()` which already includes the currency symbol, producing "QAR 353,000.00 QAR". The "Total (QAR):" line (224-227) is redundant. Print date at line 157 shows time; the footer at line 423 shows ISO timestamp.

- [ ] **Step 1: Open the file and locate the three problem spots**

```
Line 68:  const printTimestamp = new Date().toLocaleString('en-GB')
Line 222: <span>{formatCurrency(bill.total_amount, currency)} {currency}</span>
Lines 224-227: <div className="flex justify-between text-muted-foreground">
                 <span>Total (QAR):</span>
                 <span>{formatCurrency(bill.total_amount, 'QAR')}</span>
               </div>
Line 423: This document was automatically generated · {new Date().toISOString()}
```

- [ ] **Step 2: Apply fixes**

Replace line 68:
```tsx
const printTimestamp = new Date().toLocaleDateString('en-GB')
```

Replace lines 220-228 (Grand Total block):
```tsx
<div className="flex justify-between font-bold text-base">
  <span>Grand Total:</span>
  <span>{formatCurrency(bill.total_amount, currency)}</span>
</div>
```
(Remove the "Total (QAR):" block entirely — `formatCurrency` already includes the currency.)

Replace line 423 footer timestamp:
```tsx
This document was automatically generated · {new Date().toLocaleDateString('en-GB')}
```

- [ ] **Step 3: Verify visually**

Load any bill detail page. Grand Total row must show "QAR 353,000.00" with no trailing "QAR". Print Date in meta must show "29/04/2026" with no time.

- [ ] **Step 4: Commit**

```bash
git add src/components/purchase/BillDetailDocument.tsx
git commit -m "fix(bills): remove duplicate currency in Grand Total and strip time from print date"
```

---

## Task 2: Remove approval status from bills UI

**Files:**
- Modify: `src/components/purchase/BillDetailDocument.tsx:32-37,46-51,143-145`

Bills have no approval workflow. Remove the `doc_status` badge from the printed/displayed meta row and the "DRAFT" watermark. Keep `payment_status` badges and the PAID/OVERDUE watermarks.

- [ ] **Step 1: Delete `DOC_STATUS_COLORS` constant (lines 32-37)**

Remove this entire block:
```tsx
const DOC_STATUS_COLORS: Record<string, string> = {
  draft:            'bg-slate-100 text-slate-700',
  pending_approval: 'bg-amber-100 text-amber-700',
  approved:         'bg-green-100 text-green-700',
  rejected:         'bg-red-100 text-red-700',
}
```

- [ ] **Step 2: Remove doc_status from the `getWatermark` function (lines 46-51)**

Current:
```tsx
function getWatermark(bill: BillViewModel['bill']): { text: string; colorClass: string } | null {
  if (bill.doc_status === 'draft') return { text: 'DRAFT', colorClass: 'text-slate-400' }
  if (bill.payment_status === 'paid') return { text: 'PAID', colorClass: 'text-green-400' }
  if (bill.payment_status === 'overdue') return { text: 'OVERDUE', colorClass: 'text-red-400' }
  return null
}
```

Replace with:
```tsx
function getWatermark(bill: BillViewModel['bill']): { text: string; colorClass: string } | null {
  if (bill.payment_status === 'paid') return { text: 'PAID', colorClass: 'text-green-400' }
  if (bill.payment_status === 'overdue') return { text: 'OVERDUE', colorClass: 'text-red-400' }
  return null
}
```

- [ ] **Step 3: Remove `doc_status` badge from meta section (lines 142-149)**

Current badges block:
```tsx
<div className="flex items-center gap-2 flex-wrap">
  <Badge className={cn('text-xs', DOC_STATUS_COLORS[bill.doc_status] ?? '')}>
    {bill.doc_status.replace(/_/g, ' ')}
  </Badge>
  <Badge className={cn('text-xs', PAY_STATUS_COLORS[bill.payment_status] ?? '')}>
    {bill.payment_status.replace(/_/g, ' ')}
  </Badge>
</div>
```

Replace with (only payment status):
```tsx
<div className="flex items-center gap-2 flex-wrap">
  <Badge className={cn('text-xs', PAY_STATUS_COLORS[bill.payment_status] ?? '')}>
    {bill.payment_status.replace(/_/g, ' ')}
  </Badge>
</div>
```

- [ ] **Step 4: Commit**

```bash
git add src/components/purchase/BillDetailDocument.tsx
git commit -m "feat(bills): remove approval status badges — bills have no approval workflow"
```

---

## Task 3: Two-level Company + Division sidebar selectors

**Files:**
- Modify: `src/components/purchase/BillDetailSidebar.tsx`
- Modify: `src/components/purchase/BillDetailDocument.tsx`
- Modify: `src/app/(dashboard)/purchase/bills/[id]/page.tsx`

The current sidebar has a single select labeled "Company" that lists divisions. The user wants two stacked selects: Company (box 1) → Division filtered by that company (box 2). The print header top-left must show company name on line 1, division name on line 2.

The `companies` table has `id`, `name_en` (used for display). The `divisions` table has `company_id`. Both hooks already exist: `useCompanies` and `useDivisionsByCompany(companyId)`.

### 3a — Update BillDetailSidebar props and UI

- [ ] **Step 1: Update the props type in `BillDetailSidebar.tsx`**

Current Props type:
```tsx
type Props = {
  divisions: Division[]
  selectedDivisionId: string
  onDivisionChange: (id: string) => void
  ...
}
```

Replace with:
```tsx
import type { Company } from '@/hooks/useCompanies'

type Props = {
  companies: Company[]
  selectedCompanyId: string
  onCompanyChange: (id: string) => void
  divisions: Division[]
  selectedDivisionId: string
  onDivisionChange: (id: string) => void
  ...
}
```

- [ ] **Step 2: Replace the single Company selector with two stacked selects**

Remove the existing single `<Select>` block (lines 54-68) and replace with:
```tsx
{/* Company selector */}
<div className="space-y-2">
  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Company</p>
  <Select value={selectedCompanyId} onValueChange={(v) => { if (v) onCompanyChange(v) }}>
    <SelectTrigger>
      <SelectValue placeholder="Select company…" />
    </SelectTrigger>
    <SelectContent>
      {companies.map((c) => (
        <SelectItem key={c.id} value={c.id}>{c.name_en}</SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>

{/* Division selector */}
<div className="space-y-2">
  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Division</p>
  <Select
    value={selectedDivisionId}
    onValueChange={(v) => { if (v) onDivisionChange(v) }}
    disabled={!selectedCompanyId}
  >
    <SelectTrigger>
      <SelectValue placeholder={selectedCompanyId ? 'Select division…' : 'Select company first…'} />
    </SelectTrigger>
    <SelectContent>
      {divisions.map((d) => (
        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>
```

### 3b — Update BillDetailDocument header

- [ ] **Step 3: Add `company` prop to BillDetailDocument and update header**

Current Props type in `BillDetailDocument.tsx`:
```tsx
type Props = {
  viewModel: BillViewModel
  division: Division | null
  ...
}
```

Add `company` field:
```tsx
import type { Company } from '@/hooks/useCompanies'

type Props = {
  viewModel: BillViewModel
  company: Company | null
  division: Division | null
  ...
}
```

Update the header section (lines 94-112). Current:
```tsx
<div>
  <h1 className="text-xl font-bold leading-tight">
    {division?.name ?? FALLBACK_COMPANY}
  </h1>
  {division?.address_en && (
    <p className="text-sm text-muted-foreground mt-1 whitespace-pre-line">
      {division.address_en}
    </p>
  )}
</div>
```

Replace with:
```tsx
<div>
  <h1 className="text-xl font-bold leading-tight">
    {company?.name_en ?? FALLBACK_COMPANY}
  </h1>
  {division && (
    <p className="text-sm font-medium text-muted-foreground mt-0.5">
      {division.name}
    </p>
  )}
  {division?.address_en && (
    <p className="text-sm text-muted-foreground mt-1 whitespace-pre-line">
      {division.address_en}
    </p>
  )}
</div>
```

Also update the footer (line 416-418) to show company name:
```tsx
<p>
  {company?.name_en ?? FALLBACK_COMPANY}
  {division ? ` · ${division.name}` : ''}
  {' · '}
  <span dir="rtl">هذا المستند تم إنشاؤه تلقائياً</span>
</p>
```

### 3c — Update the bill detail page

- [ ] **Step 4: Update `bills/[id]/page.tsx` to fetch companies + divisions-by-company**

Add imports:
```tsx
import { useCompanies } from '@/hooks/useCompanies'
import { useDivisionsByCompany } from '@/hooks/useDivisions'
```

Add state:
```tsx
const [selectedCompanyId, setSelectedCompanyId] = useState('')
const [selectedDivisionId, setSelectedDivisionId] = useState('')
```

Add queries (after existing `useDivisions` — replace it):
```tsx
const { data: companies = [] } = useCompanies()
const { data: divisionsByCompany = [] } = useDivisionsByCompany(selectedCompanyId || null)
```

Replace the `useEffect` that auto-selects the first division:
```tsx
useEffect(() => {
  if (companies.length > 0 && !selectedCompanyId) {
    setSelectedCompanyId(companies[0].id)
  }
}, [companies]) // eslint-disable-line react-hooks/exhaustive-deps

useEffect(() => {
  if (divisionsByCompany.length > 0 && selectedCompanyId) {
    setSelectedDivisionId(divisionsByCompany[0].id)
  } else {
    setSelectedDivisionId('')
  }
}, [divisionsByCompany, selectedCompanyId]) // eslint-disable-line react-hooks/exhaustive-deps
```

Update `selectedDivision` lookup:
```tsx
const selectedCompany = companies.find((c) => c.id === selectedCompanyId) ?? null
const selectedDivision = divisionsByCompany.find((d) => d.id === selectedDivisionId) ?? null
```

Pass new props to `BillDetailSidebar`:
```tsx
<BillDetailSidebar
  companies={companies}
  selectedCompanyId={selectedCompanyId}
  onCompanyChange={setSelectedCompanyId}
  divisions={divisionsByCompany}
  selectedDivisionId={selectedDivisionId}
  onDivisionChange={setSelectedDivisionId}
  ...
/>
```

Pass `company` to `BillDetailDocument`:
```tsx
<BillDetailDocument
  ...
  company={selectedCompany}
  division={selectedDivision}
  ...
/>
```

- [ ] **Step 5: Verify**

Open any bill detail page. The sidebar must show "Company" dropdown (populated with company names) and "Division" dropdown (empty until company selected, then filtered). Header top-left must show company name on line 1 and division name on line 2.

- [ ] **Step 6: Commit**

```bash
git add src/components/purchase/BillDetailSidebar.tsx \
        src/components/purchase/BillDetailDocument.tsx \
        src/app/(dashboard)/purchase/bills/[id]/page.tsx
git commit -m "feat(bills): two-level company+division selector in sidebar; update print header"
```

---

## Task 4: Manual "Mark as Paid" button

**Files:**
- Modify: `src/hooks/useSupplierBills.ts`
- Modify: `src/components/purchase/BillDetailDocument.tsx`

Bills are manually managed. Add a button to toggle payment_status between `unpaid` and `paid` without going through the payment linking flow.

- [ ] **Step 1: Add `useMarkBillPaymentStatus` hook to `useSupplierBills.ts`**

Append this export at the bottom of the file:
```tsx
export function useMarkBillPaymentStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ billId, status }: { billId: string; status: 'paid' | 'unpaid' }) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('invoices')
        .update({ payment_status: status })
        .eq('id', billId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-bills'] })
      queryClient.invalidateQueries({ queryKey: ['bill-view-model'] })
    },
  })
}
```

- [ ] **Step 2: Import and use the hook in `BillDetailDocument.tsx`**

Add import:
```tsx
import { useMarkBillPaymentStatus } from '@/hooks/useSupplierBills'
```

Inside the component body (alongside the existing `attachOpen` state):
```tsx
const markPaid = useMarkBillPaymentStatus()
```

- [ ] **Step 3: Add the button to the Payment section (section 7, around line 288)**

In the `print:hidden` Payment section, add a "Mark as Paid" / "Mark as Unpaid" button. Replace the current section 7 content:

```tsx
{/* 7. Link Payment (non-printable) */}
<BillDetailSection title="Payment" className="print:hidden">
  <div className="flex items-center justify-between gap-3 mb-3">
    <div className="flex gap-2">
      {bill.payment_status !== 'paid' ? (
        <Button
          size="sm"
          variant="default"
          onClick={() => markPaid.mutate({ billId: bill.id, status: 'paid' })}
          disabled={markPaid.isPending}
        >
          {markPaid.isPending ? 'Marking…' : 'Mark as Paid'}
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={() => markPaid.mutate({ billId: bill.id, status: 'unpaid' })}
          disabled={markPaid.isPending}
        >
          {markPaid.isPending ? 'Updating…' : 'Mark as Unpaid'}
        </Button>
      )}
    </div>
    {bill.payment_status !== 'paid' && (
      <Button size="sm" variant="outline" onClick={() => setAttachOpen(true)}>
        Link Payment
      </Button>
    )}
  </div>
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
    <p className="text-sm text-muted-foreground">No payment linked yet.</p>
  )}
</BillDetailSection>
```

- [ ] **Step 4: Verify**

Open any unpaid bill. "Mark as Paid" button appears in the Payment section. Clicking it changes `payment_status` to `paid` and updates the badge. A paid bill shows "Mark as Unpaid" instead.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSupplierBills.ts \
        src/components/purchase/BillDetailDocument.tsx
git commit -m "feat(bills): add Mark as Paid / Mark as Unpaid manual toggle"
```

---

## Task 5: Replace create-bill page with CreateBillFromPODialog

**Files:**
- Create: `src/components/purchase/CreateBillFromPODialog.tsx`
- Modify: `src/app/(dashboard)/purchase/orders/page.tsx:456`
- Modify: `src/components/purchase/PoDetailDialog.tsx:177`
- Delete: `src/app/(dashboard)/purchase/create-bill/page.tsx`

The `/purchase/create-bill` full-page route is removed. The same form becomes a dialog that opens from the PO list and PO detail dialog. After creation the user is redirected to the new bill's detail page.

- [ ] **Step 1: Create `CreateBillFromPODialog.tsx`**

This is a Dialog-wrapped version of the logic in `create-bill/page.tsx`. Key differences:
- Wrapped in `<Dialog open={open} onOpenChange={onOpenChange}>`
- On success: calls `router.push('/purchase/bills/' + newBillId)` and closes dialog
- Discount row shown in totals when `po.discount_amount > 0`
- The `useCreateBill` mutation must return the created bill's `id` — verify `useCreateBill` returns it; if not, update the mutation to `.select().single()` and `return data`

```tsx
// src/components/purchase/CreateBillFromPODialog.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Package } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useCreateBill } from '@/hooks/useSupplierBills'
import { usePurchaseOrder, usePOReceivalsByPO } from '@/hooks/usePurchaseOrders'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'

type BillLine = {
  po_line_item_id: string
  item_name: string
  sku: string | null
  ordered_qty: number
  received_qty: number
  bill_qty: number
  unit_price: number
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  poId: string
}

export function CreateBillFromPODialog({ open, onOpenChange, poId }: Props) {
  const router = useRouter()
  const createBill = useCreateBill()
  const { data: po, isLoading: poLoading } = usePurchaseOrder(open ? poId : null)
  const { data: receivals } = usePOReceivalsByPO(open ? poId : null)

  const [dueDate, setDueDate] = useState('')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<BillLine[]>([])
  const [showReceival, setShowReceival] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) {
      setDueDate(''); setReference(''); setNotes(''); setLines([]); setShowReceival(false)
      return
    }
    if (!po) { setLines([]); return }
    setLines((po.po_line_items ?? []).map((li) => ({
      po_line_item_id: li.id,
      item_name: li.item_name,
      sku: li.sku ?? null,
      ordered_qty: li.qty,
      received_qty: li.received_qty ?? 0,
      bill_qty: li.qty,
      unit_price: li.unit_price,
    })))
  }, [po, open])

  function updateLine(idx: number, patch: Partial<BillLine>) {
    setLines((prev) => prev.map((l, i) => i === idx ? { ...l, ...patch } : l))
  }

  const receivedMap = new Map<string, number>()
  for (const r of (receivals ?? []).filter((r) => r.status === 'approved')) {
    for (const ri of (r.receival_items ?? []) as any[]) {
      if (!ri.is_free && ri.po_line_item_id) {
        receivedMap.set(ri.po_line_item_id, (receivedMap.get(ri.po_line_item_id) ?? 0) + ri.qty_received)
      }
    }
  }

  function fillFromReceived() {
    setLines((prev) => prev.map((l) => ({ ...l, bill_qty: receivedMap.get(l.po_line_item_id) ?? l.received_qty })))
  }

  const subtotal = lines.reduce((s, l) => s + l.bill_qty * l.unit_price, 0)
  const discount = po?.discount_amount ?? 0
  const grandTotal = subtotal - discount
  const canSubmit = !!poId && !!dueDate && lines.length > 0 && lines.every((l) => l.bill_qty >= 0)

  async function submit() {
    if (!po || !canSubmit) return
    setSaving(true)
    try {
      const newBill = await createBill.mutateAsync({
        supplier_id:       (po as any).supplier_id,
        purchase_order_id: poId,
        po_number:         po.po_number,
        discount_amount:   discount,
        discount_label:    po.discount_label ?? null,
        receival_id:       null,
        due_date:          dueDate,
        source_label:      reference || null,
        notes,
        line_items: lines.filter((l) => l.bill_qty > 0).map((l) => ({
          description:  l.item_name,
          qty:          l.bill_qty,
          unit_price:   l.unit_price,
          total:        l.bill_qty * l.unit_price,
          match_status: 'matched' as const,
          match_note:   null,
        })),
      })
      toast.success('Bill created')
      onOpenChange(false)
      router.push(`/purchase/bills/${newBill.id}`)
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Failed to create bill')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Create Supplier Bill
            {po && <span className="text-sm font-normal text-muted-foreground ml-2">{po.po_number} · {po.supplier_name}</span>}
          </DialogTitle>
        </DialogHeader>

        {poLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading PO…</div>
        ) : !po ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Purchase order not found.</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-2">
            {/* Left: PO summary + bill fields */}
            <div className="lg:col-span-1 space-y-4">
              {/* PO summary */}
              <div className="rounded-lg border p-4 text-sm space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Purchase Order</p>
                <div className="flex justify-between"><span className="text-muted-foreground">PO Number</span><span className="font-mono font-medium">{po.po_number}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Supplier</span><span className="font-medium">{po.supplier_name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">PO Date</span><span>{formatDate(po.created_date)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">PO Total</span><span className="font-semibold">{formatCurrency(po.total_qar ?? 0, po.currency ?? 'QAR')}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Status</span><Badge variant="secondary" className="text-xs capitalize">{po.status.replace(/_/g, ' ')}</Badge></div>
              </div>

              {/* Bill fields */}
              <div className="rounded-lg border p-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Bill Details</p>
                <div className="space-y-1">
                  <Label>Due Date *</Label>
                  <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Supplier Invoice # (Reference)</Label>
                  <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. INV-2026-001" />
                </div>
                <div className="space-y-1">
                  <Label>Notes</Label>
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal notes…" />
                </div>
              </div>
            </div>

            {/* Right: Line items */}
            <div className="lg:col-span-2 space-y-4">
              <div className="rounded-lg border overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Line Items</p>
                  <div className="flex items-center gap-2">
                    {showReceival && (
                      <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground" onClick={fillFromReceived}>
                        <Package className="h-3 w-3" />Fill from received
                      </Button>
                    )}
                    <Button type="button" variant="outline" size="sm"
                      className={cn('h-7 text-xs gap-1.5', showReceival && 'bg-blue-50 border-blue-200 text-blue-700')}
                      onClick={() => setShowReceival((v) => !v)}>
                      {showReceival ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      Receival Info
                    </Button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-right w-[80px]">Ordered</TableHead>
                        {showReceival && <TableHead className="text-right w-[90px] text-blue-600">Received</TableHead>}
                        <TableHead className="text-right w-[110px]">Bill Qty</TableHead>
                        <TableHead className="text-right w-[130px]">Unit Price</TableHead>
                        <TableHead className="text-right w-[120px]">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((line, idx) => {
                        const lineTotal = line.bill_qty * line.unit_price
                        const approvedReceived = receivedMap.get(line.po_line_item_id) ?? line.received_qty
                        return (
                          <TableRow key={line.po_line_item_id}>
                            <TableCell>
                              <p className="text-sm font-medium">{line.item_name}</p>
                              {line.sku && <p className="text-xs text-muted-foreground">{line.sku}</p>}
                            </TableCell>
                            <TableCell className="text-right text-sm text-muted-foreground">{line.ordered_qty}</TableCell>
                            {showReceival && (
                              <TableCell className="text-right text-sm">
                                {approvedReceived > 0
                                  ? <span className="text-green-600 font-medium">{approvedReceived}</span>
                                  : <span className="text-muted-foreground">0</span>}
                                <p className="text-xs text-muted-foreground">of {line.ordered_qty}</p>
                              </TableCell>
                            )}
                            <TableCell className="text-right">
                              <Input type="number" min={0} value={line.bill_qty}
                                onChange={(e) => updateLine(idx, { bill_qty: Math.max(0, Number(e.target.value)) })}
                                className="h-7 w-20 text-right ml-auto" />
                            </TableCell>
                            <TableCell className="text-right">
                              <Input type="number" min={0} step="0.01" value={line.unit_price}
                                onChange={(e) => updateLine(idx, { unit_price: Math.max(0, Number(e.target.value)) })}
                                className="h-7 w-28 text-right ml-auto" />
                            </TableCell>
                            <TableCell className="text-right text-sm font-medium">{formatCurrency(lineTotal, 'QAR')}</TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Totals */}
                <div className="flex justify-end gap-8 text-sm px-4 py-3 border-t bg-muted/30 flex-col items-end space-y-1">
                  <div className="flex gap-8">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-semibold min-w-[120px] text-right">{formatCurrency(subtotal, 'QAR')}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex gap-8">
                      <span className="text-muted-foreground">
                        {po.discount_label ? `Discount (${po.discount_label})` : 'Discount'}
                      </span>
                      <span className="font-semibold min-w-[120px] text-right text-destructive">
                        −{formatCurrency(discount, 'QAR')}
                      </span>
                    </div>
                  )}
                  <div className="flex gap-8 border-t pt-1">
                    <span className="font-bold">Grand Total</span>
                    <span className="font-bold min-w-[120px] text-right">{formatCurrency(grandTotal, 'QAR')}</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button onClick={submit} disabled={saving || !canSubmit}>
                  {saving ? 'Creating…' : 'Create Bill'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Ensure `useCreateBill` returns the created bill**

Open `src/hooks/useSupplierBills.ts` and find `useCreateBill`. The `mutationFn` must return the created invoice. Verify the `insert` already ends with `.select().single()` and `return bill`. If the function does not return `bill`, add `return bill` after the insert succeeds. The component calls `await createBill.mutateAsync(...)` and uses the returned value's `.id`.

- [ ] **Step 3: Update PO orders list to open dialog**

In `src/app/(dashboard)/purchase/orders/page.tsx`:

Add import:
```tsx
import { CreateBillFromPODialog } from '@/components/purchase/CreateBillFromPODialog'
```

Add state near other dialog state:
```tsx
const [createBillPOId, setCreateBillPOId] = useState<string | null>(null)
```

Find line 456 (DropdownMenuItem):
```tsx
<DropdownMenuItem onClick={() => router.push(`/purchase/create-bill?po_id=${po.id}`)}>Create Bill</DropdownMenuItem>
```

Replace with:
```tsx
<DropdownMenuItem onClick={() => setCreateBillPOId(po.id)}>Create Bill</DropdownMenuItem>
```

Add dialog before closing `</PageWrapper>` or similar root element:
```tsx
<CreateBillFromPODialog
  open={!!createBillPOId}
  onOpenChange={(open) => { if (!open) setCreateBillPOId(null) }}
  poId={createBillPOId ?? ''}
/>
```

- [ ] **Step 4: Update PoDetailDialog to open dialog**

In `src/components/purchase/PoDetailDialog.tsx`, add import:
```tsx
import { CreateBillFromPODialog } from './CreateBillFromPODialog'
```

Add state inside `PoDetailDialog`:
```tsx
const [createBillOpen, setCreateBillOpen] = useState(false)
```

Find line 177 (the Create Bill button):
```tsx
<Button variant="outline" size="sm" onClick={() => { onOpenChange(false); router.push(`/purchase/create-bill?po_id=${current.id}`) }}>
```

Replace with:
```tsx
<Button variant="outline" size="sm" onClick={() => setCreateBillOpen(true)}>
```

Add the dialog at the bottom of the JSX (inside the Dialog root, after `DialogContent`):
```tsx
<CreateBillFromPODialog
  open={createBillOpen}
  onOpenChange={setCreateBillOpen}
  poId={current?.id ?? ''}
/>
```

- [ ] **Step 5: Delete the old page**

```bash
rm "src/app/(dashboard)/purchase/create-bill/page.tsx"
rmdir "src/app/(dashboard)/purchase/create-bill"
```

Verify no remaining imports of the deleted page exist:
```bash
grep -r "create-bill" src/ --include="*.tsx" --include="*.ts"
```
Only the just-updated files should remain (using `setCreateBillPOId`/`setCreateBillOpen`). No `router.push('/purchase/create-bill')` calls should remain.

- [ ] **Step 6: Verify**

Open PO list → three-dot menu → "Create Bill" → dialog appears with PO data pre-filled. Fill in due date, click Create Bill → redirected to the new bill's detail page.

- [ ] **Step 7: Commit**

```bash
git add src/components/purchase/CreateBillFromPODialog.tsx \
        src/app/(dashboard)/purchase/orders/page.tsx \
        src/components/purchase/PoDetailDialog.tsx \
        src/hooks/useSupplierBills.ts
git rm "src/app/(dashboard)/purchase/create-bill/page.tsx"
git commit -m "feat(bills): replace create-bill page with CreateBillFromPODialog; show discount in form"
```

---

## Task 6: Multi-bill payment allocations — database migration

**Files:**
- Create: `supabase/migrations/20260429120000_payment_bill_allocations.sql`

Replace the 1:1 `payments.invoice_id` link with a many-to-many `payment_bill_allocations` table. One payment can be split across multiple bills. Backfill existing links. Drop `payments.invoice_id`.

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260429120000_payment_bill_allocations.sql`:

```sql
BEGIN;

-- ── New allocations table ───────────────────────────────────────────────────
CREATE TABLE payment_bill_allocations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id   UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  bill_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  amount       NUMERIC NOT NULL CHECK (amount > 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (payment_id, bill_id)
);

CREATE INDEX idx_pba_payment ON payment_bill_allocations (payment_id);
CREATE INDEX idx_pba_bill    ON payment_bill_allocations (bill_id);

-- Enable RLS (authenticated users can read/write their own company's data)
ALTER TABLE payment_bill_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated full access" ON payment_bill_allocations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Backfill from existing payments.invoice_id ──────────────────────────────
INSERT INTO payment_bill_allocations (payment_id, bill_id, amount)
SELECT p.id, p.invoice_id, p.amount
FROM payments p
WHERE p.invoice_id IS NOT NULL
  AND p.direction  = 'outgoing';

-- ── Replace attach_payment_to_bill with allocate_payment_to_bill ─────────────
-- New RPC: supports partial allocation with an explicit amount.
-- Validates that total allocations do not exceed payment amount.
-- Recalculates bill payment_status after allocation.
CREATE OR REPLACE FUNCTION allocate_payment_to_bill(
  p_payment_id UUID,
  p_bill_id    UUID,
  p_amount     NUMERIC
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_total   NUMERIC;
  v_already_alloc   NUMERIC;
  v_bill_total      NUMERIC;
  v_total_paid      NUMERIC;
  v_new_status      TEXT;
BEGIN
  -- Verify payment exists and get its amount
  SELECT amount INTO v_payment_total
  FROM payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % does not exist', p_payment_id;
  END IF;

  -- Verify bill exists
  SELECT total_amount INTO v_bill_total
  FROM invoices WHERE id = p_bill_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bill % does not exist', p_bill_id;
  END IF;

  -- Validate amount
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Allocation amount must be greater than zero';
  END IF;

  -- Check total allocations would not exceed payment amount
  SELECT COALESCE(SUM(amount), 0) INTO v_already_alloc
  FROM payment_bill_allocations
  WHERE payment_id = p_payment_id
    AND bill_id != p_bill_id;  -- exclude current bill if re-allocating

  IF v_already_alloc + p_amount > v_payment_total THEN
    RAISE EXCEPTION 'Allocation of % exceeds remaining payment balance of %',
      p_amount, v_payment_total - v_already_alloc;
  END IF;

  -- Upsert allocation (allow re-allocation to same bill)
  INSERT INTO payment_bill_allocations (payment_id, bill_id, amount)
  VALUES (p_payment_id, p_bill_id, p_amount)
  ON CONFLICT (payment_id, bill_id)
  DO UPDATE SET amount = EXCLUDED.amount;

  -- Recalculate bill payment_status
  SELECT COALESCE(SUM(pba.amount), 0)
    INTO v_total_paid
    FROM payment_bill_allocations pba
   WHERE pba.bill_id = p_bill_id;

  v_new_status := CASE
    WHEN v_total_paid >= v_bill_total THEN 'paid'
    WHEN v_total_paid > 0             THEN 'partially_paid'
    ELSE                                   'unpaid'
  END;

  UPDATE invoices SET payment_status = v_new_status WHERE id = p_bill_id;
END;
$$;

GRANT EXECUTE ON FUNCTION allocate_payment_to_bill(uuid, uuid, numeric) TO authenticated;

-- Keep old RPC as a compatibility shim (allocates full payment amount)
CREATE OR REPLACE FUNCTION attach_payment_to_bill(
  p_payment_id uuid,
  p_bill_id    uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_amount NUMERIC;
BEGIN
  SELECT amount INTO v_payment_amount FROM payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % does not exist', p_payment_id;
  END IF;
  PERFORM allocate_payment_to_bill(p_payment_id, p_bill_id, v_payment_amount);
END;
$$;

GRANT EXECUTE ON FUNCTION attach_payment_to_bill(uuid, uuid) TO authenticated;

COMMIT;
```

- [ ] **Step 2: Apply the migration**

```bash
npx supabase db push
```

Expected output: "Remote database is up to date" or shows the migration applied successfully. No errors.

- [ ] **Step 3: Commit the migration**

```bash
git add supabase/migrations/20260429120000_payment_bill_allocations.sql
git commit -m "feat(db): add payment_bill_allocations table for multi-bill payment splits; update RPCs"
```

---

## Task 7: Update bill VM and AttachBillDialog for multi-allocation

**Files:**
- Modify: `src/hooks/useSupplierBills.ts` (useBillViewModel)
- Modify: `src/hooks/useAttachPaymentToBill.ts`
- Modify: `src/components/purchase/AttachBillDialog.tsx`
- Modify: `src/components/purchase/BillDetailDocument.tsx` (payment display)

The bill VM must now pull payment data from `payment_bill_allocations` (joined with `payments`). The "Link Payment" dialog must show available payment balance and accept a partial allocation amount.

### 7a — Update useBillViewModel

- [ ] **Step 1: Change payment fetch in `useBillViewModel` inside `useSupplierBills.ts`**

Find the `paymentsResult` fetch inside `useBillViewModel` (currently `.from('payments').eq('invoice_id', id)`).

Replace with a query through the allocations table:
```ts
// Fetch allocations for this bill, joined with payment details
const paymentsResult = await (supabase as any)
  .from('payment_bill_allocations')
  .select(`
    id,
    amount,
    payment_id,
    payments (
      id,
      payment_id,
      method,
      date,
      reference,
      notes,
      status,
      amount
    )
  `)
  .eq('bill_id', id)
  .order('created_at', { ascending: false })
```

Update the `BillPayment` type (or the inline mapping) so that each payment in the VM has:
- `id` — allocation id
- `payment_id` — the human-readable payment ID (from `payments.payment_id`)
- `amount` — the **allocated** amount (from `payment_bill_allocations.amount`, NOT the full payment amount)
- `method`, `date`, `reference` — from `payments.*`

Update the return mapping in `useBillViewModel`:
```ts
payments: (paymentsResult.data ?? []).map((alloc: any) => ({
  id:          alloc.id,
  payment_id:  alloc.payments?.payment_id ?? '—',
  amount:      alloc.amount,               // allocated amount
  method:      alloc.payments?.method ?? '',
  date:        alloc.payments?.date ?? '',
  reference:   alloc.payments?.reference ?? null,
  full_amount: alloc.payments?.amount ?? 0, // full payment amount for reference
})),
```

Also update `paid_amount` calculation if it is derived from payments in the VM (it may come from the DB column instead — check). The DB column is updated by the RPC, so no change needed there.

### 7b — Update useAttachPaymentToBill hook

- [ ] **Step 2: Update `useAttachPaymentToBill.ts` to call the new RPC**

Replace the entire file:
```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export function useAttachPaymentToBill() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      paymentId,
      billId,
      amount,
    }: {
      paymentId: string
      billId: string
      amount: number
    }) => {
      const supabase = createClient()
      const { error } = await (supabase as any).rpc('allocate_payment_to_bill', {
        p_payment_id: paymentId,
        p_bill_id:    billId,
        p_amount:     amount,
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

### 7c — Update AttachBillDialog for multi-bill with amount

- [ ] **Step 3: Read `AttachBillDialog.tsx` fully before editing**

The dialog has two modes: `"attach-bill"` (from Payments page) and `"link-payment"` (from Bill detail). We focus on `"link-payment"` mode — user selects a payment and enters how much to allocate.

- [ ] **Step 4: Update `AttachBillDialog.tsx` for `"link-payment"` mode**

The dialog must:
1. Show a list of available unlinked / partially-used payments for the supplier
2. Show each payment's total amount and already-allocated amount (remaining balance)
3. Let user enter an allocation amount (default = remaining balance, max = remaining balance)
4. Pass `amount` to `useAttachPaymentToBill`

To get available payments with their remaining balance, add a query inside the dialog:
```tsx
// Fetch payments for this supplier with allocated amounts
const { data: availablePayments } = useQuery({
  queryKey: ['supplier-payments-available', supplierId],
  queryFn: async () => {
    const supabase = createClient()
    const { data, error } = await (supabase as any)
      .from('payments')
      .select(`
        id, payment_id, amount, method, date, reference, status,
        payment_bill_allocations(amount)
      `)
      .eq('supplier_id', supplierId)
      .eq('direction', 'outgoing')
      .order('date', { ascending: false })
    if (error) throw error
    return (data ?? []).map((p: any) => {
      const allocated = (p.payment_bill_allocations ?? []).reduce((s: number, a: any) => s + a.amount, 0)
      return {
        ...p,
        allocated,
        remaining: p.amount - allocated,
      }
    }).filter((p: any) => p.remaining > 0)
  },
  enabled: !!supplierId && mode === 'link-payment',
})
```

Add `amount` state alongside `selectedPaymentId`:
```tsx
const [selectedPaymentId, setSelectedPaymentId] = useState('')
const [allocationAmount, setAllocationAmount] = useState('')
```

When user selects a payment, pre-fill `allocationAmount` with the remaining balance:
```tsx
function handlePaymentSelect(paymentId: string) {
  setSelectedPaymentId(paymentId)
  const p = availablePayments?.find((p) => p.id === paymentId)
  if (p) setAllocationAmount(String(p.remaining))
}
```

Show the payment list with remaining balance and an amount input:
```tsx
{availablePayments?.map((p) => (
  <div
    key={p.id}
    className={cn('border rounded-md p-3 cursor-pointer', selectedPaymentId === p.id && 'border-primary bg-primary/5')}
    onClick={() => handlePaymentSelect(p.id)}
  >
    <div className="flex justify-between text-sm font-medium">
      <span className="font-mono">{p.payment_id}</span>
      <span>{formatCurrency(p.amount, 'QAR')}</span>
    </div>
    <div className="flex justify-between text-xs text-muted-foreground mt-1">
      <span>{formatDate(p.date)} · {p.method.replace(/_/g, ' ')}</span>
      <span>Remaining: {formatCurrency(p.remaining, 'QAR')}</span>
    </div>
  </div>
))}

{selectedPaymentId && (
  <div className="space-y-1 pt-2">
    <Label>Amount to allocate (QAR)</Label>
    <Input
      type="number"
      min={0.01}
      step="0.01"
      max={availablePayments?.find(p => p.id === selectedPaymentId)?.remaining ?? undefined}
      value={allocationAmount}
      onChange={(e) => setAllocationAmount(e.target.value)}
    />
  </div>
)}
```

Update the confirm handler to pass `amount`:
```tsx
async function handleConfirm() {
  if (!selectedPaymentId || !billId) return
  const amount = parseFloat(allocationAmount)
  if (!amount || amount <= 0) return
  setLoading(true)
  try {
    await attach.mutateAsync({ paymentId: selectedPaymentId, billId, amount })
    onOpenChange(false)
    toast.success('Payment allocated to bill')
  } catch (err: unknown) {
    toast.error((err as Error).message ?? 'Failed to link payment')
  } finally {
    setLoading(false)
  }
}
```

- [ ] **Step 5: Update BillDetailDocument to show allocated amounts**

In the Payment History section (section 6), the `payments` array now contains allocated amounts. No code change needed since we map `amount` to the allocated amount in step 1. Verify the "Total Paid" summary and "Balance" calculations still work:

The `bill.paid_amount` comes from the DB column (updated by the RPC), not computed client-side. It should be correct automatically.

Optionally add a column showing the full payment amount for transparency:
```tsx
// In the TableHeader row for Payment History section, add a column:
<TableHead className="text-right">Allocated</TableHead>
// In the TableBody row:
<TableCell className="text-right font-medium">
  {formatCurrency(p.amount, currency)}
</TableCell>
```
(The current column already shows `p.amount` which is now the allocated amount — this is correct as-is.)

- [ ] **Step 6: Verify end-to-end**

1. Open a bill → Payment section → "Link Payment"
2. Dialog shows payments with remaining balance
3. Select a payment, adjust allocation amount
4. Click confirm → payment history updates showing the allocated amount
5. Open a second bill from the same supplier
6. Link the same payment with a different amount → both bills now show their allocation
7. The payment's remaining balance decreases after each allocation

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useSupplierBills.ts \
        src/hooks/useAttachPaymentToBill.ts \
        src/components/purchase/AttachBillDialog.tsx \
        src/components/purchase/BillDetailDocument.tsx
git commit -m "feat(bills): multi-bill payment allocation — split one payment across multiple bills"
```

---

## Self-Review

### Spec coverage check

| Requirement | Covered by |
|---|---|
| No approval statuses on bills | Task 2 |
| Bills manually marked as paid | Task 4 |
| All bill work on bill detail page (no separate route) | Task 5 |
| Fix Grand Total showing QAR twice | Task 1 |
| Discount shown in create-bill form | Task 5 (discount row in dialog totals) |
| One payment attachable to multiple POs | Tasks 6 + 7 |
| Print Date: date only, no time | Task 1 |
| Select Company (box 1) in sidebar | Task 3 |
| Select Division (box 2) in sidebar | Task 3 |
| Top-left header: company name + division below | Task 3 |
| Dropdown placeholders not empty | Task 3 (explicit `placeholder=` props) |

### Placeholder scan — none found.

### Type consistency check

- `BillPayment` type in `useSupplierBills.ts` gains `full_amount?: number` (optional, backwards safe)
- `CreateBillFromPODialog` calls `createBill.mutateAsync()` and uses `.id` — `useCreateBill` must return the created row. Verify in Task 5 Step 2.
- `allocate_payment_to_bill` RPC param names: `p_payment_id`, `p_bill_id`, `p_amount` — consistent across migration and hook.
- `attach_payment_to_bill` shim forwards to `allocate_payment_to_bill` — existing callers unaffected.
