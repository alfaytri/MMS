# Inventory Tab — Full Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `InventoryTab.tsx` into a full 5-tab inventory management UI (Products, Spare Parts, Consumables, Tools & Assets, Service Links) with a 4-level expandable tree, ATP stock display, Command/Combobox service linking, FIFO layers panel with skeleton, and `?subtab=` URL deep-link sync.

**Architecture:** Bottom-up build — migration → hooks → leaf components → row components → list views → dialogs → shell. Each row component owns its own expand state (prevents full-list re-renders). Data fetching is lazy per expanded row. No lifted Set state in parent list views.

**Tech Stack:** Next.js 15 App Router, TypeScript, TanStack Query v5, shadcn/ui (Command, Tooltip, Dialog, Badge, Skeleton), Tailwind CSS, Supabase browser client

---

## Real Schema (verified from migrations)

```
inventory_categories:  id, name_en, name_ar, sku, type (enum), created_at, updated_at
inventory_items:       id, category_id, name_en, name_ar, sku, unit, cost_price, total_stock, linked_services_count
inventory_brand_variants: id, item_id, brand (TEXT), code, selling_price, average_cost, stock_level, reserved_qty, incoming
fifo_cost_layers:      id, brand_variant_id, receival_number, date, qty, unit_cost, landed_cost_per_unit, total_unit_cost, remaining_qty
tool_asset_items:      id, category_id, name_en, name_ar
tool_asset_units:      id, item_id, serial_number, brand, status, condition, expiry, assigned_to
service_inventory:     id, service_id, brand_variant_id, qty_per_service, notes
inventory_type enum:   'products' | 'spare-parts' | 'consumables' | 'tools'
```

**Columns added by Task 1 migration:** `status`, `sort_order` on categories/items/variants; `reorder_point` on variants.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/20260425000100_inventory_tab_columns.sql` | Create | Add status/sort_order/reorder_point to categories, items, variants |
| `src/hooks/useInventory.ts` | Modify | Add 14 new hooks + FifoLayer / ToolAsset / ToolUnit types |
| `src/components/services/inventory/FifoLayersTable.tsx` | Create | Level 4 read-only FIFO panel with 3-row skeleton |
| `src/components/services/inventory/BrandVariantEditDialog.tsx` | Create | Create/edit brand variant (brand = text input) |
| `src/components/services/inventory/BrandVariantRow.tsx` | Create | Level 3: ATP badge + tooltip + FIFO expand |
| `src/components/services/inventory/CategoryEditDialog.tsx` | Create | Create/edit/archive category |
| `src/components/services/inventory/ItemEditDialog.tsx` | Create | Create/edit/archive item |
| `src/components/services/inventory/ItemRow.tsx` | Create | Level 2: per-component expand, owns brand variants |
| `src/components/services/inventory/CategoryRow.tsx` | Create | Level 1: per-component expand, owns items |
| `src/components/services/inventory/ItemsListView.tsx` | Create | Tree shell for the 3 product-type tabs |
| `src/components/services/inventory/ToolAssetEditDialog.tsx` | Create | Create/edit tool item; create/edit tool unit |
| `src/components/services/inventory/ToolsAssetsView.tsx` | Create | Two-level list: tool_asset_items → tool_asset_units |
| `src/components/services/inventory/ServiceLinksView.tsx` | Create | Brand-variant-level service linking with Command/Combobox |
| `src/components/services/InventoryTab.tsx` | Rewrite | 5-tab shell + `?subtab=` URL sync |

---

## Task 1: DB Migration — Add Missing Columns

**Files:**
- Create: `supabase/migrations/20260425000100_inventory_tab_columns.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260425000100_inventory_tab_columns.sql

-- inventory_categories
ALTER TABLE inventory_categories
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;

-- inventory_items
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0;

-- inventory_brand_variants
ALTER TABLE inventory_brand_variants
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS sort_order INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reorder_point INT NOT NULL DEFAULT 0;
```

- [ ] **Step 2: Apply the migration to Supabase**

```bash
npx supabase db push
```

Expected: migration applied with no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260425000100_inventory_tab_columns.sql
git commit -m "feat(inventory): add status/sort_order/reorder_point columns"
```

---

## Task 2: New Hooks (`useInventory.ts`)

**Files:**
- Modify: `src/hooks/useInventory.ts`

- [ ] **Step 1: Add new types and hooks** — append to the end of `src/hooks/useInventory.ts`:

