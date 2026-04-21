# Warehouses Hub Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the existing `/purchase/warehouses` 7-tab hub to match the full UI spec — compact density, semantic color tokens, URL-based tab state, React.memo tab isolation, dialog fetch-gating, unified Receivals & Deliveries tab — and move its nav entry from Purchase & Sales into the Master Data dropdown.

**Architecture:** Page orchestrator (`page.tsx`) owns shared data (warehouses list, badge counts, current profile) and passes them as props to React.memo-wrapped tab components. Active tab is driven by `?tab=` search param (URL state). Dialogs own their own open state internally; page header buttons trigger them via forwarded refs or trigger-child pattern. Tab 7 (`ReceivalsDeliveriesTab`) fetches purchase `receivals` and sale `deliveries` in parallel via `Promise.all` and merges client-side.

**Tech Stack:** Next.js 15 App Router, React 18 (memo, Suspense), Supabase browser client, TanStack Query v5, shadcn/ui, lucide-react, Tailwind CSS, sonner toasts, date-fns.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `src/components/layout/nav-config.ts` | Move Warehouses nav entry |
| Delete | `src/components/purchase/wh/WhReceivalsTab.tsx` | Replaced by ReceivalsDeliveriesTab |
| Modify | `src/hooks/useWarehouseOperations.ts` | Add `ReceivalDelivery` type + `useReceivalsAndDeliveries()` |
| Rewrite | `src/app/(dashboard)/purchase/warehouses/page.tsx` | Orchestrator: URL state, tab bar, shared data, dialog triggers |
| Rewrite | `src/components/purchase/wh/WhWarehousesTab.tsx` | Tab 1 — warehouse cards grid |
| Rewrite | `src/components/purchase/wh/WhStockOverviewTab.tsx` | Tab 2 — summary cards + company/warehouse views |
| Rewrite | `src/components/purchase/wh/WhTransfersTab.tsx` | Tab 3 — transfer cards + approve/reject |
| Rewrite | `src/components/purchase/wh/WhAdjustmentsTab.tsx` | Tab 4 — adjustments table + inline photo preview |
| Rewrite | `src/components/purchase/wh/WhInventoryChecksTab.tsx` | Tab 5 — checks list + detail dialog |
| Rewrite | `src/components/purchase/wh/WhMovementsTab.tsx` | Tab 6 — movements table + filters |
| Create | `src/components/purchase/wh/ReceivalsDeliveriesTab.tsx` | Tab 7 — unified inbound + outbound |
| Create | `src/components/purchase/wh/WhReceivalDetailDialog.tsx` | Modal D — read-only receival/delivery detail |
| Rewrite | `src/components/purchase/wh/WhAdjustmentDialog.tsx` | Modal A — stock adjustment + photo upload |
| Rewrite | `src/components/purchase/wh/WhInventoryCheckDialog.tsx` | Modal B — inventory check creation |
| Rewrite | `src/components/purchase/wh/WhTransferDialog.tsx` | Modal C — transfer creation + approval banner |

---

## Task 1: Navigation Change + File Cleanup

**Files:**
- Modify: `src/components/layout/nav-config.ts`
- Delete: `src/components/purchase/wh/WhReceivalsTab.tsx`

- [ ] **Step 1: Move Warehouses from Purchase & Sales to Master Data in nav-config.ts**

Open `src/components/layout/nav-config.ts`. Remove the `{ label: 'Warehouses', href: '/purchase/warehouses' }` entry from the Purchase & Sales separator group, and insert it into Master Data group 1 between `Suppliers` and `Users & Roles`:

```ts
// src/components/layout/nav-config.ts
export const NAV_ITEMS: NavEntry[] = [
  {
    label: 'Master Data',
    icon: 'Database',
    groups: [
      {
        items: [
          { label: 'Inventory Items', href: '/master-data/inventory' },
          { label: 'Suppliers', href: '/master-data/suppliers' },
          { label: 'Warehouses', href: '/purchase/warehouses' },   // ← moved here
          { label: 'Users & Roles', href: '/master-data/users' },
          { label: 'Audit Trail', href: '/master-data/audit-trail' },
          { label: 'Admin', href: '/master-data/admin' },
        ],
      },
      {
        items: [
          { label: 'Service List', href: '/master-data/services', comingSoon: true },
          { label: 'Team & Employee', href: '/master-data/teams', comingSoon: true },
          { label: 'Subscription Packages', href: '/master-data/subscriptions', comingSoon: true },
          { label: 'QuickBooks', href: '/master-data/quickbooks', comingSoon: true },
          { label: 'Notification Trail', href: '/master-data/notifications', comingSoon: true },
        ],
      },
    ],
  },
  // ... Orders, Contracts unchanged ...
  {
    label: 'Purchase & Sales',
    icon: 'ShoppingBag',
    groups: [
      {
        label: 'PURCHASE',
        items: [
          { label: 'Purchase Orders', href: '/purchase/orders' },
          { label: 'Receivals', href: '/purchase/receivals' },
          { label: 'Purchase Payments', href: '/purchase/payments' },
        ],
      },
      {
        // Warehouses removed from here
        items: [
          { label: 'Approvals', href: '/purchase/approvals' },
          { label: 'Shipments', href: '/purchase/shipments' },
          { label: 'Landed Costs', href: '/purchase/landed-costs' },
          { label: 'Dead Stock Report', href: '/purchase/dead-stock' },
        ],
      },
      {
        label: 'SALES',
        items: [
          { label: 'Sale Orders', href: '/sales/orders' },
          { label: 'Deliveries', href: '/sales/deliveries' },
          { label: 'Invoices', href: '/sales/invoices' },
          { label: 'Payments', href: '/sales/payments' },
          { label: 'Credit Notes', href: '/sales/credit-notes' },
          { label: 'Returns', href: '/sales/returns' },
        ],
      },
    ],
  },
  // ... Teams unchanged ...
]
```

- [ ] **Step 2: Delete the old purchase-only receivals tab**

```bash
rm src/components/purchase/wh/WhReceivalsTab.tsx
```

- [ ] **Step 3: Verify nav renders correctly**

Start the dev server (`npm run dev`), open the app, expand the Master Data dropdown — confirm "Warehouses" appears between Suppliers and Users & Roles. Expand Purchase & Sales — confirm Warehouses is gone from the Operations group.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/nav-config.ts
git rm src/components/purchase/wh/WhReceivalsTab.tsx
git commit -m "feat(nav): move Warehouses to Master Data dropdown, remove old receivals tab"
```

---

## Task 2: ReceivalDelivery Type + useReceivalsAndDeliveries Hook

**Files:**
- Modify: `src/hooks/useWarehouseOperations.ts`

- [ ] **Step 1: Add the ReceivalDelivery type**

At the top of `src/hooks/useWarehouseOperations.ts`, add alongside the other exported types:

```ts
export type ReceivalDelivery = {
  id: string
  direction: 'inbound' | 'outbound'
  docNumber: string
  reference: string       // po_id (inbound) | sale_order_id (outbound)
  warehouseId: string
  warehouseName: string
  counterparty: string    // supplier name (inbound) | customer name (outbound)
  date: string
  items: { name: string; sku: string; qty: number }[]
  itemCount: number
  status: string
}
```

- [ ] **Step 2: Verify the deliveries table name**

Run in Supabase SQL editor to confirm the exact table name:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name ILIKE '%deliver%';
```

Note the result — use it in Step 3 below.

- [ ] **Step 3: Append useReceivalsAndDeliveries hook**

Append at the end of `src/hooks/useWarehouseOperations.ts`. Replace `'deliveries'` with the actual table name confirmed in Step 2:

```ts
export function useReceivalsAndDeliveries() {
  return useQuery({
    queryKey: ['receivals-deliveries'],
    queryFn: async () => {
      const supabase = createClient()

      const [receivalsRes, deliveriesRes] = await Promise.all([
        (supabase as any)
          .from('receivals')
          .select('id, receival_number, po_id, warehouse_id, warehouse_name, supplier_name, date, status, items')
          .order('date', { ascending: false }),
        (supabase as any)
          .from('deliveries') // replace with actual table name from Step 2
          .select('id, delivery_number, sale_order_id, warehouse_id, warehouse_name, customer_name, date, status, items')
          .order('date', { ascending: false }),
      ])

      const inbound: ReceivalDelivery[] = (receivalsRes.data ?? []).map((r: any) => ({
        id: r.id,
        direction: 'inbound' as const,
        docNumber: r.receival_number ?? '',
        reference: r.po_id ?? '',
        warehouseId: r.warehouse_id ?? '',
        warehouseName: r.warehouse_name ?? '',
        counterparty: r.supplier_name ?? '',
        date: r.date ?? '',
        items: Array.isArray(r.items) ? r.items : [],
        itemCount: Array.isArray(r.items) ? r.items.length : 0,
        status: r.status ?? 'pending',
      }))

      const outbound: ReceivalDelivery[] = (deliveriesRes.data ?? []).map((d: any) => ({
        id: d.id,
        direction: 'outbound' as const,
        docNumber: d.delivery_number ?? '',
        reference: d.sale_order_id ?? '',
        warehouseId: d.warehouse_id ?? '',
        warehouseName: d.warehouse_name ?? '',
        counterparty: d.customer_name ?? '',
        date: d.date ?? '',
        items: Array.isArray(d.items) ? d.items : [],
        itemCount: Array.isArray(d.items) ? d.items.length : 0,
        status: d.status ?? 'pending',
      }))

      return [...inbound, ...outbound].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      )
    },
  })
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no new errors related to `useReceivalsAndDeliveries` or `ReceivalDelivery`.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useWarehouseOperations.ts
git commit -m "feat(wh): add ReceivalDelivery type + useReceivalsAndDeliveries hook"
```

