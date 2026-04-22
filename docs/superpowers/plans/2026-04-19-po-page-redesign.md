# Purchase Orders Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fully redesign the Purchase Orders list page (stat cards, rich filters, progress-bar table) and the PO Detail Dialog (5 tabs including inline Receive, redesigned header with action buttons, timeline activity log, Create Shipment dialog).

**Architecture:** The existing `orders/page.tsx` is completely rewritten (same file path). `PoDetailDialog.tsx` is extended with a new Receive tab and header action buttons. Two new component files are added: `PoShipmentDialog.tsx` and `PoReceiveTab.tsx`. The `usePurchaseOrders` hook is extended to expose `useSubmitPO` and `useCancelPO`. A shadcn `progress` component is installed.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase, TanStack Query v5, shadcn/ui (progress, card, table, tabs, select, dialog), Tailwind CSS, Lucide icons.

**Design reference:** User spec provided 2026-04-19 (stat cards, filters bar, new table columns, 5-tab dialog).

---

## File Structure

```
src/app/(dashboard)/purchase/orders/page.tsx      ← Task 2–4: complete rewrite
src/components/purchase/PoDetailDialog.tsx         ← Task 5–6: extend with Receive tab + header
src/components/purchase/PoReceiveTab.tsx           ← Task 6: new — inline receival creation
src/components/purchase/PoShipmentDialog.tsx       ← Task 7: new — create shipment nested dialog
src/hooks/usePurchaseOrders.ts                     ← Task 1: add useSubmitPO + useCancelPO
src/components/ui/progress.tsx                     ← Task 1: install via shadcn
```

---

## Critical Facts

- `PurchaseOrder` type: has `po_line_items?: POLineItem[]` — each item has `qty` and `received_qty`
- Receival progress on list: `sum(received_qty) / sum(qty)` across `po_line_items` (only works when `po_line_items` are fetched in list query — see Task 1)
- Payment progress on list: not currently in PO query — show payment status badge from status field instead
- `useCreateReceival` takes `CreateReceivalPayload` from `src/hooks/useReceivals.ts`
- No `progress.tsx` in `src/components/ui/` — must be installed first (Task 1)
- `RfqFormDialog` render is removed from orders/page.tsx (user chose option B)
- `BillFormDialog` with `initialPoId` and three-dot row actions are preserved

---

## Task 1: Prerequisites — Install Progress + Add useSubmitPO / useCancelPO

**Files:**
- Install: `src/components/ui/progress.tsx` (via shadcn CLI)
- Modify: `src/hooks/usePurchaseOrders.ts`

- [ ] **Step 1: Install progress component**

```bash
cd D:/MMS && npx shadcn@latest add progress -y
```

Expected: `src/components/ui/progress.tsx` created.

- [ ] **Step 2: Add useSubmitPO and useCancelPO to `src/hooks/usePurchaseOrders.ts`**

Read the file, find where other mutations end (after `useCancelPO` if it exists, otherwise after the last `export function use...`), and append:

```typescript
export function useSubmitPO() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('purchase_orders')
        .update({ status: 'pending_approval' })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-order', id] })
    },
  })
}

export function useCancelPO() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('purchase_orders')
        .update({ status: 'cancelled' })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-order', id] })
    },
  })
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | head -20
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
cd D:/MMS && git add src/components/ui/progress.tsx src/hooks/usePurchaseOrders.ts && git commit -m "feat(purchase): install progress component + useSubmitPO + useCancelPO hooks"
```

---

## Task 2: Page — Header + Stat Cards

**Files:**
- Modify: `src/app/(dashboard)/purchase/orders/page.tsx`

This is a complete rewrite. Start fresh — replace the entire file with this:

- [ ] **Step 1: Replace `orders/page.tsx` with the new header + stat cards version**

