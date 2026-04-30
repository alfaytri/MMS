# SO Invoice Button + Invoice Sidebar + SO Activity Timeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "View Invoice" button to the SO dialog, give the Invoice page a Bill-style sidebar with company/division selectors and document toggles, and upgrade the SO Activity tab to use the PO-style timeline design.

**Architecture:** All changes are pure UI — no new API routes, hooks, or DB migrations needed. The existing `useInvoicesBySO`, `useCustomerPayments`, `usePaymentPlans`, `useCompanies`, and `useDivisionsByCompany` hooks already supply all required data. The Invoice page is restructured from a single-column toolbar layout to the sidebar + content layout that the Bill page already uses.

**Tech Stack:** Next.js 14 App Router, React, TypeScript, Tailwind CSS, shadcn/ui, `next/navigation`

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Modify | `src/components/sales/SoDetailDialog.tsx` | Activity tab timeline + View Invoice button |
| Create | `src/components/sales/InvoiceDetailSidebar.tsx` | New sidebar: company/division selectors + toggles |
| Modify | `src/components/sales/InvoiceDetailDocument.tsx` | Accept `showNotes`, `showQR`, `showPaymentPlan` props |
| Modify | `src/app/(dashboard)/sales/invoices/[id]/page.tsx` | Sidebar layout, toggle state, wire sidebar + document |

---

## Task 1: Upgrade SO Activity tab to PO-style timeline

**Files:**
- Modify: `src/components/sales/SoDetailDialog.tsx` (lines 432–450)

The current flat list uses `formatRelative`. Replace it with the same left-timeline pattern from `PoDetailDialog.tsx`: vertical connector line, colored dot per action type, absolute date below action.

Color map for SO actions:
- `bg-destructive` → action includes "Cancelled" or "Rejected"
- `bg-green-500` → action includes "Delivered", "Confirmed", or "Approved"
- `bg-purple-500` → action includes "Payment"
- `bg-orange-500` → action includes "Return"
- `bg-primary` → everything else

- [ ] **Step 1: Replace the Activity TabsContent block**

Find the existing block in `SoDetailDialog.tsx`:
```tsx
{/* ── Activity ─────────────────────────────────────── */}
<TabsContent value="activity" className="flex-1 overflow-y-auto">
  {(activityLogs ?? []).length === 0 ? (
    <p className="text-sm text-muted-foreground text-center py-4">No activity yet</p>
  ) : (
    <div className="space-y-2">
      {(activityLogs ?? []).map((log) => (
        <div key={log.id} className="flex gap-3 text-sm">
          <span className="text-muted-foreground shrink-0 text-xs pt-0.5">{formatRelative(log.created_at)}</span>
          <div>
            <span className="font-medium">{log.action}</span>
            {log.performer_name && <span className="text-muted-foreground"> · {log.performer_name}</span>}
            {log.details && <p className="text-xs text-muted-foreground mt-0.5">{log.details}</p>}
          </div>
        </div>
      ))}
    </div>
  )}
</TabsContent>
```

Replace with:
```tsx
{/* ── Activity ─────────────────────────────────────── */}
<TabsContent value="activity" className="flex-1 overflow-y-auto">
  {(activityLogs ?? []).length === 0 ? (
    <p className="text-sm text-muted-foreground text-center py-4">No activity yet</p>
  ) : (
    <div className="relative pl-6 space-y-0">
      {(activityLogs ?? []).map((log, idx) => {
        const a = log.action ?? ''
        const dotClass =
          a.includes('Cancelled') || a.includes('Rejected')
            ? 'bg-destructive border-destructive'
            : a.includes('Delivered') || a.includes('Confirmed') || a.includes('Approved')
            ? 'bg-green-500 border-green-500'
            : a.includes('Payment')
            ? 'bg-purple-500 border-purple-500'
            : a.includes('Return')
            ? 'bg-orange-500 border-orange-500'
            : 'bg-primary border-primary'
        return (
          <div key={log.id} className="relative pb-4">
            {idx < (activityLogs ?? []).length - 1 && (
              <span className="absolute left-[-16px] top-3 bottom-0 w-px bg-border" />
            )}
            <span className={cn('absolute left-[-20px] top-1.5 h-3 w-3 rounded-full border-2', dotClass)} />
            <div className="text-sm flex flex-wrap items-center gap-1.5">
              <span className="font-medium">{log.action}</span>
              {log.performer_name && (
                <span className="text-muted-foreground text-xs">· {log.performer_name}</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{formatDate(log.created_at)}</p>
            {log.details && (
              <p className="text-xs text-muted-foreground mt-0.5">{log.details}</p>
            )}
          </div>
        )
      })}
    </div>
  )}
</TabsContent>
```