```typescript
// ─── New types ────────────────────────────────────────────────────────────────

export type FifoLayer = {
  id: string
  brand_variant_id: string
  receival_number: string | null
  date: string
  qty: number
  remaining_qty: number
  unit_cost: number
  landed_cost_per_unit: number
  total_unit_cost: number
  created_at: string
}

export type ToolAssetItem = {
  id: string
  category_id: string | null
  name_en: string
  name_ar: string | null
  created_at: string
}

export type ToolAssetUnit = {
  id: string
  item_id: string
  serial_number: string
  brand: string
  status: string
  assigned_to: string | null
  condition: string
  expiry: string | null
  created_at: string
  updated_at: string
}

export type ServiceInventoryLink = {
  id: string
  service_id: string
  brand_variant_id: string
  qty_per_service: number
  notes: string | null
}

// ─── Category hooks ───────────────────────────────────────────────────────────

export function useInventoryCategoriesByType(type: string, showArchived = false) {
  return useQuery({
    queryKey: ['inventory-categories', type, showArchived],
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('inventory_categories')
        .select('*')
        .eq('type', type)
        .order('sort_order', { ascending: true })
        .order('name_en', { ascending: true })
      if (!showArchived) q = q.neq('status', 'archived')
      const { data, error } = await q
      if (error) throw error
      return data as InventoryCategory[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateInventoryCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { name_en: string; name_ar?: string | null; sku?: string | null; type: string }) => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('inventory_categories')
        .insert(payload)
        .select()
        .single()
      if (error) throw error
      return data as InventoryCategory
    },
    onSuccess: (_: unknown, v: { type: string }) => {
      qc.invalidateQueries({ queryKey: ['inventory-categories', v.type] })
    },
  })
}

export function useUpdateInventoryCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...payload }: { id: string; name_en?: string; name_ar?: string | null; sku?: string | null; status?: string }) => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('inventory_categories')
        .update(payload)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as InventoryCategory
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory-categories'] }),
  })
}

// ─── Item hooks ───────────────────────────────────────────────────────────────

export function useInventoryItemsByCategory(categoryId: string | null, showArchived = false) {
  return useQuery({
    queryKey: ['inventory-items-by-category', categoryId, showArchived],
    enabled: !!categoryId,
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('inventory_items')
        .select('*')
        .eq('category_id', categoryId!)
        .order('sort_order', { ascending: true })
        .order('name_en', { ascending: true })
      if (!showArchived) q = q.neq('status', 'archived')
      const { data, error } = await q
      if (error) throw error
      return data as InventoryItem[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useArchiveInventoryItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('inventory_items')
        .update({ status: 'archived' })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory-items-by-category'] }),
  })
}

// ─── Brand variant hooks ──────────────────────────────────────────────────────

export function useInventoryBrandVariants(itemId: string | null, showArchived = false) {
  return useQuery({
    queryKey: ['brand-variants-v2', itemId, showArchived],
    enabled: !!itemId,
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('inventory_brand_variants')
        .select('*')
        .eq('item_id', itemId!)
        .order('sort_order', { ascending: true })
        .order('brand', { ascending: true })
      if (!showArchived) q = q.neq('status', 'archived')
      const { data, error } = await q
      if (error) throw error
      return data as BrandVariant[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useArchiveInventoryBrandVariant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('inventory_brand_variants')
        .update({ status: 'archived' })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['brand-variants-v2'] }),
  })
}

// ─── FIFO layers ──────────────────────────────────────────────────────────────

export function useFifoLayers(brandVariantId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['fifo-layers', brandVariantId],
    enabled: enabled && !!brandVariantId,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('fifo_cost_layers')
        .select('id, brand_variant_id, receival_number, date, qty, remaining_qty, unit_cost, landed_cost_per_unit, total_unit_cost, created_at')
        .eq('brand_variant_id', brandVariantId!)
        .order('date', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as FifoLayer[]
    },
    staleTime: 2 * 60 * 1000,
  })
}

// ─── Tool asset hooks ─────────────────────────────────────────────────────────

export function useToolAssetItems(search = '') {
  return useQuery({
    queryKey: ['tool-asset-items', search],
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('tool_asset_items')
        .select('*')
        .order('name_en', { ascending: true })
      if (search) q = q.ilike('name_en', `%${search}%`)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as ToolAssetItem[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useToolAssetUnits(itemId: string | null) {
  return useQuery({
    queryKey: ['tool-asset-units', itemId],
    enabled: !!itemId,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('tool_asset_units')
        .select('*')
        .eq('item_id', itemId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as ToolAssetUnit[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateToolAssetItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { name_en: string; name_ar?: string | null }) => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('tool_asset_items')
        .insert(payload)
        .select()
        .single()
      if (error) throw error
      return data as ToolAssetItem
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tool-asset-items'] }),
  })
}

export function useUpdateToolAssetItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...payload }: { id: string; name_en?: string; name_ar?: string | null }) => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('tool_asset_items')
        .update(payload)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as ToolAssetItem
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tool-asset-items'] }),
  })
}

export function useCreateToolAssetUnit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { item_id: string; serial_number: string; brand: string; condition?: string; expiry?: string | null }) => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('tool_asset_units')
        .insert({ condition: 'Good', ...payload })
        .select()
        .single()
      if (error) throw error
      return data as ToolAssetUnit
    },
    onSuccess: (_: unknown, v: { item_id: string }) => {
      qc.invalidateQueries({ queryKey: ['tool-asset-units', v.item_id] })
    },
  })
}

export function useUpdateToolAssetUnit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, item_id, ...payload }: { id: string; item_id: string; serial_number?: string; brand?: string; condition?: string; status?: string; expiry?: string | null; assigned_to?: string | null }) => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('tool_asset_units')
        .update(payload)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as ToolAssetUnit
    },
    onSuccess: (_: unknown, v: { item_id: string }) => {
      qc.invalidateQueries({ queryKey: ['tool-asset-units', v.item_id] })
    },
  })
}

// ─── Service inventory links ──────────────────────────────────────────────────

export function useServiceInventoryLinks(brandVariantId: string | null) {
  return useQuery({
    queryKey: ['service-inventory-links', brandVariantId],
    enabled: !!brandVariantId,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('service_inventory')
        .select('id, service_id, brand_variant_id, qty_per_service, notes')
        .eq('brand_variant_id', brandVariantId!)
      if (error) throw error
      return (data ?? []) as ServiceInventoryLink[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useUpdateServiceInventoryLinks() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ brandVariantId, serviceIds }: { brandVariantId: string; serviceIds: string[] }) => {
      const supabase = createClient()
      const { data: existing, error: fetchErr } = await (supabase as any)
        .from('service_inventory')
        .select('id, service_id')
        .eq('brand_variant_id', brandVariantId)
      if (fetchErr) throw fetchErr

      const existingIds: string[] = (existing ?? []).map((r: { service_id: string }) => r.service_id)
      const toAdd = serviceIds.filter((id) => !existingIds.includes(id))
      const toRemove = (existing ?? [])
        .filter((r: { service_id: string }) => !serviceIds.includes(r.service_id))
        .map((r: { id: string }) => r.id)

      if (toRemove.length > 0) {
        const { error } = await (supabase as any)
          .from('service_inventory')
          .delete()
          .in('id', toRemove)
        if (error) throw error
      }
      if (toAdd.length > 0) {
        const rows = toAdd.map((sid) => ({ service_id: sid, brand_variant_id: brandVariantId, qty_per_service: 1 }))
        const { error } = await (supabase as any).from('service_inventory').insert(rows)
        if (error) throw error
      }
    },
    onSuccess: (_: unknown, v: { brandVariantId: string }) => {
      qc.invalidateQueries({ queryKey: ['service-inventory-links', v.brandVariantId] })
    },
  })
}

export function useAllServices() {
  return useQuery({
    queryKey: ['services-all-for-links'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('services')
        .select('id, name_en')
        .order('name_en')
      if (error) throw error
      return (data ?? []) as { id: string; name_en: string }[]
    },
    staleTime: 10 * 60 * 1000,
  })
}

// ─── All items (flat, for Service Links tab) ──────────────────────────────────

export function useInventoryItemsAll(enabled = true) {
  return useQuery({
    queryKey: ['inventory-items-all'],
    enabled,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('inventory_items')
        .select('id, name_en, name_ar, sku, category_id, unit, linked_services_count')
        .neq('status', 'archived')
        .order('name_en', { ascending: true })
      if (error) throw error
      return (data ?? []) as InventoryItem[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

// ─── Cascade archive category (also archives items + variants) ────────────────

export function useArchiveInventoryCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (categoryId: string) => {
      const supabase = createClient()
      const { data: items, error: fetchErr } = await (supabase as any)
        .from('inventory_items')
        .select('id')
        .eq('category_id', categoryId)
      if (fetchErr) throw fetchErr

      if (items && items.length > 0) {
        const itemIds = (items as { id: string }[]).map((i) => i.id)
        const { error: varErr } = await (supabase as any)
          .from('inventory_brand_variants')
          .update({ status: 'archived' })
          .in('item_id', itemIds)
        if (varErr) throw varErr
        const { error: itemErr } = await (supabase as any)
          .from('inventory_items')
          .update({ status: 'archived' })
          .in('id', itemIds)
        if (itemErr) throw itemErr
      }

      const { error } = await (supabase as any)
        .from('inventory_categories')
        .update({ status: 'archived' })
        .eq('id', categoryId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory-categories'] })
      qc.invalidateQueries({ queryKey: ['inventory-items-by-category'] })
      qc.invalidateQueries({ queryKey: ['brand-variants-v2'] })
    },
  })
}

// ─── Sort order bulk update ───────────────────────────────────────────────────

export function useUpdateSortOrders(table: 'inventory_categories' | 'inventory_items' | 'inventory_brand_variants') {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (updates: { id: string; sort_order: number }[]) => {
      const supabase = createClient()
      await Promise.all(
        updates.map(({ id, sort_order }) =>
          (supabase as any).from(table).update({ sort_order }).eq('id', id)
        )
      )
    },
    onSuccess: () => {
      if (table === 'inventory_categories') qc.invalidateQueries({ queryKey: ['inventory-categories'] })
      if (table === 'inventory_items') qc.invalidateQueries({ queryKey: ['inventory-items-by-category'] })
      if (table === 'inventory_brand_variants') qc.invalidateQueries({ queryKey: ['brand-variants-v2'] })
    },
  })
}

// ─── Item attributes (chips) ──────────────────────────────────────────────────

export function useUpsertInventoryItemAttributes() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ itemId, attributes }: { itemId: string; attributes: string[] }) => {
      const supabase = createClient()
      const { error: delErr } = await (supabase as any)
        .from('inventory_item_attributes')
        .delete()
        .eq('item_id', itemId)
      if (delErr) throw delErr
      if (attributes.length > 0) {
        const rows = attributes.map((attr) => ({ item_id: itemId, attribute: attr }))
        const { error: insErr } = await (supabase as any)
          .from('inventory_item_attributes')
          .insert(rows)
        if (insErr) throw insErr
      }
    },
    onSuccess: (_: unknown, v: { itemId: string }) => {
      qc.invalidateQueries({ queryKey: ['inventory-item-attributes', v.itemId] })
    },
  })
}

// ─── Staff profiles (for tool unit assignment) ────────────────────────────────

export function useStaffProfiles() {
  return useQuery({
    queryKey: ['staff-profiles'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('profiles')
        .select('id, full_name')
        .order('full_name')
      if (error) throw error
      return (data ?? []) as { id: string; full_name: string }[]
    },
    staleTime: 10 * 60 * 1000,
  })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useInventory.ts
git commit -m "feat(inventory): add 14 new hooks for inventory tab rebuild"
```

---

## Task 3: FifoLayersTable

**Files:**
- Create: `src/components/services/inventory/FifoLayersTable.tsx`

- [ ] **Step 1: Create the component**