```tsx
'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, FileText, Clock, Package, DollarSign, Search, X, MoreVertical } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { PoDetailDialog } from '@/components/purchase/PoDetailDialog'
import { BillFormDialog } from '@/components/purchase/BillFormDialog'
import { usePurchaseOrders, type PurchaseOrder, type POStatus } from '@/hooks/usePurchaseOrders'
import { useSuppliers } from '@/hooks/useSuppliers'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'

const STATUS_OPTIONS: { value: POStatus | ''; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'partially_received', label: 'Partially Received' },
  { value: 'received', label: 'Received' },
  { value: 'cancelled', label: 'Cancelled' },
]

const RECEIVAL_STATUS_OPTIONS = [
  { value: '', label: 'All Receival' },
  { value: 'not_received', label: 'Not Received' },
  { value: 'partial', label: 'Partial' },
  { value: 'fully_received', label: 'Fully Received' },
]

const PAYMENT_STATUS_OPTIONS = [
  { value: '', label: 'All Payment' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'partial', label: 'Partial' },
  { value: 'paid', label: 'Fully Paid' },
]

const STATUS_COLORS: Record<POStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  pending_approval: 'bg-amber-100 text-amber-700',
  approved: 'bg-blue-100 text-blue-700',
  partially_received: 'bg-purple-100 text-purple-700',
  received: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
}

function getReceivalStatus(po: PurchaseOrder): 'not_received' | 'partial' | 'fully_received' {
  const items = po.po_line_items ?? []
  if (items.length === 0) return 'not_received'
  const totalOrdered = items.reduce((s, i) => s + i.qty, 0)
  const totalReceived = items.reduce((s, i) => s + i.received_qty, 0)
  if (totalReceived === 0) return 'not_received'
  if (totalReceived >= totalOrdered) return 'fully_received'
  return 'partial'
}

function getReceivalPct(po: PurchaseOrder): number {
  const items = po.po_line_items ?? []
  const totalOrdered = items.reduce((s, i) => s + i.qty, 0)
  const totalReceived = items.reduce((s, i) => s + i.received_qty, 0)
  if (totalOrdered === 0) return 0
  return Math.min(100, Math.round((totalReceived / totalOrdered) * 100))
}

function getReceivalText(po: PurchaseOrder): string {
  const items = po.po_line_items ?? []
  const totalOrdered = items.reduce((s, i) => s + i.qty, 0)
  const totalReceived = items.reduce((s, i) => s + i.received_qty, 0)
  return `${totalReceived}/${totalOrdered}`
}

export default function PurchaseOrdersPage() {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<POStatus | ''>('')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [receivalFilter, setReceivalFilter] = useState('')
  const [paymentFilter, setPaymentFilter] = useState('')
  const [detailPO, setDetailPO] = useState<PurchaseOrder | null>(null)
  const [billPoId, setBillPoId] = useState<string | null>(null)

  const { data: orders, isLoading } = usePurchaseOrders({
    search,
    status: statusFilter,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  })
  const { data: suppliers } = useSuppliers()

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const all = orders ?? []
    return {
      total: all.length,
      pendingApproval: all.filter((o) => o.status === 'pending_approval').length,
      inReceival: all.filter((o) => ['approved', 'partially_received'].includes(o.status)).length,
      totalValue: all.reduce((s, o) => s + (o.total_qar ?? 0), 0),
    }
  }, [orders])

  // ── Client-side filtering ─────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = orders ?? []
    if (supplierFilter) result = result.filter((o) => o.supplier_id === supplierFilter)
    if (receivalFilter) result = result.filter((o) => getReceivalStatus(o) === receivalFilter)
    if (paymentFilter) {
      result = result.filter((o) => {
        const status = o.status
        if (paymentFilter === 'paid') return status === 'received'
        if (paymentFilter === 'unpaid') return ['draft', 'pending_approval', 'approved'].includes(status)
        if (paymentFilter === 'partial') return status === 'partially_received'
        return true
      })
    }
    return result
  }, [orders, supplierFilter, receivalFilter, paymentFilter])

  const hasActiveFilters = !!(search || statusFilter || supplierFilter || dateFrom || dateTo || receivalFilter || paymentFilter)

  function clearFilters() {
    setSearch(''); setStatusFilter(''); setSupplierFilter('')
    setDateFrom(''); setDateTo(''); setReceivalFilter(''); setPaymentFilter('')
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Purchase Orders</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage purchase orders, receivals & payments</p>
        </div>
        <Button onClick={() => router.push('/purchase/create-po')}>
          <Plus className="h-4 w-4 mr-2" />
          Create PO
        </Button>
      </div>

      {/* ── Stat Cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total POs</p>
                <p className="text-2xl font-bold mt-1">{stats.total}</p>
                <p className="text-xs text-muted-foreground mt-1">All time</p>
              </div>
              <div className="p-2 rounded-lg bg-blue-500/10">
                <FileText className="h-5 w-5 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Pending Approval</p>
                <p className="text-2xl font-bold mt-1">{stats.pendingApproval}</p>
                <p className="text-xs text-muted-foreground mt-1">Awaiting review</p>
              </div>
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Clock className="h-5 w-5 text-amber-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">In Receival</p>
                <p className="text-2xl font-bold mt-1">{stats.inReceival}</p>
                <p className="text-xs text-muted-foreground mt-1">Active orders</p>
              </div>
              <div className="p-2 rounded-lg bg-purple-500/10">
                <Package className="h-5 w-5 text-purple-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total Value (QAR)</p>
                <p className="text-2xl font-bold mt-1">{formatCurrency(stats.totalValue, 'QAR')}</p>
                <p className="text-xs text-muted-foreground mt-1">All POs</p>
              </div>
              <div className="p-2 rounded-lg bg-green-500/10">
                <DollarSign className="h-5 w-5 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Filters Bar ────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by PO number or supplier…"
                className="pl-9"
              />
            </div>

            {/* Status */}
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as POStatus | '')}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value || '__all__'}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Supplier */}
            <Select value={supplierFilter} onValueChange={setSupplierFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Supplier" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Suppliers</SelectItem>
                {(suppliers ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Date From */}
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-9 w-[140px] rounded-md border border-input bg-background px-3 text-sm"
              aria-label="From date"
            />
            {/* Date To */}
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-9 w-[140px] rounded-md border border-input bg-background px-3 text-sm"
              aria-label="To date"
            />

            {/* Receival Status */}
            <Select value={receivalFilter} onValueChange={setReceivalFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Receival" /></SelectTrigger>
              <SelectContent>
                {RECEIVAL_STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value || '__all__'}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Payment Status */}
            <Select value={paymentFilter} onValueChange={setPaymentFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Payment" /></SelectTrigger>
              <SelectContent>
                {PAYMENT_STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value || '__all__'}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Clear */}
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO Number</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="w-[110px]">Date</TableHead>
                <TableHead className="w-[80px] text-center hidden md:table-cell">Items</TableHead>
                <TableHead className="w-[140px] text-right">Total (QAR)</TableHead>
                <TableHead className="w-[140px] text-center">Status</TableHead>
                <TableHead className="w-[120px] text-center hidden lg:table-cell">Receival</TableHead>
                <TableHead className="w-[60px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <TableCell key={j}>
                        <div className="h-4 bg-muted animate-pulse rounded" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <FileText className="h-12 w-12" />
                      <p className="font-medium">No purchase orders found</p>
                      <Button variant="outline" size="sm" onClick={() => router.push('/purchase/create-po')}>
                        Create your first PO
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((po) => {
                  const receivalPct = getReceivalPct(po)
                  const receivalText = getReceivalText(po)
                  const lineCount = (po.po_line_items ?? []).length
                  return (
                    <TableRow
                      key={po.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setDetailPO(po)}
                    >
                      <TableCell>
                        <span className="font-medium font-mono text-sm">{po.po_number}</span>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{po.supplier_name}</span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(po.created_date)}
                      </TableCell>
                      <TableCell className="text-center hidden md:table-cell">
                        <Badge variant="secondary">{lineCount}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-mono">{formatCurrency(po.total_qar, 'QAR')}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
                          STATUS_COLORS[po.status] ?? 'bg-slate-100 text-slate-700'
                        )}>
                          {po.status.replace(/_/g, ' ')}
                        </span>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="space-y-1">
                          <Progress value={receivalPct} className="h-1.5" />
                          <p className="text-xs text-muted-foreground text-center">{receivalText}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent" aria-label="Row actions">
                            <MoreVertical className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setDetailPO(po)}>View</DropdownMenuItem>
                            {po.status === 'draft' && (
                              <DropdownMenuItem onClick={() => router.push(`/purchase/edit-po/${po.id}`)}>Edit</DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => setBillPoId(po.id)}>Create Bill</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* ── Dialogs ────────────────────────────────────────────────────────── */}
      <PoDetailDialog
        open={!!detailPO}
        onOpenChange={(open) => { if (!open) setDetailPO(null) }}
        po={detailPO}
        onEdit={(po) => router.push(`/purchase/edit-po/${po.id}`)}
        onCreateBill={(poId) => { setDetailPO(null); setBillPoId(poId) }}
      />

      {billPoId && (
        <BillFormDialog
          open={!!billPoId}
          onOpenChange={(v) => { if (!v) setBillPoId(null) }}
          initialPoId={billPoId}
        />
      )}
    </div>
  )
}
```