- [ ] **Step 2: Verify `cn` and `formatDate` are imported**

`cn` comes from `@/lib/utils` and `formatDate` from `@/lib/utils/formatters`. Both are already imported in `SoDetailDialog.tsx` — confirm at the top of the file. `formatRelative` may now be unused; remove it from the import if so.

- [ ] **Step 3: Commit**

```bash
git add src/components/sales/SoDetailDialog.tsx
git commit -m "feat(sales): upgrade SO activity tab to PO-style timeline"
```

---

## Task 2: Add "View Invoice" button to SO dialog footer

**Files:**
- Modify: `src/components/sales/SoDetailDialog.tsx` (import + footer buttons section ~line 599)

- [ ] **Step 1: Add `useRouter` import**

At the top of `SoDetailDialog.tsx`, add to the existing Next.js import:
```tsx
import { useRouter } from 'next/navigation'
```

- [ ] **Step 2: Instantiate router inside the component**

After the existing `const current = fullSO ?? so` line, add:
```tsx
const router = useRouter()
```

- [ ] **Step 3: Add the View Invoice button to the footer**

Find the footer action buttons block (starts with `{current && !isLoading && (`). Add the View Invoice button **before** the Close button:

```tsx
{soInvoice && (
  <Button
    variant="outline"
    size="sm"
    onClick={() => { onOpenChange(false); router.push(`/sales/invoices/${soInvoice.id}`) }}
  >
    View Invoice ({soInvoice.invoice_id})
  </Button>
)}
```

The full footer block should now look like:
```tsx
{current && !isLoading && (
  <div className="shrink-0 flex flex-wrap gap-2 pt-2 border-t justify-end">
    {canApprove && (
      <Button
        size="sm"
        className="bg-yellow-600 hover:bg-yellow-700 text-white"
        disabled={approveSO.isPending}
        onClick={handleApprove}
      >
        {approveSO.isPending ? 'Approving…' : 'Approve Order'}
      </Button>
    )}
    {canConfirm && onConfirm && (
      <Button size="sm" onClick={() => { onConfirm(current); onOpenChange(false) }}>
        Confirm Order
      </Button>
    )}
    {canDeliver && (
      <Button variant="outline" size="sm" onClick={() => setDeliveryOpen(true)}>
        + Create Delivery
      </Button>
    )}
    {canEdit && onEdit && (
      <Button variant="outline" size="sm" disabled={isLoading} onClick={() => { onEdit(current); onOpenChange(false) }}>
        Edit SO
      </Button>
    )}
    {(current?.status === 'quotation' || current?.status === 'pending_approval') && fullSO && (
      <SoPdfButton so={fullSO} />
    )}
    {soInvoice && (
      <Button
        variant="outline"
        size="sm"
        onClick={() => { onOpenChange(false); router.push(`/sales/invoices/${soInvoice.id}`) }}
      >
        View Invoice ({soInvoice.invoice_id})
      </Button>
    )}
    <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
      Close
    </Button>
  </div>
)}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/sales/SoDetailDialog.tsx
git commit -m "feat(sales): add View Invoice button to SO dialog footer"
```

---

## Task 3: Create InvoiceDetailSidebar component

**Files:**
- Create: `src/components/sales/InvoiceDetailSidebar.tsx`

This is a direct port of `BillDetailSidebar.tsx` adapted for invoices. Always-shown sections differ; toggleable sections are Notes, QR Code, and Payment Plan.

- [ ] **Step 1: Create the file**

