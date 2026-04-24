# Bill Detail Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full-page AP bill detail view at `/purchase/bills/[id]` with a left sidebar of display toggles and a printable document layout.

**Architecture:** Left sidebar (280px, company selector + switches) alongside a scrollable A4 document card. Toggle states persist in URLSearchParams. Single `useBillViewModel` hook fetches all data in parallel via `Promise.all` to avoid waterfall rendering. Print stylesheet hides sidebar and applies table pagination rules.

**Tech Stack:** Next.js 15 App Router, TanStack Query v5, shadcn/ui, Tailwind CSS, Supabase, `qrcode.react`

---

## File Map

| File | Action |
|---|---|
| `supabase/migrations/20260424000004_divisions_address.sql` | Create |
| `src/hooks/useSupplierBills.ts` | Modify — add `BillViewModel`, `BillPayment`, `BillReceival` types + `useBillViewModel` hook |
| `src/components/purchase/BillDetailSection.tsx` | Create — reusable section wrapper |
| `src/components/purchase/BillDetailSidebar.tsx` | Create — company selector + toggle switches + print button |
| `src/components/purchase/BillDetailDocument.tsx` | Create — full A4 document with all sections |
| `src/app/(dashboard)/purchase/bills/[id]/page.tsx` | Create — page container, data orchestration |
| `src/app/(dashboard)/purchase/bills/page.tsx` | Modify — make rows clickable |
| `src/components/purchase/PoDetailDialog.tsx` | Modify — fix View Bill URL to include bill ID |
| `src/app/globals.css` | Modify — add print styles |

---

## Task 1: Install qrcode.react

**Files:**
- Modify: `package.json` (via npm)

- [ ] **Step 1: Install the package**

```bash
npm install qrcode.react
```

Expected output: `added 1 package` (or similar, no errors).

- [ ] **Step 2: Verify types are included**

```bash
ls node_modules/qrcode.react/lib/*.d.ts
```

Expected: `.d.ts` file present (v3 ships its own types — no `@types/qrcode.react` needed).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install qrcode.react"
```

---

## Task 2: Database Migration — divisions.address

**Files:**
- Create: `supabase/migrations/20260424000004_divisions_address.sql`

- [ ] **Step 1: Create the migration file**

```bash
npx supabase migration new divisions_address
```

This creates a timestamped file in `supabase/migrations/`. Open it and add:

```sql
-- TEXT (not VARCHAR) to support long multi-line addresses
ALTER TABLE divisions ADD COLUMN IF NOT EXISTS address TEXT;
```

- [ ] **Step 2: Apply to remote database**

```bash
npx supabase db query --linked "ALTER TABLE divisions ADD COLUMN IF NOT EXISTS address TEXT;"
```

Expected: `{ "rows": [] }` with no error.

- [ ] **Step 3: Verify**

```bash
npx supabase db query --linked "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'divisions' AND column_name = 'address';"
```

Expected: `{ "column_name": "address", "data_type": "text" }`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: add address column to divisions table"
```

---

## Task 3: Add useBillViewModel Hook

**Files:**
- Modify: `src/hooks/useSupplierBills.ts`

- [ ] **Step 1: Add types and hook to `useSupplierBills.ts`**

Add the following at the end of `src/hooks/useSupplierBills.ts` (after the existing `useApproveBill` export):

