# Purchase Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **CRITICAL: After every task commit, immediately commit an updated PROGRESS.md marking that task complete. Do this BEFORE dispatching the next task's subagent.**

**Goal:** Build Shipments tracking, Landed Costs allocation, Warehouses operational hub (7 tabs), and Dead Stock Report — completing the Purchase Operations module.

**Architecture:** TanStack Query hooks for all operations tables, sub-components per warehouse tab, full-page routes at `/purchase/shipments`, `/purchase/landed-costs`, `/purchase/warehouses`, and `/purchase/dead-stock`.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (client-side), TanStack Query v5, shadcn/ui (Base UI), sonner toasts, Tailwind CSS.

---

## CRITICAL codebase rules — read before writing any code

1. `DropdownMenuTrigger` does **NOT** support `asChild` — use `className` directly.
2. `DropdownMenuLabel` **MUST** be inside `<DropdownMenuGroup>` or crashes with `MenuGroupRootContext is missing`.
3. `zodResolver(schema) as never` — always add `as never` to bypass zod v4 TS inference.
4. Supabase client: `import { createClient } from '@/lib/supabase/client'`
5. Types: `DBTable<'t'>`, `DBInsert<'t'>`, `DBUpdate<'t'>` from `@/types/database.types` — if generated types are stale (column missing), cast: `(supabase as any).from(...)`.
6. **Responsive design is mandatory** — every component must work at phone/tablet/laptop/TV breakpoints. Dialogs: `w-full max-w-full rounded-none sm:max-w-2xl sm:rounded-lg`. Touch targets: `min-h-11`.
7. Import `cn` from `@/lib/utils`
8. Formatters: `import { formatCurrency, formatDate, formatDateTime, formatRelative } from '@/lib/utils/formatters'`
9. Shared: `PageHeader` from `@/components/shared/PageHeader`, `DataTable` from `@/components/shared/DataTable`, `SearchInput` from `@/components/shared/SearchInput`, `ConfirmDialog` from `@/components/shared/ConfirmDialog`
10. After every task: commit code, then immediately commit updated PROGRESS.md before next task.

---

## Key schema facts

**`shipments`**: id, tracking_number (text NOT NULL), po_id (uuid FK→purchase_orders), receival_id (uuid nullable FK→receivals), mode (`shipment_mode` enum: `air|sea|land|manual`), carrier (text), status (`shipment_status` enum: `booked|in_transit|customs|delivered|delayed`), origin (nullable), destination (nullable), etd (date nullable), eta (date nullable), events (jsonb default `'[]'`), archived (bool default false), created_at, updated_at.

**`landed_costs`**: id, lc_number (text UNIQUE), description (nullable), total_amount (numeric default 0), currency (text default `'QAR'`), lines (jsonb default `'[]'` — array of `{description, amount, currency}`), attached_receival_ids (uuid[] default `'{}'`), attached_po_ids (uuid[] default `'{}'`), all_items_sold (bool), date (date NOT NULL), item_allocations (jsonb nullable — array of `{brand_variant_id, item_name, sku, qty_received, original_unit_cost, allocated_cost, updated_unit_cost}`), voided_at (timestamptz nullable), voided_reason (nullable), created_at, updated_at.

**`warehouses`**: id, name, location, warehouse_type (text: `central|local|team_vehicle`), item_count (int), total_value (numeric), deleted_at — **already has a hook `useWarehouses()` in `src/hooks/useWarehouses.ts`** — re-use it, do NOT recreate.

**`warehouse_transfers`**: id, transfer_number (UNIQUE), from_warehouse_id (FK), to_warehouse_id (FK), status (`transfer_status` enum: `pending|in_transit|pending_approval|approved|rejected`), created_by_name, approved_by_name, date (NOT NULL), approved_date, items (jsonb NOT NULL — array of `{brand_variant_id, item_name, sku, qty, unit_cost}`), notes, created_at, updated_at.

**`stock_adjustments`**: id, warehouse_id (FK), brand_variant_id (FK), adjustment_type (text: `increase|decrease|set`), qty (numeric), reason (text), notes, status (text default `'pending_approval'`), requested_by_name, approved_by_name, approved_at, created_at, updated_at.

**`inventory_checks`**: id, check_number, warehouse_id (FK), warehouse_name (text), status (text: `draft|submitted|reviewed`), submitted_by_name, submitted_at, reviewed_by_name, reviewed_at, review_notes, notes, created_at.

**`inventory_check_items`**: id, check_id (FK), brand_variant_id (FK), item_name, brand, sku, system_qty, counted_qty (nullable), is_counted (bool), variance (generated: counted_qty - system_qty), notes.

**`inventory_brand_variants`**: id, item_name, brand (nullable), sku (nullable), unit, cost_price, selling_price, stock_level (numeric default 0), average_cost (numeric default 0). Use `(supabase as any)` — stale types.

**`inventory_stock_movements`** (likely not in generated types — always cast with `as any`): id, warehouse_id, brand_variant_id, item_name, sku, movement_type (text: `purchase_receival|sale_delivery|transfer_in|transfer_out|adjustment|return|sale_return`), qty (numeric), unit_cost (numeric), reference_type (nullable), reference_id (uuid nullable), notes, created_at.

**`receivals`**: id, receival_number, po_id (FK), warehouse_id (FK), received_by_name, date, status, notes. Already used in purchase core.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/hooks/useShipments.ts` | Shipment CRUD + event tracking mutations |
| `src/hooks/useLandedCosts.ts` | Landed cost CRUD + void mutation |
| `src/hooks/useWarehouseOperations.ts` | Transfers, adjustments, inventory checks, stock movements |
| `src/hooks/useDeadStock.ts` | Dead stock report query + classification |
| `src/components/purchase/wh/WhStockOverviewTab.tsx` | Per-warehouse stock table |
| `src/components/purchase/wh/WhMovementsTab.tsx` | Stock movement log |
| `src/components/purchase/wh/WhTransferDialog.tsx` | Create transfer form dialog |
| `src/components/purchase/wh/WhTransfersTab.tsx` | Transfers list + approve/reject |
| `src/components/purchase/wh/WhAdjustmentDialog.tsx` | Create stock adjustment form |
| `src/components/purchase/wh/WhAdjustmentsTab.tsx` | Adjustments list + approve |
| `src/components/purchase/wh/WhInventoryCheckDialog.tsx` | Create/count/review inventory check |
| `src/components/purchase/wh/WhInventoryChecksTab.tsx` | Inventory checks list |
| `src/components/purchase/wh/WhReceivalsTab.tsx` | Receivals for a warehouse |
| `src/app/(dashboard)/purchase/shipments/page.tsx` | Shipments tracking page |
| `src/app/(dashboard)/purchase/landed-costs/page.tsx` | Landed costs page |
| `src/app/(dashboard)/purchase/warehouses/page.tsx` | 7-tab warehouse hub |
| `src/app/(dashboard)/purchase/dead-stock/page.tsx` | Dead stock analytics |

---

## Task 1: Hooks

**Files:**
- Create: `src/hooks/useShipments.ts`
- Create: `src/hooks/useLandedCosts.ts`
- Create: `src/hooks/useWarehouseOperations.ts`
- Create: `src/hooks/useDeadStock.ts`

- [ ] **Step 1: Create `src/hooks/useShipments.ts`**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ShipmentMode = 'air' | 'sea' | 'land' | 'manual'
export type ShipmentStatus = 'booked' | 'in_transit' | 'customs' | 'delivered' | 'delayed'

export type ShipmentEvent = {
  date: string
  location: string
  status: string
  notes?: string
}

export type Shipment = {
  id: string
  tracking_number: string
  po_id: string
  receival_id: string | null
  mode: ShipmentMode
  carrier: string
  status: ShipmentStatus
  origin: string | null
  destination: string | null
  etd: string | null
  eta: string | null
  events: ShipmentEvent[]
  archived: boolean
  created_at: string
  updated_at: string
  purchase_orders?: { po_number: string; supplier_name: string } | null
}

export type CreateShipmentPayload = {
  po_id: string
  mode: ShipmentMode
  carrier: string
  tracking_number: string
  origin?: string | null
  destination?: string | null
  etd?: string | null
  eta?: string | null
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useShipments({ archived = false, search = '' }: { archived?: boolean; search?: string } = {}) {
  return useQuery({
    queryKey: ['shipments', { archived, search }],
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('shipments')
        .select('*, purchase_orders(po_number, supplier_name)')
        .eq('archived', archived)
        .order('created_at', { ascending: false })
      if (search) {
        q = q.or(`tracking_number.ilike.%${search}%,carrier.ilike.%${search}%`)
      }
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as Shipment[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateShipment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateShipmentPayload) => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('shipments')
        .insert({ ...payload, events: [], archived: false, status: 'booked' })
        .select()
        .single()
      if (error) throw error
      return data as Shipment
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shipments'] }),
  })
}

export function useUpdateShipmentStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ShipmentStatus }) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('shipments')
        .update({ status })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shipments'] }),
  })
}

export function useAddShipmentEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, event, currentEvents }: { id: string; event: ShipmentEvent; currentEvents: ShipmentEvent[] }) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('shipments')
        .update({ events: [...currentEvents, event] })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shipments'] }),
  })
}

export function useArchiveShipment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('shipments')
        .update({ archived: true })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shipments'] }),
  })
}
```

- [ ] **Step 2: Create `src/hooks/useLandedCosts.ts`**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

// ─── Types ────────────────────────────────────────────────────────────────────

export type LandedCostLine = {
  description: string
  amount: number
  currency: string
}

export type LandedCostItemAllocation = {
  brand_variant_id: string
  item_name: string
  sku: string | null
  qty_received: number
  original_unit_cost: number
  allocated_cost: number
  updated_unit_cost: number
}

export type LandedCost = {
  id: string
  lc_number: string
  description: string | null
  total_amount: number
  currency: string
  lines: LandedCostLine[]
  attached_receival_ids: string[]
  attached_po_ids: string[]
  all_items_sold: boolean
  date: string
  item_allocations: LandedCostItemAllocation[] | null
  voided_at: string | null
  voided_reason: string | null
  created_at: string
  updated_at: string
}