Create `src/components/sales/InvoiceDetailSidebar.tsx` with:
```tsx
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
import type { Company } from '@/hooks/useCompanies'

export type InvoiceToggleKey = 'showNotes' | 'showQR' | 'showPaymentPlan'

type Props = {
  companies: Company[]
  selectedCompanyId: string
  onCompanyChange: (id: string) => void
  divisions: Division[]
  selectedDivisionId: string
  onDivisionChange: (id: string) => void
  showNotes: boolean
  showQR: boolean
  showPaymentPlan: boolean
  onToggle: (key: InvoiceToggleKey, value: boolean) => void
  hasNotes: boolean
  hasPaymentPlan: boolean
}

const ALWAYS_ON_SECTIONS = [
  'Company Header',
  'Customer Info',
  'Line Items',
  'Totals',
  'Payment History',
]

export function InvoiceDetailSidebar({
  companies,
  selectedCompanyId,
  onCompanyChange,
  divisions,
  selectedDivisionId,
  onDivisionChange,
  showNotes,
  showQR,
  showPaymentPlan,
  onToggle,
  hasNotes,
  hasPaymentPlan,
}: Props) {
  return (
    <aside className="invoice-sidebar w-[280px] shrink-0 flex flex-col gap-5 p-5 border-r bg-muted/20 min-h-full lg:min-h-screen lg:sticky lg:top-0 overflow-y-auto">
      {/* Company selector */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Company</p>
        <Select value={selectedCompanyId || undefined} onValueChange={(v) => { if (v) onCompanyChange(v) }}>
          <SelectTrigger>
            <SelectValue placeholder="— Select —" />
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
          value={selectedDivisionId || undefined}
          onValueChange={(v) => { if (v) onDivisionChange(v) }}
          disabled={!selectedCompanyId}
        >
          <SelectTrigger>
            <SelectValue placeholder={selectedCompanyId ? '— Select —' : 'Select company first…'} />
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
        Print Invoice
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
git add src/components/sales/InvoiceDetailSidebar.tsx
git commit -m "feat(sales): add InvoiceDetailSidebar with company/division/toggle controls"
```

---

## Task 4: Update InvoiceDetailDocument to accept toggle props

**Files:**
- Modify: `src/components/sales/InvoiceDetailDocument.tsx`

Add `showNotes`, `showQR`, `showPaymentPlan` props. Wrap the Notes and QR sections with the flags. Add a Payment Plan section that renders `plans` when `showPaymentPlan` is true.

Import `PaymentPlan` type from `@/hooks/usePaymentPlans`.

- [ ] **Step 1: Add `usePaymentPlans` type import**

At the top of `InvoiceDetailDocument.tsx`, add:
```tsx
import type { PaymentPlan } from '@/hooks/usePaymentPlans'
```

- [ ] **Step 2: Update the Props type**

Replace the existing `Props` type:
```tsx
type Props = {
  invoice: ArInvoice
  payments: CustomerPayment[]
  company: Company | null
  division: Division | null
  plans?: PaymentPlan[]
  showNotes?: boolean
  showQR?: boolean
  showPaymentPlan?: boolean
}
```

- [ ] **Step 3: Update function signature**

Replace:
```tsx
export function InvoiceDetailDocument({ invoice, payments, company, division }: Props) {
```
With:
```tsx
export function InvoiceDetailDocument({
  invoice,
  payments,
  company,
  division,
  plans = [],
  showNotes = true,
  showQR = true,
  showPaymentPlan = true,
}: Props) {
```

- [ ] **Step 4: Wrap the Notes section with `showNotes`**

Find:
```tsx
      {/* 7. Notes */}
      {invoice.notes && (
        <BillDetailSection title="Notes / Remarks">
          <p className="text-sm text-muted-foreground whitespace-pre-line">{invoice.notes}</p>
        </BillDetailSection>
      )}
```
Replace with:
```tsx
      {/* 7. Notes */}
      {showNotes && invoice.notes && (
        <BillDetailSection title="Notes / Remarks">
          <p className="text-sm text-muted-foreground whitespace-pre-line">{invoice.notes}</p>
        </BillDetailSection>
      )}
```

- [ ] **Step 5: Add Payment Plan section before Notes**