```typescript
// src/components/services/inventory/FifoLayersTable.tsx
'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { useFifoLayers } from '@/hooks/useInventory'

export function FifoLayersTable({ brandVariantId }: { brandVariantId: string }) {
  const { data: layers = [], isLoading } = useFifoLayers(brandVariantId, true)

  return (
    <div className="rounded border border-border bg-slate-50 overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-100">
            <TableHead className="text-[10px] h-7 font-semibold text-slate-600">RECEIVAL #</TableHead>
            <TableHead className="text-[10px] h-7 font-semibold text-slate-600">DATE</TableHead>
            <TableHead className="text-[10px] h-7 font-semibold text-slate-600 text-right">QTY IN</TableHead>
            <TableHead className="text-[10px] h-7 font-semibold text-slate-600 text-right">REMAINING</TableHead>
            <TableHead className="text-[10px] h-7 font-semibold text-slate-600 text-right">UNIT COST</TableHead>
            <TableHead className="text-[10px] h-7 font-semibold text-slate-600 text-right">LANDED</TableHead>
            <TableHead className="text-[10px] h-7 font-semibold text-slate-600 text-right">TOTAL/UNIT</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <>
              {[0, 1, 2].map((i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-3 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-3 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-3 w-10 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-3 w-10 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-3 w-16 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-3 w-12 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-3 w-16 ml-auto" /></TableCell>
                </TableRow>
              ))}
            </>
          )}
          {!isLoading && layers.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-[11px] text-muted-foreground py-4">
                No cost layers recorded
              </TableCell>
            </TableRow>
          )}
          {!isLoading && layers.map((layer) => (
            <TableRow key={layer.id} className="text-xs">
              <TableCell className="font-mono text-[11px]">
                {layer.receival_number ?? '—'}
              </TableCell>
              <TableCell className="text-[11px]">{formatDate(layer.date)}</TableCell>
              <TableCell className="text-right text-[11px]">{layer.qty}</TableCell>
              <TableCell className="text-right">
                <span className={`text-[11px] font-medium ${layer.remaining_qty > 0 ? 'text-green-600' : 'text-slate-400'}`}>
                  {layer.remaining_qty}
                </span>
              </TableCell>
              <TableCell className="text-right text-[11px]">{formatCurrency(layer.unit_cost, 'QAR')}</TableCell>
              <TableCell className="text-right text-[11px]">
                {layer.landed_cost_per_unit > 0 ? formatCurrency(layer.landed_cost_per_unit, 'QAR') : '—'}
              </TableCell>
              <TableCell className="text-right text-[11px] font-medium">
                {formatCurrency(layer.total_unit_cost, 'QAR')}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/services/inventory/FifoLayersTable.tsx
git commit -m "feat(inventory): FifoLayersTable with skeleton loader"
```

---

## Task 4: BrandVariantEditDialog

**Files:**
- Create: `src/components/services/inventory/BrandVariantEditDialog.tsx`

- [ ] **Step 1: Create the component**

```typescript
// src/components/services/inventory/BrandVariantEditDialog.tsx
'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateBrandVariant, useUpdateBrandVariant, type BrandVariant } from '@/hooks/useInventory'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  itemId: string
  variant?: BrandVariant | null
}

export function BrandVariantEditDialog({ open, onOpenChange, itemId, variant }: Props) {
  const isEdit = !!variant
  const create = useCreateBrandVariant()
  const update = useUpdateBrandVariant()

  const [brand, setBrand] = useState('')
  const [code, setCode] = useState('')
  const [sellingPrice, setSellingPrice] = useState('')
  const [reorderPoint, setReorderPoint] = useState('0')

  useEffect(() => {
    if (open) {
      setBrand(variant?.brand ?? '')
      setCode(variant?.code ?? '')
      setSellingPrice(variant?.selling_price != null ? String(variant.selling_price) : '')
      setReorderPoint(variant ? String((variant as any).reorder_point ?? 0) : '0')
    }
  }, [open, variant])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!brand.trim()) { toast.error('Brand name is required'); return }

    const payload = {
      brand: brand.trim(),
      code: code.trim() || null,
      selling_price: sellingPrice ? Number(sellingPrice) : 0,
      reorder_point: Number(reorderPoint),
    }

    if (isEdit && variant) {
      update.mutate(
        { id: variant.id, ...payload },
        {
          onSuccess: () => { toast.success('Variant updated'); onOpenChange(false) },
          onError: (err) => toast.error(err.message),
        },
      )
    } else {
      create.mutate(
        { item_id: itemId, ...payload },
        {
          onSuccess: () => { toast.success('Variant added'); onOpenChange(false) },
          onError: (err) => toast.error(err.message),
        },
      )
    }
  }

  const isPending = create.isPending || update.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full h-full rounded-none sm:h-auto sm:max-w-md sm:rounded-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Brand Variant' : 'Add Brand Variant'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label>Brand *</Label>
            <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. LG, Alfacool" />
          </div>
          <div className="space-y-1">
            <Label>SKU Code</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Auto-generated if blank" className="font-mono" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Selling Price (QAR)</Label>
              <Input type="number" min="0" step="0.01" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-1">
              <Label>Reorder Point</Label>
              <Input type="number" min="0" step="1" value={reorderPoint} onChange={(e) => setReorderPoint(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Variant'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/services/inventory/BrandVariantEditDialog.tsx
git commit -m "feat(inventory): BrandVariantEditDialog"
```

---

## Task 5: BrandVariantRow

**Files:**
- Create: `src/components/services/inventory/BrandVariantRow.tsx`

- [ ] **Step 1: Create the component**

```typescript
// src/components/services/inventory/BrandVariantRow.tsx
'use client'

import { useState } from 'react'
import { ArrowDown, ArrowUp, ChevronRight, ChevronDown, Pencil, Archive } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { TableCell, TableRow } from '@/components/ui/table'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { FifoLayersTable } from './FifoLayersTable'
import { BrandVariantEditDialog } from './BrandVariantEditDialog'
import { useArchiveInventoryBrandVariant, type BrandVariant } from '@/hooks/useInventory'
import { formatCurrency } from '@/lib/utils/formatters'

type Props = {
  variant: BrandVariant
  itemId: string
  canMoveUp: boolean
  canMoveDown: boolean
  onMoveUp: () => void
  onMoveDown: () => void
}

function AtpBadge({ stockLevel, reservedQty, reorderPoint }: { stockLevel: number; reservedQty: number; reorderPoint: number }) {
  const atp = stockLevel - reservedQty
  let color = 'bg-green-100 text-green-700'
  if (atp <= 0) color = 'bg-red-100 text-red-700'
  else if (atp <= reorderPoint) color = 'bg-amber-100 text-amber-700'

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium cursor-default ${color}`}>
            {atp}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {stockLevel} On Hand · {reservedQty} Reserved
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function BrandVariantRow({ variant, itemId, canMoveUp, canMoveDown, onMoveUp, onMoveDown }: Props) {
  const [fifoOpen, setFifoOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const archive = useArchiveInventoryBrandVariant()

  const stockLevel = variant.stock_level ?? 0
  const reservedQty = (variant as any).reserved_qty ?? 0
  const reorderPoint = (variant as any).reorder_point ?? 0
  const incoming = variant.incoming ?? 0

  return (
    <>
      <TableRow
        className="text-xs cursor-pointer hover:bg-muted/30"
        onClick={() => setFifoOpen((v) => !v)}
      >
        <TableCell className="pl-4">
          <div className="flex items-center gap-1">
            {fifoOpen
              ? <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              : <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            }
            <button
              className="font-medium text-blue-600 hover:underline"
              onClick={(e) => { e.stopPropagation(); setEditOpen(true) }}
            >
              {variant.brand}
            </button>
          </div>
        </TableCell>
        <TableCell className="font-mono text-[11px]">{variant.code ?? '—'}</TableCell>
        <TableCell className="text-right">
          {variant.average_cost != null ? formatCurrency(variant.average_cost, 'QAR') : '—'}
        </TableCell>
        <TableCell className="text-right">
          {variant.selling_price != null ? formatCurrency(variant.selling_price, 'QAR') : '—'}
        </TableCell>
        <TableCell className="text-right">
          <AtpBadge stockLevel={stockLevel} reservedQty={reservedQty} reorderPoint={reorderPoint} />
        </TableCell>
        <TableCell className="text-right text-[11px]">
          {incoming > 0 ? <span className="text-blue-600 font-medium">+{incoming}</span> : '—'}
        </TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-6 w-6" disabled={!canMoveUp} onClick={() => onMoveUp()}>
              <ArrowUp className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" disabled={!canMoveDown} onClick={() => onMoveDown()}>
              <ArrowDown className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => setArchiveOpen(true)}>
              <Archive className="h-3 w-3" />
            </Button>
          </div>
        </TableCell>
      </TableRow>

      {fifoOpen && (
        <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
          <TableCell colSpan={7} className="py-2 px-4">
            <FifoLayersTable brandVariantId={variant.id} />
          </TableCell>
        </TableRow>
      )}

      <BrandVariantEditDialog open={editOpen} onOpenChange={setEditOpen} itemId={itemId} variant={variant} />

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Archive Brand Variant"
        description={`Archive "${variant.brand}"? It will be hidden from the inventory view.`}
        confirmLabel="Archive"
        variant="destructive"
        onConfirm={() =>
          archive.mutate(variant.id, {
            onSuccess: () => { toast.success('Variant archived'); setArchiveOpen(false) },
            onError: (err) => toast.error(err.message),
          })
        }
      />
    </>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/services/inventory/BrandVariantRow.tsx
git commit -m "feat(inventory): BrandVariantRow with ATP badge and FIFO expand"
```

---

## Task 6: CategoryEditDialog

**Files:**
- Create: `src/components/services/inventory/CategoryEditDialog.tsx`

- [ ] **Step 1: Create the component**

```typescript
// src/components/services/inventory/CategoryEditDialog.tsx
'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateInventoryCategory, useUpdateInventoryCategory, type InventoryCategory } from '@/hooks/useInventory'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  categoryType: string
  category?: InventoryCategory | null
}

export function CategoryEditDialog({ open, onOpenChange, categoryType, category }: Props) {
  const isEdit = !!category
  const create = useCreateInventoryCategory()
  const update = useUpdateInventoryCategory()

  const [nameEn, setNameEn] = useState('')
  const [nameAr, setNameAr] = useState('')
  const [sku, setSku] = useState('')

  useEffect(() => {
    if (open) {
      setNameEn(category?.name_en ?? '')
      setNameAr(category?.name_ar ?? '')
      setSku((category as any)?.sku ?? '')
    }
  }, [open, category])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nameEn.trim()) { toast.error('Name (EN) is required'); return }

    const payload = { name_en: nameEn.trim(), name_ar: nameAr.trim() || null, sku: sku.trim() || null }

    if (isEdit && category) {
      update.mutate(
        { id: category.id, ...payload },
        {
          onSuccess: () => { toast.success('Category updated'); onOpenChange(false) },
          onError: (err) => toast.error(err.message),
        },
      )
    } else {
      create.mutate(
        { ...payload, type: categoryType },
        {
          onSuccess: () => { toast.success('Category created'); onOpenChange(false) },
          onError: (err) => toast.error(err.message),
        },
      )
    }
  }

  const isPending = create.isPending || update.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full h-full rounded-none sm:h-auto sm:max-w-md sm:rounded-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Category' : 'New Category'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label>Name (English) *</Label>
            <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="e.g. Water Heaters" />
          </div>
          <div className="space-y-1">
            <Label>Name (Arabic)</Label>
            <Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" placeholder="الاسم بالعربية" />
          </div>
          <div className="space-y-1">
            <Label>SKU Prefix</Label>
            <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="e.g. WH" className="font-mono" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Category'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/services/inventory/CategoryEditDialog.tsx