```typescript
import type { PaymentPlan } from '@/types/invoice'

export type BillPayment = {
  id: string
  payment_id: string
  amount: number
  method: string
  date: string
  reference: string | null
  notes: string | null
  status: string
}

export type BillReceival = {
  id: string
  receival_number: string
  date: string
  status: string
  receival_items: {
    id: string
    item_name: string
    sku: string | null
    qty_received: number
    is_free: boolean
  }[]
}

export type BillViewModel = {
  bill: ApInvoice & {
    paid_amount: number | null
    suppliers: {
      name: string
      contact_name: string | null
      phone: string | null
      email: string | null
      address: string | null
    } | null
    purchase_orders: {
      po_number: string
      created_date: string
      currency: string
    } | null
  }
  payments: BillPayment[]
  paymentPlan: PaymentPlan | null
  receival: BillReceival | null
}

export function useBillViewModel(id: string | null) {
  return useQuery({
    queryKey: ['bill-view-model', id],
    enabled: !!id,
    queryFn: async (): Promise<BillViewModel> => {
      const supabase = createClient()

      const [billResult, paymentsResult, planResult] = await Promise.all([
        (supabase as any)
          .from('invoices')
          .select(`
            *,
            invoice_line_items(*),
            suppliers(name, contact_name, phone, email, address),
            purchase_orders(po_number, created_date, currency)
          `)
          .eq('id', id)
          .eq('direction', 'ap')
          .single(),
        (supabase as any)
          .from('payments')
          .select('id, payment_id, amount, method, date, reference, notes, status')
          .eq('invoice_id', id)
          .eq('direction', 'outgoing')
          .order('date', { ascending: false }),
        (supabase as any)
          .from('payment_plans')
          .select('*, payment_installments(*)')
          .eq('invoice_id', id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      if (billResult.error) throw billResult.error
      if (paymentsResult.error) throw paymentsResult.error

      let receival: BillReceival | null = null
      if (billResult.data?.receival_id) {
        const { data } = await (supabase as any)
          .from('receivals')
          .select('id, receival_number, date, status, receival_items(id, item_name, sku, qty_received, is_free)')
          .eq('id', billResult.data.receival_id)
          .single()
        receival = data ?? null
      }

      return {
        bill: billResult.data as BillViewModel['bill'],
        payments: (paymentsResult.data ?? []) as BillPayment[],
        paymentPlan: planResult.data ?? null,
        receival,
      }
    },
  })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep "useSupplierBills\|BillViewModel"
```

Expected: no output (no errors on these files).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useSupplierBills.ts
git commit -m "feat: add useBillViewModel hook with parallel data fetching"
```

---

## Task 4: Create BillDetailSection Component

**Files:**
- Create: `src/components/purchase/BillDetailSection.tsx`

- [ ] **Step 1: Create the file**

```typescript
// src/components/purchase/BillDetailSection.tsx
import { cn } from '@/lib/utils'

type Props = {
  title?: string
  children: React.ReactNode
  className?: string
}