After the Payment History section (`{/* 6. Payment History */}`) and before Notes, insert:
```tsx
      {/* 7. Payment Plan */}
      {showPaymentPlan && plans.length > 0 && (
        <BillDetailSection title="Payment Plan">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans
                .flatMap((plan) => plan.installments ?? [])
                .map((inst, i) => (
                  <TableRow key={inst.id ?? i}>
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell>{formatDate(inst.due_date)}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(inst.amount, 'QAR')}
                    </TableCell>
                    <TableCell>
                      <span className={cn(
                        'text-xs px-1.5 py-0.5 rounded font-medium capitalize',
                        inst.status === 'paid'    ? 'bg-green-100 text-green-700' :
                        inst.status === 'overdue' ? 'bg-red-100 text-red-700' :
                                                    'bg-slate-100 text-slate-600'
                      )}>
                        {inst.status}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </BillDetailSection>
      )}
```

> **Note on `PaymentPlan` shape:** Check `src/hooks/usePaymentPlans.ts` for the actual type. If `installments` is at `plan.installments`, use that. If the structure differs, adapt the flatMap accordingly. The key fields needed are `id`, `due_date`, `amount`, `status` on each installment.

- [ ] **Step 6: Wrap the QR section with `showQR`**

Find:
```tsx
      {/* 8. QR Code */}
      <BillDetailSection>
        <div className="flex justify-end">
```
Replace with:
```tsx
      {/* 8. QR Code */}
      {showQR && (
      <BillDetailSection>
        <div className="flex justify-end">
```
And close the conditional after the closing `</BillDetailSection>`:
```tsx
      </BillDetailSection>
      )}
```

- [ ] **Step 7: Re-number the Notes section comment to 8, QR to 9, Footer stays**

Update inline comments to `{/* 8. Notes */}`, `{/* 9. QR Code */}` to keep them readable. This is cosmetic only.

- [ ] **Step 8: Commit**

```bash
git add src/components/sales/InvoiceDetailDocument.tsx
git commit -m "feat(sales): add showNotes/showQR/showPaymentPlan toggle props to InvoiceDetailDocument"
```

---

## Task 5: Rebuild Invoice page with sidebar layout

**Files:**
- Modify: `src/app/(dashboard)/sales/invoices/[id]/page.tsx`

Restructure the page to match the Bill page: sidebar always visible on `lg+`, slide-in overlay on mobile triggered by an "Options" button. Move Print button to the sidebar. Keep Send to Customer, Pay Now, and Payment Plan in the toolbar.

- [ ] **Step 1: Add new imports**

Add to the existing imports in the page file:
```tsx
import { usePathname, useSearchParams } from 'next/navigation'
import { Settings2 } from 'lucide-react'
import { InvoiceDetailSidebar, type InvoiceToggleKey } from '@/components/sales/InvoiceDetailSidebar'
import { cn } from '@/lib/utils'
```