git commit -m "feat(inventory): CategoryEditDialog"
```

---

## Task 7: ItemEditDialog

**Files:**
- Create: `src/components/services/inventory/ItemEditDialog.tsx`

- [ ] **Step 1: Create the component**

```typescript
// src/components/services/inventory/ItemEditDialog.tsx
'use client'

import { useState, useEffect } from 'react'
import { X, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useCreateInventoryItem, useUpdateInventoryItem, useUpsertInventoryItemAttributes, type InventoryItem } from '@/hooks/useInventory'

const UNITS = ['Piece', 'Kg', 'Litre', 'Set', 'Box', 'Metre', 'Roll', 'Pair', 'Other']

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  categoryId: string
  categoryType: string
  item?: InventoryItem | null
}

export function ItemEditDialog({ open, onOpenChange, categoryId, categoryType, item }: Props) {
  const isEdit = !!item
  const create = useCreateInventoryItem()
  const update = useUpdateInventoryItem()
  const upsertAttributes = useUpsertInventoryItemAttributes()

  const [nameEn, setNameEn] = useState('')
  const [nameAr, setNameAr] = useState('')
  const [sku, setSku] = useState('')
  const [unit, setUnit] = useState('Piece')
  const [chips, setChips] = useState<string[]>([])
  const [chipInput, setChipInput] = useState('')

  useEffect(() => {
    if (open) {
      setNameEn(item?.name_en ?? '')
      setNameAr(item?.name_ar ?? '')
      setSku(item?.sku ?? '')
      setUnit(item?.unit ?? 'Piece')
      setChips([])
      setChipInput('')
    }
  }, [open, item])

  function addChip() {
    const val = chipInput.trim()
    if (val && !chips.includes(val)) setChips((c) => [...c, val])
    setChipInput('')
  }

  function removeChip(chip: string) {
    setChips((c) => c.filter((x) => x !== chip))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nameEn.trim()) { toast.error('Name (EN) is required'); return }
    if (!sku.trim()) { toast.error('SKU is required'); return }

    const payload = {
      name_en: nameEn.trim(),
      name_ar: nameAr.trim() || null,
      sku: sku.trim(),
      unit,
    }

    if (isEdit && item) {
      update.mutate(
        { id: item.id, ...payload },
        {
          onSuccess: () => {
            upsertAttributes.mutate({ itemId: item.id, attributes: chips })
            toast.success('Item updated')
            onOpenChange(false)
          },
          onError: (err) => toast.error(err.message),
        },
      )
    } else {
      create.mutate(
        { ...payload, category_id: categoryId },
        {
          onSuccess: (data) => {
            upsertAttributes.mutate({ itemId: data.id, attributes: chips })
            toast.success('Item created')
            onOpenChange(false)
          },
          onError: (err) => toast.error(err.message),
        },
      )
    }
  }

  const isPending = create.isPending || update.isPending || upsertAttributes.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full h-full rounded-none sm:h-auto sm:max-w-lg sm:rounded-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Item' : 'New Item'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Name (English) *</Label>
              <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="e.g. Alfaheat" />
            </div>
            <div className="space-y-1">
              <Label>Name (Arabic)</Label>
              <Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" placeholder="الاسم بالعربية" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>SKU *</Label>
              <Input value={sku} onChange={(e) => setSku(e.target.value)} className="font-mono" placeholder="PRD-HT-001" />
            </div>
            <div className="space-y-1">
              <Label>Unit</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Item Type</Label>
            <Input value={categoryType} disabled className="bg-muted text-muted-foreground capitalize" />
          </div>
          <div className="space-y-2">
            <Label>Attributes (optional chips)</Label>
            <div className="flex gap-2">
              <Input
                value={chipInput}
                onChange={(e) => setChipInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addChip() } }}
                placeholder='e.g. "80 Gallon"'
                className="flex-1"
              />
              <Button type="button" variant="outline" size="icon" onClick={addChip}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {chips.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {chips.map((chip) => (
                  <Badge key={chip} variant="secondary" className="gap-1">
                    {chip}
                    <button type="button" onClick={() => removeChip(chip)} className="hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Item'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/services/inventory/ItemEditDialog.tsx
git commit -m "feat(inventory): ItemEditDialog with attribute chips"
```

---

## Task 8: ItemRow

**Files:**
- Create: `src/components/services/inventory/ItemRow.tsx`

- [ ] **Step 1: Create the component**

```typescript
// src/components/services/inventory/ItemRow.tsx
'use client'

import { useState } from 'react'
import { ArrowDown, ArrowUp, ChevronRight, ChevronDown, Pencil, Archive, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableHead, TableHeader, TableRow, TableCell } from '@/components/ui/table'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { BrandVariantRow } from './BrandVariantRow'
import { ItemEditDialog } from './ItemEditDialog'
import { BrandVariantEditDialog } from './BrandVariantEditDialog'
import { useInventoryBrandVariants, useArchiveInventoryItem, useUpdateSortOrders, type InventoryItem } from '@/hooks/useInventory'
import { formatCurrency } from '@/lib/utils/formatters'

type Props = {
  item: InventoryItem
  categoryType: string
  showArchived: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onMoveUp: () => void
  onMoveDown: () => void
}

function StockBadge({ atp, reorderPoint }: { atp: number; reorderPoint: number }) {
  let color = 'bg-green-100 text-green-700'
  if (atp <= 0) color = 'bg-red-100 text-red-700'
  else if (atp <= reorderPoint) color = 'bg-amber-100 text-amber-700'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${color}`}>
      {atp} available
    </span>
  )
}

export function ItemRow({ item, categoryType, showArchived, canMoveUp, canMoveDown, onMoveUp, onMoveDown }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [addVariantOpen, setAddVariantOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const archive = useArchiveInventoryItem()
  const updateVariantOrder = useUpdateSortOrders('inventory_brand_variants')
  const { data: variants = [] } = useInventoryBrandVariants(expanded ? item.id : null, showArchived)

  function handleVariantMove(idx: number, direction: 'up' | 'down') {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    const a = variants[idx]
    const b = variants[targetIdx]
    updateVariantOrder.mutate([
      { id: a.id, sort_order: (a as any).sort_order ?? idx },
      { id: b.id, sort_order: (b as any).sort_order ?? targetIdx },
    ])
  }

  const totalAtp = variants.reduce((sum, v) => sum + (v.stock_level ?? 0) - ((v as any).reserved_qty ?? 0), 0)
  const minReorder = Math.min(...variants.map((v) => (v as any).reorder_point ?? 0), Infinity)
  const reorderPoint = isFinite(minReorder) ? minReorder : 0
  const linkedCount = item.linked_services_count ?? 0

  return (
    <>
      {/* Item row */}
      <tr
        className="border-b border-border hover:bg-muted/20 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="py-2 pl-8 pr-2 w-1/2">
          <div className="flex items-center gap-1.5">
            {expanded
              ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            }
            <div>
              <span className="text-sm font-medium text-blue-600">{item.name_en}</span>
              {item.name_ar && (
                <div className="text-[10px] text-muted-foreground" dir="rtl">{item.name_ar}</div>
              )}
            </div>
          </div>
        </td>
        <td className="py-2 px-2 text-[11px] font-mono text-muted-foreground">{item.sku}</td>
        <td className="py-2 px-2 text-[11px]">{item.unit}</td>
        <td className="py-2 px-2 text-[11px]">
          {item.cost_price != null ? (
            <span className="text-muted-foreground">Avg: {formatCurrency(item.cost_price, 'QAR')}</span>
          ) : '—'}
        </td>
        <td className="py-2 px-2">
          <div className="flex items-center gap-2">
            <StockBadge atp={totalAtp} reorderPoint={reorderPoint} />
            {linkedCount > 0 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5 text-blue-600 border-blue-200">
                🔗 {linkedCount}
              </Badge>
            )}
          </div>
        </td>
        <td className="py-2 px-2 text-right">
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-6 w-6" disabled={!canMoveUp} onClick={() => onMoveUp()}>
              <ArrowUp className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" disabled={!canMoveDown} onClick={() => onMoveDown()}>
              <ArrowDown className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => setArchiveOpen(true)}>
              <Archive className="h-3 w-3" />
            </Button>
          </div>
        </td>
      </tr>

      {/* Brand variants sub-table */}
      {expanded && (
        <tr className="bg-muted/10">
          <td colSpan={6} className="py-0 pl-8 pr-4 pb-3">
            <div className="rounded border border-border overflow-x-auto mt-2">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-[10px] h-7 font-semibold">BRAND</TableHead>
                    <TableHead className="text-[10px] h-7 font-semibold">CODE</TableHead>
                    <TableHead className="text-[10px] h-7 font-semibold text-right">AVG COST</TableHead>
                    <TableHead className="text-[10px] h-7 font-semibold text-right">SELLING PRICE</TableHead>
                    <TableHead className="text-[10px] h-7 font-semibold text-right">AVAILABLE</TableHead>
                    <TableHead className="text-[10px] h-7 font-semibold text-right">INCOMING</TableHead>
                    <TableHead className="text-[10px] h-7" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {variants.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-[11px] text-muted-foreground py-4">
                        No variants yet
                      </TableCell>
                    </TableRow>
                  )}
                  {variants.map((v, idx) => (
                    <BrandVariantRow
                      key={v.id}
                      variant={v}
                      itemId={item.id}
                      canMoveUp={idx > 0}
                      canMoveDown={idx < variants.length - 1}
                      onMoveUp={() => handleVariantMove(idx, 'up')}
                      onMoveDown={() => handleVariantMove(idx, 'down')}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
            <button
              className="mt-2 text-xs text-blue-600 hover:underline flex items-center gap-1"
              onClick={() => setAddVariantOpen(true)}
            >
              <Plus className="h-3 w-3" /> Add Brand Variant
            </button>
          </td>
        </tr>
      )}

      <ItemEditDialog open={editOpen} onOpenChange={setEditOpen} categoryId={item.category_id} categoryType={categoryType} item={item} />
      <BrandVariantEditDialog open={addVariantOpen} onOpenChange={setAddVariantOpen} itemId={item.id} />
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Archive Item"
        description={`Archive "${item.name_en}"? All variants will be hidden.`}
        confirmLabel="Archive"
        variant="destructive"
        onConfirm={() =>
          archive.mutate(item.id, {
            onSuccess: () => { toast.success('Item archived'); setArchiveOpen(false) },
            onError: (err) => toast.error(err.message),
          })
        }
      />
    </>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/services/inventory/ItemRow.tsx
git commit -m "feat(inventory): ItemRow with per-component expand and brand variants"
```

---

## Task 9: CategoryRow

**Files:**
- Create: `src/components/services/inventory/CategoryRow.tsx`

- [ ] **Step 1: Create the component**

```typescript
// src/components/services/inventory/CategoryRow.tsx
'use client'

import { useState } from 'react'
import { ArrowDown, ArrowUp, ChevronRight, ChevronDown, Pencil, Archive, Package, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { ItemRow } from './ItemRow'
import { CategoryEditDialog } from './CategoryEditDialog'
import { ItemEditDialog } from './ItemEditDialog'
import { useInventoryItemsByCategory, useArchiveInventoryCategory, useUpdateSortOrders, type InventoryCategory } from '@/hooks/useInventory'

type Props = {
  category: InventoryCategory
  categoryType: string
  showArchived: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onMoveUp: () => void
  onMoveDown: () => void
}

export function CategoryRow({ category, categoryType, showArchived, canMoveUp, canMoveDown, onMoveUp, onMoveDown }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [addItemOpen, setAddItemOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const archiveCategory = useArchiveInventoryCategory()
  const updateItemOrder = useUpdateSortOrders('inventory_items')
  const { data: items = [] } = useInventoryItemsByCategory(expanded ? category.id : null, showArchived)

  function handleItemMove(idx: number, direction: 'up' | 'down') {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    const a = items[idx]
    const b = items[targetIdx]
    updateItemOrder.mutate([
      { id: a.id, sort_order: (a as any).sort_order ?? idx },
      { id: b.id, sort_order: (b as any).sort_order ?? targetIdx },
    ])
  }

  return (
    <>
      {/* Category row */}
      <tr
        className="border-b border-border bg-slate-50/80 hover:bg-slate-100/60 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="py-2.5 pl-3 pr-2 w-1/2">
          <div className="flex items-center gap-2">
            {expanded
              ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            }
            <Package className="h-4 w-4 text-slate-500 flex-shrink-0" />
            <div>
              <button
                className="text-sm font-semibold text-blue-600 hover:underline text-left"
                onClick={(e) => { e.stopPropagation(); setEditOpen(true) }}
              >
                {category.name_en}
              </button>
              {category.name_ar && (
                <div className="text-[10px] text-muted-foreground" dir="rtl">{category.name_ar}</div>
              )}
            </div>
          </div>
        </td>
        <td className="py-2.5 px-2 text-[11px] font-mono text-muted-foreground">{(category as any).sku ?? '—'}</td>
        <td className="py-2.5 px-2 text-[11px] text-muted-foreground">—</td>
        <td className="py-2.5 px-2 text-[11px] text-muted-foreground">—</td>
        <td className="py-2.5 px-2 text-[11px] text-muted-foreground">—</td>
        <td className="py-2.5 px-2 text-right">
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-6 w-6" disabled={!canMoveUp} onClick={() => onMoveUp()}>
              <ArrowUp className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" disabled={!canMoveDown} onClick={() => onMoveDown()}>
              <ArrowDown className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setAddItemOpen(true)}>
              <Plus className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => setArchiveOpen(true)}>
              <Archive className="h-3 w-3" />
            </Button>
          </div>
        </td>
      </tr>

      {/* Items */}
      {expanded && items.map((item, idx) => (
        <ItemRow
          key={item.id}
          item={item}
          categoryType={categoryType}
          showArchived={showArchived}
          canMoveUp={idx > 0}
          canMoveDown={idx < items.length - 1}
          onMoveUp={() => handleItemMove(idx, 'up')}
          onMoveDown={() => handleItemMove(idx, 'down')}
        />
      ))}

      {expanded && items.length === 0 && (
        <tr className="border-b border-border">
          <td colSpan={6} className="py-3 pl-10 text-[11px] text-muted-foreground">
            No items in this category yet.
          </td>
        </tr>
      )}

      <CategoryEditDialog open={editOpen} onOpenChange={setEditOpen} categoryType={categoryType} category={category} />
      <ItemEditDialog open={addItemOpen} onOpenChange={setAddItemOpen} categoryId={category.id} categoryType={categoryType} />
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Archive Category"
        description={`Archive "${category.name_en}"? All items in this category will be hidden.`}
        confirmLabel="Archive"
        variant="destructive"
        onConfirm={() =>
          archiveCategory.mutate(category.id, {
            onSuccess: () => { toast.success('Category archived'); setArchiveOpen(false) },
            onError: (err) => toast.error(err.message),
          })
        }
      />
    </>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/services/inventory/CategoryRow.tsx
git commit -m "feat(inventory): CategoryRow with per-component expand and items"
```

---

## Task 10: ItemsListView

**Files:**
- Create: `src/components/services/inventory/ItemsListView.tsx`

- [ ] **Step 1: Create the component**

```typescript
// src/components/services/inventory/ItemsListView.tsx
'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { CategoryRow } from './CategoryRow'
import { CategoryEditDialog } from './CategoryEditDialog'
import { useInventoryCategoriesByType, useUpdateSortOrders } from '@/hooks/useInventory'

type InventorySubType = 'products' | 'spare-parts' | 'consumables'

const LABEL_MAP: Record<InventorySubType, string> = {
  'products': 'Products (Installation)',
  'spare-parts': 'Spare Parts (Sales)',
  'consumables': 'Consumables (Internal)',
}

type Props = {
  type: InventorySubType
  enabled: boolean
}

export function ItemsListView({ type, enabled }: Props) {
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false)

  const { data: categories = [], isLoading } = useInventoryCategoriesByType(type, showArchived)
  const updateCategoryOrder = useUpdateSortOrders('inventory_categories')

  function handleCategoryMove(idx: number, direction: 'up' | 'down') {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    const a = filtered[idx]
    const b = filtered[targetIdx]
    updateCategoryOrder.mutate([
      { id: a.id, sort_order: (a as any).sort_order ?? idx },
      { id: b.id, sort_order: (b as any).sort_order ?? targetIdx },
    ])
  }

  const filtered = categories.filter((c) =>
    !search ||
    c.name_en.toLowerCase().includes(search.toLowerCase()) ||
    (c.name_ar ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border flex-wrap">
        <Input
          placeholder={`Search ${LABEL_MAP[type].toLowerCase()}…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-7 text-xs w-64"
        />
        <div className="flex items-center gap-2">
          <Switch id="show-archived" checked={showArchived} onCheckedChange={setShowArchived} />
          <Label htmlFor="show-archived" className="text-xs cursor-pointer">Show archived</Label>
        </div>
        <Button size="sm" className="ml-auto h-7 text-xs" onClick={() => setCreateCategoryOpen(true)}>
          <Plus className="h-3 w-3 mr-1" /> New Category
        </Button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full rounded" />)}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left text-[11px] font-semibold py-2 pl-3 pr-2 w-1/2">ITEM</th>
                <th className="text-left text-[11px] font-semibold py-2 px-2">SKU</th>
                <th className="text-left text-[11px] font-semibold py-2 px-2">UNIT</th>
                <th className="text-left text-[11px] font-semibold py-2 px-2">PRICING</th>
                <th className="text-left text-[11px] font-semibold py-2 px-2">STOCK / SERVICES</th>
                <th className="text-right text-[11px] font-semibold py-2 px-2">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-xs text-muted-foreground py-12">
                    {search ? 'No categories match your search' : `No ${LABEL_MAP[type].toLowerCase()} categories yet`}
                  </td>
                </tr>
              )}
              {filtered.map((cat, idx) => (
                <CategoryRow
                  key={cat.id}
                  category={cat}
                  categoryType={type}
                  showArchived={showArchived}
                  canMoveUp={idx > 0}
                  canMoveDown={idx < filtered.length - 1}
                  onMoveUp={() => handleCategoryMove(idx, 'up')}
                  onMoveDown={() => handleCategoryMove(idx, 'down')}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CategoryEditDialog open={createCategoryOpen} onOpenChange={setCreateCategoryOpen} categoryType={type} />
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/services/inventory/ItemsListView.tsx
git commit -m "feat(inventory): ItemsListView tree shell for 3 product-type tabs"
```

---

## Task 11: ToolsAssetsView + ToolAssetEditDialog

**Files:**
- Create: `src/components/services/inventory/ToolAssetEditDialog.tsx`
- Create: `src/components/services/inventory/ToolsAssetsView.tsx`

- [ ] **Step 1: Create ToolAssetEditDialog**

```typescript
// src/components/services/inventory/ToolAssetEditDialog.tsx
'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  useCreateToolAssetItem, useUpdateToolAssetItem,
  useCreateToolAssetUnit, useUpdateToolAssetUnit,
  useStaffProfiles,
  type ToolAssetItem, type ToolAssetUnit,
} from '@/hooks/useInventory'

type ItemProps = {
  open: boolean
  onOpenChange: (v: boolean) => void
  item?: ToolAssetItem | null
}

export function ToolAssetItemEditDialog({ open, onOpenChange, item }: ItemProps) {
  const isEdit = !!item
  const create = useCreateToolAssetItem()
  const update = useUpdateToolAssetItem()
  const [nameEn, setNameEn] = useState('')
  const [nameAr, setNameAr] = useState('')

  useEffect(() => {
    if (open) { setNameEn(item?.name_en ?? ''); setNameAr(item?.name_ar ?? '') }
  }, [open, item])

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!nameEn.trim()) { toast.error('Name (EN) is required'); return }
    const payload = { name_en: nameEn.trim(), name_ar: nameAr.trim() || null }
    if (isEdit && item) {
      update.mutate({ id: item.id, ...payload }, {
        onSuccess: () => { toast.success('Tool updated'); onOpenChange(false) },
        onError: (err) => toast.error(err.message),
      })
    } else {
      create.mutate(payload, {
        onSuccess: () => { toast.success('Tool created'); onOpenChange(false) },
        onError: (err) => toast.error(err.message),
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full h-full rounded-none sm:h-auto sm:max-w-md sm:rounded-lg">
        <DialogHeader><DialogTitle>{isEdit ? 'Edit Tool/Asset' : 'New Tool/Asset'}</DialogTitle></DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1">
            <Label>Name (English) *</Label>
            <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="e.g. Power Drill" />
          </div>
          <div className="space-y-1">
            <Label>Name (Arabic)</Label>
            <Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={create.isPending || update.isPending}>
              {create.isPending || update.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

type UnitProps = {
  open: boolean
  onOpenChange: (v: boolean) => void
  itemId: string
  unit?: ToolAssetUnit | null
}

const CONDITIONS = ['Good', 'Fair', 'Poor', 'Under Repair']

export function ToolAssetUnitEditDialog({ open, onOpenChange, itemId, unit }: UnitProps) {
  const isEdit = !!unit
  const create = useCreateToolAssetUnit()
  const update = useUpdateToolAssetUnit()
  const { data: staffProfiles = [] } = useStaffProfiles()
  const [serial, setSerial] = useState('')
  const [brand, setBrand] = useState('')
  const [condition, setCondition] = useState('Good')
  const [expiry, setExpiry] = useState('')
  const [status, setStatus] = useState('available')
  const [assignedTo, setAssignedTo] = useState<string>('')

  useEffect(() => {
    if (open) {
      setSerial(unit?.serial_number ?? '')
      setBrand(unit?.brand ?? '')
      setCondition(unit?.condition ?? 'Good')
      setExpiry(unit?.expiry ?? '')
      setStatus(unit?.status ?? 'available')
      setAssignedTo(unit?.assigned_to ?? '')
    }
  }, [open, unit])

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!serial.trim()) { toast.error('Serial number is required'); return }
    if (!brand.trim()) { toast.error('Brand is required'); return }
    if (status === 'assigned' && !assignedTo) { toast.error('Select a staff member to assign to'); return }
    const payload = {
      serial_number: serial.trim(),
      brand: brand.trim(),
      condition,
      expiry: expiry || null,
      status,
      assigned_to: status === 'assigned' ? assignedTo : null,
    }
    if (isEdit && unit) {
      update.mutate({ id: unit.id, item_id: itemId, ...payload }, {
        onSuccess: () => { toast.success('Unit updated'); onOpenChange(false) },
        onError: (err) => toast.error(err.message),
      })
    } else {
      create.mutate({ item_id: itemId, ...payload }, {
        onSuccess: () => { toast.success('Unit added'); onOpenChange(false) },
        onError: (err) => toast.error(err.message),
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full h-full rounded-none sm:h-auto sm:max-w-md sm:rounded-lg">
        <DialogHeader><DialogTitle>{isEdit ? 'Edit Unit' : 'Add Unit'}</DialogTitle></DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1">
            <Label>Serial Number *</Label>
            <Input value={serial} onChange={(e) => setSerial(e.target.value)} className="font-mono" />
          </div>
          <div className="space-y-1">
            <Label>Brand *</Label>
            <Input value={brand} onChange={(e) => setBrand(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Condition</Label>
              <Select value={condition} onValueChange={setCondition}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CONDITIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => { setStatus(v); if (v !== 'assigned') setAssignedTo('') }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="assigned">Assigned</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="retired">Retired</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {status === 'assigned' && (
            <div className="space-y-1">
              <Label>Assigned To *</Label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger>
                  <SelectValue placeholder="Select staff member…">
                    {staffProfiles.find((p) => p.id === assignedTo)?.full_name ?? 'Select staff member…'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {staffProfiles.length === 0 && (
                    <SelectItem value="" disabled>No staff profiles found</SelectItem>
                  )}
                  {staffProfiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label>Expiry Date</Label>
            <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={create.isPending || update.isPending}>
              {create.isPending || update.isPending ? 'Saving…' : isEdit ? 'Save' : 'Add Unit'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Create ToolsAssetsView**

```typescript
// src/components/services/inventory/ToolsAssetsView.tsx
'use client'

import { useState } from 'react'
import { ChevronRight, ChevronDown, Plus, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ToolAssetItemEditDialog, ToolAssetUnitEditDialog } from './ToolAssetEditDialog'
import { useToolAssetItems, useToolAssetUnits, type ToolAssetItem, type ToolAssetUnit } from '@/hooks/useInventory'
import { formatDate } from '@/lib/utils/formatters'

function ToolUnitRows({ itemId }: { itemId: string }) {
  const { data: units = [], isLoading } = useToolAssetUnits(itemId)
  const [editUnit, setEditUnit] = useState<ToolAssetUnit | null>(null)
  const [addUnitOpen, setAddUnitOpen] = useState(false)

  const statusColor: Record<string, string> = {
    available: 'bg-green-100 text-green-700',
    assigned: 'bg-blue-100 text-blue-700',
    maintenance: 'bg-amber-100 text-amber-700',
    retired: 'bg-slate-100 text-slate-500',
  }

  return (
    <>
      <tr className="bg-slate-50/50">
        <td colSpan={6} className="py-2 pl-12 pr-4">
          <div className="rounded border border-border overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-100">
                  <th className="text-left text-[10px] font-semibold py-1.5 px-2">SERIAL #</th>
                  <th className="text-left text-[10px] font-semibold py-1.5 px-2">BRAND</th>
                  <th className="text-left text-[10px] font-semibold py-1.5 px-2">CONDITION</th>
                  <th className="text-left text-[10px] font-semibold py-1.5 px-2">STATUS</th>
                  <th className="text-left text-[10px] font-semibold py-1.5 px-2">EXPIRY</th>
                  <th className="text-right text-[10px] font-semibold py-1.5 px-2" />
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={6}><Skeleton className="h-6 w-full m-2" /></td></tr>}
                {!isLoading && units.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-[11px] text-muted-foreground py-3">No units added yet</td></tr>
                )}
                {units.map((unit) => (
                  <tr key={unit.id} className="border-t border-border">
                    <td className="py-1.5 px-2 font-mono">{unit.serial_number}</td>
                    <td className="py-1.5 px-2">{unit.brand}</td>
                    <td className="py-1.5 px-2">{unit.condition}</td>
                    <td className="py-1.5 px-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColor[unit.status] ?? 'bg-slate-100 text-slate-600'}`}>
                        {unit.status}
                      </span>
                    </td>
                    <td className="py-1.5 px-2">{unit.expiry ? formatDate(unit.expiry) : '—'}</td>
                    <td className="py-1.5 px-2 text-right">
                      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setEditUnit(unit)}>
                        <Pencil className="h-2.5 w-2.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="mt-2 text-xs text-blue-600 hover:underline flex items-center gap-1" onClick={() => setAddUnitOpen(true)}>
            <Plus className="h-3 w-3" /> Add Unit
          </button>
        </td>
      </tr>
      <ToolAssetUnitEditDialog open={addUnitOpen} onOpenChange={setAddUnitOpen} itemId={itemId} />
      {editUnit && (
        <ToolAssetUnitEditDialog open={!!editUnit} onOpenChange={(v) => { if (!v) setEditUnit(null) }} itemId={itemId} unit={editUnit} />
      )}
    </>
  )
}

function ToolItemRow({ item }: { item: ToolAssetItem }) {
  const [expanded, setExpanded] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  return (
    <>
      <tr className="border-b border-border hover:bg-muted/20 cursor-pointer" onClick={() => setExpanded((v) => !v)}>
        <td className="py-2.5 pl-3 pr-2">
          <div className="flex items-center gap-2">
            {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
            <span className="text-sm font-medium">{item.name_en}</span>
            {item.name_ar && <span className="text-[10px] text-muted-foreground" dir="rtl">{item.name_ar}</span>}
          </div>
        </td>
        <td className="py-2.5 px-2 text-right">
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3 w-3" />
            </Button>
          </div>
        </td>
      </tr>
      {expanded && <ToolUnitRows itemId={item.id} />}
      <ToolAssetItemEditDialog open={editOpen} onOpenChange={setEditOpen} item={item} />
    </>
  )
}

export function ToolsAssetsView({ enabled }: { enabled: boolean }) {
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const { data: items = [], isLoading } = useToolAssetItems(search)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border">
        <Input placeholder="Search tools & assets…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-7 text-xs w-64" />
        <Button size="sm" className="ml-auto h-7 text-xs" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3 w-3 mr-1" /> Add Tool/Asset
        </Button>
      </div>
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-4 space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left text-[11px] font-semibold py-2 pl-3 pr-2">TOOL / ASSET</th>
                <th className="text-right text-[11px] font-semibold py-2 px-2">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={2} className="text-center text-xs text-muted-foreground py-12">No tools or assets yet</td></tr>
              )}
              {items.map((item) => <ToolItemRow key={item.id} item={item} />)}
            </tbody>
          </table>
        )}
      </div>
      <ToolAssetItemEditDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/services/inventory/ToolAssetEditDialog.tsx src/components/services/inventory/ToolsAssetsView.tsx
git commit -m "feat(inventory): ToolsAssetsView two-level list with units"
```

---

## Task 12: ServiceLinksView

**Files:**
- Create: `src/components/services/inventory/ServiceLinksView.tsx`

- [ ] **Step 1: Create the component**

```typescript
// src/components/services/inventory/ServiceLinksView.tsx
'use client'

import { useState, useEffect } from 'react'
import { X, Link2 } from 'lucide-react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import {
  useInventoryItemsAll,
  useInventoryBrandVariants,
  useServiceInventoryLinks,
  useUpdateServiceInventoryLinks,
  useAllServices,
  type BrandVariant,
} from '@/hooks/useInventory'

function ManageLinksDialog({
  variant,
  onClose,
}: {
  variant: BrandVariant
  onClose: () => void
}) {
  const { data: links = [] } = useServiceInventoryLinks(variant.id)
  const { data: allServices = [] } = useAllServices()
  const update = useUpdateServiceInventoryLinks()

  const [linkedIds, setLinkedIds] = useState<string[]>(() => links.map((l) => l.service_id))

  // Initialise linkedIds once links load (useEffect, not useMemo — this is a side effect)
  useEffect(() => {
    setLinkedIds(links.map((l) => l.service_id))
  }, [links.length])

  const linkedServices = allServices.filter((s) => linkedIds.includes(s.id))
  const unlinkedServices = allServices.filter((s) => !linkedIds.includes(s.id))

  function addService(id: string) {
    setLinkedIds((ids) => [...ids, id])
  }

  function removeService(id: string) {
    setLinkedIds((ids) => ids.filter((x) => x !== id))
  }

  function handleSave() {
    update.mutate(
      { brandVariantId: variant.id, serviceIds: linkedIds },
      {
        onSuccess: () => { toast.success('Links saved'); onClose() },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="w-full h-full rounded-none sm:h-auto sm:max-w-lg sm:rounded-lg">
        <DialogHeader>
          <DialogTitle>Manage Service Links — {variant.brand}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Current chips */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Linked services</p>
            {linkedServices.length === 0 ? (
              <p className="text-xs text-muted-foreground">None linked yet</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {linkedServices.map((s) => (
                  <Badge key={s.id} variant="secondary" className="gap-1 text-xs">
                    {s.name_en}
                    <button onClick={() => removeService(s.id)} className="hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
          {/* Search & add */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Search to add</p>
            <Command className="rounded-md border border-border">
              <CommandInput placeholder="Search services…" className="text-xs" />
              <CommandList className="max-h-48">
                <CommandEmpty className="text-xs py-4 text-center text-muted-foreground">No services found</CommandEmpty>
                <CommandGroup>
                  {unlinkedServices.map((s) => (
                    <CommandItem key={s.id} value={s.name_en} onSelect={() => addService(s.id)} className="text-xs cursor-pointer">
                      {s.name_en}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save Links'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function VariantLinkRow({ variant }: { variant: BrandVariant }) {
  const { data: links = [] } = useServiceInventoryLinks(variant.id)
  const [manageOpen, setManageOpen] = useState(false)

  return (
    <>
      <tr className="border-b border-border text-xs hover:bg-muted/20">
        <td className="py-2 pl-8 pr-2">
          <span className="font-medium">{variant.brand}</span>
          {variant.code && <span className="ml-2 font-mono text-[10px] text-muted-foreground">{variant.code}</span>}
        </td>
        <td className="py-2 px-2">
          {links.length > 0 ? (
            <Badge variant="outline" className="text-[10px] px-1.5 gap-0.5 text-blue-600 border-blue-200">
              <Link2 className="h-2.5 w-2.5" /> {links.length}
            </Badge>
          ) : (
            <span className="text-[11px] text-muted-foreground">—</span>
          )}
        </td>
        <td className="py-2 px-2 text-right">
          <Button variant="outline" size="sm" className="h-6 text-[11px]" onClick={() => setManageOpen(true)}>
            Manage Links
          </Button>
        </td>
      </tr>
      {manageOpen && <ManageLinksDialog variant={variant} onClose={() => setManageOpen(false)} />}
    </>
  )
}

function ItemLinkSection({ item, search }: { item: { id: string; name_en: string; sku: string }; search: string }) {
  const [expanded, setExpanded] = useState(false)
  const { data: variants = [] } = useInventoryBrandVariants(expanded ? item.id : null)

  if (search && !item.name_en.toLowerCase().includes(search.toLowerCase())) return null

  return (
    <>
      <tr
        className="border-b border-border bg-slate-50/80 cursor-pointer hover:bg-slate-100/60"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="py-2.5 pl-3 pr-2 font-medium text-sm">{item.name_en}</td>
        <td className="py-2.5 px-2 font-mono text-[11px] text-muted-foreground">{item.sku}</td>
        <td className="py-2.5 px-2 text-[11px] text-muted-foreground" colSpan={2}>
          Click to manage variant links
        </td>
      </tr>
      {expanded && variants.map((v) => <VariantLinkRow key={v.id} variant={v} />)}
    </>
  )
}

export function ServiceLinksView({ enabled }: { enabled: boolean }) {
  const [search, setSearch] = useState('')
  const { data: items = [], isLoading } = useInventoryItemsAll(enabled)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border">
        <Input placeholder="Search items…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-7 text-xs w-64" />
      </div>
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-4 space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left text-[11px] font-semibold py-2 pl-3 pr-2">ITEM</th>
                <th className="text-left text-[11px] font-semibold py-2 px-2">SKU</th>
                <th className="text-left text-[11px] font-semibold py-2 px-2">LINKED SERVICES</th>
                <th className="text-right text-[11px] font-semibold py-2 px-2">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr><td colSpan={4} className="text-center text-xs text-muted-foreground py-12">No inventory items found</td></tr>
              )}
              {items.map((item) => (
                <ItemLinkSection key={item.id} item={item} search={search} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/services/inventory/ServiceLinksView.tsx
git commit -m "feat(inventory): ServiceLinksView with Command/Combobox link dialog"
```

---

## Task 13: InventoryTab Shell Rewrite

**Files:**
- Rewrite: `src/components/services/InventoryTab.tsx`

- [ ] **Step 1: Rewrite the component**

```typescript
// src/components/services/InventoryTab.tsx
'use client'

import { useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ItemsListView } from './inventory/ItemsListView'
import { ToolsAssetsView } from './inventory/ToolsAssetsView'
import { ServiceLinksView } from './inventory/ServiceLinksView'

type SubTab = 'products' | 'spare-parts' | 'consumables' | 'tools' | 'service-links'

const TABS: { key: SubTab; label: string }[] = [
  { key: 'products', label: 'Products (Installation)' },
  { key: 'spare-parts', label: 'Spare Parts (Sales)' },
  { key: 'consumables', label: 'Consumables (Internal)' },
  { key: 'tools', label: 'Tools & Assets' },
  { key: 'service-links', label: 'Service Links' },
]

interface InventoryTabProps {
  enabled: boolean
}

export function InventoryTab({ enabled }: InventoryTabProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const raw = searchParams.get('subtab') as SubTab | null
  const activeTab: SubTab = raw && TABS.some((t) => t.key === raw) ? raw : 'products'

  const setTab = useCallback(
    (tab: SubTab) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('subtab', tab)
      router.replace(`?${params.toString()}`, { scroll: false })
    },
    [router, searchParams],
  )

  return (
    <div className="flex flex-col h-full">
      {/* Sub-tab bar */}
      <div className="px-4 pt-2 border-b border-border overflow-x-auto">
        <div className="flex gap-4 min-w-max">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setTab(tab.key)}
              className={[
                'text-xs px-0 py-1.5 border-b-2 whitespace-nowrap transition-colors',
                activeTab === tab.key
                  ? 'border-blue-500 text-blue-600 font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content — mount lazily after first visit */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'products' && (
          <ItemsListView type="products" enabled={enabled} />
        )}
        {activeTab === 'spare-parts' && (
          <ItemsListView type="spare-parts" enabled={enabled} />
        )}
        {activeTab === 'consumables' && (
          <ItemsListView type="consumables" enabled={enabled} />
        )}
        {activeTab === 'tools' && (
          <ToolsAssetsView enabled={enabled} />
        )}
        {activeTab === 'service-links' && (
          <ServiceLinksView enabled={enabled} />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/services/InventoryTab.tsx
git commit -m "feat(inventory): InventoryTab shell — 5 tabs + ?subtab= URL sync"
```

---

## Task 14: Integration Test

**Files:**
- No new files — verify the full build.

- [ ] **Step 1: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 2: Run existing test suite**

```bash
npm test -- --passWithNoTests
```

Expected: All existing tests pass. No regressions.

- [ ] **Step 3: Build check**

```bash
npm run build
```

Expected: Build succeeds. `/master-data/services` route listed. No `/master-data/inventory` route listed (it was deleted).

- [ ] **Step 4: Browser smoke test**

Navigate to `http://localhost:3000/master-data/services` and verify:

1. Inventory tab loads
2. All 5 sub-tabs are visible with blue active border
3. Refreshing on `?tab=inventory&subtab=consumables` restores the Consumables sub-tab
4. Expanding a category row loads items (no full-list flicker)
5. Expanding a brand variant row shows the FIFO skeleton then data
6. AVAILABLE column shows stock_level − reserved_qty with tooltip
7. "Manage Links" opens the Command/Combobox dialog
8. Navigating to `/master-data/inventory` redirects or 404s (route deleted)

- [ ] **Step 5: Update PROGRESS.md and commit**

```bash
git add PROGRESS.md
git commit -m "docs: update PROGRESS.md — inventory tab complete"
```