**IMPORTANT adaption notes:**
- `useSuppliers` — verify the exact import path and that `s.id` / `s.name` are the correct field names by reading `src/hooks/useSuppliers.ts` first.
- The `Select` component uses `__all__` sentinel for "all" options (empty string causes issues with shadcn Select). After selecting, map `__all__` back to `''` for filter logic: update `onValueChange` handlers:
  ```tsx
  onValueChange={(v) => setStatusFilter(v === '__all__' ? '' : v as POStatus)}
  ```
  Do the same for `supplierFilter`, `receivalFilter`, `paymentFilter`.

- [ ] **Step 2: TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | head -30
```

Fix any errors. Common issues:
- `useSuppliers` import path — check actual path
- `supplier.name` field — might be `supplier.contact_name` or similar

- [ ] **Step 3: Commit**

```bash
cd D:/MMS && git add "src/app/(dashboard)/purchase/orders/page.tsx" && git commit -m "feat(purchase): redesign PO list page — stat cards, rich filters, progress table"
```

---

## Task 3: PoDetailDialog — Redesigned Header + Action Buttons

**Files:**
- Modify: `src/components/purchase/PoDetailDialog.tsx`

Replace the `DialogHeader` section and add `useSubmitPO` / `useCancelPO` imports and action buttons.

- [ ] **Step 1: Add new imports to PoDetailDialog.tsx**

Add these to the existing import block (keep all existing imports):
```typescript
import { Printer, Send, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useSubmitPO, useCancelPO } from '@/hooks/usePurchaseOrders'
```

- [ ] **Step 2: Add hook calls inside the component**

Inside `PoDetailDialog`, after the existing hook calls, add:
```typescript
const submitPO = useSubmitPO()
const cancelPO = useCancelPO()
```

- [ ] **Step 3: Replace the DialogHeader**

Find the `<DialogHeader className="shrink-0">` block and replace it:

```tsx
<DialogHeader className="shrink-0 pb-3 border-b">
  <div className="flex flex-wrap items-start justify-between gap-3">
    <div>
      <div className="flex items-center gap-2">
        <DialogTitle className="font-mono text-lg">{current?.po_number}</DialogTitle>
        {current && (
          <span className={cn(
            'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
            {
              draft: 'bg-slate-100 text-slate-700',
              pending_approval: 'bg-amber-100 text-amber-700',
              approved: 'bg-blue-100 text-blue-700',
              partially_received: 'bg-purple-100 text-purple-700',
              received: 'bg-green-100 text-green-700',
              cancelled: 'bg-red-100 text-red-700',
            }[current.status] ?? 'bg-slate-100 text-slate-700'
          )}>
            {current.status.replace(/_/g, ' ')}
          </span>
        )}
      </div>
      {current && (
        <p className="text-sm text-muted-foreground mt-0.5">
          {current.supplier_name} · {current.currency} · {formatDate(current.created_date)}
        </p>
      )}
    </div>
    {current && !isLoading && (
      <div className="flex flex-wrap gap-2">
        {current.status === 'draft' && onEdit && (
          <Button variant="outline" size="sm" onClick={() => { onEdit(current); onOpenChange(false) }}>
            Edit PO
          </Button>
        )}
        {current.status === 'draft' && (
          <Button
            size="sm"
            disabled={submitPO.isPending}
            onClick={async () => {
              await submitPO.mutateAsync(current.id)
              toast.success('PO submitted for approval')
            }}
          >
            <Send className="h-3.5 w-3.5 mr-1.5" />
            Submit for Approval
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => { toast.info('Print functionality coming soon'); }}
        >
          <Printer className="h-3.5 w-3.5 mr-1.5" />
          Print
        </Button>
        {!['received', 'cancelled'].includes(current.status) && (
          <Button
            variant="destructive"
            size="sm"
            disabled={cancelPO.isPending}
            onClick={async () => {
              if (!confirm('Cancel this purchase order?')) return
              await cancelPO.mutateAsync(current.id)
              toast.success('PO cancelled')
              onOpenChange(false)
            }}
          >
            <XCircle className="h-3.5 w-3.5 mr-1.5" />
            Cancel PO
          </Button>
        )}
        {onCreateBill && (
          <Button variant="outline" size="sm" onClick={() => { onCreateBill(current.id); onOpenChange(false) }}>
            Create Bill
          </Button>
        )}
      </div>
    )}
  </div>
  {current?.po_approvals && current.po_approvals.length > 0 && (
    <PoApprovalChain steps={current.po_approvals} />
  )}
</DialogHeader>
```

- [ ] **Step 4: Remove the old footer action buttons div**

Find and delete this block (it's now in the header):
```typescript
{/* Action buttons */}
{current && !isLoading && (
  <div className="shrink-0 flex flex-wrap gap-2 pt-2 border-t">
    ...
  </div>
)}
```

- [ ] **Step 5: Add `cn` import if not already present**

Check if `cn` is already imported. If not, add:
```typescript
import { cn } from '@/lib/utils'
```

- [ ] **Step 6: TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | head -20
```

Expected: zero errors.

- [ ] **Step 7: Commit**

```bash
cd D:/MMS && git add src/components/purchase/PoDetailDialog.tsx && git commit -m "feat(purchase): PoDetailDialog — redesigned header with Submit/Print/Cancel action buttons"
```

---

## Task 4: PoDetailDialog — Activity Log Timeline

**Files:**
- Modify: `src/components/purchase/PoDetailDialog.tsx`

- [ ] **Step 1: Replace the activity tab content**

Find the `<TabsContent value="activity" ...>` block and replace it:

```tsx
<TabsContent value="activity" className="flex-1 overflow-y-auto">
  {(activityLogs ?? []).length === 0 ? (
    <p className="text-sm text-muted-foreground text-center py-4">No activity yet</p>
  ) : (
    <div className="relative pl-6 space-y-0">
      {(activityLogs ?? []).map((log, idx) => (
        <div key={log.id} className="relative pb-4">
          {/* vertical line */}
          {idx < (activityLogs ?? []).length - 1 && (
            <span className="absolute left-[-16px] top-3 bottom-0 w-px bg-border" />
          )}
          {/* dot */}
          <span className="absolute left-[-20px] top-1.5 h-3 w-3 rounded-full border-2 border-primary bg-background" />
          <div className="text-sm">
            <span className="font-medium">{log.action}</span>
            {log.performer_name && (
              <span className="text-muted-foreground"> · {log.performer_name}</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{formatRelative(log.created_at)}</p>
          {log.details && (
            <p className="text-xs text-muted-foreground mt-0.5">{log.details}</p>
          )}
        </div>
      ))}
    </div>
  )}
</TabsContent>
```

- [ ] **Step 2: TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | head -20
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
cd D:/MMS && git add src/components/purchase/PoDetailDialog.tsx && git commit -m "feat(purchase): PoDetailDialog — activity log as vertical timeline"
```

---

## Task 5: PoReceiveTab — Inline Receival Creation

**Files:**
- Create: `src/components/purchase/PoReceiveTab.tsx`
- Modify: `src/components/purchase/PoDetailDialog.tsx`

- [ ] **Step 1: Read `src/hooks/useReceivals.ts` lines 1-80 and `src/hooks/useWarehouses.ts` to verify exact `useCreateReceival` signature and `useWarehouses` field names**

(read before writing, no code change in this step)

- [ ] **Step 2: Create `src/components/purchase/PoReceiveTab.tsx`**

```tsx
'use client'

import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useWarehouses } from '@/hooks/useWarehouses'
import { useCreateReceival } from '@/hooks/useReceivals'
import type { PurchaseOrder } from '@/hooks/usePurchaseOrders'