---

## Task 3: Page Orchestrator — `page.tsx`

**Files:**
- Rewrite: `src/app/(dashboard)/purchase/warehouses/page.tsx`

- [ ] **Step 1: Rewrite page.tsx**

```tsx
'use client'

import { Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import {
  ClipboardList, ClipboardCheck, ArrowRightLeft,
  WarehouseIcon, Layers, Activity, Truck,
} from 'lucide-react'
import { useWarehouses } from '@/hooks/useWarehouses'
import { useWarehouseTransfers, useReceivalsAndDeliveries } from '@/hooks/useWarehouseOperations'
import { useProfiles } from '@/hooks/useProfiles'
import { WhWarehousesTab } from '@/components/purchase/wh/WhWarehousesTab'
import { WhStockOverviewTab } from '@/components/purchase/wh/WhStockOverviewTab'
import { WhTransfersTab } from '@/components/purchase/wh/WhTransfersTab'
import { WhAdjustmentsTab } from '@/components/purchase/wh/WhAdjustmentsTab'
import { WhInventoryChecksTab } from '@/components/purchase/wh/WhInventoryChecksTab'
import { WhMovementsTab } from '@/components/purchase/wh/WhMovementsTab'
import { ReceivalsDeliveriesTab } from '@/components/purchase/wh/ReceivalsDeliveriesTab'
import { WhAdjustmentDialog } from '@/components/purchase/wh/WhAdjustmentDialog'
import { WhInventoryCheckDialog } from '@/components/purchase/wh/WhInventoryCheckDialog'
import { WhTransferDialog } from '@/components/purchase/wh/WhTransferDialog'

function WarehousesPageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const activeTab = searchParams.get('tab') ?? 'warehouses'
  const setActiveTab = (val: string) =>
    router.replace(`/purchase/warehouses?tab=${val}`, { scroll: false })

  const { data: warehouses = [] } = useWarehouses()
  const { data: currentProfile } = useProfiles()
  const { data: transfers = [] } = useWarehouseTransfers()
  const { data: receivalsDeliveries = [] } = useReceivalsAndDeliveries()

  const pendingTransferCount = transfers.filter(t => t.status === 'pending_approval').length
  const pendingReceivalCount = receivalsDeliveries.filter(
    r => r.direction === 'inbound' && r.status === 'pending_approval'
  ).length

  return (
    <div className="flex flex-col h-full">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-background flex items-start justify-between gap-2 px-4 md:px-6 py-4 border-b border-border">
        <div>
          <h1 className="text-lg font-semibold">Warehouses</h1>
          <p className="text-xs text-muted-foreground">
            Stock overview, transfers, adjustments &amp; movements
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <WhAdjustmentDialog warehouses={warehouses} currentProfile={currentProfile}>
            <Button size="sm" variant="outline" className="gap-1.5">
              <ClipboardList className="h-3.5 w-3.5" />
              Stock Adjustment
            </Button>
          </WhAdjustmentDialog>
          <WhInventoryCheckDialog warehouses={warehouses}>
            <Button size="sm" variant="outline" className="gap-1.5">
              <ClipboardCheck className="h-3.5 w-3.5" />
              Inventory Check
            </Button>
          </WhInventoryCheckDialog>
          <WhTransferDialog warehouses={warehouses} currentProfile={currentProfile}>
            <Button size="sm" variant="outline" className="gap-1.5">
              <ArrowRightLeft className="h-3.5 w-3.5" />
              Transfer Stock
            </Button>
          </WhTransferDialog>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
        <TabsList className="h-8 overflow-x-auto whitespace-nowrap scrollbar-hide px-4 md:px-6 border-b rounded-none justify-start bg-background flex-shrink-0">
          <TabsTrigger value="warehouses" className="text-xs gap-1">
            <WarehouseIcon className="h-3 w-3" />
            Warehouses
          </TabsTrigger>
          <TabsTrigger value="stock" className="text-xs gap-1">
            <Layers className="h-3 w-3" />
            Stock Overview
          </TabsTrigger>
          <TabsTrigger value="transfers" className="text-xs gap-1">
            <ArrowRightLeft className="h-3 w-3" />
            Transfers
            {pendingTransferCount > 0 && (
              <span className="ml-1 h-4 px-1 text-[9px] bg-warning/20 text-warning rounded inline-flex items-center">
                {pendingTransferCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="adjustments" className="text-xs gap-1">
            <ClipboardList className="h-3 w-3" />
            Adjustments
          </TabsTrigger>
          <TabsTrigger value="checks" className="text-xs gap-1">
            <ClipboardCheck className="h-3 w-3" />
            Inv. Checks
          </TabsTrigger>
          <TabsTrigger value="movements" className="text-xs gap-1">
            <Activity className="h-3 w-3" />
            Movements
          </TabsTrigger>
          <TabsTrigger value="receivals" className="text-xs gap-1">
            <Truck className="h-3 w-3" />
            Receivals &amp; Deliveries
            {pendingReceivalCount > 0 && (
              <span className="ml-1 h-4 px-1 text-[9px] bg-warning/20 text-warning rounded inline-flex items-center">
                {pendingReceivalCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-auto">
          <TabsContent value="warehouses" className="mt-0 p-4 md:p-6">
            <WhWarehousesTab warehouses={warehouses} />
          </TabsContent>
          <TabsContent value="stock" className="mt-0">
            <WhStockOverviewTab warehouses={warehouses} />
          </TabsContent>
          <TabsContent value="transfers" className="mt-0">
            <WhTransfersTab warehouses={warehouses} currentProfile={currentProfile} />
          </TabsContent>
          <TabsContent value="adjustments" className="mt-0">
            <WhAdjustmentsTab warehouses={warehouses} currentProfile={currentProfile} />
          </TabsContent>
          <TabsContent value="checks" className="mt-0">
            <WhInventoryChecksTab warehouses={warehouses} currentProfile={currentProfile} />
          </TabsContent>
          <TabsContent value="movements" className="mt-0">
            <WhMovementsTab warehouses={warehouses} />
          </TabsContent>
          <TabsContent value="receivals" className="mt-0">
            <ReceivalsDeliveriesTab warehouses={warehouses} currentProfile={currentProfile} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}

export default function WarehousesPage() {
  return (
    <Suspense fallback={null}>
      <WarehousesPageInner />
    </Suspense>
  )
}
```

> **Note on `useProfiles`:** Check `src/hooks/useProfiles.ts` for the correct hook name and return shape for the current user's profile. It should expose `id` and `role`. Adjust the import and call accordingly if the export name differs.

- [ ] **Step 2: Verify the page renders without errors**

`npm run dev` → navigate to `/purchase/warehouses`. The tab bar should appear. Clicking tabs should update the URL to `?tab=<value>`. Refreshing should land on the same tab.

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/purchase/warehouses/page.tsx
git commit -m "feat(wh): rewrite page orchestrator — URL tab state, Suspense, shared data"
```

---

## Task 4: Tab 1 — WhWarehousesTab

**Files:**
- Rewrite: `src/components/purchase/wh/WhWarehousesTab.tsx`

- [ ] **Step 1: Rewrite the file**

```tsx
'use client'

import React from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { WarehouseIcon, MapPin, User, Package, DollarSign } from 'lucide-react'
import { Warehouse } from '@/hooks/useWarehouses'

interface Props {
  warehouses: Warehouse[]
}