export type CreateLandedCostPayload = {
  description?: string | null
  date: string
  currency: string
  lines: LandedCostLine[]
  attached_receival_ids: string[]
  attached_po_ids: string[]
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useLandedCosts({ search = '' }: { search?: string } = {}) {
  return useQuery({
    queryKey: ['landed_costs', { search }],
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('landed_costs')
        .select('*')
        .order('date', { ascending: false })
      if (search) {
        q = q.or(`lc_number.ilike.%${search}%,description.ilike.%${search}%`)
      }
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as LandedCost[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useLandedCost(id: string) {
  return useQuery({
    queryKey: ['landed_costs', id],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('landed_costs')
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw error
      return data as LandedCost
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateLandedCost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateLandedCostPayload) => {
      const supabase = createClient()
      const total_amount = payload.lines.reduce((s, l) => s + l.amount, 0)
      const { data, error } = await (supabase as any)
        .from('landed_costs')
        .insert({ ...payload, total_amount, all_items_sold: false })
        .select()
        .single()
      if (error) throw error
      return data as LandedCost
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['landed_costs'] }),
  })
}

export function useVoidLandedCost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('landed_costs')
        .update({ voided_at: new Date().toISOString(), voided_reason: reason })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['landed_costs'] }),
  })
}
```

- [ ] **Step 3: Create `src/hooks/useWarehouseOperations.ts`**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

// ─── Types ────────────────────────────────────────────────────────────────────

export type StockMovementType =
  | 'purchase_receival'
  | 'sale_delivery'
  | 'transfer_in'
  | 'transfer_out'
  | 'adjustment'
  | 'return'
  | 'sale_return'

export type StockMovement = {
  id: string
  warehouse_id: string
  brand_variant_id: string
  item_name: string
  sku: string | null
  movement_type: StockMovementType
  qty: number
  unit_cost: number
  reference_type: string | null
  reference_id: string | null
  notes: string | null
  created_at: string
}

export type WarehouseStockItem = {
  brand_variant_id: string
  item_name: string
  brand: string | null
  sku: string | null
  unit: string
  stock_level: number
  average_cost: number
  total_value: number
}

export type TransferStatus = 'pending' | 'in_transit' | 'pending_approval' | 'approved' | 'rejected'

export type TransferItem = {
  brand_variant_id: string
  item_name: string
  sku: string | null
  qty: number
  unit_cost: number
}

export type WarehouseTransfer = {
  id: string
  transfer_number: string
  from_warehouse_id: string
  to_warehouse_id: string
  status: TransferStatus
  created_by_name: string | null
  approved_by_name: string | null
  date: string
  approved_date: string | null
  items: TransferItem[]
  notes: string | null
  created_at: string
  updated_at: string
  from_warehouse?: { name: string } | null
  to_warehouse?: { name: string } | null
}

export type CreateTransferPayload = {
  from_warehouse_id: string
  to_warehouse_id: string
  date: string
  items: TransferItem[]
  notes?: string | null
  created_by_name?: string | null
}

export type StockAdjustment = {
  id: string
  warehouse_id: string
  brand_variant_id: string
  adjustment_type: string
  qty: number
  reason: string
  notes: string | null
  status: string
  requested_by_name: string | null
  approved_by_name: string | null
  approved_at: string | null
  created_at: string
  updated_at: string
}

export type CreateAdjustmentPayload = {
  warehouse_id: string
  brand_variant_id: string
  adjustment_type: 'increase' | 'decrease' | 'set'
  qty: number
  reason: string
  notes?: string | null
  requested_by_name?: string | null
}

export type InventoryCheck = {
  id: string
  check_number: string
  warehouse_id: string
  warehouse_name: string
  status: string
  submitted_by_name: string | null
  submitted_at: string | null
  reviewed_by_name: string | null
  reviewed_at: string | null
  review_notes: string | null
  notes: string | null
  created_at: string
  items?: InventoryCheckItem[]
}

export type InventoryCheckItem = {
  id: string
  check_id: string
  brand_variant_id: string
  item_name: string
  brand: string
  sku: string | null
  system_qty: number
  counted_qty: number | null
  is_counted: boolean
  variance: number | null
  notes: string | null
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useStockMovements({
  warehouseId,
  limit = 100,
}: {
  warehouseId?: string
  limit?: number
} = {}) {
  return useQuery({
    queryKey: ['stock_movements', { warehouseId, limit }],
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('inventory_stock_movements')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (warehouseId) q = q.eq('warehouse_id', warehouseId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as StockMovement[]
    },
    staleTime: 2 * 60 * 1000,
  })
}

export function useWarehouseStock(warehouseId?: string) {
  return useQuery({
    queryKey: ['warehouse_stock', warehouseId],
    queryFn: async () => {
      const supabase = createClient()
      // Query brand variants with stock. If warehouseId provided, filter by warehouse via movements.
      // Simple approach: query inventory_brand_variants with stock_level > 0
      const { data, error } = await (supabase as any)
        .from('inventory_brand_variants')
        .select('id, item_name, brand, sku, unit, stock_level, average_cost')
        .gt('stock_level', 0)
        .order('item_name', { ascending: true })
      if (error) throw error
      return ((data ?? []) as any[]).map((v) => ({
        brand_variant_id: v.id,
        item_name: v.item_name,
        brand: v.brand,
        sku: v.sku,
        unit: v.unit,
        stock_level: v.stock_level,
        average_cost: v.average_cost,
        total_value: v.stock_level * v.average_cost,
      })) as WarehouseStockItem[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useWarehouseTransfers({ status }: { status?: TransferStatus } = {}) {
  return useQuery({
    queryKey: ['warehouse_transfers', { status }],
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('warehouse_transfers')
        .select('*, from_warehouse:from_warehouse_id(name), to_warehouse:to_warehouse_id(name)')
        .order('created_at', { ascending: false })
      if (status) q = q.eq('status', status)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as WarehouseTransfer[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateTransfer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateTransferPayload) => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('warehouse_transfers')
        .insert({ ...payload, status: 'pending' })
        .select()
        .single()
      if (error) throw error
      return data as WarehouseTransfer
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['warehouse_transfers'] }),
  })
}

export function useApproveTransfer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, approvedByName }: { id: string; approvedByName: string }) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('warehouse_transfers')
        .update({ status: 'approved', approved_by_name: approvedByName, approved_date: new Date().toISOString().split('T')[0] })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['warehouse_transfers'] }),
  })
}

export function useRejectTransfer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('warehouse_transfers')
        .update({ status: 'rejected' })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['warehouse_transfers'] }),
  })
}

export function useStockAdjustments({ warehouseId }: { warehouseId?: string } = {}) {
  return useQuery({
    queryKey: ['stock_adjustments', { warehouseId }],
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('stock_adjustments')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (warehouseId) q = q.eq('warehouse_id', warehouseId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as StockAdjustment[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateStockAdjustment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: CreateAdjustmentPayload) => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('stock_adjustments')
        .insert({ ...payload, status: 'pending_approval' })
        .select()
        .single()
      if (error) throw error
      return data as StockAdjustment
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stock_adjustments'] }),
  })
}

export function useApproveStockAdjustment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, approvedByName }: { id: string; approvedByName: string }) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('stock_adjustments')
        .update({ status: 'approved', approved_by_name: approvedByName, approved_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stock_adjustments'] }),
  })
}

export function useInventoryChecks({ warehouseId }: { warehouseId?: string } = {}) {
  return useQuery({
    queryKey: ['inventory_checks', { warehouseId }],
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('inventory_checks')
        .select('*')
        .order('created_at', { ascending: false })
      if (warehouseId) q = q.eq('warehouse_id', warehouseId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as InventoryCheck[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useInventoryCheck(id: string) {
  return useQuery({
    queryKey: ['inventory_checks', id],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('inventory_checks')
        .select('*, items:inventory_check_items(*)')
        .eq('id', id)
        .single()
      if (error) throw error
      return data as InventoryCheck
    },
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
  })
}

export function useCreateInventoryCheck() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      warehouseId,
      warehouseName,
      notes,
    }: {
      warehouseId: string
      warehouseName: string
      notes?: string | null
    }) => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('inventory_checks')
        .insert({ warehouse_id: warehouseId, warehouse_name: warehouseName, status: 'draft', notes })
        .select()
        .single()
      if (error) throw error
      return data as InventoryCheck
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory_checks'] }),
  })
}

export function useUpdateInventoryCheckItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      countedQty,
    }: {
      id: string
      countedQty: number
    }) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('inventory_check_items')
        .update({ counted_qty: countedQty, is_counted: true })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['inventory_checks'] })
    },
  })
}

export function useSubmitInventoryCheck() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, submittedByName }: { id: string; submittedByName: string }) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('inventory_checks')
        .update({
          status: 'submitted',
          submitted_by_name: submittedByName,
          submitted_at: new Date().toISOString(),
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory_checks'] }),
  })
}

export function useReviewInventoryCheck() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      reviewedByName,
      reviewNotes,
    }: {
      id: string
      reviewedByName: string
      reviewNotes?: string | null
    }) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('inventory_checks')
        .update({
          status: 'reviewed',
          reviewed_by_name: reviewedByName,
          reviewed_at: new Date().toISOString(),
          review_notes: reviewNotes,
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory_checks'] }),
  })
}
```

- [ ] **Step 4: Create `src/hooks/useDeadStock.ts`**

```typescript
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

// ─── Types ────────────────────────────────────────────────────────────────────

export type DeadStockStatus = 'active' | 'slow_moving' | 'at_risk' | 'dead'

export type DeadStockItem = {
  brand_variant_id: string
  item_name: string
  brand: string | null
  sku: string | null
  stock_level: number
  average_cost: number
  total_value: number
  last_movement_date: string | null
  days_idle: number
  status: DeadStockStatus
}

function classifyDeadStock(days: number): DeadStockStatus {
  if (days <= 30) return 'active'
  if (days <= 90) return 'slow_moving'
  if (days <= 180) return 'at_risk'
  return 'dead'
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useDeadStockReport({
  search = '',
  status,
}: {
  search?: string
  status?: DeadStockStatus
} = {}) {
  return useQuery({
    queryKey: ['dead_stock', { search, status }],
    queryFn: async () => {
      const supabase = createClient()

      // 1. Fetch all brand variants with stock > 0
      const { data: variants, error: varErr } = await (supabase as any)
        .from('inventory_brand_variants')
        .select('id, item_name, brand, sku, stock_level, average_cost')
        .gt('stock_level', 0)
      if (varErr) throw varErr

      if (!variants || variants.length === 0) return []

      // 2. Fetch latest movement per variant (one query, ordered by created_at desc)
      const variantIds = (variants as any[]).map((v) => v.id)
      const { data: movements, error: movErr } = await (supabase as any)
        .from('inventory_stock_movements')
        .select('brand_variant_id, created_at')
        .in('brand_variant_id', variantIds)
        .order('created_at', { ascending: false })
      if (movErr) throw movErr

      // Build a map: brand_variant_id -> latest movement date
      const latestMap = new Map<string, string>()
      for (const m of (movements ?? []) as any[]) {
        if (!latestMap.has(m.brand_variant_id)) {
          latestMap.set(m.brand_variant_id, m.created_at)
        }
      }

      const now = Date.now()
      let items: DeadStockItem[] = (variants as any[]).map((v) => {
        const lastDate = latestMap.get(v.id) ?? null
        const days = lastDate
          ? Math.floor((now - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24))
          : 999
        return {
          brand_variant_id: v.id,
          item_name: v.item_name,
          brand: v.brand,
          sku: v.sku,
          stock_level: v.stock_level,
          average_cost: v.average_cost,
          total_value: v.stock_level * v.average_cost,
          last_movement_date: lastDate,
          days_idle: days,
          status: classifyDeadStock(days),
        }
      })

      // Apply filters
      if (search) {
        const q = search.toLowerCase()
        items = items.filter(
          (i) =>
            i.item_name.toLowerCase().includes(q) ||
            (i.sku ?? '').toLowerCase().includes(q) ||
            (i.brand ?? '').toLowerCase().includes(q)
        )
      }
      if (status) {
        items = items.filter((i) => i.status === status)
      }

      // Sort by days_idle desc
      items.sort((a, b) => b.days_idle - a.days_idle)

      return items
    },
    staleTime: 10 * 60 * 1000,
  })
}
```