type Props = {
  po: PurchaseOrder
}

type ReceiveRow = {
  po_line_item_id: string
  item_name: string
  sku: string | null
  ordered: number
  alreadyReceived: number
  receiveNow: number
  unitCost: number
  isFree: boolean
}

export function PoReceiveTab({ po }: Props) {
  const { data: warehouses } = useWarehouses()
  const createReceival = useCreateReceival()

  const [warehouseId, setWarehouseId] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const [rows, setRows] = useState<ReceiveRow[]>(() =>
    (po.po_line_items ?? []).map((li) => ({
      po_line_item_id: li.id,
      item_name: li.item_name,
      sku: li.sku,
      ordered: li.qty,
      alreadyReceived: li.received_qty,
      receiveNow: Math.max(0, li.qty - li.received_qty),
      unitCost: li.unit_price,
      isFree: false,
    }))
  )

  function updateRow(id: string, field: 'receiveNow' | 'unitCost' | 'isFree', value: number | boolean) {
    setRows((prev) =>
      prev.map((r) => (r.po_line_item_id === id ? { ...r, [field]: value } : r))
    )
  }

  function receiveAll() {
    setRows((prev) =>
      prev.map((r) => ({ ...r, receiveNow: Math.max(0, r.ordered - r.alreadyReceived) }))
    )
  }

  const canSubmit = !!warehouseId && rows.some((r) => r.receiveNow > 0)

  async function submit() {
    if (!canSubmit) return
    setSaving(true)
    try {
      await createReceival.mutateAsync({
        po_id: po.id,
        warehouse_id: warehouseId,
        date: new Date().toISOString().split('T')[0],
        notes,
        items: rows
          .filter((r) => r.receiveNow > 0)
          .map((r) => ({
            po_line_item_id: r.po_line_item_id,
            item_name: r.item_name,
            sku: r.sku,
            qty_received: r.receiveNow,
            unit_cost: r.unitCost,
          })),
      })
      toast.success('Receival recorded successfully')
      // Reset receive quantities
      setRows((prev) => prev.map((r) => ({ ...r, receiveNow: 0 })))
      setNotes('')
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Failed to record receival')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Warehouse + Receive All */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1 flex-1 min-w-[200px]">
          <Label>Warehouse *</Label>
          <Select value={warehouseId} onValueChange={setWarehouseId}>
            <SelectTrigger><SelectValue placeholder="Select warehouse…" /></SelectTrigger>
            <SelectContent>
              {(warehouses ?? []).map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" type="button" onClick={receiveAll}>
          Receive All Remaining
        </Button>
      </div>

      {/* Items table */}
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead className="text-right w-[80px]">Ordered</TableHead>
              <TableHead className="text-right w-[100px]">Received</TableHead>
              <TableHead className="text-right w-[120px]">Receive Now</TableHead>
              <TableHead className="text-right hidden sm:table-cell w-[100px]">Unit Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.po_line_item_id}>
                <TableCell>
                  <p className="font-medium text-sm">{row.item_name}</p>
                  {row.sku && <p className="text-xs text-muted-foreground">{row.sku}</p>}
                </TableCell>
                <TableCell className="text-right text-sm">{row.ordered}</TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">{row.alreadyReceived}</TableCell>
                <TableCell className="text-right">
                  <Input
                    type="number"
                    min={0}
                    max={row.ordered - row.alreadyReceived}
                    value={row.receiveNow}
                    onChange={(e) => updateRow(row.po_line_item_id, 'receiveNow', Number(e.target.value))}
                    className="h-7 w-20 text-right ml-auto"
                  />
                </TableCell>
                <TableCell className="text-right hidden sm:table-cell">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={row.unitCost}
                    onChange={(e) => updateRow(row.po_line_item_id, 'unitCost', Number(e.target.value))}
                    className="h-7 w-24 text-right ml-auto"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Notes + Submit */}
      <div className="space-y-1">
        <Label>Notes</Label>
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional receival notes…"
        />
      </div>
      <div className="flex justify-end">
        <Button disabled={!canSubmit || saving} onClick={submit}>
          {saving ? 'Saving…' : 'Confirm Receival'}
        </Button>
      </div>
    </div>
  )
}
```

**IMPORTANT:** Read `useWarehouses` hook to verify field names are `w.id` and `w.name`. Read `useCreateReceival` to verify the payload matches `CreateReceivalPayload`. Adapt if different.

- [ ] **Step 3: Add the Receive tab to PoDetailDialog**

Open `src/components/purchase/PoDetailDialog.tsx`.

Add import:
```typescript
import { PoReceiveTab } from './PoReceiveTab'
```

Find the `<TabsList>` and add the new trigger (only shown when PO status is approved or partially_received):
```tsx
<TabsList className="shrink-0 mx-0 overflow-x-auto">
  <TabsTrigger value="items">Line Items</TabsTrigger>
  <TabsTrigger value="receivals">
    Receivals {(receivals ?? []).length > 0 && <span className="ml-1 text-[10px]">({(receivals ?? []).length})</span>}
  </TabsTrigger>
  {current && ['approved', 'partially_received'].includes(current.status) && (
    <TabsTrigger value="receive">Receive</TabsTrigger>
  )}
  <TabsTrigger value="payments">
    Payments {(payments ?? []).length > 0 && <span className="ml-1 text-[10px]">({(payments ?? []).length})</span>}
  </TabsTrigger>
  <TabsTrigger value="activity">Activity Log</TabsTrigger>