export const WhWarehousesTab = React.memo(function WhWarehousesTab({ warehouses }: Props) {
  if (warehouses.length === 0) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-xs text-muted-foreground text-center">
          No warehouses configured. Add warehouses in Admin Settings.
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {warehouses.map((wh) => (
        <Card key={wh.id} className="hover:shadow-md transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <WarehouseIcon className="h-4 w-4 text-primary" />
              {wh.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 flex-shrink-0" />
              {wh.location ?? 'No location set'}
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <User className="h-3 w-3 flex-shrink-0" />
              <span className="text-muted-foreground">Manager:</span>
              <span className="font-medium">{(wh as any).manager_name ?? 'Unassigned'}</span>
            </div>
            <div className="pt-2 border-t flex justify-between items-center">
              <div className="flex items-center gap-1 text-xs">
                <Package className="h-3.5 w-3.5 text-primary" />
                {((wh as any).item_count ?? 0).toLocaleString()} items
              </div>
              <div className="flex items-center gap-1 text-xs">
                <DollarSign className="h-3.5 w-3.5 text-success" />
                QR {((wh as any).total_value ?? 0).toLocaleString()}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
})
```

> **Note:** `manager_name`, `item_count`, and `total_value` are cast via `(wh as any)` if they're not in the generated `Warehouse` type. Check `useWarehouses.ts` — if these fields are already typed, remove the casts.

- [ ] **Step 2: Verify**

Navigate to `/purchase/warehouses?tab=warehouses`. Cards should render for each warehouse with location, manager, item count, and value. Empty state shows if no warehouses exist.

- [ ] **Step 3: Commit**

```bash
git add src/components/purchase/wh/WhWarehousesTab.tsx
git commit -m "feat(wh): rewrite WhWarehousesTab — responsive card grid"
```

---

## Task 5: Tab 2 — WhStockOverviewTab

**Files:**
- Rewrite: `src/components/purchase/wh/WhStockOverviewTab.tsx`

- [ ] **Step 1: Rewrite the file**

```tsx
'use client'

import React, { useState, useMemo } from 'react'
import { Layers, Package, DollarSign, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { useWarehouseStock } from '@/hooks/useWarehouseOperations'
import { Warehouse } from '@/hooks/useWarehouses'

interface Props {
  warehouses: Warehouse[]
}

export const WhStockOverviewTab = React.memo(function WhStockOverviewTab({ warehouses }: Props) {
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'company' | 'warehouse'>('company')

  const { data: allStock = [] } = useWarehouseStock(undefined) // all warehouses

  const filtered = useMemo(() => {
    if (!search) return allStock
    const q = search.toLowerCase()
    return allStock.filter((s: any) =>
      s.item_name?.toLowerCase().includes(q) ||
      s.brand?.toLowerCase().includes(q) ||
      s.sku?.toLowerCase().includes(q)
    )
  }, [allStock, search])

  const totalItems = useMemo(() => new Set(filtered.map((s: any) => s.brand_variant_id)).size, [filtered])
  const totalQty = useMemo(() => filtered.reduce((sum: number, s: any) => sum + (s.qty ?? 0), 0), [filtered])
  const totalValue = useMemo(() => filtered.reduce((sum: number, s: any) => sum + (s.total_value ?? 0), 0), [filtered])

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: <Layers className="h-4 w-4 text-primary" />, label: 'Total Items', value: totalItems.toLocaleString() },
          { icon: <Package className="h-4 w-4 text-primary" />, label: 'Total Qty', value: totalQty.toLocaleString() },
          { icon: <DollarSign className="h-4 w-4 text-success" />, label: 'Total Value', value: `QR ${totalValue.toFixed(2)}` },
        ].map((card) => (
          <div key={card.label} className="p-3 rounded-md border flex items-center gap-2">
            {card.icon}
            <div>
              <p className="text-[10px] text-muted-foreground">{card.label}</p>
              <p className="text-sm font-semibold">{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="h-8 text-xs pl-8"
            placeholder="Search items…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={view} onValueChange={(v) => setView(v as 'company' | 'warehouse')}>
          <SelectTrigger className="w-[150px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="company" className="text-xs">Company Total</SelectItem>
            <SelectItem value="warehouse" className="text-xs">By Warehouse</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Company Total view */}
      {view === 'company' && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Category</TableHead>
                <TableHead className="text-xs">Item</TableHead>
                <TableHead className="text-xs">Brand</TableHead>
                <TableHead className="text-xs">SKU</TableHead>
                <TableHead className="text-xs text-right">Qty</TableHead>
                <TableHead className="text-xs text-right">Reserved</TableHead>
                <TableHead className="text-xs text-right">Available</TableHead>
                <TableHead className="text-xs text-right">Value (QR)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-8">
                    No stock data
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((s: any) => {
                  const available = (s.qty ?? 0) - (s.reserved_qty ?? 0)
                  return (
                    <TableRow key={s.id ?? s.brand_variant_id}>
                      <TableCell className="text-xs">{s.category ?? '—'}</TableCell>
                      <TableCell className="text-xs">{s.item_name}</TableCell>
                      <TableCell className="text-xs">{s.brand ?? '—'}</TableCell>
                      <TableCell className="text-xs text-primary">{s.sku ?? '—'}</TableCell>
                      <TableCell className="text-xs text-right font-medium">{s.qty ?? 0}</TableCell>
                      <TableCell className="text-xs text-right">
                        {(s.reserved_qty ?? 0) === 0 ? '—' : s.reserved_qty}
                      </TableCell>
                      <TableCell className={`text-xs text-right ${available < 0 ? 'text-destructive' : ''}`}>
                        {available}
                      </TableCell>
                      <TableCell className="text-xs text-right">
                        {(s.total_value ?? 0).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* By Warehouse view */}
      {view === 'warehouse' && (
        <Accordion type="multiple" className="space-y-2">
          {warehouses.map((wh) => {
            const whStock = filtered.filter((s: any) => s.warehouse_id === wh.id)
            const whQty = whStock.reduce((sum: number, s: any) => sum + (s.qty ?? 0), 0)
            const whValue = whStock.reduce((sum: number, s: any) => sum + (s.total_value ?? 0), 0)
            return (
              <AccordionItem key={wh.id} value={wh.id} className="border rounded-md px-3">
                <AccordionTrigger className="text-xs py-2 hover:no-underline">
                  <span className="font-medium">{wh.name}</span>
                  <Badge variant="outline" className="ml-2 text-[10px]">
                    {whQty} items · QR {whValue.toFixed(0)}
                  </Badge>
                </AccordionTrigger>
                <AccordionContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[10px]">Item</TableHead>
                        <TableHead className="text-[10px]">Brand</TableHead>
                        <TableHead className="text-[10px]">SKU</TableHead>
                        <TableHead className="text-[10px] text-right">Qty</TableHead>
                        <TableHead className="text-[10px] text-right">Value (QR)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {whStock.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-[10px] text-muted-foreground py-4">
                            No stock in this warehouse
                          </TableCell>
                        </TableRow>
                      ) : (
                        whStock.map((s: any) => (
                          <TableRow key={s.id ?? s.brand_variant_id}>
                            <TableCell className="text-[10px]">{s.item_name}</TableCell>
                            <TableCell className="text-[10px]">{s.brand ?? '—'}</TableCell>
                            <TableCell className="text-[10px] text-primary">{s.sku ?? '—'}</TableCell>
                            <TableCell className="text-[10px] text-right">{s.qty ?? 0}</TableCell>
                            <TableCell className="text-[10px] text-right">{(s.total_value ?? 0).toFixed(2)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </AccordionContent>
              </AccordionItem>
            )
          })}
        </Accordion>
      )}
    </div>
  )
})
```

> **Note on `useWarehouseStock`:** If the hook requires a `warehouseId` param and doesn't support `undefined` for "all warehouses", check `useWarehouseOperations.ts` — you may need to call the hook with each warehouse ID and flatten, or add an all-warehouses variant.

- [ ] **Step 2: Verify**

Navigate to `?tab=stock`. Summary cards show totals. Search filters rows. Toggle between Company Total (table) and By Warehouse (accordion). Available goes red when negative.

- [ ] **Step 3: Commit**

```bash
git add src/components/purchase/wh/WhStockOverviewTab.tsx
git commit -m "feat(wh): rewrite WhStockOverviewTab — summary cards, company/warehouse views"
```

---

## Task 6: Tab 3 — WhTransfersTab

**Files:**
- Rewrite: `src/components/purchase/wh/WhTransfersTab.tsx`

- [ ] **Step 1: Rewrite the file**

```tsx
'use client'

import React from 'react'
import { ArrowRight, CheckCircle2, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useWarehouseTransfers, useApproveTransfer, useRejectTransfer } from '@/hooks/useWarehouseOperations'
import { Warehouse } from '@/hooks/useWarehouses'
import { format } from 'date-fns'
import { toast } from 'sonner'

const STATUS_STYLES: Record<string, string> = {
  pending:          'bg-muted text-muted-foreground',
  in_transit:       'bg-primary/10 text-primary',
  pending_approval: 'bg-warning/10 text-warning',
  approved:         'bg-success/10 text-success',
  rejected:         'bg-destructive/10 text-destructive',
}

interface Props {
  warehouses: Warehouse[]
  currentProfile: any
}

export const WhTransfersTab = React.memo(function WhTransfersTab({ warehouses, currentProfile }: Props) {
  const { data: transfers = [] } = useWarehouseTransfers()
  const approve = useApproveTransfer()
  const reject = useRejectTransfer()

  const isAdmin = currentProfile?.role === 'admin'

  function canApprove(transfer: any) {
    const toWh = warehouses.find(w => w.id === transfer.to_warehouse_id)
    return isAdmin || currentProfile?.id === (toWh as any)?.manager_id
  }

  function getManagerName(transfer: any) {
    const toWh = warehouses.find(w => w.id === transfer.to_warehouse_id)
    return (toWh as any)?.manager_name ?? 'the warehouse manager'
  }

  if (transfers.length === 0) {
    return (
      <div className="p-4 md:p-6 flex items-center justify-center h-40">
        <p className="text-xs text-muted-foreground">No transfers yet.</p>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-3">
      {transfers.map((t: any) => (
        <div
          key={t.id}
          className={`rounded-lg border p-4 ${t.status === 'pending_approval' ? 'border-warning/30 bg-warning/5' : ''}`}
        >
          {/* Top row */}
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-primary">{t.transfer_number}</span>
              <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_STYLES[t.status] ?? 'bg-muted text-muted-foreground'}`}>
                {t.status.replace(/_/g, ' ')}
              </Badge>
              <span className="text-[10px] text-muted-foreground">
                {t.date ? format(new Date(t.date), 'dd MMM yyyy') : ''}
              </span>
            </div>
            {t.status === 'pending_approval' && (
              <div className="flex items-center gap-1 flex-shrink-0">
                {canApprove(t) ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[10px] gap-1 text-success border-success/30 hover:bg-success/10"
                      onClick={() => approve.mutate(t.id, { onSuccess: () => toast.success('Transfer approved') })}
                    >
                      <CheckCircle2 className="h-3 w-3" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[10px] gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                      onClick={() => reject.mutate(t.id, { onSuccess: () => toast.success('Transfer rejected') })}
                    >
                      <XCircle className="h-3 w-3" /> Reject
                    </Button>
                  </>
                ) : (
                  <Badge variant="outline" className="text-[10px]">
                    Awaiting approval from {getManagerName(t)}
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* Body */}
          <div className="text-xs mb-2 flex items-center gap-1.5 flex-wrap text-muted-foreground">
            <span className="text-foreground font-medium">{t.from_warehouse_name}</span>
            <ArrowRight className="h-3 w-3" />
            <span className="text-foreground font-medium">{t.to_warehouse_name}</span>
            <span>· by {t.created_by_name}</span>
            {t.status === 'approved' && t.approved_by_name && (
              <span className="text-[10px] text-success">• Approved by {t.approved_by_name}</span>
            )}
          </div>

          {/* Items */}
          <div className="flex flex-wrap gap-1.5">
            {(t.items ?? []).map((item: any, i: number) => (
              <Badge key={i} variant="outline" className="text-[10px]">
                {item.qty}× {item.item_name}
              </Badge>
            ))}
          </div>

          {/* Notes */}
          {t.notes && (
            <p className="text-[10px] text-muted-foreground mt-1.5">{t.notes}</p>
          )}
        </div>
      ))}
    </div>
  )
})
```

- [ ] **Step 2: Verify**

Navigate to `?tab=transfers`. Transfers render as cards. Pending-approval cards show amber highlight. Approve/Reject buttons appear for eligible users. Clicking Approve/Reject calls the mutation and shows a toast.

- [ ] **Step 3: Commit**

```bash
git add src/components/purchase/wh/WhTransfersTab.tsx
git commit -m "feat(wh): rewrite WhTransfersTab — transfer cards, approve/reject, status palette"
```

---

## Task 7: Tab 4 — WhAdjustmentsTab

**Files:**
- Rewrite: `src/components/purchase/wh/WhAdjustmentsTab.tsx`

- [ ] **Step 1: Rewrite the file**

```tsx
'use client'

import React, { useState } from 'react'
import { Eye } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useStockAdjustments } from '@/hooks/useWarehouseOperations'
import { useQueryClient } from '@tanstack/react-query'
import { Warehouse } from '@/hooks/useWarehouses'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

const TYPE_STYLES: Record<string, string> = {
  increase:  'bg-success/10 text-success',
  decrease:  'bg-warning/10 text-warning',
  damage:    'bg-destructive/10 text-destructive',
  write_off: 'bg-destructive/10 text-destructive',
}
const STATUS_STYLES: Record<string, string> = {
  pending_approval: 'bg-warning/10 text-warning',
  approved:         'bg-success/10 text-success',
  rejected:         'bg-destructive/10 text-destructive',
}

interface Props {
  warehouses: Warehouse[]
  currentProfile: any
}

export const WhAdjustmentsTab = React.memo(function WhAdjustmentsTab({ warehouses, currentProfile }: Props) {
  const { data: adjustments = [] } = useStockAdjustments()
  const queryClient = useQueryClient()
  const [photoUrls, setPhotoUrls] = useState<string[] | null>(null)

  const isAdmin = currentProfile?.role === 'admin'

  function canApprove(adj: any) {
    const wh = warehouses.find(w => w.id === adj.warehouse_id)
    return isAdmin || currentProfile?.id === (wh as any)?.manager_id
  }

  async function handleApprove(adjId: string, action: 'approve' | 'reject') {
    try {
      const supabase = createClient()
      const { error } = await (supabase as any).functions.invoke('process-stock-adjustment', {
        body: { adjustment_id: adjId, action },
      })
      if (error) throw error
      toast.success(action === 'approve' ? 'Adjustment approved' : 'Adjustment rejected')
      queryClient.invalidateQueries({ queryKey: ['stock-adjustments'] })
    } catch (e: any) {
      toast.error(e.message ?? 'Something went wrong')
    }
  }

  if (adjustments.length === 0) {
    return (
      <div className="p-4 md:p-6 flex items-center justify-center h-40">
        <p className="text-xs text-muted-foreground">No stock adjustments yet.</p>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Date</TableHead>
              <TableHead className="text-xs">Warehouse</TableHead>
              <TableHead className="text-xs">Item</TableHead>
              <TableHead className="text-xs">Type</TableHead>
              <TableHead className="text-xs text-right">Qty</TableHead>
              <TableHead className="text-xs">Reason</TableHead>
              <TableHead className="text-xs">Requested By</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs">Photos</TableHead>
              <TableHead className="text-xs text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {adjustments.map((adj: any) => (
              <TableRow key={adj.id}>
                <TableCell className="text-xs whitespace-nowrap">
                  {adj.created_at ? format(new Date(adj.created_at), 'dd MMM') : '—'}
                </TableCell>
                <TableCell className="text-xs">{adj.warehouse_name ?? '—'}</TableCell>
                <TableCell className="text-xs">
                  {adj.item_name}
                  {adj.brand && <span className="text-muted-foreground ml-1">({adj.brand})</span>}
                </TableCell>
                <TableCell>
                  <Badge className={`text-[10px] px-1.5 py-0 capitalize ${TYPE_STYLES[adj.adjustment_type] ?? ''}`}>
                    {adj.adjustment_type?.replace(/_/g, ' ')}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-right">{adj.qty}</TableCell>
                <TableCell className="text-xs max-w-[120px] truncate">{adj.reason}</TableCell>
                <TableCell className="text-xs">{adj.requested_by_name ?? '—'}</TableCell>
                <TableCell>
                  <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_STYLES[adj.status] ?? 'bg-muted text-muted-foreground'}`}>
                    {adj.status?.replace(/_/g, ' ')}
                  </Badge>
                </TableCell>
                <TableCell>
                  {(adj.photo_urls?.length ?? 0) > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1.5 gap-1 text-[10px]"
                      onClick={() => setPhotoUrls(adj.photo_urls)}
                    >
                      <Eye className="h-3 w-3" />
                      {adj.photo_urls.length}
                    </Button>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {adj.status === 'pending_approval' && canApprove(adj) ? (
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[10px] text-success border-success/30 hover:bg-success/10"
                        onClick={() => handleApprove(adj.id, 'approve')}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[10px] text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={() => handleApprove(adj.id, 'reject')}
                      >
                        Reject
                      </Button>
                    </div>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">
                      {adj.status === 'pending_approval'
                        ? 'Awaiting approval'
                        : adj.approved_by_name ?? '—'}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Photo Preview Dialog — inline */}
      <Dialog open={!!photoUrls} onOpenChange={() => setPhotoUrls(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm">Evidence Photos</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {(photoUrls ?? []).map((url, i) => (
              <img
                key={i}
                src={url}
                alt={`Evidence ${i + 1}`}
                className="aspect-square w-full object-cover rounded-md border"
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
})
```

- [ ] **Step 2: Verify**

Navigate to `?tab=adjustments`. Table renders with correct type/status badge colors. Eye button opens the photo preview dialog. Approve/Reject buttons appear only for pending items where user can approve.

- [ ] **Step 3: Commit**

```bash
git add src/components/purchase/wh/WhAdjustmentsTab.tsx
git commit -m "feat(wh): rewrite WhAdjustmentsTab — table, photo preview, approve/reject"
```

---

## Task 8: Tab 5 — WhInventoryChecksTab

**Files:**
- Rewrite: `src/components/purchase/wh/WhInventoryChecksTab.tsx`

- [ ] **Step 1: Rewrite the file**

```tsx
'use client'

import React, { useState } from 'react'
import { Clock, CheckCircle2, XCircle, ClipboardCheck, Eye } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useInventoryChecks, useInventoryCheck } from '@/hooks/useWarehouseOperations'
import { Warehouse } from '@/hooks/useWarehouses'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  draft:     { icon: <Clock className="h-4 w-4" />, color: 'text-muted-foreground', bg: 'bg-muted/20' },
  submitted: { icon: <Clock className="h-4 w-4" />, color: 'text-warning', bg: 'bg-warning/10' },
  approved:  { icon: <CheckCircle2 className="h-4 w-4" />, color: 'text-success', bg: 'bg-success/10' },
  rejected:  { icon: <XCircle className="h-4 w-4" />, color: 'text-destructive', bg: 'bg-destructive/10' },
}
const STATUS_BADGE: Record<string, string> = {
  draft:     'bg-muted text-muted-foreground',
  submitted: 'bg-warning/10 text-warning',
  approved:  'bg-success/10 text-success',
  rejected:  'bg-destructive/10 text-destructive',
}

interface Props {
  warehouses: Warehouse[]
  currentProfile: any
}

export const WhInventoryChecksTab = React.memo(function WhInventoryChecksTab({ warehouses, currentProfile }: Props) {
  const { data: checks = [] } = useInventoryChecks()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reviewNotes, setReviewNotes] = useState('')
  const [reviewing, setReviewing] = useState(false)

  const { data: checkDetail } = useInventoryCheck(selectedId ?? '', { enabled: !!selectedId })
  const isAdmin = currentProfile?.role === 'admin'

  async function handleReview(action: 'approve' | 'reject') {
    if (!selectedId) return
    setReviewing(true)
    try {
      const supabase = createClient()
      const { error } = await (supabase as any).functions.invoke('process-inventory-check', {
        body: { check_id: selectedId, action, review_notes: reviewNotes },
      })
      if (error) throw error
      toast.success(action === 'approve' ? 'Inventory check approved' : 'Inventory check rejected')
      setSelectedId(null)
      setReviewNotes('')
    } catch (e: any) {
      toast.error(e.message ?? 'Something went wrong')
    } finally {
      setReviewing(false)
    }
  }

  if (checks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2">
        <ClipboardCheck className="h-10 w-10 text-muted-foreground/30" />
        <p className="text-xs text-muted-foreground">No inventory checks yet.</p>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-2">
      {checks.map((c: any) => {
        const cfg = STATUS_CONFIG[c.status] ?? STATUS_CONFIG.draft
        const isPending = c.status === 'submitted'
        return (
          <div
            key={c.id}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer hover:bg-muted/30 transition-colors
              ${isPending ? 'border-warning/30 bg-warning/5' : ''}`}
            onClick={() => setSelectedId(c.id)}
          >
            <div className={`h-9 w-9 rounded-md flex items-center justify-center flex-shrink-0 ${cfg.bg} ${cfg.color}`}>
              {cfg.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold">{c.check_number}</span>
                <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_BADGE[c.status] ?? ''}`}>
                  {c.status}
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {c.warehouse_name} · by {c.submitted_by_name ?? 'unknown'}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-[10px] text-muted-foreground">
                {c.submitted_at ? format(new Date(c.submitted_at), 'dd MMM') : ''}
              </span>
              <Eye className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </div>
        )
      })}

      {/* Detail Dialog */}
      <Dialog open={!!selectedId} onOpenChange={() => { setSelectedId(null); setReviewNotes('') }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              {checkDetail?.check_number}
              {checkDetail?.status && (
                <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_BADGE[checkDetail.status] ?? ''}`}>
                  {checkDetail.status}
                </Badge>
              )}
              <span className="text-xs font-normal text-muted-foreground">{checkDetail?.warehouse_name}</span>
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="flex-1 min-h-0">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Item</TableHead>
                    <TableHead className="text-xs">Brand</TableHead>
                    <TableHead className="text-xs">SKU</TableHead>
                    <TableHead className="text-xs text-right">System</TableHead>
                    <TableHead className="text-xs text-right">Counted</TableHead>
                    <TableHead className="text-xs text-right">Variance</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(checkDetail?.items ?? []).map((item: any) => {
                    const variance = item.variance ?? 0
                    const isCounted = item.is_counted
                    const rowBg = !isCounted ? 'bg-muted/30' : variance === 0 ? 'bg-success/5' : 'bg-warning/5'
                    return (
                      <TableRow key={item.id} className={rowBg}>
                        <TableCell className="text-xs">{item.item_name}</TableCell>
                        <TableCell className="text-xs">{item.brand ?? '—'}</TableCell>
                        <TableCell className="text-xs text-primary">{item.sku ?? '—'}</TableCell>
                        <TableCell className="text-xs text-right">{item.system_qty}</TableCell>
                        <TableCell className="text-xs text-right">{item.counted_qty ?? '—'}</TableCell>
                        <TableCell className="text-xs text-right">
                          {isCounted ? (
                            <span className={variance > 0 ? 'text-success' : variance < 0 ? 'text-destructive' : ''}>
                              {variance > 0 ? `+${variance}` : variance}
                            </span>
                          ) : '—'}
                        </TableCell>
                        <TableCell>
                          {!isCounted ? (
                            <Badge variant="outline" className="text-[10px]">Not counted</Badge>
                          ) : variance === 0 ? (
                            <Badge className="text-[10px] bg-success/10 text-success">Match</Badge>
                          ) : (
                            <Badge className="text-[10px] bg-warning/10 text-warning">Variance</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            {checkDetail?.notes && (
              <div className="mt-3 p-3 rounded-md bg-muted/30 text-xs text-muted-foreground">
                {checkDetail.notes}
              </div>
            )}

            {/* Reviewer panel */}
            {checkDetail?.status === 'submitted' && isAdmin && (
              <div className="mt-3 space-y-2">
                <Textarea
                  placeholder="Review notes (optional)…"
                  className="text-xs min-h-[60px]"
                  value={reviewNotes}
                  onChange={e => setReviewNotes(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                    disabled={reviewing}
                    onClick={() => handleReview('reject')}
                  >
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    className="text-xs bg-success text-success-foreground hover:bg-success/90"
                    disabled={reviewing}
                    onClick={() => handleReview('approve')}
                  >
                    Approve &amp; Adjust
                  </Button>
                </div>
              </div>
            )}

            {/* Footer audit */}
            {(checkDetail?.status === 'approved' || checkDetail?.status === 'rejected') && (
              <p className="mt-3 text-[10px] text-muted-foreground">
                {checkDetail.status === 'approved' ? 'Approved' : 'Rejected'} by {checkDetail.reviewed_by_name}
                {checkDetail.reviewed_at ? ` on ${format(new Date(checkDetail.reviewed_at), 'dd MMM yyyy')}` : ''}
                {checkDetail.review_notes ? ` — ${checkDetail.review_notes}` : ''}
              </p>
            )}
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setSelectedId(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
})
```

- [ ] **Step 2: Verify**

Navigate to `?tab=checks`. Check rows render with correct status icon/color. Clicking a row opens the detail dialog. Items table shows variance colors. Admin sees reviewer panel on submitted checks.

- [ ] **Step 3: Commit**

```bash
git add src/components/purchase/wh/WhInventoryChecksTab.tsx
git commit -m "feat(wh): rewrite WhInventoryChecksTab — check list, detail dialog, reviewer panel"
```

---

## Task 9: Tab 6 — WhMovementsTab

**Files:**
- Rewrite: `src/components/purchase/wh/WhMovementsTab.tsx`

- [ ] **Step 1: Rewrite the file**

```tsx
'use client'

import React, { useState, useMemo } from 'react'
import { Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useStockMovements } from '@/hooks/useWarehouseOperations'
import { Warehouse } from '@/hooks/useWarehouses'
import { format } from 'date-fns'

const MOVEMENT_STYLES: Record<string, string> = {
  purchase:       'bg-success/10 text-success',
  order_usage:    'bg-destructive/10 text-destructive',
  adjustment_in:  'bg-primary/10 text-primary',
  adjustment_out: 'bg-warning/10 text-warning',
  transfer_in:    'bg-accent/10 text-accent-foreground',
  transfer_out:   'bg-secondary text-secondary-foreground',
  damage:         'bg-destructive/10 text-destructive',
}

const MOVEMENT_TYPES = ['purchase', 'order_usage', 'adjustment_in', 'adjustment_out', 'transfer_in', 'transfer_out', 'damage']

interface Props {
  warehouses: Warehouse[]
}

export const WhMovementsTab = React.memo(function WhMovementsTab({ warehouses }: Props) {
  const [search, setSearch] = useState('')
  const [warehouseFilter, setWarehouseFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')

  const { data: movements = [] } = useStockMovements()

  const filtered = useMemo(() => {
    return movements.filter((m: any) => {
      const q = search.toLowerCase()
      const matchSearch = !q ||
        m.item_name?.toLowerCase().includes(q) ||
        m.brand?.toLowerCase().includes(q) ||
        m.sku?.toLowerCase().includes(q)
      const matchWh = warehouseFilter === 'all' || m.warehouse_id === warehouseFilter
      const matchType = typeFilter === 'all' || m.movement_type === typeFilter
      return matchSearch && matchWh && matchType
    })
  }, [movements, search, warehouseFilter, typeFilter])

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="h-8 text-xs pl-8"
            placeholder="Search item / brand / SKU…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue placeholder="All Warehouses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All Warehouses</SelectItem>
            {warehouses.map(wh => (
              <SelectItem key={wh.id} value={wh.id} className="text-xs">{wh.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All Types</SelectItem>
            {MOVEMENT_TYPES.map(t => (
              <SelectItem key={t} value={t} className="text-xs capitalize">{t.replace(/_/g, ' ')}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Date</TableHead>
              <TableHead className="text-xs">Item</TableHead>
              <TableHead className="text-xs">Brand</TableHead>
              <TableHead className="text-xs">SKU</TableHead>
              <TableHead className="text-xs">Type</TableHead>
              <TableHead className="text-xs text-right">Qty</TableHead>
              <TableHead className="text-xs text-right">Unit Cost</TableHead>
              <TableHead className="text-xs text-right">Total</TableHead>
              <TableHead className="text-xs">Warehouse</TableHead>
              <TableHead className="text-xs">Ref</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-xs text-muted-foreground py-8">
                  No movements found
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((m: any) => (
                <TableRow key={m.id}>
                  <TableCell className="text-xs whitespace-nowrap">
                    {m.created_at ? format(new Date(m.created_at), 'dd MMM yy') : '—'}
                  </TableCell>
                  <TableCell className="text-xs">{m.item_name}</TableCell>
                  <TableCell className="text-xs">{m.brand ?? '—'}</TableCell>
                  <TableCell className="text-xs text-primary">{m.sku ?? '—'}</TableCell>
                  <TableCell>
                    <Badge className={`text-[10px] px-1.5 py-0 capitalize ${MOVEMENT_STYLES[m.movement_type] ?? 'bg-muted text-muted-foreground'}`}>
                      {m.movement_type?.replace(/_/g, ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-right">{m.qty}</TableCell>
                  <TableCell className="text-xs text-right">{m.unit_cost?.toFixed(2) ?? '—'}</TableCell>
                  <TableCell className="text-xs text-right">
                    {m.unit_cost != null && m.qty != null ? (m.unit_cost * m.qty).toFixed(2) : '—'}
                  </TableCell>
                  <TableCell className="text-xs">{m.warehouse_name ?? '—'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground truncate max-w-[80px]">
                    {m.reference_type ?? '—'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
})
```

- [ ] **Step 2: Verify**

Navigate to `?tab=movements`. Table renders movements with type badges. Search, warehouse filter, and type filter all narrow the results correctly.

- [ ] **Step 3: Commit**

```bash
git add src/components/purchase/wh/WhMovementsTab.tsx
git commit -m "feat(wh): rewrite WhMovementsTab — movements table, search + type + warehouse filters"
```

---

## Task 10: Tab 7 — ReceivalsDeliveriesTab + WhReceivalDetailDialog

**Files:**
- Create: `src/components/purchase/wh/ReceivalsDeliveriesTab.tsx`
- Create: `src/components/purchase/wh/WhReceivalDetailDialog.tsx`

- [ ] **Step 1: Create WhReceivalDetailDialog.tsx**

```tsx
'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Package, Truck } from 'lucide-react'
import { ReceivalDelivery } from '@/hooks/useWarehouseOperations'
import { format } from 'date-fns'

interface Props {
  item: ReceivalDelivery | null
  onClose: () => void
}

export function WhReceivalDetailDialog({ item, onClose }: Props) {
  if (!item) return null
  const isInbound = item.direction === 'inbound'

  return (
    <Dialog open={!!item} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2">
            {item.docNumber}
            <Badge className={`text-[10px] px-1.5 py-0 flex items-center gap-1 ${isInbound ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'}`}>
              {isInbound ? <Package className="h-2.5 w-2.5" /> : <Truck className="h-2.5 w-2.5" />}
              {isInbound ? 'Receival' : 'Delivery'}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Info grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <div>
            <p className="text-muted-foreground">Reference</p>
            <p className="font-medium">{item.reference || '—'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Warehouse</p>
            <p className="font-medium">{item.warehouseName || '—'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Date</p>
            <p className="font-medium">{item.date ? format(new Date(item.date), 'dd MMM yyyy') : '—'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{isInbound ? 'Supplier' : 'Customer'}</p>
            <p className="font-medium">{item.counterparty || '—'}</p>
          </div>
        </div>

        {/* Items table */}
        <div className="rounded-md border mt-2">
          <Table>
            <TableHeader>
              <TableRow>
                {isInbound ? (
                  <>
                    <TableHead className="text-xs">Item</TableHead>
                    <TableHead className="text-xs">SKU</TableHead>
                    <TableHead className="text-xs text-right">Qty</TableHead>
                  </>
                ) : (
                  <>
                    <TableHead className="text-xs">Line Item</TableHead>
                    <TableHead className="text-xs text-right">Qty</TableHead>
                  </>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {item.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-xs text-muted-foreground py-4">
                    No items
                  </TableCell>
                </TableRow>
              ) : (
                item.items.map((i, idx) => (
                  <TableRow key={idx}>
                    {isInbound ? (
                      <>
                        <TableCell className="text-xs">{i.name}</TableCell>
                        <TableCell className="text-xs text-primary">{i.sku || '—'}</TableCell>
                        <TableCell className="text-xs text-right">{i.qty}</TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell className="text-xs font-mono text-muted-foreground">
                          {String(i.name || '').slice(0, 8)}…
                        </TableCell>
                        <TableCell className="text-xs text-right">{i.qty}</TableCell>
                      </>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" className="text-xs" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Create ReceivalsDeliveriesTab.tsx**

```tsx
'use client'

import React, { useState, useMemo } from 'react'
import { Search, Package, Truck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useReceivalsAndDeliveries, ReceivalDelivery } from '@/hooks/useWarehouseOperations'
import { WhReceivalDetailDialog } from './WhReceivalDetailDialog'
import { Warehouse } from '@/hooks/useWarehouses'
import { format } from 'date-fns'

const STATUS_STYLE: Record<string, string> = {
  approved:         'bg-success/10 text-success',
  delivered:        'bg-success/10 text-success',
  pending:          'bg-warning/10 text-warning',
  pending_approval: 'bg-warning/10 text-warning',
  dispatched:       'bg-primary/10 text-primary',
}

interface Props {
  warehouses: Warehouse[]
  currentProfile: any
}

export const ReceivalsDeliveriesTab = React.memo(function ReceivalsDeliveriesTab({ warehouses }: Props) {
  const { data: allItems = [] } = useReceivalsAndDeliveries()
  const [search, setSearch] = useState('')
  const [direction, setDirection] = useState<'all' | 'inbound' | 'outbound'>('all')
  const [warehouseFilter, setWarehouseFilter] = useState('all')
  const [selected, setSelected] = useState<ReceivalDelivery | null>(null)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return allItems.filter((item) => {
      const matchSearch = !q ||
        item.docNumber.toLowerCase().includes(q) ||
        item.reference.toLowerCase().includes(q) ||
        item.counterparty.toLowerCase().includes(q)
      const matchDirection = direction === 'all' || item.direction === direction
      const matchWh = warehouseFilter === 'all' || item.warehouseId === warehouseFilter
      return matchSearch && matchDirection && matchWh
    })
  }, [allItems, search, direction, warehouseFilter])

  const inboundCount = allItems.filter(i => i.direction === 'inbound').length
  const outboundCount = allItems.filter(i => i.direction === 'outbound').length

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="h-8 text-xs pl-8"
            placeholder="Search doc# / ref / party…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={direction} onValueChange={(v) => setDirection(v as any)}>
          <SelectTrigger className="w-[150px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All ({allItems.length})</SelectItem>
            <SelectItem value="inbound" className="text-xs">Inbound ({inboundCount})</SelectItem>
            <SelectItem value="outbound" className="text-xs">Outbound ({outboundCount})</SelectItem>
          </SelectContent>
        </Select>
        <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue placeholder="All Warehouses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All Warehouses</SelectItem>
            {warehouses.map(wh => (
              <SelectItem key={wh.id} value={wh.id} className="text-xs">{wh.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Direction</TableHead>
              <TableHead className="text-xs">Doc #</TableHead>
              <TableHead className="text-xs">Reference</TableHead>
              <TableHead className="text-xs">Warehouse</TableHead>
              <TableHead className="text-xs">Counterparty</TableHead>
              <TableHead className="text-xs">Date</TableHead>
              <TableHead className="text-xs text-right">Items</TableHead>
              <TableHead className="text-xs">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-8">
                  No receivals or deliveries found
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((item) => (
                <TableRow
                  key={`${item.direction}-${item.id}`}
                  className="cursor-pointer hover:bg-muted/30"
                  onClick={() => setSelected(item)}
                >
                  <TableCell>
                    <Badge className={`text-[10px] px-1.5 py-0 flex items-center gap-1 w-fit ${item.direction === 'inbound' ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'}`}>
                      {item.direction === 'inbound'
                        ? <><Package className="h-2.5 w-2.5" /> Receival</>
                        : <><Truck className="h-2.5 w-2.5" /> Delivery</>}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs font-medium">{item.docNumber}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{item.reference || '—'}</TableCell>
                  <TableCell className="text-xs">{item.warehouseName}</TableCell>
                  <TableCell className="text-xs">{item.counterparty}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {item.date ? format(new Date(item.date), 'dd MMM yyyy') : '—'}
                  </TableCell>
                  <TableCell className="text-xs text-right">{item.itemCount}</TableCell>
                  <TableCell>
                    <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_STYLE[item.status] ?? 'bg-muted text-muted-foreground'}`}>
                      {item.status.replace(/_/g, ' ')}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <WhReceivalDetailDialog item={selected} onClose={() => setSelected(null)} />
    </div>
  )
})
```

- [ ] **Step 3: Verify**

Navigate to `?tab=receivals`. Both inbound and outbound rows appear. Direction badges are green (Receival) / blue (Delivery). Direction and warehouse filters work. Clicking a row opens the detail dialog with the correct items table (3-col for inbound, 2-col for outbound).

- [ ] **Step 4: Commit**

```bash
git add src/components/purchase/wh/ReceivalsDeliveriesTab.tsx src/components/purchase/wh/WhReceivalDetailDialog.tsx
git commit -m "feat(wh): create ReceivalsDeliveriesTab + WhReceivalDetailDialog — unified inbound/outbound"
```

---

## Task 11: Modal A — WhAdjustmentDialog

**Files:**
- Rewrite: `src/components/purchase/wh/WhAdjustmentDialog.tsx`

- [ ] **Step 1: Rewrite the file**

```tsx
'use client'

import { useState, useRef } from 'react'
import { Camera, X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Warehouse } from '@/hooks/useWarehouses'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { audit } from '@/lib/audit'

// InventoryItemLookup — import from wherever it lives in your codebase
// e.g. import { InventoryItemLookup } from '@/components/shared/InventoryItemLookup'
// If it doesn't exist yet, use a plain Select over brand_variants for now

const ADJUSTMENT_TYPES = [
  { value: 'increase', label: 'Increase (Found/Returned)' },
  { value: 'decrease', label: 'Decrease (Lost/Consumed)' },
  { value: 'damage',   label: 'Damage' },
  { value: 'write_off', label: 'Write Off' },
]

interface Props {
  warehouses: Warehouse[]
  currentProfile: any
  children: React.ReactNode  // trigger button
}

export function WhAdjustmentDialog({ warehouses, currentProfile, children }: Props) {
  const [open, setOpen] = useState(false)
  const [warehouseId, setWarehouseId] = useState('')
  const [selectedItem, setSelectedItem] = useState<{ id: string; name: string; brand?: string } | null>(null)
  const [type, setType] = useState('')
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const canSubmit = !!warehouseId && !!selectedItem && !!type && !!qty && !!reason

  function handleClose() {
    setOpen(false)
    setWarehouseId(''); setSelectedItem(null); setType(''); setQty(''); setReason(''); setNotes('')
    setPhotos([]); setPreviews([])
  }

  function addPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (photos.length + files.length > 5) {
      toast.error('Maximum 5 photos allowed')
      return
    }
    const newFiles = [...photos, ...files].slice(0, 5)
    setPhotos(newFiles)
    setPreviews(newFiles.map(f => URL.createObjectURL(f)))
    e.target.value = ''
  }

  function removePhoto(idx: number) {
    const updated = photos.filter((_, i) => i !== idx)
    setPhotos(updated)
    setPreviews(updated.map(f => URL.createObjectURL(f)))
  }

  async function handleSubmit() {
    if (!canSubmit || !currentProfile) return
    setSubmitting(true)
    try {
      const supabase = createClient()

      // Upload photos
      const photoUrls: string[] = []
      for (const file of photos) {
        const ext = file.name.split('.').pop()
        const path = `${currentProfile.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error: uploadErr } = await supabase.storage
          .from('adjustment-photos')
          .upload(path, file)
        if (uploadErr) throw uploadErr
        const { data: signed } = await supabase.storage
          .from('adjustment-photos')
          .createSignedUrl(path, 60 * 60 * 24 * 365)
        if (signed?.signedUrl) photoUrls.push(signed.signedUrl)
      }

      // Insert adjustment
      const { error } = await (supabase as any).from('stock_adjustments').insert({
        warehouse_id: warehouseId,
        brand_variant_id: selectedItem!.id,
        item_name: selectedItem!.name,
        brand: selectedItem!.brand ?? null,
        adjustment_type: type,
        qty: parseFloat(qty),
        reason,
        notes: notes || null,
        photo_urls: photoUrls,
        status: 'pending_approval',
        requested_by_name: currentProfile.full_name ?? currentProfile.email,
      })
      if (error) throw error

      await audit('purchase', 'stock_adjustment_created', { warehouse_id: warehouseId, type, qty })
      toast.success('Adjustment submitted for approval')
      handleClose()
    } catch (e: any) {
      toast.error(e.message ?? 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <span onClick={() => setOpen(true)}>{children}</span>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm">Stock Adjustment</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Warehouse */}
            <div className="space-y-1.5">
              <Label className="text-xs">Warehouse *</Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select warehouse…" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map(wh => (
                    <SelectItem key={wh.id} value={wh.id} className="text-xs">{wh.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Item lookup — replace with InventoryItemLookup component if available */}
            <div className="space-y-1.5">
              <Label className="text-xs">Item *</Label>
              <Input
                className="h-8 text-xs"
                placeholder="Search and select item…"
                value={selectedItem?.name ?? ''}
                readOnly
                onClick={() => {/* open item lookup */}}
              />
              {/* TODO: integrate <InventoryItemLookup onSelect={setSelectedItem} /> */}
            </div>

            {/* Type + Qty */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Type *</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select type…" />
                  </SelectTrigger>
                  <SelectContent>
                    {ADJUSTMENT_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Quantity *</Label>
                <Input
                  type="number"
                  className="h-8 text-xs"
                  min="0"
                  step="0.01"
                  value={qty}
                  onChange={e => setQty(e.target.value)}
                />
              </div>
            </div>

            {/* Reason */}
            <div className="space-y-1.5">
              <Label className="text-xs">Reason *</Label>
              <Input
                className="h-8 text-xs"
                placeholder="Reason for adjustment…"
                value={reason}
                onChange={e => setReason(e.target.value)}
              />
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea
                className="text-xs min-h-[60px]"
                placeholder="Optional notes…"
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>

            {/* Photos */}
            <div className="space-y-1.5">
              <Label className="text-xs">Evidence Photos (max 5)</Label>
              <div className="flex flex-wrap gap-2">
                {previews.map((url, idx) => (
                  <div key={idx} className="relative h-16 w-16">
                    <img src={url} className="h-16 w-16 object-cover rounded-md border" alt="" />
                    <button
                      className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                      onClick={() => removePhoto(idx)}
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
                {photos.length < 5 && (
                  <button
                    className="h-16 w-16 rounded-md border-2 border-dashed border-border flex items-center justify-center hover:border-primary transition-colors"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Camera className="h-4 w-4 text-muted-foreground" />
                  </button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={addPhoto} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs" onClick={handleClose}>Cancel</Button>
            <Button size="sm" className="text-xs" disabled={!canSubmit || submitting} onClick={handleSubmit}>
              {submitting ? 'Submitting…' : 'Submit for Approval'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
```

- [ ] **Step 2: Wire up InventoryItemLookup**

Search the codebase for an existing item lookup component:

```bash
grep -r "InventoryItemLookup\|ItemLookup\|item_lookup" src/ --include="*.tsx" -l
```

If found, import it and replace the placeholder `<Input readOnly>` with it. If not found, use a `<Select>` that calls `supabase.from('inventory_brand_variants').select(...)` — this is a functional fallback until the lookup component exists.

- [ ] **Step 3: Verify**

Click the "Stock Adjustment" header button. Dialog opens. Fill all required fields — Submit button becomes enabled. Submitting creates a `stock_adjustments` row with `status: 'pending_approval'` and shows a toast.

- [ ] **Step 4: Commit**

```bash
git add src/components/purchase/wh/WhAdjustmentDialog.tsx
git commit -m "feat(wh): rewrite WhAdjustmentDialog — photo upload, adjustment submission"
```

---

## Task 12: Modal B — WhInventoryCheckDialog

**Files:**
- Rewrite: `src/components/purchase/wh/WhInventoryCheckDialog.tsx`

- [ ] **Step 1: Rewrite the file**

```tsx
'use client'

import { useState, useMemo } from 'react'
import { ClipboardCheck, Search } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Warehouse } from '@/hooks/useWarehouses'
import { useWarehouseStock, useCreateInventoryCheck } from '@/hooks/useWarehouseOperations'
import { toast } from 'sonner'
import { audit } from '@/lib/audit'
import { format } from 'date-fns'

interface Props {
  warehouses: Warehouse[]
  children: React.ReactNode
}

export function WhInventoryCheckDialog({ warehouses, children }: Props) {
  const [open, setOpen] = useState(false)
  const [warehouseId, setWarehouseId] = useState('')
  const [search, setSearch] = useState('')
  const [counts, setCounts] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const { data: stock = [] } = useWarehouseStock(warehouseId, { enabled: !!warehouseId && open })
  const createCheck = useCreateInventoryCheck()

  const filtered = useMemo(() => {
    if (!search) return stock
    const q = search.toLowerCase()
    return stock.filter((s: any) =>
      s.item_name?.toLowerCase().includes(q) ||
      s.brand?.toLowerCase().includes(q) ||
      s.sku?.toLowerCase().includes(q)
    )
  }, [stock, search])

  const countedItems = useMemo(() =>
    Object.values(counts).filter(v => v !== '').length
  , [counts])

  const varianceCount = useMemo(() =>
    stock.filter((s: any) => {
      const counted = counts[s.brand_variant_id]
      if (counted === '' || counted === undefined) return false
      return parseFloat(counted) !== (s.qty ?? 0)
    }).length
  , [stock, counts])

  function handleClose() {
    setOpen(false)
    setWarehouseId(''); setSearch(''); setCounts({}); setNotes('')
  }

  async function handleSubmit() {
    if (!warehouseId) return
    setSubmitting(true)
    try {
      const year = new Date().getFullYear()
      const seq = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0')
      const checkNumber = `IC-${year}-${seq}`
      const wh = warehouses.find(w => w.id === warehouseId)

      const items = stock.map((s: any) => ({
        brand_variant_id: s.brand_variant_id,
        item_name: s.item_name,
        brand: s.brand ?? null,
        sku: s.sku ?? null,
        system_qty: s.qty ?? 0,
        counted_qty: counts[s.brand_variant_id] !== undefined && counts[s.brand_variant_id] !== ''
          ? parseFloat(counts[s.brand_variant_id])
          : null,
        is_counted: counts[s.brand_variant_id] !== undefined && counts[s.brand_variant_id] !== '',
      }))

      await createCheck.mutateAsync({
        check_number: checkNumber,
        warehouse_id: warehouseId,
        warehouse_name: wh?.name ?? '',
        status: 'submitted',
        notes: notes || null,
        items,
      })

      await audit('purchase', 'inventory_check_submitted', { warehouse_id: warehouseId, check_number: checkNumber })
      toast.success(`Inventory check ${checkNumber} submitted for approval`)
      handleClose()
    } catch (e: any) {
      toast.error(e.message ?? 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <span onClick={() => setOpen(true)}>{children}</span>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" />
              Inventory Check
            </DialogTitle>
          </DialogHeader>

          {/* Top controls */}
          <div className="flex flex-wrap items-center gap-3 flex-shrink-0">
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger className="w-[200px] h-8 text-xs">
                <SelectValue placeholder="Select warehouse…" />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map(wh => (
                  <SelectItem key={wh.id} value={wh.id} className="text-xs">{wh.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {warehouseId && (
              <div className="relative max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className="h-8 text-xs pl-8"
                  placeholder="Search items…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            )}
            {stock.length > 0 && (
              <>
                <Badge variant="outline" className="text-[10px]">
                  {countedItems}/{stock.length} counted
                </Badge>
                {varianceCount > 0 && (
                  <Badge className="text-[10px] bg-warning/10 text-warning">
                    {varianceCount} variances
                  </Badge>
                )}
              </>
            )}
          </div>

          {/* Items table */}
          <ScrollArea className="flex-1 min-h-0">
            {warehouseId && (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Item</TableHead>
                      <TableHead className="text-xs">Brand</TableHead>
                      <TableHead className="text-xs">SKU</TableHead>
                      <TableHead className="text-xs text-right">System Qty</TableHead>
                      <TableHead className="text-xs text-right">Counted</TableHead>
                      <TableHead className="text-xs text-right">Variance</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-8">
                          {stock.length === 0 ? 'No stock in this warehouse' : 'No items match search'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filtered.map((s: any) => {
                        const countedStr = counts[s.brand_variant_id]
                        const isCounted = countedStr !== undefined && countedStr !== ''
                        const counted = isCounted ? parseFloat(countedStr) : null
                        const variance = counted !== null ? counted - (s.qty ?? 0) : null
                        const rowBg = !isCounted ? 'bg-muted/30' : variance === 0 ? 'bg-success/5' : 'bg-warning/5'
                        return (
                          <TableRow key={s.brand_variant_id} className={rowBg}>
                            <TableCell className="text-xs">{s.item_name}</TableCell>
                            <TableCell className="text-xs">{s.brand ?? '—'}</TableCell>
                            <TableCell className="text-xs text-primary">{s.sku ?? '—'}</TableCell>
                            <TableCell className="text-xs text-right">{s.qty ?? 0}</TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                className="w-20 h-7 text-xs text-right"
                                min="0"
                                step="0.01"
                                value={counts[s.brand_variant_id] ?? ''}
                                onChange={e => setCounts(prev => ({ ...prev, [s.brand_variant_id]: e.target.value }))}
                              />
                            </TableCell>
                            <TableCell className="text-xs text-right">
                              {variance !== null ? (
                                <span className={variance > 0 ? 'text-success' : variance < 0 ? 'text-destructive' : ''}>
                                  {variance > 0 ? `+${variance}` : variance}
                                </span>
                              ) : '—'}
                            </TableCell>
                            <TableCell>
                              {!isCounted ? (
                                <Badge variant="outline" className="text-[10px]">Not counted</Badge>
                              ) : variance === 0 ? (
                                <Badge className="text-[10px] bg-success/10 text-success">Match</Badge>
                              ) : (
                                <Badge className="text-[10px] bg-warning/10 text-warning">Variance</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </ScrollArea>

          {/* Notes */}
          <div className="space-y-1.5 flex-shrink-0">
            <Label className="text-xs">Notes</Label>
            <Textarea
              className="text-xs min-h-[60px]"
              placeholder="Optional notes…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs" onClick={handleClose}>Cancel</Button>
            <Button size="sm" className="text-xs" disabled={!warehouseId || submitting} onClick={handleSubmit}>
              {submitting ? 'Submitting…' : 'Submit for Approval'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
```

> **Note on `useCreateInventoryCheck`:** Check `useWarehouseOperations.ts` — if the mutation signature differs, adjust the `mutateAsync` call accordingly. The mutation should insert into `inventory_checks` and `inventory_check_items` in a single operation or two sequential inserts.

- [ ] **Step 2: Verify**

Click "Inventory Check" header button. Select a warehouse — stock items load. Entering a count value shows variance. Badge counters update. Submitting creates an `inventory_checks` row and shows a success toast.

- [ ] **Step 3: Commit**

```bash
git add src/components/purchase/wh/WhInventoryCheckDialog.tsx
git commit -m "feat(wh): rewrite WhInventoryCheckDialog — live variance tracking, submit"
```

---

## Task 13: Modal C — WhTransferDialog

**Files:**
- Rewrite: `src/components/purchase/wh/WhTransferDialog.tsx`

- [ ] **Step 1: Rewrite the file**

```tsx
'use client'

import { useState } from 'react'
import { ArrowRightLeft, Bell, Plus, X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Warehouse } from '@/hooks/useWarehouses'
import { useCreateTransfer } from '@/hooks/useWarehouseOperations'
import { toast } from 'sonner'
import { audit } from '@/lib/audit'

const UNITS = ['Piece', 'kg', 'Liter', 'm²', 'Roll', 'Box']

interface TransferItem {
  itemName: string
  sku: string
  qty: string
  unit: string
}

interface Props {
  warehouses: Warehouse[]
  currentProfile: any
  children: React.ReactNode
}

export function WhTransferDialog({ warehouses, currentProfile, children }: Props) {
  const [open, setOpen] = useState(false)
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [items, setItems] = useState<TransferItem[]>([{ itemName: '', sku: '', qty: '', unit: 'Piece' }])
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const createTransfer = useCreateTransfer()

  const toWh = warehouses.find(w => w.id === toId)
  const managerName = (toWh as any)?.manager_name ?? 'the warehouse manager'
  const showApprovalBanner = !!fromId && !!toId

  function handleClose() {
    setOpen(false)
    setFromId(''); setToId('')
    setItems([{ itemName: '', sku: '', qty: '', unit: 'Piece' }])
    setNotes('')
  }

  function addItem() {
    setItems(prev => [...prev, { itemName: '', sku: '', qty: '', unit: 'Piece' }])
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  function updateItem(idx: number, field: keyof TransferItem, value: string) {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  async function handleSubmit() {
    if (!fromId || !toId) return
    setSubmitting(true)
    try {
      const year = new Date().getFullYear()
      const seq = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0')
      const transferNumber = `WT-${year}-${seq}`
      const fromWh = warehouses.find(w => w.id === fromId)

      await createTransfer.mutateAsync({
        transfer_number: transferNumber,
        from_warehouse_id: fromId,
        to_warehouse_id: toId,
        from_warehouse_name: fromWh?.name ?? '',
        to_warehouse_name: toWh?.name ?? '',
        status: 'pending_approval',
        date: new Date().toISOString().split('T')[0],
        created_by_name: currentProfile?.full_name ?? currentProfile?.email ?? '',
        items: items
          .filter(i => i.itemName && i.qty)
          .map(i => ({ item_name: i.itemName, sku: i.sku, qty: parseFloat(i.qty), unit: i.unit })),
        notes: notes || null,
      })

      await audit('purchase', 'transfer_created', { from: fromId, to: toId, transfer_number: transferNumber })
      toast.success(`Awaiting approval from ${managerName}`)
      handleClose()
    } catch (e: any) {
      toast.error(e.message ?? 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = !!fromId && !!toId && items.some(i => i.itemName && i.qty)

  return (
    <>
      <span onClick={() => setOpen(true)}>{children}</span>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4" />
              Create Stock Transfer
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* From / To */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">From Warehouse *</Label>
                <Select value={fromId} onValueChange={setFromId}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.filter(w => w.id !== toId).map(wh => (
                      <SelectItem key={wh.id} value={wh.id} className="text-xs">{wh.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">To Warehouse *</Label>
                <Select value={toId} onValueChange={setToId}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.filter(w => w.id !== fromId).map(wh => (
                      <SelectItem key={wh.id} value={wh.id} className="text-xs">{wh.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Approval banner */}
            {showApprovalBanner && (
              <div className="flex items-center gap-2 p-3 rounded-md bg-primary/5 border border-primary/20 text-xs">
                <Bell className="h-3 w-3 text-primary flex-shrink-0" />
                <span>Notification will be sent to <strong>{managerName}</strong> for approval.</span>
              </div>
            )}

            {/* Items */}
            <div className="space-y-2">
              <Label className="text-xs">Items</Label>
              {items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_80px_60px_80px] gap-2 items-center">
                  <Input
                    className="h-7 text-xs"
                    placeholder="Item name"
                    value={item.itemName}
                    onChange={e => updateItem(idx, 'itemName', e.target.value)}
                  />
                  <Input
                    className="h-7 text-xs"
                    placeholder="SKU"
                    value={item.sku}
                    onChange={e => updateItem(idx, 'sku', e.target.value)}
                  />
                  <Input
                    type="number"
                    className="h-7 text-xs"
                    placeholder="Qty"
                    min="0"
                    value={item.qty}
                    onChange={e => updateItem(idx, 'qty', e.target.value)}
                  />
                  <div className="flex gap-1">
                    <Select value={item.unit} onValueChange={v => updateItem(idx, 'unit', v)}>
                      <SelectTrigger className="h-7 text-xs flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {UNITS.map(u => (
                          <SelectItem key={u} value={u} className="text-xs">{u}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {items.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => removeItem(idx)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              <Button variant="ghost" size="sm" className="text-xs gap-1 h-7" onClick={addItem}>
                <Plus className="h-3 w-3" /> Add Item
              </Button>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea
                className="text-xs min-h-[60px]"
                placeholder="Optional notes…"
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs" onClick={handleClose}>Cancel</Button>
            <Button size="sm" className="text-xs" disabled={!canSubmit || submitting} onClick={handleSubmit}>
              {submitting ? 'Creating…' : 'Create Transfer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
```

- [ ] **Step 2: Verify**

Click "Transfer Stock" header button. Select from/to warehouses — approval banner appears. Add items with qty. Create Transfer button becomes enabled. Submitting creates a `warehouse_transfers` row with `status: 'pending_approval'` and shows the approval toast.

- [ ] **Step 3: Commit**

```bash
git add src/components/purchase/wh/WhTransferDialog.tsx
git commit -m "feat(wh): rewrite WhTransferDialog — from/to select, approval banner, item rows"
```

---

## Implementation Notes

**`audit()` helper:** Tasks 11–13 import `audit` from `@/lib/audit`. Verify this path is correct by checking where other purchase components call audit (e.g., `grep -r "from '@/lib/audit'" src/ --include="*.tsx"`). If the path differs, update all three tasks.

**`useCreateInventoryCheck` signature (Task 12):** The `mutateAsync` call passes `{ check_number, warehouse_id, warehouse_name, status, notes, items[] }`. Verify the actual mutation signature in `useWarehouseOperations.ts`. If it doesn't accept `items` inline, split into two sequential calls: insert `inventory_checks` first, get the returned `id`, then insert `inventory_check_items` with `check_id`.

**`useInventoryCheck` options (Task 8):** The hook is called as `useInventoryCheck(selectedId, { enabled: !!selectedId })`. If the hook signature doesn't accept an options object, wrap the call: only call it when `selectedId` is non-null by splitting into a child component that receives `selectedId` as a required prop.

**`useWarehouseStock` for all warehouses (Task 5):** Called with `undefined` to fetch all warehouses. If the hook requires a non-null `warehouseId`, either add an optional param variant to the hook, or call it per-warehouse in a loop and flatten — whichever matches the existing pattern.

**Query key for stock adjustments (Task 7):** `queryClient.invalidateQueries({ queryKey: ['stock-adjustments'] })` — verify the exact query key used in `useStockAdjustments()` and match it here.