export function BillDetailSection({ title, children, className }: Props) {
  return (
    <div className={cn('break-inside-avoid', className)}>
      {title && (
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 border-b pb-1">
          {title}
        </p>
      )}
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/purchase/BillDetailSection.tsx
git commit -m "feat: add BillDetailSection reusable wrapper"
```

---

## Task 5: Create BillDetailSidebar Component

**Files:**
- Create: `src/components/purchase/BillDetailSidebar.tsx`

- [ ] **Step 1: Create the file**

```typescript
// src/components/purchase/BillDetailSidebar.tsx
'use client'

import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { Division } from '@/hooks/useDivisions'

type ToggleKey = 'showReceival' | 'showPaymentPlan' | 'showNotes' | 'showQR'

type Props = {
  divisions: Division[]
  selectedDivisionId: string
  onDivisionChange: (id: string) => void
  showReceival: boolean
  showPaymentPlan: boolean
  showNotes: boolean
  showQR: boolean
  onToggle: (key: ToggleKey, value: boolean) => void
  hasReceival: boolean
  hasPaymentPlan: boolean
  hasNotes: boolean
}

const ALWAYS_ON_SECTIONS = [
  'Company Header',
  'Supplier Info',
  'Line Items',
  'Totals',
  'Payment History',
]

export function BillDetailSidebar({
  divisions,
  selectedDivisionId,
  onDivisionChange,
  showReceival,
  showPaymentPlan,
  showNotes,
  showQR,
  onToggle,
  hasReceival,
  hasPaymentPlan,
  hasNotes,
}: Props) {
  return (
    <aside className="bill-sidebar w-[280px] shrink-0 flex flex-col gap-5 p-5 border-r bg-muted/20 min-h-screen sticky top-0">
      {/* Company selector */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Company</p>
        <Select value={selectedDivisionId} onValueChange={onDivisionChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select company…" />
          </SelectTrigger>
          <SelectContent>
            {divisions.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Always-on sections */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Always Shown</p>
        {ALWAYS_ON_SECTIONS.map((label) => (
          <div key={label} className="flex items-center gap-2 text-sm text-muted-foreground pl-1">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
            {label}
          </div>
        ))}
      </div>

      {/* Toggleable sections */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Document Options</p>
        <SidebarToggle
          label="Receival Info"
          checked={showReceival}
          disabled={!hasReceival}
          disabledHint="No receival linked"
          onCheckedChange={(v) => onToggle('showReceival', v)}
        />
        <SidebarToggle
          label="Payment Plan"
          checked={showPaymentPlan}
          disabled={!hasPaymentPlan}
          disabledHint="No payment plan"
          onCheckedChange={(v) => onToggle('showPaymentPlan', v)}
        />
        <SidebarToggle
          label="Notes / Remarks"
          checked={showNotes}
          disabled={!hasNotes}
          disabledHint="No notes"
          onCheckedChange={(v) => onToggle('showNotes', v)}
        />
        <SidebarToggle
          label="QR Code / Stamp"
          checked={showQR}
          onCheckedChange={(v) => onToggle('showQR', v)}
        />
      </div>

      <div className="flex-1" />

      <Button onClick={() => window.print()} className="w-full gap-2">
        <Printer className="h-4 w-4" />
        Print Bill
      </Button>
    </aside>
  )
}

function SidebarToggle({
  label,
  checked,
  disabled,
  disabledHint,
  onCheckedChange,
}: {
  label: string
  checked: boolean
  disabled?: boolean
  disabledHint?: string
  onCheckedChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div>
        <Label className={cn('text-sm', disabled && 'text-muted-foreground/50')}>{label}</Label>
        {disabled && disabledHint && (
          <p className="text-xs text-muted-foreground/40">{disabledHint}</p>
        )}
      </div>
      <Switch
        checked={checked && !disabled}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/purchase/BillDetailSidebar.tsx
git commit -m "feat: add BillDetailSidebar with company selector and document toggles"
```

---

## Task 6: Create BillDetailDocument Component

**Files:**
- Create: `src/components/purchase/BillDetailDocument.tsx`

- [ ] **Step 1: Create the file**

```typescript
// src/components/purchase/BillDetailDocument.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { BillDetailSection } from './BillDetailSection'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import type { BillViewModel } from '@/hooks/useSupplierBills'
import type { Division } from '@/hooks/useDivisions'

type DivisionWithAddress = Division & { address?: string | null }

type Props = {
  viewModel: BillViewModel
  division: DivisionWithAddress | null
  showReceival: boolean
  showPaymentPlan: boolean
  showNotes: boolean
  showQR: boolean
  relatedBills: { id: string; invoice_id: string }[]
  currentBillId: string
  onNavigate: (id: string) => void
}

const DOC_STATUS_COLORS: Record<string, string> = {
  draft:            'bg-slate-100 text-slate-700',
  pending_approval: 'bg-amber-100 text-amber-700',
  approved:         'bg-green-100 text-green-700',
  rejected:         'bg-red-100 text-red-700',
}

const PAY_STATUS_COLORS: Record<string, string> = {
  unpaid:         'bg-slate-100 text-slate-600',
  partially_paid: 'bg-amber-100 text-amber-700',
  paid:           'bg-green-100 text-green-700',
  overdue:        'bg-red-100 text-red-700',
}

function getWatermark(bill: BillViewModel['bill']): { text: string; colorClass: string } | null {
  if (bill.doc_status === 'draft') return { text: 'DRAFT', colorClass: 'text-slate-400' }
  if (bill.payment_status === 'paid') return { text: 'PAID', colorClass: 'text-green-400' }
  if (bill.payment_status === 'overdue') return { text: 'OVERDUE', colorClass: 'text-red-400' }
  return null
}

export function BillDetailDocument({
  viewModel,
  division,
  showReceival,
  showPaymentPlan,
  showNotes,
  showQR,
  relatedBills,
  currentBillId,
  onNavigate,
}: Props) {
  const { bill, payments, paymentPlan, receival } = viewModel
  const watermark = getWatermark(bill)
  const [origin, setOrigin] = useState('')
  const printTimestamp = new Date().toLocaleString('en-GB')

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  const supplier = bill.suppliers
  const po = bill.purchase_orders
  const currency = po?.currency ?? 'QAR'
  const balance = (bill.total_amount ?? 0) - (bill.paid_amount ?? 0)

  return (
    <div className="relative bg-white rounded-lg shadow-lg border max-w-3xl mx-auto p-10 space-y-7 print:shadow-none print:border-none print:p-6 print:max-w-none print:rounded-none">
      {/* Watermark */}
      {watermark && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden rounded-lg print:rounded-none">
          <span className={cn(
            'text-[9rem] font-black opacity-[0.07] rotate-[-30deg] tracking-widest',
            watermark.colorClass
          )}>
            {watermark.text}
          </span>
        </div>
      )}

      {/* 1. Header */}
      <BillDetailSection>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold leading-tight">
              {division?.name ?? 'Alfaytri Maintenance'}
            </h1>
            {division?.address && (
              <p className="text-sm text-muted-foreground mt-1 whitespace-pre-line">
                {division.address}
              </p>
            )}
          </div>
          <div className="text-right shrink-0">
            <h2 className="text-2xl font-bold" dir="rtl">فاتورة مشتريات</h2>
            <p className="text-sm text-muted-foreground">Purchase Bill / Statement</p>
          </div>
        </div>
        <hr className="mt-4" />
      </BillDetailSection>

      {/* Related bills alert */}
      {relatedBills.length > 1 && (
        <div className="bg-amber-50 border border-amber-200 rounded-md px-4 py-2 text-sm text-amber-800 flex flex-wrap items-center gap-2 print:hidden">
          <span className="font-medium">This PO has {relatedBills.length} bills:</span>
          {relatedBills.map((b) => (
            <button
              key={b.id}
              onClick={() => onNavigate(b.id)}
              className={cn(
                'font-mono hover:underline underline-offset-2',
                b.id === currentBillId ? 'font-bold' : 'text-amber-700'
              )}
            >
              {b.invoice_id}
            </button>
          ))}
        </div>
      )}

      {/* 2. Meta row */}
      <BillDetailSection>
        <div className="flex items-start justify-between text-sm gap-4">
          <div className="space-y-2">
            {po && (
              <p className="font-mono font-semibold">
                {po.po_number} · {formatDate(po.created_date)}
              </p>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={cn('text-xs', DOC_STATUS_COLORS[bill.doc_status] ?? '')}>
                {bill.doc_status.replace(/_/g, ' ')}
              </Badge>
              <Badge className={cn('text-xs', PAY_STATUS_COLORS[bill.payment_status] ?? '')}>
                {bill.payment_status.replace(/_/g, ' ')}
              </Badge>
            </div>
          </div>
          <div className="text-right space-y-1 text-muted-foreground shrink-0">
            <p className="font-medium text-foreground font-mono">{bill.invoice_id}</p>
            <p>Due: <span className="text-foreground">{formatDate(bill.due_date)}</span></p>
            <p>Print Date: {printTimestamp}</p>
          </div>
        </div>
      </BillDetailSection>

      {/* 3. Supplier */}
      <BillDetailSection title="Supplier / المورد">
        {supplier ? (
          <div className="text-sm space-y-0.5">
            <p className="font-bold text-base">{supplier.name}</p>
            {supplier.contact_name && (
              <p className="text-muted-foreground">{supplier.contact_name}</p>
            )}
            {supplier.phone && <p>{supplier.phone}</p>}
            {supplier.email && <p>{supplier.email}</p>}
            {supplier.address && (
              <p className="text-muted-foreground whitespace-pre-line">{supplier.address}</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">—</p>
        )}
      </BillDetailSection>

      {/* 4. Line items */}
      <BillDetailSection title="Items">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">#</TableHead>
              <TableHead>Item</TableHead>
              <TableHead className="text-right w-20">Qty</TableHead>
              <TableHead className="text-right w-28">Price</TableHead>
              <TableHead className="text-right w-28">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(bill.invoice_line_items ?? []).map((li, i) => (
              <TableRow key={li.id}>
                <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                <TableCell className="font-medium">{li.description}</TableCell>
                <TableCell className="text-right">{li.qty ?? '—'}</TableCell>
                <TableCell className="text-right">{formatCurrency(li.unit_price, currency)}</TableCell>
                <TableCell className="text-right font-medium">{formatCurrency(li.total, currency)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </BillDetailSection>

      {/* 5. Totals */}
      <div className="flex justify-end">
        <div className="w-64 space-y-1.5 text-sm border-t pt-3">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal:</span>
            <span>{formatCurrency(bill.subtotal, currency)}</span>
          </div>
          <div className="flex justify-between font-bold text-base">
            <span>Grand Total:</span>
            <span>{formatCurrency(bill.total_amount, currency)} {currency}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Total (QAR):</span>
            <span>{formatCurrency(bill.total_amount, 'QAR')}</span>
          </div>
        </div>
      </div>

      {/* 6. Payment History */}
      <BillDetailSection title="Payment History">
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No payments recorded</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{formatDate(p.date)}</TableCell>
                  <TableCell className="capitalize">{p.method.replace(/_/g, ' ')}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">
                    {p.reference ?? '—'}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(p.amount, currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <div className="flex justify-end mt-4">
          <div className="w-64 space-y-1.5 text-sm border-t pt-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Amount (QAR):</span>
              <span>{formatCurrency(bill.total_amount, 'QAR')}</span>
            </div>
            <div className="flex justify-between text-green-600 font-medium">
              <span>Total Paid:</span>
              <span>{formatCurrency(bill.paid_amount ?? 0, 'QAR')}</span>
            </div>
            <div className="flex justify-between font-bold text-red-600">
              <span>Balance:</span>
              <span>{formatCurrency(balance, 'QAR')}</span>
            </div>
            <div className="pt-1">
              <Badge className={cn('text-xs', PAY_STATUS_COLORS[bill.payment_status] ?? '')}>
                {bill.payment_status.replace(/_/g, ' ')}
              </Badge>
            </div>
          </div>
        </div>
      </BillDetailSection>

      {/* 7. Receival Info (toggleable) */}
      {showReceival && receival && (
        <BillDetailSection title="Receival Info">
          <p className="text-xs text-muted-foreground mb-2">
            Ref: <span className="font-mono">{receival.receival_number}</span>
            {' · '}{formatDate(receival.date)}
            {' · '}Status: <span className="capitalize">{receival.status}</span>
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right w-28">Qty Received</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {receival.receival_items
                .filter((ri) => !ri.is_free)
                .map((ri) => (
                  <TableRow key={ri.id}>
                    <TableCell>
                      <p className="font-medium">{ri.item_name}</p>
                      {ri.sku && <p className="text-xs text-muted-foreground">{ri.sku}</p>}
                    </TableCell>
                    <TableCell className="text-right font-medium">{ri.qty_received}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </BillDetailSection>
      )}

      {/* 8. Payment Plan (toggleable) */}
      {showPaymentPlan && paymentPlan && (
        <BillDetailSection title="Payment Plan">
          <p className="text-xs text-muted-foreground mb-2 capitalize">
            Type: {paymentPlan.plan_type} · Status: {paymentPlan.status}
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(paymentPlan.payment_installments ?? []).map((inst, i) => (
                <TableRow key={inst.id}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell>{formatDate(inst.due_date)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(inst.amount, 'QAR')}</TableCell>
                  <TableCell className="text-right text-green-600">
                    {formatCurrency(inst.paid_amount, 'QAR')}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs capitalize">
                      {inst.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </BillDetailSection>
      )}

      {/* 9. Notes (toggleable) */}
      {showNotes && bill.notes && (
        <BillDetailSection title="Notes / Remarks">
          <p className="text-sm text-muted-foreground whitespace-pre-line">{bill.notes}</p>
        </BillDetailSection>
      )}

      {/* 10. QR Code (toggleable) */}
      {showQR && (
        <BillDetailSection>
          <div className="flex justify-end">
            <div className="p-3 border rounded-lg text-center space-y-1">
              {origin ? (
                <QRCodeSVG
                  value={`${origin}/purchase/bills/${bill.id}`}
                  size={96}
                />
              ) : (
                <div className="w-24 h-24 bg-muted animate-pulse rounded" />
              )}
              <p className="text-xs font-mono text-muted-foreground">{bill.invoice_id}</p>
            </div>
          </div>
        </BillDetailSection>
      )}

      {/* 11. Footer */}
      <div className="border-t pt-4 flex items-start justify-between text-xs text-muted-foreground gap-4">
        <p>
          {division?.name ?? 'Alfaytri Maintenance'}
          {' · '}
          <span dir="rtl">هذا المستند تم إنشاؤه تلقائياً</span>
        </p>
        <p className="shrink-0">
          This document was automatically generated · {new Date().toISOString()}
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep "BillDetailDocument"
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/components/purchase/BillDetailDocument.tsx
git commit -m "feat: add BillDetailDocument component with all bill sections"
```

---

## Task 7: Create Bill Detail Page

**Files:**
- Create: `src/app/(dashboard)/purchase/bills/[id]/page.tsx`

- [ ] **Step 1: Create the directory and file**

```bash
mkdir -p "src/app/(dashboard)/purchase/bills/[id]"
```

Create `src/app/(dashboard)/purchase/bills/[id]/page.tsx`:

```typescript
'use client'

import { useState, useEffect, Suspense } from 'react'
import { useParams, useRouter, usePathname, useSearchParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useBillViewModel, useBillsByPO } from '@/hooks/useSupplierBills'
import { useDivisions } from '@/hooks/useDivisions'
import { BillDetailSidebar } from '@/components/purchase/BillDetailSidebar'
import { BillDetailDocument } from '@/components/purchase/BillDetailDocument'

type ToggleKey = 'showReceival' | 'showPaymentPlan' | 'showNotes' | 'showQR'

function BillDetailContent() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function getParam(key: string): boolean {
    const val = searchParams.get(key)
    return val === null ? true : val !== 'false'
  }

  const [showReceival, setShowReceival] = useState(() => getParam('showReceival'))
  const [showPaymentPlan, setShowPaymentPlan] = useState(() => getParam('showPaymentPlan'))
  const [showNotes, setShowNotes] = useState(() => getParam('showNotes'))
  const [showQR, setShowQR] = useState(() => getParam('showQR'))

  const [selectedDivisionId, setSelectedDivisionId] = useState('')

  function handleToggle(key: ToggleKey, value: boolean) {
    const setters: Record<ToggleKey, (v: boolean) => void> = {
      showReceival: setShowReceival,
      showPaymentPlan: setShowPaymentPlan,
      showNotes: setShowNotes,
      showQR: setShowQR,
    }
    setters[key](value)
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.delete(key)
    } else {
      params.set(key, 'false')
    }
    const qs = params.toString()
    router.replace(`${pathname}${qs ? '?' + qs : ''}`, { scroll: false })
  }

  const { data: viewModel, isLoading, isError } = useBillViewModel(id)
  const { data: divisions = [] } = useDivisions()
  const { data: relatedBills = [] } = useBillsByPO(
    viewModel?.bill.purchase_order_id ?? null
  )

  useEffect(() => {
    if (divisions.length > 0 && !selectedDivisionId) {
      setSelectedDivisionId(divisions[0].id)
    }
  }, [divisions, selectedDivisionId])

  const selectedDivision = (divisions.find((d) => d.id === selectedDivisionId) ?? null) as any

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground text-sm">
        Loading bill…
      </div>
    )
  }

  if (isError || !viewModel) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Bill not found.</p>
        <Button variant="outline" size="sm" onClick={() => router.push('/purchase/bills')}>
          Back to Bills
        </Button>
      </div>
    )
  }

  const { bill, receival, paymentPlan } = viewModel

  return (
    <div className="flex min-h-screen">
      <BillDetailSidebar
        divisions={divisions}
        selectedDivisionId={selectedDivisionId}
        onDivisionChange={setSelectedDivisionId}
        showReceival={showReceival}
        showPaymentPlan={showPaymentPlan}
        showNotes={showNotes}
        showQR={showQR}
        onToggle={handleToggle}
        hasReceival={!!receival}
        hasPaymentPlan={!!paymentPlan}
        hasNotes={!!bill.notes}
      />
      <div className="flex-1 overflow-auto bg-muted/30 p-8">
        <Button
          variant="ghost"
          size="sm"
          className="mb-6 print:hidden"
          onClick={() => router.push('/purchase/bills')}
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to Bills
        </Button>
        <BillDetailDocument
          viewModel={viewModel}
          division={selectedDivision}
          showReceival={showReceival}
          showPaymentPlan={showPaymentPlan}
          showNotes={showNotes}
          showQR={showQR}
          relatedBills={relatedBills}
          currentBillId={id}
          onNavigate={(billId) => router.push(`/purchase/bills/${billId}`)}
        />
      </div>
    </div>
  )
}

export default function BillDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-muted-foreground text-sm">
          Loading…
        </div>
      }
    >
      <BillDetailContent />
    </Suspense>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep "bills/\[id\]"
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/purchase/bills/[id]/page.tsx"
git commit -m "feat: add bill detail page at /purchase/bills/[id]"
```

---

## Task 8: Add Print Styles to globals.css

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Append print styles to `src/app/globals.css`**

Add at the very end of the file:

```css
@media print {
  .bill-sidebar {
    display: none !important;
  }

  tr {
    page-break-inside: avoid;
  }

  thead {
    display: table-header-group;
  }

  tfoot {
    display: table-footer-group;
  }

  body {
    background: white !important;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/globals.css
git commit -m "feat: add print styles — hide sidebar, prevent table row splits"
```

---

## Task 9: Make Bills List Rows Clickable

**Files:**
- Modify: `src/components/shared/DataTable.tsx` — add `onRowClick` prop
- Modify: `src/app/(dashboard)/purchase/bills/page.tsx` — pass `onRowClick`

- [ ] **Step 1: Add `onRowClick` to `DataTable`**

In `src/components/shared/DataTable.tsx`, update the interface and `<TableRow>`:

```typescript
// Update the interface (add onRowClick):
interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  isLoading?: boolean
  globalFilter?: string
  pageSize?: number
  onRowClick?: (row: TData) => void
}

// Update the function signature to destructure it:
export function DataTable<TData, TValue>({
  columns,
  data,
  isLoading = false,
  globalFilter = '',
  pageSize = 20,
  onRowClick,
}: DataTableProps<TData, TValue>) {
```

Then find this line in the `TableBody` rows render:
```typescript
<TableRow key={row.id}>
```

Replace with:
```typescript
<TableRow
  key={row.id}
  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
  className={onRowClick ? 'cursor-pointer hover:bg-muted/50' : ''}
>
```

- [ ] **Step 2: Add `useRouter` to bills page and pass `onRowClick`**

In `src/app/(dashboard)/purchase/bills/page.tsx`:

Add import:
```typescript
import { useRouter } from 'next/navigation'
```

Add inside `BillsPage()` function after `const approveBill = useApproveBill()`:
```typescript
const router = useRouter()
```

Find the `<DataTable` usage and add `onRowClick`:
```typescript
<DataTable
  columns={columns}
  data={bills ?? []}
  isLoading={isLoading}
  globalFilter={search}
  onRowClick={(row) => router.push(`/purchase/bills/${row.id}`)}
/>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep -E "DataTable|bills/page"
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/components/shared/DataTable.tsx src/app/(dashboard)/purchase/bills/page.tsx
git commit -m "feat: make bills list rows clickable — navigate to detail page"
```

---

## Task 10: Fix PoDetailDialog View Bill URL

**Files:**
- Modify: `src/components/purchase/PoDetailDialog.tsx`

- [ ] **Step 1: Find and update the View Bill navigation**

In `src/components/purchase/PoDetailDialog.tsx`, find this line (around line 150):

```typescript
<Button variant="outline" size="sm" onClick={() => { onOpenChange(false); router.push(`/purchase/bills`) }}>
  View Bill ({existingBills[0].invoice_id})
</Button>
```

Replace with:

```typescript
<Button variant="outline" size="sm" onClick={() => { onOpenChange(false); router.push(`/purchase/bills/${existingBills[0].id}`) }}>
  View Bill ({existingBills[0].invoice_id})
</Button>
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep "PoDetailDialog"
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/components/purchase/PoDetailDialog.tsx
git commit -m "fix: View Bill button navigates to specific bill detail page"
```

---

## Task 11: Update PROGRESS.md

- [ ] **Step 1: Update PROGRESS.md**

Add to the `## ✅ Completed` section:

```
- [2026-04-24] **Bill Detail Page** — `src/app/(dashboard)/purchase/bills/[id]/page.tsx`, `src/components/purchase/BillDetailDocument.tsx`, `src/components/purchase/BillDetailSidebar.tsx`, `src/components/purchase/BillDetailSection.tsx`, `src/hooks/useSupplierBills.ts`, `src/app/globals.css`, `supabase/migrations/20260424000004_divisions_address.sql` — Full-page bill detail with left sidebar (company selector, document toggles), A4 document card, status watermark, QR code, print stylesheet, URL-persisted toggle state
```

- [ ] **Step 2: Commit**

```bash
git add PROGRESS.md
git commit -m "docs: update PROGRESS.md — bill detail page complete"
```