</TabsList>
```

Add the Receive tab content after the Receivals `<TabsContent>`:
```tsx
{current && ['approved', 'partially_received'].includes(current.status) && (
  <TabsContent value="receive" className="flex-1 overflow-y-auto">
    <PoReceiveTab po={current} />
  </TabsContent>
)}
```

- [ ] **Step 4: TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | head -20
```

Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
cd D:/MMS && git add src/components/purchase/PoReceiveTab.tsx src/components/purchase/PoDetailDialog.tsx && git commit -m "feat(purchase): PoDetailDialog — inline Receive tab with warehouse selector + per-item qty input"
```

---

## Task 6: Create Shipment Dialog

**Files:**
- Create: `src/components/purchase/PoShipmentDialog.tsx`

- [ ] **Step 1: Read `src/hooks/useShipments.ts` lines 1-50 to get `useCreateShipment` payload type and import path**

(read before writing, no code change)

- [ ] **Step 2: Create `src/components/purchase/PoShipmentDialog.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useCreateShipment } from '@/hooks/useShipments'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  poId: string
}

export function PoShipmentDialog({ open, onOpenChange, poId }: Props) {
  const createShipment = useCreateShipment()

  const [mode, setMode] = useState<'air' | 'sea' | 'land' | 'manual'>('air')
  const [trackingNumber, setTrackingNumber] = useState('')
  const [carrier, setCarrier] = useState('')
  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [etd, setEtd] = useState('')
  const [eta, setEta] = useState('')
  const [saving, setSaving] = useState(false)

  function reset() {
    setMode('air'); setTrackingNumber(''); setCarrier('')
    setOrigin(''); setDestination(''); setEtd(''); setEta('')
  }

  async function submit() {
    setSaving(true)
    try {
      await createShipment.mutateAsync({
        po_id: poId,
        mode,
        tracking_number: trackingNumber || null,
        carrier: carrier || null,
        origin: origin || null,
        destination: destination || null,
        etd: etd || null,
        eta: eta || null,
      } as any)
      toast.success('Shipment created')
      reset()
      onOpenChange(false)
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Failed to create shipment')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Shipment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Mode *</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="air">Air</SelectItem>
                <SelectItem value="sea">Sea</SelectItem>
                <SelectItem value="land">Land</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Tracking Number</Label>
            <Input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} placeholder="TRK-12345" />
          </div>
          <div className="space-y-1">
            <Label>Carrier</Label>
            <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="DHL, FedEx…" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Origin</Label>
              <Input value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="Dubai" />
            </div>
            <div className="space-y-1">
              <Label>Destination</Label>
              <Input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Doha" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>ETD</Label>
              <Input type="date" value={etd} onChange={(e) => setEtd(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>ETA</Label>
              <Input type="date" value={eta} onChange={(e) => setEta(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? 'Creating…' : 'Create Shipment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

**IMPORTANT:** Read `useShipments.ts` to verify the exact `useCreateShipment` mutation and its payload fields. Adapt the `mutateAsync` call to match.

- [ ] **Step 3: TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | head -20
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
cd D:/MMS && git add src/components/purchase/PoShipmentDialog.tsx && git commit -m "feat(purchase): PoShipmentDialog — create shipment nested dialog (mode, tracking, carrier, ETD/ETA)"
```

---

## Task 7: Integration Test

**No new files.**

- [ ] **Step 1: TypeScript check**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1
```

Expected: zero errors.

- [ ] **Step 2: Unit tests**

```bash
cd D:/MMS && npx vitest run 2>&1
```

Expected: all existing tests pass.

- [ ] **Step 3: Build**

```bash
cd D:/MMS && npx next build 2>&1 | tail -20
```

Expected: build succeeds.

- [ ] **Step 4: Update PROGRESS.md**

Add to `## ✅ Completed`:
```
- [2026-04-19] **PO Page Redesign: Complete** — Stat cards (4 KPIs), rich filters bar (search/status/supplier/date/receival/payment), progress-bar table, PoDetailDialog with Submit/Cancel/Print actions + inline Receive tab + timeline activity log + PoShipmentDialog
```

Mark `PO Restructure` section as fully complete.

- [ ] **Step 5: Commit**

```bash
cd D:/MMS && git add PROGRESS.md && git commit -m "docs: update PROGRESS.md — PO Page Redesign complete"
```

---

## Self-Review

| Requirement | Task | Status |
|---|---|---|
| Header: title + subtitle + "Create PO" only (no RFQ) | 2 | ✅ |
| 4 stat cards (Total POs, Pending, In Receival, Total Value) | 2 | ✅ |
| Filters: search, status, supplier, date range, receival, payment, clear | 2 | ✅ |
| Table: clickable rows, Items badge, Receival progress bar, Status badge | 2 | ✅ |
| Three-dot row actions: View / Edit / Create Bill | 2 | ✅ |
| Empty state with illustration | 2 | ✅ |
| Dialog header: PO# + status badge + subtitle | 3 | ✅ |
| Dialog actions: Edit / Submit for Approval / Print / Cancel PO | 3 | ✅ |
| Activity Log as vertical timeline | 4 | ✅ |
| Receive tab (inline receival): warehouse + per-item qty + confirm | 5 | ✅ |
| Receive tab: only visible when approved/partially_received | 5 | ✅ |
| Receivals + Payments tabs show count badges | 5 | ✅ |
| PoShipmentDialog: mode/tracking/carrier/origin/dest/ETD/ETA | 6 | ✅ |
| useSubmitPO + useCancelPO mutations | 1 | ✅ |
| Progress component installed | 1 | ✅ |