- [ ] **Step 5: Commit**

```bash
cd D:/MMS && git add src/hooks/useShipments.ts src/hooks/useLandedCosts.ts src/hooks/useWarehouseOperations.ts src/hooks/useDeadStock.ts
git commit -m "feat: add Purchase Operations hooks — shipments, landed costs, warehouse ops, dead stock"
```

---

## Task 2: Shipments Page

**Files:**
- Create: `src/app/(dashboard)/purchase/shipments/page.tsx`

- [ ] **Step 1: Create `src/app/(dashboard)/purchase/shipments/page.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Plane, Ship, Truck, PenLine, Eye, Archive, Plus } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { SearchInput } from '@/components/shared/SearchInput'
import { DataTable } from '@/components/shared/DataTable'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { formatDate } from '@/lib/utils/formatters'
import {
  useShipments, useCreateShipment, useUpdateShipmentStatus, useAddShipmentEvent, useArchiveShipment,
  type Shipment, type ShipmentMode, type ShipmentStatus, type ShipmentEvent,
} from '@/hooks/useShipments'
import { usePurchaseOrders } from '@/hooks/usePurchaseOrders'
import type { ColumnDef } from '@tanstack/react-table'

// ─── Constants ────────────────────────────────────────────────────────────────

const MODE_ICONS: Record<ShipmentMode, { icon: React.ReactNode; label: string }> = {
  air:    { icon: <Plane className="h-4 w-4" />,    label: 'Air'    },
  sea:    { icon: <Ship className="h-4 w-4" />,     label: 'Sea'    },
  land:   { icon: <Truck className="h-4 w-4" />,   label: 'Land'   },
  manual: { icon: <PenLine className="h-4 w-4" />, label: 'Manual' },
}

const STATUS_COLORS: Record<ShipmentStatus, string> = {
  booked:     'bg-blue-100 text-blue-800',
  in_transit: 'bg-orange-100 text-orange-800',
  customs:    'bg-yellow-100 text-yellow-800',
  delivered:  'bg-green-100 text-green-800',
  delayed:    'bg-red-100 text-red-800',
}

const STATUS_LABELS: Record<ShipmentStatus, string> = {
  booked:     'Booked',
  in_transit: 'In Transit',
  customs:    'Customs',
  delivered:  'Delivered',
  delayed:    'Delayed',
}

const ALL_STATUSES: ShipmentStatus[] = ['booked', 'in_transit', 'customs', 'delivered', 'delayed']

// ─── Sub-components ────────────────────────────────────────────────────────────

function ShipmentStatusBadge({ status }: { status: ShipmentStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

// ─── Create Shipment Dialog ───────────────────────────────────────────────────

function CreateShipmentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: pos } = usePurchaseOrders({ status: undefined })
  const createShipment = useCreateShipment()
  const [form, setForm] = useState({
    po_id: '', mode: 'air' as ShipmentMode, carrier: '', tracking_number: '',
    origin: '', destination: '', etd: '', eta: '',
  })

  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.po_id) { toast.error('Select a PO'); return }
    if (!form.carrier) { toast.error('Carrier is required'); return }
    if (!form.tracking_number) { toast.error('Tracking number is required'); return }
    createShipment.mutate(
      {
        po_id: form.po_id,
        mode: form.mode,
        carrier: form.carrier,
        tracking_number: form.tracking_number,
        origin: form.origin || null,
        destination: form.destination || null,
        etd: form.etd || null,
        eta: form.eta || null,
      },
      {
        onSuccess: () => { toast.success('Shipment created'); onOpenChange(false); setForm({ po_id: '', mode: 'air', carrier: '', tracking_number: '', origin: '', destination: '', etd: '', eta: '' }) },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  const approvedPos = (pos ?? []).filter((p) => p.status === 'approved' || p.status === 'partially_received')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-lg sm:rounded-lg">
        <DialogHeader><DialogTitle>Create Shipment</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label>Purchase Order *</Label>
            <select value={form.po_id} onChange={(e) => set('po_id', e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
              <option value="">Select PO…</option>
              {approvedPos.map((p) => (
                <option key={p.id} value={p.id}>{p.po_number} — {p.supplier_name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Mode *</Label>
              <select value={form.mode} onChange={(e) => set('mode', e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                <option value="air">✈️ Air</option>
                <option value="sea">🚢 Sea</option>
                <option value="land">🚛 Land</option>
                <option value="manual">✏️ Manual</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Carrier *</Label>
              <Input value={form.carrier} onChange={(e) => set('carrier', e.target.value)} placeholder="DHL, FedEx…" />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Tracking Number *</Label>
            <Input value={form.tracking_number} onChange={(e) => set('tracking_number', e.target.value)} placeholder="TRK-001" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Origin</Label>
              <Input value={form.origin} onChange={(e) => set('origin', e.target.value)} placeholder="Shanghai" />
            </div>
            <div className="space-y-1">
              <Label>Destination</Label>
              <Input value={form.destination} onChange={(e) => set('destination', e.target.value)} placeholder="Doha" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>ETD</Label>
              <Input type="date" value={form.etd} onChange={(e) => set('etd', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>ETA</Label>
              <Input type="date" value={form.eta} onChange={(e) => set('eta', e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={createShipment.isPending}>
              {createShipment.isPending ? 'Creating…' : 'Create Shipment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Shipment Detail Dialog ───────────────────────────────────────────────────

function ShipmentDetailDialog({
  shipment,
  onClose,
}: {
  shipment: Shipment | null
  onClose: () => void
}) {
  const updateStatus = useUpdateShipmentStatus()
  const addEvent = useAddShipmentEvent()
  const archiveShipment = useArchiveShipment()
  const [showEventForm, setShowEventForm] = useState(false)
  const [eventForm, setEventForm] = useState({ date: '', location: '', status: '', notes: '' })

  if (!shipment) return null

  function handleAddEvent(e: React.FormEvent) {
    e.preventDefault()
    if (!shipment) return
    if (!eventForm.date || !eventForm.location) { toast.error('Date and location required'); return }
    addEvent.mutate(
      { id: shipment.id, event: { ...eventForm }, currentEvents: shipment.events ?? [] },
      {
        onSuccess: () => { toast.success('Event added'); setShowEventForm(false); setEventForm({ date: '', location: '', status: '', notes: '' }) },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  const modeInfo = MODE_ICONS[shipment.mode]

  return (
    <Dialog open={!!shipment} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-2xl sm:rounded-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span className="text-muted-foreground">{modeInfo.icon}</span>
            {shipment.tracking_number}
            <ShipmentStatusBadge status={shipment.status} />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">PO</p>
              <p className="font-medium">{shipment.purchase_orders?.po_number ?? '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Carrier</p>
              <p className="font-medium">{shipment.carrier}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Route</p>
              <p className="font-medium">{shipment.origin ?? '—'} → {shipment.destination ?? '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">ETD / ETA</p>
              <p className="font-medium">{formatDate(shipment.etd)} / {formatDate(shipment.eta)}</p>
            </div>
          </div>

          <Separator />

          {/* Tracking Timeline */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Tracking Timeline</h3>
            {(shipment.events ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No events yet</p>
            ) : (
              <div className="space-y-2">
                {[...(shipment.events ?? [])].reverse().map((ev, i) => (
                  <div key={i} className="flex gap-3 text-sm">
                    <div className="w-24 shrink-0 text-muted-foreground">{ev.date}</div>
                    <div>
                      <span className="font-medium">{ev.location}</span>
                      {ev.status && <span className="ml-2 text-muted-foreground">· {ev.status}</span>}
                      {ev.notes && <p className="text-xs text-muted-foreground">{ev.notes}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add event form */}
          {showEventForm && (
            <form onSubmit={handleAddEvent} className="rounded-md border p-3 space-y-3 bg-muted/30">
              <p className="text-sm font-medium">Add Tracking Event</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Date *</Label>
                  <Input type="date" value={eventForm.date} onChange={(e) => setEventForm((f) => ({ ...f, date: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Location *</Label>
                  <Input value={eventForm.location} onChange={(e) => setEventForm((f) => ({ ...f, location: e.target.value }))} placeholder="Port, city…" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Input value={eventForm.status} onChange={(e) => setEventForm((f) => ({ ...f, status: e.target.value }))} placeholder="Departed, Cleared customs…" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Notes</Label>
                <Textarea value={eventForm.notes} onChange={(e) => setEventForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowEventForm(false)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={addEvent.isPending}>Add Event</Button>
              </div>
            </form>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowEventForm(true)} disabled={showEventForm}>
            <Plus className="h-4 w-4 mr-1" /> Add Event
          </Button>
          {/* Update Status dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent h-9">
              Update Status
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuGroup>
                {ALL_STATUSES.filter((s) => s !== shipment.status).map((s) => (
                  <DropdownMenuItem
                    key={s}
                    onClick={() => updateStatus.mutate(
                      { id: shipment.id, status: s },
                      { onSuccess: () => toast.success('Status updated'), onError: (err) => toast.error(err.message) }
                    )}
                  >
                    {STATUS_LABELS[s]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          {!shipment.archived && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => archiveShipment.mutate(
                shipment.id,
                { onSuccess: () => { toast.success('Archived'); onClose() }, onError: (err) => toast.error(err.message) }
              )}
            >
              <Archive className="h-4 w-4 mr-1" /> Archive
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ShipmentsPage() {
  const [archived, setArchived] = useState(false)
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [selected, setSelected] = useState<Shipment | null>(null)

  const { data: shipments, isLoading } = useShipments({ archived, search })

  const columns: ColumnDef<Shipment>[] = [
    {
      accessorKey: 'tracking_number',
      header: 'Tracking #',
      cell: ({ row }) => <span className="font-mono text-sm font-medium">{row.original.tracking_number}</span>,
    },
    {
      id: 'po_number',
      header: 'PO #',
      cell: ({ row }) => <span className="text-sm">{row.original.purchase_orders?.po_number ?? '—'}</span>,
    },
    {
      accessorKey: 'mode',
      header: 'Mode',
      cell: ({ row }) => {
        const m = MODE_ICONS[row.original.mode]
        return <span className="flex items-center gap-1 text-sm">{m.icon} {m.label}</span>
      },
    },
    {
      accessorKey: 'carrier',
      header: 'Carrier',
      cell: ({ row }) => <span className="text-sm">{row.original.carrier}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <ShipmentStatusBadge status={row.original.status} />,
    },
    {
      id: 'route',
      header: 'Route',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.origin ?? '—'} → {row.original.destination ?? '—'}
        </span>
      ),
    },
    {
      accessorKey: 'etd',
      header: 'ETD',
      cell: ({ row }) => <span className="text-sm">{formatDate(row.original.etd)}</span>,
    },
    {
      accessorKey: 'eta',
      header: 'ETA',
      cell: ({ row }) => <span className="text-sm">{formatDate(row.original.eta)}</span>,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="View shipment" onClick={() => setSelected(row.original)}>
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Shipments"
        description="Track shipments linked to purchase orders"
        action={{ label: '+ Create Shipment', onClick: () => setCreateOpen(true) }}
      />

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        {/* Active / Archived tabs */}
        <div className="flex rounded-md border overflow-hidden">
          {[false, true].map((isArchived) => (
            <button
              key={String(isArchived)}
              type="button"
              onClick={() => setArchived(isArchived)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                archived === isArchived ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              }`}
            >
              {isArchived ? 'Archived' : 'Active'}
            </button>
          ))}
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder="Search tracking, carrier…" className="flex-1 sm:max-w-xs" />
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)}</div>
      ) : (
        <DataTable columns={columns} data={shipments ?? []} />
      )}

      <CreateShipmentDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ShipmentDetailDialog shipment={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd D:/MMS && git add "src/app/(dashboard)/purchase/shipments/page.tsx"
git commit -m "feat: add Shipments tracking page with create dialog, timeline events, status updates"
```

---

## Task 3: Landed Costs Page

**Files:**
- Create: `src/app/(dashboard)/purchase/landed-costs/page.tsx`

- [ ] **Step 1: Create `src/app/(dashboard)/purchase/landed-costs/page.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Eye, Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/shared/PageHeader'
import { SearchInput } from '@/components/shared/SearchInput'
import { DataTable } from '@/components/shared/DataTable'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import {
  useLandedCosts, useCreateLandedCost, useVoidLandedCost,
  type LandedCost, type LandedCostLine,
} from '@/hooks/useLandedCosts'
import type { ColumnDef } from '@tanstack/react-table'

// ─── Local receival hook ───────────────────────────────────────────────────────

type ReceivalSummary = {
  id: string
  receival_number: string
  po_id: string
  date: string
  status: string
  purchase_orders: { po_number: string; supplier_name: string } | null
}

function useReceivals() {
  return useQuery({
    queryKey: ['receivals_list'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('receivals')
        .select('id, receival_number, po_id, date, status, purchase_orders(po_number, supplier_name)')
        .order('date', { ascending: false })
        .limit(100)
      if (error) throw error
      return (data ?? []) as ReceivalSummary[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

// ─── LC Detail Dialog ─────────────────────────────────────────────────────────

function LcDetailDialog({
  lc,
  onClose,
}: {
  lc: LandedCost | null
  onClose: () => void
}) {
  const voidLc = useVoidLandedCost()
  const [voidOpen, setVoidOpen] = useState(false)
  const [voidReason, setVoidReason] = useState('')

  if (!lc) return null

  const isVoided = !!lc.voided_at

  return (
    <>
      <Dialog open={!!lc} onOpenChange={(open) => { if (!open) onClose() }}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-3xl sm:rounded-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              {lc.lc_number}
              <Badge variant={isVoided ? 'destructive' : 'outline'}>{isVoided ? 'Voided' : 'Active'}</Badge>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
            {/* Header info */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Date</p>
                <p className="font-medium">{formatDate(lc.date)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Total Amount</p>
                <p className="font-semibold">{formatCurrency(lc.total_amount, lc.currency)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Description</p>
                <p className="font-medium">{lc.description ?? '—'}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Receivals Attached</p>
                <p className="font-medium">{lc.attached_receival_ids?.length ?? 0}</p>
              </div>
            </div>

            <Separator />

            {/* Cost Lines */}
            <div>
              <h3 className="text-sm font-semibold mb-2">Cost Lines</h3>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Currency</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(lc.lines ?? []).map((line, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm">{line.description}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{formatCurrency(line.amount, line.currency)}</TableCell>
                        <TableCell className="text-sm">{line.currency}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Item Allocations */}
            {(lc.item_allocations ?? []).length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Item Allocations</h3>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Original Cost</TableHead>
                        <TableHead className="text-right">Allocated Cost</TableHead>
                        <TableHead className="text-right">Updated Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(lc.item_allocations ?? []).map((alloc, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-sm">{alloc.item_name}</TableCell>
                          <TableCell className="text-sm font-mono">{alloc.sku ?? '—'}</TableCell>
                          <TableCell className="text-right text-sm">{alloc.qty_received}</TableCell>
                          <TableCell className="text-right text-sm">{formatCurrency(alloc.original_unit_cost, lc.currency)}</TableCell>
                          <TableCell className="text-right text-sm">{formatCurrency(alloc.allocated_cost, lc.currency)}</TableCell>
                          <TableCell className="text-right text-sm font-medium">{formatCurrency(alloc.updated_unit_cost, lc.currency)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>

          {!isVoided && (
            <DialogFooter>
              <Button variant="destructive" size="sm" onClick={() => setVoidOpen(true)}>
                Void LC
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Void confirm */}
      <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-sm sm:rounded-lg">
          <DialogHeader><DialogTitle>Void Landed Cost</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">This will void {lc.lc_number}. Please provide a reason.</p>
            <Textarea value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Reason for voiding…" rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!voidReason || voidLc.isPending}
              onClick={() => voidLc.mutate(
                { id: lc.id, reason: voidReason },
                {
                  onSuccess: () => { toast.success('LC voided'); setVoidOpen(false); onClose() },
                  onError: (err) => toast.error(err.message),
                }
              )}
            >
              {voidLc.isPending ? 'Voiding…' : 'Confirm Void'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─── Create LC Dialog ─────────────────────────────────────────────────────────

function CreateLcDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const createLc = useCreateLandedCost()
  const { data: receivals } = useReceivals()
  const [description, setDescription] = useState('')
  const [date, setDate] = useState('')
  const [currency, setCurrency] = useState('QAR')
  const [lines, setLines] = useState<LandedCostLine[]>([{ description: '', amount: 0, currency: 'QAR' }])
  const [selectedReceivalIds, setSelectedReceivalIds] = useState<string[]>([])

  function addLine() { setLines((l) => [...l, { description: '', amount: 0, currency: 'QAR' }]) }
  function removeLine(i: number) { setLines((l) => l.filter((_, idx) => idx !== i)) }
  function updateLine(i: number, k: keyof LandedCostLine, v: string | number) {
    setLines((l) => l.map((line, idx) => idx === i ? { ...line, [k]: v } : line))
  }
  function toggleReceival(id: string) {
    setSelectedReceivalIds((ids) => ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id])
  }

  const total = lines.reduce((s, l) => s + Number(l.amount), 0)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!date) { toast.error('Date is required'); return }
    if (lines.some((l) => !l.description)) { toast.error('All cost lines need a description'); return }
    createLc.mutate(
      {
        description: description || null,
        date,
        currency,
        lines,
        attached_receival_ids: selectedReceivalIds,
        attached_po_ids: [],
      },
      {
        onSuccess: () => {
          toast.success('Landed cost created')
          onOpenChange(false)
          setDescription(''); setDate(''); setCurrency('QAR')
          setLines([{ description: '', amount: 0, currency: 'QAR' }])
          setSelectedReceivalIds([])
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-2xl sm:rounded-lg">
        <DialogHeader><DialogTitle>Create Landed Cost</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1 sm:col-span-2">
              <Label>Description</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Freight, customs fees…" />
            </div>
            <div className="space-y-1">
              <Label>Date *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          {/* Cost Lines */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Cost Lines</p>
            {lines.map((line, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-5">
                  <Input placeholder="Description" value={line.description} onChange={(e) => updateLine(i, 'description', e.target.value)} className="text-sm" />
                </div>
                <div className="col-span-3">
                  <Input type="number" min="0" step="0.01" placeholder="Amount" value={line.amount} onChange={(e) => updateLine(i, 'amount', Number(e.target.value))} className="text-sm" />
                </div>
                <div className="col-span-3">
                  <select value={line.currency} onChange={(e) => updateLine(i, 'currency', e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm">
                    {['QAR', 'USD', 'EUR', 'GBP', 'AED'].map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="col-span-1 flex justify-center">
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeLine(i)} disabled={lines.length === 1} aria-label="Remove line">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <Button type="button" variant="outline" size="sm" onClick={addLine}>
                <Plus className="h-4 w-4 mr-1" /> Add Cost Line
              </Button>
              <p className="text-sm font-semibold">Total: {formatCurrency(total, currency)}</p>
            </div>
          </div>

          <Separator />

          {/* Receival Selector */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Attach Receivals</p>
            {(receivals ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No receivals found</p>
            ) : (
              <div className="max-h-40 overflow-y-auto space-y-1 rounded-md border p-2">
                {(receivals ?? []).map((r) => (
                  <label key={r.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted rounded px-2 py-1">
                    <input
                      type="checkbox"
                      checked={selectedReceivalIds.includes(r.id)}
                      onChange={() => toggleReceival(r.id)}
                      className="h-4 w-4"
                    />
                    <span className="font-mono">{r.receival_number}</span>
                    <span className="text-muted-foreground">— {r.purchase_orders?.supplier_name ?? 'Unknown'} · {formatDate(r.date)}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={createLc.isPending}>
              {createLc.isPending ? 'Creating…' : 'Create Landed Cost'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function LandedCostsPage() {
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [selected, setSelected] = useState<LandedCost | null>(null)

  const { data: landedCosts, isLoading } = useLandedCosts({ search })

  const columns: ColumnDef<LandedCost>[] = [
    {
      accessorKey: 'lc_number',
      header: 'LC #',
      cell: ({ row }) => <span className="font-mono font-medium text-sm">{row.original.lc_number}</span>,
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ row }) => <span className="text-sm">{row.original.description ?? '—'}</span>,
    },
    {
      accessorKey: 'date',
      header: 'Date',
      cell: ({ row }) => <span className="text-sm">{formatDate(row.original.date)}</span>,
    },
    {
      accessorKey: 'total_amount',
      header: 'Total',
      cell: ({ row }) => <span className="text-sm font-medium">{formatCurrency(row.original.total_amount, row.original.currency)}</span>,
    },
    {
      id: 'receivals',
      header: 'Receivals',
      cell: ({ row }) => <span className="text-sm">{row.original.attached_receival_ids?.length ?? 0}</span>,
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.voided_at ? 'destructive' : 'outline'}>
          {row.original.voided_at ? 'Voided' : 'Active'}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="View landed cost" onClick={() => setSelected(row.original)}>
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Landed Costs"
        description="Allocate freight, customs and other costs to received goods"
        action={{ label: '+ Create Landed Cost', onClick: () => setCreateOpen(true) }}
      />

      <SearchInput value={search} onChange={setSearch} placeholder="Search LC number or description…" className="max-w-sm" />

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)}</div>
      ) : (
        <DataTable columns={columns} data={landedCosts ?? []} />
      )}

      <CreateLcDialog open={createOpen} onOpenChange={setCreateOpen} />
      <LcDetailDialog lc={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd D:/MMS && git add "src/app/(dashboard)/purchase/landed-costs/page.tsx"
git commit -m "feat: add Landed Costs page with create dialog, cost lines, receival attachment, void"
```

- [ ] **Step 3: Update PROGRESS.md**

Add to `## ✅ Completed`:
```
- [2026-04-17] **Purchase Operations Task 3: Landed Costs Page** — LC list with DataTable, CreateLcDialog (description/date/cost lines/receival checkboxes), LcDetailDialog (cost lines + attached receivals + item allocations + void action)
```
Update `## 🔄 In Progress` to: `Purchase Operations Task 4: Warehouses Hub`
Commit: `docs: update PROGRESS.md — Purchase Operations Task 3 complete`

---

## Task 4: Warehouses Hub Page Shell + Warehouses + Stock Overview + Movements Tabs

**Files:**
- Create: `src/app/(dashboard)/purchase/warehouses/page.tsx`
- Create: `src/components/purchase/wh/WhWarehousesTab.tsx`
- Create: `src/components/purchase/wh/WhStockOverviewTab.tsx`
- Create: `src/components/purchase/wh/WhMovementsTab.tsx`

- [ ] **Step 1: Create `src/app/(dashboard)/purchase/warehouses/page.tsx`**

```typescript
'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/shared/PageHeader'
import { WhWarehousesTab } from '@/components/purchase/wh/WhWarehousesTab'
import { WhStockOverviewTab } from '@/components/purchase/wh/WhStockOverviewTab'
import { WhMovementsTab } from '@/components/purchase/wh/WhMovementsTab'
import { WhTransfersTab } from '@/components/purchase/wh/WhTransfersTab'
import { WhReceivalsTab } from '@/components/purchase/wh/WhReceivalsTab'
import { WhAdjustmentsTab } from '@/components/purchase/wh/WhAdjustmentsTab'
import { WhInventoryChecksTab } from '@/components/purchase/wh/WhInventoryChecksTab'

export default function WarehousesHubPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Warehouses"
        description="Stock overview, movements, transfers, receivals, adjustments, and inventory checks"
      />
      <Tabs defaultValue="warehouses">
        <TabsList className="overflow-x-auto w-full justify-start flex-nowrap">
          <TabsTrigger value="warehouses">Warehouses</TabsTrigger>
          <TabsTrigger value="stock">Stock</TabsTrigger>
          <TabsTrigger value="movements">Movements</TabsTrigger>
          <TabsTrigger value="transfers">Transfers</TabsTrigger>
          <TabsTrigger value="receivals">Receivals</TabsTrigger>
          <TabsTrigger value="adjustments">Adjustments</TabsTrigger>
          <TabsTrigger value="checks">Inv. Checks</TabsTrigger>
        </TabsList>
        <TabsContent value="warehouses"><WhWarehousesTab /></TabsContent>
        <TabsContent value="stock"><WhStockOverviewTab /></TabsContent>
        <TabsContent value="movements"><WhMovementsTab /></TabsContent>
        <TabsContent value="transfers"><WhTransfersTab /></TabsContent>
        <TabsContent value="receivals"><WhReceivalsTab /></TabsContent>
        <TabsContent value="adjustments"><WhAdjustmentsTab /></TabsContent>
        <TabsContent value="checks"><WhInventoryChecksTab /></TabsContent>
      </Tabs>
    </div>
  )
}
```

- [ ] **Step 2: Create `src/components/purchase/wh/WhWarehousesTab.tsx`**

```typescript
'use client'

import { useWarehouses } from '@/hooks/useWarehouses'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'

const TYPE_CONFIG: Record<string, { label: string; className: string }> = {
  central:      { label: 'Central',  className: 'border-blue-500 text-blue-500' },
  local:        { label: 'Local',    className: 'border-orange-500 text-orange-500' },
  team_vehicle: { label: 'Vehicle',  className: 'border-success text-success' },
}

export function WhWarehousesTab() {
  const { data: warehouses, isLoading } = useWarehouses()

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-lg" />)}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
      {(warehouses ?? []).map((wh: any) => {
        const cfg = TYPE_CONFIG[wh.warehouse_type] ?? { label: wh.warehouse_type, className: '' }
        return (
          <div key={wh.id} className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">{wh.name}</h3>
              <Badge variant="outline" className={cn('text-xs', cfg.className)}>{cfg.label}</Badge>
            </div>
            {wh.location && <p className="text-xs text-muted-foreground">{wh.location}</p>}
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="text-muted-foreground text-xs">Items</div>
                <div className="font-medium">{wh.item_count ?? 0}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Value (QAR)</div>
                <div className="font-medium">{formatCurrency(wh.total_value ?? 0, 'QAR')}</div>
              </div>
            </div>
          </div>
        )
      })}
      {(warehouses ?? []).length === 0 && (
        <div className="col-span-full text-center text-muted-foreground text-sm py-8">No warehouses found</div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create `src/components/purchase/wh/WhStockOverviewTab.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useWarehouses } from '@/hooks/useWarehouses'
import { useWarehouseStock } from '@/hooks/useWarehouseOperations'
import { SearchInput } from '@/components/shared/SearchInput'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency } from '@/lib/utils/formatters'

export function WhStockOverviewTab() {
  const [warehouseId, setWarehouseId] = useState('')
  const [search, setSearch] = useState('')
  const { data: warehouses } = useWarehouses()
  const { data: stock, isLoading } = useWarehouseStock(warehouseId || undefined)

  const filtered = (stock ?? []).filter((item) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      item.item_name.toLowerCase().includes(q) ||
      (item.sku ?? '').toLowerCase().includes(q) ||
      (item.brand ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-4 pt-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <select
          value={warehouseId}
          onChange={(e) => setWarehouseId(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm w-full sm:w-56"
        >
          <option value="">All warehouses (global stock)</option>
          {(warehouses ?? []).map((w: any) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
        <SearchInput value={search} onChange={setSearch} placeholder="Search item, SKU, brand…" className="max-w-sm" />
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="hidden sm:table-cell">Brand</TableHead>
                <TableHead className="hidden md:table-cell">SKU</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="hidden sm:table-cell text-right">Avg Cost</TableHead>
                <TableHead className="text-right">Total Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No stock items found</TableCell>
                </TableRow>
              ) : (
                filtered.map((item) => (
                  <TableRow key={item.brand_variant_id}>
                    <TableCell className="font-medium text-sm">{item.item_name}</TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{item.brand ?? '—'}</TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{item.sku ?? '—'}</TableCell>
                    <TableCell className="text-right font-medium">{item.stock_level}</TableCell>
                    <TableCell className="hidden sm:table-cell text-right text-sm">{formatCurrency(item.average_cost, 'QAR')}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(item.total_value, 'QAR')}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Create `src/components/purchase/wh/WhMovementsTab.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useWarehouses } from '@/hooks/useWarehouses'
import { useStockMovements } from '@/hooks/useWarehouseOperations'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency, formatDateTime } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'

const MOVEMENT_CONFIG: Record<string, { label: string; colorClass: string }> = {
  purchase_receival: { label: 'Purchase Receival', colorClass: 'text-success' },
  sale_delivery:     { label: 'Sale Delivery',     colorClass: 'text-destructive' },
  transfer_in:       { label: 'Transfer In',        colorClass: 'text-success' },
  transfer_out:      { label: 'Transfer Out',       colorClass: 'text-destructive' },
  adjustment:        { label: 'Adjustment',         colorClass: 'text-orange-500' },
  return:            { label: 'Return',             colorClass: 'text-blue-500' },
  sale_return:       { label: 'Sale Return',        colorClass: 'text-blue-500' },
}

export function WhMovementsTab() {
  const [warehouseId, setWarehouseId] = useState('')
  const { data: warehouses } = useWarehouses()
  const { data: movements, isLoading } = useStockMovements({ warehouseId: warehouseId || undefined, limit: 200 })

  return (
    <div className="space-y-4 pt-4">
      <select
        value={warehouseId}
        onChange={(e) => setWarehouseId(e.target.value)}
        className="h-9 rounded-md border border-input bg-background px-3 text-sm w-full sm:w-56"
      >
        <option value="">All warehouses</option>
        {(warehouses ?? []).map((w: any) => (
          <option key={w.id} value={w.id}>{w.name}</option>
        ))}
      </select>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : (movements ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No movements found</p>
      ) : (
        <div className="space-y-1">
          {(movements ?? []).map((m) => {
            const cfg = MOVEMENT_CONFIG[m.movement_type] ?? { label: m.movement_type, colorClass: '' }
            return (
              <div key={m.id} className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{m.item_name}</div>
                  {m.sku && <div className="text-xs text-muted-foreground">{m.sku}</div>}
                </div>
                <Badge variant="outline" className={cn('text-xs shrink-0', cfg.colorClass)}>
                  {cfg.label}
                </Badge>
                <span className={cn('font-semibold shrink-0 tabular-nums', m.qty > 0 ? 'text-success' : 'text-destructive')}>
                  {m.qty > 0 ? '+' : ''}{m.qty}
                </span>
                {m.unit_cost > 0 && (
                  <span className="text-xs text-muted-foreground hidden md:block shrink-0">
                    @ {formatCurrency(m.unit_cost, 'QAR')}
                  </span>
                )}
                <span className="text-xs text-muted-foreground hidden sm:block shrink-0">
                  {formatDateTime(m.created_at)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

> **Troubleshooting:** If `formatDateTime` is not exported from formatters, use `formatDate` instead or inline:
> `const formatDateTime = (ts: string) => new Date(ts).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })`

- [ ] **Step 5: TypeScript check + commit**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | grep -v node_modules | head -40
cd D:/MMS && git add \
  "src/app/(dashboard)/purchase/warehouses/page.tsx" \
  src/components/purchase/wh/WhWarehousesTab.tsx \
  src/components/purchase/wh/WhStockOverviewTab.tsx \
  src/components/purchase/wh/WhMovementsTab.tsx
git commit -m "feat: add Warehouses Hub page shell with Warehouses, Stock Overview, Movements tabs"
```

- [ ] **Step 6: Update PROGRESS.md**

Add to `## ✅ Completed`:
```
- [2026-04-17] **Purchase Operations Task 4: Warehouses Hub Shell** — 7-tab hub page, WhWarehousesTab (card grid with type badge/item count/value), WhStockOverviewTab (warehouse selector + stock table), WhMovementsTab (movement log with type badges + qty colors)
```
Update `## 🔄 In Progress` to: `Purchase Operations Task 5: Transfers + Receivals tabs`
Commit: `docs: update PROGRESS.md — Purchase Operations Task 4 complete`

---

## Task 5: Transfers Tab + Transfer Dialog + Receivals Tab

**Files:**
- Create: `src/components/purchase/wh/WhTransferDialog.tsx`
- Create: `src/components/purchase/wh/WhTransfersTab.tsx`
- Create: `src/components/purchase/wh/WhReceivalsTab.tsx`

- [ ] **Step 1: Create `src/components/purchase/wh/WhTransferDialog.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useWarehouses } from '@/hooks/useWarehouses'
import { useCreateTransfer } from '@/hooks/useWarehouseOperations'
import type { TransferItem } from '@/hooks/useWarehouseOperations'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function WhTransferDialog({ open, onOpenChange }: Props) {
  const { data: warehouses } = useWarehouses()
  const createTransfer = useCreateTransfer()
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<TransferItem[]>([
    { brand_variant_id: '', item_name: '', sku: null, qty: 1, unit_cost: 0 },
  ])

  function addItem() {
    setItems([...items, { brand_variant_id: '', item_name: '', sku: null, qty: 1, unit_cost: 0 }])
  }

  function updateItem(idx: number, patch: Partial<TransferItem>) {
    setItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }

  function removeItem(idx: number) {
    if (items.length === 1) return
    setItems(items.filter((_, i) => i !== idx))
  }

  function reset() {
    setFromId(''); setToId(''); setNotes('')
    setItems([{ brand_variant_id: '', item_name: '', sku: null, qty: 1, unit_cost: 0 }])
  }

  function handleSubmit() {
    if (!fromId || !toId) { toast.error('Select source and destination warehouses'); return }
    if (fromId === toId) { toast.error('Source and destination must be different'); return }
    const validItems = items.filter((i) => i.item_name.trim() && i.qty > 0)
    if (validItems.length === 0) { toast.error('Add at least one item with name and qty > 0'); return }

    createTransfer.mutate(
      { from_warehouse_id: fromId, to_warehouse_id: toId, date, items: validItems, notes: notes || null },
      {
        onSuccess: () => { toast.success('Transfer created'); onOpenChange(false); reset() },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-2xl sm:rounded-lg max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>Create Transfer</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="tf-from">From Warehouse *</Label>
              <select
                id="tf-from"
                value={fromId}
                onChange={(e) => setFromId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="">Select…</option>
                {(warehouses ?? []).map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="tf-to">To Warehouse *</Label>
              <select
                id="tf-to"
                value={toId}
                onChange={(e) => setToId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
              >
                <option value="">Select…</option>
                {(warehouses ?? []).map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1 w-36">
            <Label htmlFor="tf-date">Date *</Label>
            <Input id="tf-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Items</Label>
            {items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center rounded-md border p-2">
                <div className="col-span-12 sm:col-span-5">
                  <Input
                    placeholder="Item name *"
                    value={item.item_name}
                    onChange={(e) => updateItem(idx, { item_name: e.target.value })}
                    className="text-xs"
                  />
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <Input
                    placeholder="SKU"
                    value={item.sku ?? ''}
                    onChange={(e) => updateItem(idx, { sku: e.target.value || null })}
                    className="text-xs"
                  />
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <Input
                    type="number"
                    min="1"
                    placeholder="Qty"
                    value={item.qty}
                    onChange={(e) => updateItem(idx, { qty: Math.max(1, Number(e.target.value)) })}
                    className="text-xs"
                  />
                </div>
                <div className="col-span-3 sm:col-span-2">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Cost"
                    value={item.unit_cost}
                    onChange={(e) => updateItem(idx, { unit_cost: Number(e.target.value) })}
                    className="text-xs"
                  />
                </div>
                <div className="col-span-1 flex justify-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => removeItem(idx)}
                    disabled={items.length === 1}
                  >
                    ✕
                  </Button>
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addItem}>
              + Add Item
            </Button>
          </div>

          <div className="space-y-1">
            <Label htmlFor="tf-notes">Notes</Label>
            <Input
              id="tf-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional…"
            />
          </div>
        </div>

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={createTransfer.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createTransfer.isPending}>
            {createTransfer.isPending ? 'Creating…' : 'Create Transfer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Create `src/components/purchase/wh/WhTransfersTab.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { WhTransferDialog } from './WhTransferDialog'
import { useWarehouseTransfers, useApproveTransfer, useRejectTransfer } from '@/hooks/useWarehouseOperations'
import { formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending:          { label: 'Pending',          className: 'border-muted-foreground/40 text-muted-foreground' },
  in_transit:       { label: 'In Transit',        className: 'border-blue-500 text-blue-500' },
  pending_approval: { label: 'Pending Approval',  className: 'border-warning text-warning' },
  approved:         { label: 'Approved',           className: 'border-success text-success' },
  rejected:         { label: 'Rejected',           className: 'border-destructive text-destructive' },
}

export function WhTransfersTab() {
  const [createOpen, setCreateOpen] = useState(false)
  const { data: transfers, isLoading } = useWarehouseTransfers()
  const approve = useApproveTransfer()
  const reject = useRejectTransfer()

  function handleApprove(id: string) {
    approve.mutate(
      { id, approvedByName: 'Manager' }, // TODO: replace with supabase.auth.getUser() name
      {
        onSuccess: () => toast.success('Transfer approved'),
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleReject(id: string) {
    reject.mutate(id, {
      onSuccess: () => toast.success('Transfer rejected'),
      onError: (err) => toast.error(err.message),
    })
  }

  return (
    <div className="space-y-4 pt-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreateOpen(true)}>+ Create Transfer</Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
        </div>
      ) : (transfers ?? []).length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
          No transfers found
        </div>
      ) : (
        <div className="space-y-3">
          {(transfers ?? []).map((t) => {
            const cfg = STATUS_CONFIG[t.status] ?? { label: t.status, className: '' }
            return (
              <div key={t.id} className="rounded-lg border p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-sm">{t.transfer_number}</span>
                    <Badge variant="outline" className={cn('text-xs', cfg.className)}>{cfg.label}</Badge>
                  </div>
                  {t.status === 'pending_approval' && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive border-destructive/50 hover:bg-destructive/5"
                        onClick={() => handleReject(t.id)}
                        disabled={reject.isPending}
                      >
                        Reject
                      </Button>
                      <Button size="sm" onClick={() => handleApprove(t.id)} disabled={approve.isPending}>
                        Approve
                      </Button>
                    </div>
                  )}
                </div>
                <div className="text-sm">
                  {t.from_warehouse?.name ?? 'Unknown'} → {t.to_warehouse?.name ?? 'Unknown'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDate(t.date)} · {t.items.length} item(s)
                  {t.created_by_name && ` · by ${t.created_by_name}`}
                </div>
                {t.items.length > 0 && (
                  <div className="text-xs text-muted-foreground truncate">
                    Items: {t.items.slice(0, 3).map((i) => i.item_name).join(', ')}
                    {t.items.length > 3 ? `… +${t.items.length - 3} more` : ''}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <WhTransferDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
```

- [ ] **Step 3: Create `src/components/purchase/wh/WhReceivalsTab.tsx`**

This tab queries `receivals` directly (not via `usePurchaseOrders`) since it needs all receivals across warehouses with optional warehouse filter.

```typescript
'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useWarehouses } from '@/hooks/useWarehouses'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/lib/utils/formatters'

function useAllReceivalsHub(warehouseId?: string) {
  return useQuery({
    queryKey: ['receivals_hub', { warehouseId }],
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('receivals')
        .select('*, purchase_orders(po_number, supplier_name), receival_items(item_name, qty_received, sku)')
        .order('created_at', { ascending: false })
        .limit(200)
      if (warehouseId) q = q.eq('warehouse_id', warehouseId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as any[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function WhReceivalsTab() {
  const [warehouseId, setWarehouseId] = useState('')
  const { data: warehouses } = useWarehouses()
  const { data: receivals, isLoading } = useAllReceivalsHub(warehouseId || undefined)

  return (
    <div className="space-y-4 pt-4">
      <select
        value={warehouseId}
        onChange={(e) => setWarehouseId(e.target.value)}
        className="h-9 rounded-md border border-input bg-background px-3 text-sm w-full sm:w-56"
      >
        <option value="">All warehouses</option>
        {(warehouses ?? []).map((w: any) => (
          <option key={w.id} value={w.id}>{w.name}</option>
        ))}
      </select>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
        </div>
      ) : (receivals ?? []).length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
          No receivals found
        </div>
      ) : (
        <div className="space-y-3">
          {(receivals ?? []).map((r) => (
            <div key={r.id} className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-semibold text-sm">{r.receival_number}</span>
                <Badge variant="outline" className="text-xs">{r.status}</Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                {formatDate(r.date)}
                {r.purchase_orders?.po_number && ` · PO: ${r.purchase_orders.po_number}`}
                {r.purchase_orders?.supplier_name && ` · ${r.purchase_orders.supplier_name}`}
              </div>
              {r.receival_items && r.receival_items.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  {r.receival_items.length} item(s): {(r.receival_items as any[]).slice(0, 3).map((i: any) => i.item_name).join(', ')}
                  {r.receival_items.length > 3 ? `… +${r.receival_items.length - 3} more` : ''}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: TypeScript check + commit**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | grep -v node_modules | head -40
cd D:/MMS && git add \
  src/components/purchase/wh/WhTransferDialog.tsx \
  src/components/purchase/wh/WhTransfersTab.tsx \
  src/components/purchase/wh/WhReceivalsTab.tsx
git commit -m "feat: add Warehouses Hub transfers tab, transfer create dialog, receivals tab"
```

- [ ] **Step 5: Update PROGRESS.md**

Add to `## ✅ Completed`:
```
- [2026-04-17] **Purchase Operations Task 5: Transfers + Receivals Tabs** — WhTransfersTab (list with approve/reject actions for pending_approval transfers), WhTransferDialog (from/to warehouse, date, dynamic item rows), WhReceivalsTab (all-warehouse receival list with PO context)
```
Update `## 🔄 In Progress` to: `Purchase Operations Task 6: Adjustments + Inventory Checks tabs`
Commit: `docs: update PROGRESS.md — Purchase Operations Task 5 complete`

---

## Task 6: Adjustments Tab + Adjustment Dialog + Inventory Checks Tab + Check Dialog

**Files:**
- Create: `src/components/purchase/wh/WhAdjustmentDialog.tsx`
- Create: `src/components/purchase/wh/WhAdjustmentsTab.tsx`
- Create: `src/components/purchase/wh/WhInventoryCheckDialog.tsx`
- Create: `src/components/purchase/wh/WhInventoryChecksTab.tsx`

- [ ] **Step 1: Create `src/components/purchase/wh/WhAdjustmentDialog.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useWarehouses } from '@/hooks/useWarehouses'
import { useCreateStockAdjustment } from '@/hooks/useWarehouseOperations'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function WhAdjustmentDialog({ open, onOpenChange }: Props) {
  const { data: warehouses } = useWarehouses()
  const createAdjustment = useCreateStockAdjustment()
  const [warehouseId, setWarehouseId] = useState('')
  const [brandVariantId, setBrandVariantId] = useState('')
  const [adjustmentType, setAdjustmentType] = useState<'increase' | 'decrease' | 'set'>('increase')
  const [qty, setQty] = useState(0)
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')

  function reset() {
    setWarehouseId(''); setBrandVariantId(''); setQty(0); setReason(''); setNotes('')
  }

  function handleSubmit() {
    if (!warehouseId) { toast.error('Select a warehouse'); return }
    if (!brandVariantId.trim()) { toast.error('Enter a Brand Variant ID'); return }
    if (!reason.trim()) { toast.error('Reason is required'); return }

    createAdjustment.mutate(
      {
        warehouse_id: warehouseId,
        brand_variant_id: brandVariantId.trim(),
        adjustment_type: adjustmentType,
        qty,
        reason,
        notes: notes || null,
      },
      {
        onSuccess: () => {
          toast.success('Adjustment submitted for approval')
          onOpenChange(false)
          reset()
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-md sm:rounded-lg">
        <DialogHeader>
          <DialogTitle>New Stock Adjustment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="adj-wh">Warehouse *</Label>
            <select
              id="adj-wh"
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
            >
              <option value="">Select warehouse…</option>
              {(warehouses ?? []).map((w: any) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="adj-bv">Brand Variant ID *</Label>
            <Input
              id="adj-bv"
              value={brandVariantId}
              onChange={(e) => setBrandVariantId(e.target.value)}
              placeholder="UUID of the brand variant"
            />
          </div>
          <div className="space-y-1">
            <Label>Adjustment Type *</Label>
            <div className="flex gap-2">
              {(['increase', 'decrease', 'set'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setAdjustmentType(t)}
                  className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium capitalize transition-colors ${
                    adjustmentType === t ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="adj-qty">Quantity *</Label>
            <Input
              id="adj-qty"
              type="number"
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="adj-reason">Reason *</Label>
            <Input
              id="adj-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Physical count discrepancy"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="adj-notes">Notes</Label>
            <Textarea
              id="adj-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={createAdjustment.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createAdjustment.isPending}>
            {createAdjustment.isPending ? 'Submitting…' : 'Submit for Approval'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Create `src/components/purchase/wh/WhAdjustmentsTab.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { WhAdjustmentDialog } from './WhAdjustmentDialog'
import { useStockAdjustments, useApproveStockAdjustment } from '@/hooks/useWarehouseOperations'
import { useWarehouses } from '@/hooks/useWarehouses'
import { formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'

export function WhAdjustmentsTab() {
  const [warehouseId, setWarehouseId] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const { data: warehouses } = useWarehouses()
  const { data: adjustments, isLoading } = useStockAdjustments({ warehouseId: warehouseId || undefined })
  const approve = useApproveStockAdjustment()

  function handleApprove(id: string) {
    approve.mutate(
      { id, approvedByName: 'Manager' }, // TODO: use supabase.auth.getUser() email
      {
        onSuccess: () => toast.success('Adjustment approved'),
        onError: (err) => toast.error(err.message),
      }
    )
  }

  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <select
          value={warehouseId}
          onChange={(e) => setWarehouseId(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm w-full sm:w-56"
        >
          <option value="">All warehouses</option>
          {(warehouses ?? []).map((w: any) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
        <Button size="sm" onClick={() => setCreateOpen(true)}>+ New Adjustment</Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
        </div>
      ) : (adjustments ?? []).length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
          No adjustments found
        </div>
      ) : (
        <div className="space-y-3">
          {(adjustments ?? []).map((adj) => (
            <div key={adj.id} className="rounded-lg border p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium capitalize">{adj.adjustment_type}</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-xs',
                      adj.status === 'approved'
                        ? 'border-success text-success'
                        : adj.status === 'rejected'
                        ? 'border-destructive text-destructive'
                        : 'border-warning text-warning'
                    )}
                  >
                    {adj.status}
                  </Badge>
                </div>
                {adj.status === 'pending_approval' && (
                  <Button size="sm" onClick={() => handleApprove(adj.id)} disabled={approve.isPending}>
                    Approve
                  </Button>
                )}
              </div>
              <div className="text-sm">
                Qty:{' '}
                <span className={cn('font-semibold', adj.qty > 0 ? 'text-success' : 'text-destructive')}>
                  {adj.qty > 0 ? '+' : ''}{adj.qty}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                {formatDate(adj.created_at)} · {adj.reason}
                {adj.requested_by_name && ` · requested by ${adj.requested_by_name}`}
              </div>
            </div>
          ))}
        </div>
      )}

      <WhAdjustmentDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
```

- [ ] **Step 3: Create `src/components/purchase/wh/WhInventoryCheckDialog.tsx`**

This dialog handles both "create new check" mode (when `checkId` is null) and "view/count existing check" mode (when `checkId` is set).

```typescript
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useWarehouses } from '@/hooks/useWarehouses'
import {
  useInventoryCheck,
  useCreateInventoryCheck,
  useUpdateInventoryCheckItem,
  useSubmitInventoryCheck,
  useReviewInventoryCheck,
} from '@/hooks/useWarehouseOperations'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  checkId: string | null // null = create mode
}

export function WhInventoryCheckDialog({ open, onOpenChange, checkId }: Props) {
  const { data: warehouses } = useWarehouses()
  const createCheck = useCreateInventoryCheck()
  const updateItem = useUpdateInventoryCheckItem()
  const submitCheck = useSubmitInventoryCheck()
  const reviewCheck = useReviewInventoryCheck()
  const { data: check, isLoading: checkLoading } = useInventoryCheck(checkId ?? '')

  const [warehouseId, setWarehouseId] = useState('')
  const [notes, setNotes] = useState('')

  const isCreateMode = !checkId

  function handleCreate() {
    const wh = (warehouses ?? []).find((w: any) => w.id === warehouseId) as any
    if (!wh) { toast.error('Select a warehouse'); return }
    createCheck.mutate(
      { warehouseId, warehouseName: wh.name, notes: notes || null },
      {
        onSuccess: () => {
          toast.success('Inventory check created')
          onOpenChange(false)
          setWarehouseId(''); setNotes('')
        },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleUpdateItem(itemId: string, countedQty: number) {
    updateItem.mutate(
      { id: itemId, countedQty },
      { onError: (err) => toast.error(err.message) }
    )
  }

  function handleSubmit() {
    if (!checkId) return
    submitCheck.mutate(
      { id: checkId, submittedByName: 'Warehouse Staff' }, // TODO: use auth user name
      {
        onSuccess: () => { toast.success('Check submitted for review'); onOpenChange(false) },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  function handleReview() {
    if (!checkId) return
    reviewCheck.mutate(
      { id: checkId, reviewedByName: 'Manager' }, // TODO: use auth user name
      {
        onSuccess: () => { toast.success('Check reviewed'); onOpenChange(false) },
        onError: (err) => toast.error(err.message),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-2xl sm:rounded-lg max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {isCreateMode ? 'New Inventory Check' : `Check ${check?.check_number ?? '…'}`}
          </DialogTitle>
        </DialogHeader>

        {isCreateMode ? (
          <>
            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <Label htmlFor="chk-wh">Warehouse *</Label>
                <select
                  id="chk-wh"
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                >
                  <option value="">Select warehouse…</option>
                  {(warehouses ?? []).map((w: any) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="chk-notes">Notes</Label>
                <Input
                  id="chk-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional notes…"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={createCheck.isPending}>
                {createCheck.isPending ? 'Creating…' : 'Create Check'}
              </Button>
            </DialogFooter>
          </>
        ) : checkLoading ? (
          <div className="space-y-2 py-4">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : check ? (
          <>
            <div className="flex-1 overflow-y-auto space-y-3 py-2">
              <div className="flex items-center gap-3">
                <Badge variant="outline">{check.status}</Badge>
                <span className="text-sm text-muted-foreground">{check.warehouse_name}</span>
              </div>
              {(check.items ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No items in this check — items are added automatically based on current stock
                </p>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-3">
                    <div className="col-span-5">Item</div>
                    <div className="col-span-2 text-right">System</div>
                    <div className="col-span-3 text-right">Counted</div>
                    <div className="col-span-2 text-right">Variance</div>
                  </div>
                  {(check.items ?? []).map((item) => (
                    <div
                      key={item.id}
                      className={cn(
                        'grid grid-cols-12 gap-2 items-center rounded-md border px-3 py-2',
                        item.variance !== null && item.variance !== 0 && 'border-warning/50 bg-warning/5'
                      )}
                    >
                      <div className="col-span-5 min-w-0">
                        <div className="text-sm font-medium truncate">{item.item_name}</div>
                        {item.sku && <div className="text-xs text-muted-foreground">{item.sku}</div>}
                      </div>
                      <div className="col-span-2 text-right text-sm font-medium">{item.system_qty}</div>
                      <div className="col-span-3">
                        <Input
                          type="number"
                          min="0"
                          defaultValue={item.counted_qty ?? ''}
                          onBlur={(e) => {
                            const val = Number(e.target.value)
                            if (val !== item.counted_qty) handleUpdateItem(item.id, val)
                          }}
                          className="h-8 text-right text-sm"
                          disabled={check.status !== 'draft'}
                          placeholder="—"
                        />
                      </div>
                      <div className={cn(
                        'col-span-2 text-right text-sm font-semibold',
                        item.variance === null ? 'text-muted-foreground' :
                        item.variance === 0 ? 'text-muted-foreground' :
                        item.variance > 0 ? 'text-success' : 'text-destructive'
                      )}>
                        {item.variance === null ? '—' : item.variance > 0 ? `+${item.variance}` : item.variance}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {check.review_notes && (
                <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                  Review notes: {check.review_notes}
                </div>
              )}
            </div>
            <DialogFooter className="shrink-0">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
              {check.status === 'draft' && (
                <Button onClick={handleSubmit} disabled={submitCheck.isPending}>
                  {submitCheck.isPending ? 'Submitting…' : 'Submit for Review'}
                </Button>
              )}
              {check.status === 'submitted' && (
                <Button onClick={handleReview} disabled={reviewCheck.isPending}>
                  {reviewCheck.isPending ? 'Reviewing…' : 'Mark as Reviewed'}
                </Button>
              )}
            </DialogFooter>
          </>
        ) : (
          <div className="py-8 text-center text-muted-foreground text-sm">Inventory check not found</div>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 4: Create `src/components/purchase/wh/WhInventoryChecksTab.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { WhInventoryCheckDialog } from './WhInventoryCheckDialog'
import { useInventoryChecks } from '@/hooks/useWarehouseOperations'
import { useWarehouses } from '@/hooks/useWarehouses'
import { formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  draft:     { label: 'Draft',     className: 'border-muted-foreground/40 text-muted-foreground' },
  submitted: { label: 'Submitted', className: 'border-warning text-warning' },
  reviewed:  { label: 'Reviewed',  className: 'border-success text-success' },
}

export function WhInventoryChecksTab() {
  const [warehouseId, setWarehouseId] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedCheckId, setSelectedCheckId] = useState<string | null>(null)
  const { data: warehouses } = useWarehouses()
  const { data: checks, isLoading } = useInventoryChecks({ warehouseId: warehouseId || undefined })

  const dialogOpen = createOpen || !!selectedCheckId
  const dialogCheckId = createOpen ? null : selectedCheckId

  function handleDialogClose(open: boolean) {
    if (!open) { setCreateOpen(false); setSelectedCheckId(null) }
  }

  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <select
          value={warehouseId}
          onChange={(e) => setWarehouseId(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm w-full sm:w-56"
        >
          <option value="">All warehouses</option>
          {(warehouses ?? []).map((w: any) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
        <Button size="sm" onClick={() => setCreateOpen(true)}>+ New Inventory Check</Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
        </div>
      ) : (checks ?? []).length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
          No inventory checks found
        </div>
      ) : (
        <div className="space-y-3">
          {(checks ?? []).map((check) => {
            const cfg = STATUS_CONFIG[check.status] ?? { label: check.status, className: '' }
            return (
              <div key={check.id} className="rounded-lg border p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="font-mono font-semibold text-sm hover:underline"
                      onClick={() => setSelectedCheckId(check.id)}
                    >
                      {check.check_number}
                    </button>
                    <Badge variant="outline" className={cn('text-xs', cfg.className)}>{cfg.label}</Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-8 h-8"
                    onClick={() => setSelectedCheckId(check.id)}
                  >
                    {check.status === 'draft' ? 'Count' : 'View'}
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground">
                  {check.warehouse_name} · {formatDate(check.created_at)}
                  {check.submitted_by_name && ` · submitted by ${check.submitted_by_name}`}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <WhInventoryCheckDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        checkId={dialogCheckId}
      />
    </div>
  )
}
```

- [ ] **Step 5: TypeScript check + commit**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | grep -v node_modules | head -40
cd D:/MMS && git add \
  src/components/purchase/wh/WhAdjustmentDialog.tsx \
  src/components/purchase/wh/WhAdjustmentsTab.tsx \
  src/components/purchase/wh/WhInventoryCheckDialog.tsx \
  src/components/purchase/wh/WhInventoryChecksTab.tsx
git commit -m "feat: add Warehouses Hub adjustments tab, adjustment dialog, inventory checks tab and dialog"
```

- [ ] **Step 6: Update PROGRESS.md**

Add to `## ✅ Completed`:
```
- [2026-04-17] **Purchase Operations Task 6: Adjustments + Inventory Checks Tabs** — WhAdjustmentsTab (list with approve action), WhAdjustmentDialog (warehouse/variant/type/qty/reason form), WhInventoryChecksTab (list with create+view), WhInventoryCheckDialog (dual-mode: create new or count items with variance display + submit/review workflow)
```
Update `## 🔄 In Progress` to: `Purchase Operations Task 7: Dead Stock Report`
Commit: `docs: update PROGRESS.md — Purchase Operations Task 6 complete`

---

## Task 7: Dead Stock Report Page

**Files:**
- Create: `src/app/(dashboard)/purchase/dead-stock/page.tsx`

- [ ] **Step 1: Create `src/app/(dashboard)/purchase/dead-stock/page.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { SearchInput } from '@/components/shared/SearchInput'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useDeadStockReport, type DeadStockStatus } from '@/hooks/useDeadStock'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'

const STATUS_CONFIG: Record<DeadStockStatus, { label: string; badgeClass: string; cardClass: string; days: string }> = {
  active:      { label: 'Active',       badgeClass: 'border-success text-success',           cardClass: 'border-success/30 bg-success/5',     days: '≤ 30 days' },
  slow_moving: { label: 'Slow Moving',  badgeClass: 'border-warning text-warning',           cardClass: 'border-warning/30 bg-warning/5',     days: '31–90 days' },
  at_risk:     { label: 'At Risk',      badgeClass: 'border-orange-500 text-orange-500',     cardClass: 'border-orange-300 bg-orange-50',     days: '91–180 days' },
  dead:        { label: 'Dead Stock',   badgeClass: 'border-destructive text-destructive',   cardClass: 'border-destructive/30 bg-destructive/5', days: '> 180 days' },
}

const ALL_STATUSES: DeadStockStatus[] = ['active', 'slow_moving', 'at_risk', 'dead']

export default function DeadStockPage() {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<DeadStockStatus | ''>('')
  const [sortBy, setSortBy] = useState<'days' | 'value'>('days')

  const { data: items, isLoading } = useDeadStockReport({
    search,
    status: statusFilter || undefined,
  })

  const sorted = [...(items ?? [])].sort((a, b) =>
    sortBy === 'days' ? b.days_idle - a.days_idle : b.total_value - a.total_value
  )

  const summary = ALL_STATUSES.map((s) => {
    const filtered = (items ?? []).filter((i) => i.status === s)
    return {
      status: s,
      count: filtered.length,
      value: filtered.reduce((sum, i) => sum + i.total_value, 0),
    }
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dead Stock Report"
        description="Identify slow-moving and stagnant inventory to take action before value is lost"
      />

      {/* Summary cards — clickable filters */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {summary.map(({ status, count, value }) => {
          const cfg = STATUS_CONFIG[status]
          return (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(statusFilter === status ? '' : status)}
              className={cn(
                'rounded-lg border p-4 text-left transition-colors hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary',
                cfg.cardClass,
                statusFilter === status && 'ring-2 ring-primary'
              )}
            >
              <div className="text-xs text-muted-foreground mb-1">{cfg.label}</div>
              <div className="text-xs text-muted-foreground mb-2 opacity-70">{cfg.days}</div>
              <div className="text-2xl font-bold">{count}</div>
              <div className="text-xs text-muted-foreground mt-1">{formatCurrency(value, 'QAR')}</div>
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center flex-wrap">
        <SearchInput value={search} onChange={setSearch} placeholder="Search item, SKU, brand…" className="max-w-sm" />
        <div className="flex gap-2">
          {(['days', 'value'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSortBy(s)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                sortBy === s ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'
              )}
            >
              Sort: {s === 'days' ? 'Days Idle' : 'Value'}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
          No dead stock items found
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="hidden sm:table-cell">Brand</TableHead>
                <TableHead className="hidden md:table-cell">SKU</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="hidden sm:table-cell text-right">Avg Cost</TableHead>
                <TableHead className="text-right">Value (QAR)</TableHead>
                <TableHead className="hidden md:table-cell">Last Movement</TableHead>
                <TableHead className="text-right">Days Idle</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((item) => {
                const cfg = STATUS_CONFIG[item.status]
                return (
                  <TableRow key={item.brand_variant_id}>
                    <TableCell className="font-medium text-sm">{item.item_name}</TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{item.brand ?? '—'}</TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{item.sku ?? '—'}</TableCell>
                    <TableCell className="text-right font-medium">{item.stock_level}</TableCell>
                    <TableCell className="hidden sm:table-cell text-right text-sm">{formatCurrency(item.average_cost, 'QAR')}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(item.total_value, 'QAR')}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {item.last_movement_date ? formatDate(item.last_movement_date) : 'Never'}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {item.days_idle === 999 ? '∞' : item.days_idle}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn('text-xs', cfg.badgeClass)}>
                        {cfg.label}
                      </Badge>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check + commit**

```bash
cd D:/MMS && npx tsc --noEmit 2>&1 | grep -v node_modules | head -40
cd D:/MMS && git add "src/app/(dashboard)/purchase/dead-stock/page.tsx"
git commit -m "feat: add Dead Stock Report page with 4-category summary cards, sort by days/value, DataTable"
```

- [ ] **Step 3: Update PROGRESS.md**

Add to `## ✅ Completed`:
```
- [2026-04-17] **Purchase Operations Task 7: Dead Stock Report** — 4-category summary cards (Active/Slow/At-Risk/Dead) with click-to-filter, sort by days idle or value, full table with last movement date
```
Update `## 🔄 In Progress` to: `Purchase Operations Task 8: Integration Test`
Commit: `docs: update PROGRESS.md — Purchase Operations Task 7 complete`

---

## Task 8: Integration Test + PROGRESS.md Final

- [ ] **Step 1: TypeScript check (full)**

```bash
cd D:/MMS && npx tsc --noEmit --pretty 2>&1 | grep -v node_modules | head -60
```

Fix any errors. Cast with `(supabase as any)` for stale types. If `formatDateTime` is missing from formatters, either add it or use `new Date(ts).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })` inline in `WhMovementsTab`.

- [ ] **Step 2: Run tests**

```bash
cd D:/MMS && npm run test:run 2>&1 | tail -20
```

Expected: all 21 tests pass. If any fail, investigate and fix.

- [ ] **Step 3: Run build**

```bash
cd D:/MMS && npm run build 2>&1 | tail -60
```

Expected build succeeds. Look for these routes in the output:
- `/purchase/shipments`
- `/purchase/landed-costs`
- `/purchase/warehouses`
- `/purchase/dead-stock`

Fix any build errors before proceeding.

- [ ] **Step 4: Final PROGRESS.md update**

Read `D:/MMS/PROGRESS.md`, then make these changes:

1. In **`## Implementation Plans`** table, update the plan row for purchase-operations to **DONE**:
   ```
   | `docs/superpowers/plans/2026-04-17-mms-purchase-operations.md` | **DONE** | Shipments, Landed Costs, Warehouses Hub (7 tabs), Dead Stock Report |
   ```

2. In **`## ✅ Completed`**, add after the Task 7 entry:
   ```
   - [2026-04-17] **Purchase Operations plan: COMPLETE** — All 8 tasks done. 4 pages, 4 hooks, 9 warehouse tab components, full operations coverage (shipments, landed costs, stock overview, movements, transfers, receivals, adjustments, inventory checks, dead stock).
   ```

3. Change **`## 🔄 In Progress`** to:
   ```
   ## 🔄 In Progress

   - Writing CSV Import plan (bulk import for suppliers, inventory items, customers, purchase orders, sale orders)
   ```

4. Change **`## ⏳ Not Started`** to:
   ```
   ## ⏳ Not Started

   - CSV Import tool (5 entity types)
   ```

- [ ] **Step 5: Commit**

```bash
cd D:/MMS && git add PROGRESS.md
git commit -m "docs: mark Purchase Operations plan complete — all 8 tasks done"
```