Remove `Printer` from the lucide import (it moves to the sidebar's Print button).

- [ ] **Step 2: Replace the state declarations at the top of `InvoiceDetailContent`**

Replace:
```tsx
  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [selectedDivisionId, setSelectedDivisionId] = useState('')
  const [payOpen, setPayOpen] = useState(false)
  const [planOpen, setPlanOpen] = useState(false)
```
With:
```tsx
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function getParam(key: string): boolean {
    const val = searchParams.get(key)
    return val === null ? true : val !== 'false'
  }

  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [selectedDivisionId, setSelectedDivisionId] = useState('')
  const [showNotes, setShowNotes] = useState(() => getParam('showNotes'))
  const [showQR, setShowQR] = useState(() => getParam('showQR'))
  const [showPaymentPlan, setShowPaymentPlan] = useState(() => getParam('showPaymentPlan'))
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [planOpen, setPlanOpen] = useState(false)
```

- [ ] **Step 3: Add the handleToggle function**

After the `useState` declarations, add:
```tsx
  function handleToggle(key: InvoiceToggleKey, value: boolean) {
    const setters: Record<InvoiceToggleKey, (v: boolean) => void> = {
      showNotes: setShowNotes,
      showQR: setShowQR,
      showPaymentPlan: setShowPaymentPlan,
    }
    setters[key](value)
    const p = new URLSearchParams(searchParams.toString())
    if (value) {
      p.delete(key)
    } else {
      p.set(key, 'false')
    }
    const qs = p.toString()
    router.replace(`${pathname}${qs ? '?' + qs : ''}`, { scroll: false })
  }
```

- [ ] **Step 4: Replace the full return block**

Replace the entire `return (...)` block inside `InvoiceDetailContent` (from `return (` down to the closing `)`) with:

```tsx
  return (
    <div className="flex min-h-screen print:block print:min-h-0">
      {/* Sidebar */}
      <>
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <div className={cn(
          'fixed inset-y-0 left-0 z-50 lg:static lg:z-auto transition-transform lg:transform-none',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}>
          <InvoiceDetailSidebar
            companies={companies}
            selectedCompanyId={selectedCompanyId}
            onCompanyChange={setSelectedCompanyId}
            divisions={divisionsByCompany}
            selectedDivisionId={selectedDivisionId}
            onDivisionChange={setSelectedDivisionId}
            showNotes={showNotes}
            showQR={showQR}
            showPaymentPlan={showPaymentPlan}
            onToggle={handleToggle}
            hasNotes={!!invoice.notes}
            hasPaymentPlan={plans.some((p) => p.status === 'active')}
          />
        </div>
      </>

      {/* Main content */}
      <div className="flex-1 overflow-auto bg-muted/30 print:p-0 print:bg-white print:overflow-visible">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-3 bg-background border-b print:hidden flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Settings2 className="h-4 w-4 mr-1.5" />
            Options
          </Button>
          <Button variant="ghost" size="sm" onClick={() => router.push('/sales/invoices')}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back
          </Button>
          <div className="flex-1" />
          {invoice.doc_status === 'ready_to_send' && (
            <Button
              size="sm"
              disabled={sendInvoice.isPending}
              onClick={() => sendInvoice.mutate(invoice.id, {
                onSuccess: () => toast.success('Invoice marked as sent'),
                onError: () => toast.error('Failed to mark as sent'),
              })}
            >
              <Send className="h-4 w-4 mr-1.5" />
              {sendInvoice.isPending ? 'Sending…' : 'Send to Customer'}
            </Button>
          )}
          {outstanding > 0 && invoice.doc_status !== 'draft' && (
            <Button variant="outline" size="sm" onClick={() => setPayOpen(true)}>
              Pay Now
            </Button>
          )}
          {outstanding >= PAYMENT_PLAN_THRESHOLD && !hasActivePlan && (
            <Button variant="outline" size="sm" onClick={() => setPlanOpen(true)}>
              Payment Plan
            </Button>
          )}
        </div>

        {/* Document */}
        <div className="p-4 lg:p-8 print:p-0">
          <InvoiceDetailDocument
            invoice={invoice}
            payments={payments}
            company={selectedCompany}
            division={selectedDivision}
            plans={plans}
            showNotes={showNotes}
            showQR={showQR}
            showPaymentPlan={showPaymentPlan}
          />
        </div>
      </div>

      {payOpen && (
        <CustomerPaymentDialog
          open
          onOpenChange={setPayOpen}
          invoice={invoice}
          alreadyPaid={totalPaid}
          plans={plans}
        />
      )}
      {planOpen && (
        <PaymentPlanDialog
          open
          onOpenChange={setPlanOpen}
          invoiceId={invoice.id}
          outstanding={outstanding}
        />
      )}
    </div>
  )
```

- [ ] **Step 5: Verify `Printer` is removed from imports (now in sidebar)**

The page toolbar no longer has a Print button — printing is handled by the sidebar's "Print Invoice" button. Remove `Printer` from the lucide-react import line if it's no longer used in the page file.

- [ ] **Step 6: Commit**

```bash
git add src/app/(dashboard)/sales/invoices/[id]/page.tsx
git commit -m "feat(sales): rebuild invoice page with Bill-style sidebar layout"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** All four items from the design are covered — SO Activity timeline (Task 1), View Invoice button (Task 2), Invoice sidebar (Task 3+5), InvoiceDetailDocument toggles (Task 4).
- [x] **No placeholders:** All code blocks are complete and self-contained.
- [x] **Type consistency:** `InvoiceToggleKey` is exported from `InvoiceDetailSidebar.tsx` and imported in the page. `PaymentPlan` type imported in `InvoiceDetailDocument.tsx`. Props type updated before function signature update.
- [x] **`PaymentPlan` installments shape:** Task 4 Step 5 includes a note to verify the actual shape from `usePaymentPlans.ts` before committing — adapt `plan.installments` if the field name differs.
