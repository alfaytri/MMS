import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { DBTable, DBInsert, DBUpdate } from '@/types/database.types'
import { queryKeys } from '@/lib/queryKeys'
import { logActivity } from '@/lib/logActivity'

export type InventoryCategory = DBTable<'inventory_categories'>
export type InventoryItem = DBTable<'inventory_items'>
export type BrandVariant = DBTable<'inventory_brand_variants'>
export type InventoryItemInsert = DBInsert<'inventory_items'>
export type InventoryItemUpdate = DBUpdate<'inventory_items'>
// Explicit insert shape (subset of DBInsert) to keep the API surface minimal.
export type BrandVariantInsert = {
  item_id: string
  brand: string
  brand_id?: string | null
  code?: string | null
  cost_price?: number | null
  selling_price?: number | null
  average_cost?: number | null
  reorder_point?: number
  stock_level?: number | null
}
export type BrandVariantUpdate = Partial<Omit<BrandVariantInsert, 'item_id'>> & { id?: string }

export function useInventoryCategories() {
  return useQuery({
    queryKey: queryKeys.inventory.categories,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_categories')
        .select('*')
        .order('name_en')
      if (error) throw error
      return data as InventoryCategory[]
    },
    staleTime: 10 * 60 * 1000,
  })
}

export function useInventoryItems(categoryType?: string) {
  return useQuery({
    queryKey: queryKeys.inventory.itemsByType(categoryType),
    queryFn: async () => {
      const supabase = createClient()
      let query = supabase
        .from('inventory_items')
        .select('id, category_id, name_en, name_ar, sku, unit, cost_price, sort_order, status, total_stock, linked_services_count, inventory_categories!inner(type, name_en)')
        .eq('status', 'active')
        .order('name_en')

      if (categoryType) {
        query = query.eq('inventory_categories.type', categoryType as 'products' | 'spare-parts' | 'consumables' | 'tools')
      }

      const { data, error } = await query
      if (error) throw error
      return data
    },
  })
}

export function useBrandVariants(itemId: string | null) {
  return useQuery({
    queryKey: queryKeys.inventory.brandVariantsByItem(itemId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_brand_variants')
        .select('*, brands(name)')
        .eq('item_id', itemId!)
        .eq('status', 'active')
        .order('sort_order')
      if (error) throw error
      return data
    },
    enabled: !!itemId,
  })
}

export function useCreateInventoryItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: InventoryItemInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_items')
        .insert(values)
        .select()
        .single()
      if (error) throw error
      void logActivity({
        action: 'Item Created',
        module: 'inventory',
        entity_id: data.id,
        entity_type: 'item',
        new_data: data as unknown as Record<string, unknown>,
      })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.items })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.itemsByCategory })
    },
  })
}

export function useUpdateInventoryItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: InventoryItemUpdate & { id: string }) => {
      const supabase = createClient()
      const { data: old } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      const { data, error } = await supabase
        .from('inventory_items')
        .update(values)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      void logActivity({
        action: 'Item Updated',
        module: 'inventory',
        entity_id: id,
        entity_type: 'item',
        old_data: old as unknown as Record<string, unknown> | null,
        new_data: data as unknown as Record<string, unknown>,
      })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.items })
    },
  })
}

/** Atomic tool creation: item + default brand_variant via RPC.
 *  Used by the Master Data → Tools & Assets Add Tool button. */
export function useCreateToolItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { name_en: string; name_ar?: string | null; category_id: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('create_tool_item_with_default_variant', {
        p_name_en:     payload.name_en,
        p_name_ar:     payload.name_ar ?? '',
        p_category_id: payload.category_id,
      })
      if (error) throw error
      const newItemId = data as unknown as string
      void logActivity({
        action:      'Tool Created',
        module:      'inventory',
        entity_id:   newItemId,
        entity_type: 'inventory_item',
        new_data:    { name_en: payload.name_en, category_id: payload.category_id },
      })
      return newItemId
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.items })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.itemsByCategory })
    },
  })
}

export function useCreateBrandVariant() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: BrandVariantInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_brand_variants')
        .insert(values as unknown as DBInsert<'inventory_brand_variants'>)
        .select()
        .single()
      if (error) throw error
      void logActivity({
        action: 'Brand Variant Created',
        module: 'inventory',
        entity_id: data.id,
        entity_type: 'brand_variant',
        new_data: data as unknown as Record<string, unknown>,
      })
      return data
    },
    onSuccess: (_: unknown, variables: BrandVariantInsert) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.brandVariantsByItem(variables.item_id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.brandVariantsV2ByItem(variables.item_id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.items })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.allBrandNames })
    },
  })
}

export function useUpdateBrandVariant() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: BrandVariantUpdate & { id: string }) => {
      const supabase = createClient()
      const { data: old } = await supabase
        .from('inventory_brand_variants')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      const { data, error } = await supabase
        .from('inventory_brand_variants')
        .update(values as unknown as import('@/types/database.types').DBUpdate<'inventory_brand_variants'>)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      void logActivity({
        action: 'Brand Variant Updated',
        module: 'inventory',
        entity_id: id,
        entity_type: 'brand_variant',
        old_data: old as unknown as Record<string, unknown> | null,
        new_data: data as unknown as Record<string, unknown>,
      })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.brandVariants })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.brandVariantsV2 })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.items })
    },
  })
}

export function useInventoryItemsAll(enabled = true) {
  return useQuery({
    queryKey: queryKeys.inventory.itemsAll,
    enabled,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_items')
        .select('*, inventory_categories(id, name_en, type)')
        .order('name_en')
      if (error) throw error
      return (data ?? []) as (InventoryItem & {
        inventory_categories: { id: string; name_en: string; type: string } | null
      })[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export interface BrandVariantGrouped {
  variantId: string
  brand: string
  costPrice: number
  itemId: string
  itemName: string
  itemSku: string
  catId: string
  catName: string
  catType: string
}

/** All brand variants with item + category info — used for the hierarchical link picker. */
export function useAllBrandVariantsGrouped(enabled = true) {
  return useQuery({
    queryKey: queryKeys.inventory.brandVariantsGrouped,
    enabled,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_brand_variants')
        .select('id, brand, cost_price, inventory_items(id, name_en, sku, inventory_categories(id, name_en, type))')
        .order('brand')
      if (error) throw error
      const rows = (data ?? []) as Array<{
        id: string
        brand: string
        cost_price: number | null
        inventory_items: {
          id: string
          name_en: string
          sku: string
          inventory_categories: { id: string; name_en: string; type: string } | null
        } | null
      }>
      return rows.map((r): BrandVariantGrouped => ({
        variantId: r.id,
        brand: r.brand,
        costPrice: r.cost_price ?? 0,
        itemId: r.inventory_items?.id ?? '',
        itemName: r.inventory_items?.name_en ?? 'Unknown item',
        itemSku: r.inventory_items?.sku ?? '',
        catId: r.inventory_items?.inventory_categories?.id ?? '__none__',
        catName: r.inventory_items?.inventory_categories?.name_en ?? 'Uncategorised',
        catType: r.inventory_items?.inventory_categories?.type ?? '',
      }))
    },
    staleTime: 5 * 60 * 1000,
  })
}

// ─── New types ────────────────────────────────────────────────────────────────

export type FifoLayer = {
  id: string
  brand_variant_id: string
  receival_number: string | null
  receival_id: string | null
  source_type: string | null
  date: string
  qty: number
  remaining_qty: number
  unit_cost: number
  landed_cost_per_unit: number
  total_unit_cost: number
  created_at: string
  warehouse_id: string | null
  warehouse_name: string | null
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

// ─── Category hooks (new) ─────────────────────────────────────────────────────

export function useInventoryCategoriesByType(type: string, showArchived = false) {
  return useQuery({
    queryKey: queryKeys.inventory.categoriesByType(type, showArchived),
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase
        .from('inventory_categories')
        .select('*')
        .eq('type', type as 'products' | 'spare-parts' | 'consumables' | 'tools')
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
  return useMutation<InventoryCategory, Error, { name_en: string; name_ar?: string | null; sku?: string | null; description?: string | null; type: string; parent_id?: string | null }>({
    mutationFn: async (payload) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_categories')
        .insert(payload as unknown as DBInsert<'inventory_categories'>)
        .select()
        .single()
      if (error) throw error
      void logActivity({
        action: 'Category Created',
        module: 'inventory',
        entity_id: data.id,
        entity_type: 'category',
        new_data: data as unknown as Record<string, unknown>,
      })
      return data as InventoryCategory
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: queryKeys.inventory.categoriesByType(v.type) })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.categories })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.categoriesTree })
    },
  })
}

export function useUpdateInventoryCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...payload }: { id: string; name_en?: string; name_ar?: string | null; sku?: string | null; description?: string | null; status?: string; parent_id?: string | null }) => {
      const supabase = createClient()
      const { data: old } = await supabase
        .from('inventory_categories')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      const { data, error } = await supabase
        .from('inventory_categories')
        .update(payload)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      void logActivity({
        action: 'Category Updated',
        module: 'inventory',
        entity_id: id,
        entity_type: 'category',
        old_data: old as unknown as Record<string, unknown> | null,
        new_data: data as unknown as Record<string, unknown>,
      })
      return data as InventoryCategory
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.inventory.categories })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.categoriesTree })
    },
  })
}

// ─── Item hooks (new) ─────────────────────────────────────────────────────────

export function useInventoryItemsByCategory(categoryId: string | null, showArchived = false) {
  return useQuery({
    queryKey: queryKeys.inventory.itemsByCategoryId(categoryId, showArchived),
    enabled: !!categoryId,
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase
        .from('inventory_items')
        .select('*')
        .eq('category_id', categoryId!)
        .order('sort_order', { ascending: true })
        .order('name_en', { ascending: true })
        .limit(1000)
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
      const { data: old } = await supabase
        .from('inventory_items').select('*').eq('id', id).maybeSingle()
      const { error } = await supabase
        .from('inventory_items')
        .update({ status: 'archived' })
        .eq('id', id)
      if (error) throw error
      const name = (old as { name?: string } | null)?.name ?? null
      void logActivity({
        action: 'Item Archived',
        module: 'inventory',
        entity_id: id,
        entity_type: 'item',
        severity: 'warning',
        old_data: { name, status: 'active' },
        new_data: { name, status: 'archived' },
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.inventory.itemsByCategory })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.brandVariantsV2 })
    },
  })
}

// ─── Brand variant hooks (new) ────────────────────────────────────────────────

export function useInventoryBrandVariants(itemId: string | null, showArchived = false) {
  return useQuery({
    queryKey: queryKeys.inventory.brandVariantsV2ByItem(itemId, showArchived),
    enabled: !!itemId,
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase
        .from('inventory_brand_variants')
        .select('*')
        .eq('item_id', itemId!)
        .order('sort_order', { ascending: true })
        .order('brand', { ascending: true })
        .limit(500)
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
      const { data: old } = await supabase
        .from('inventory_brand_variants').select('*').eq('id', id).maybeSingle()
      const { error } = await supabase
        .from('inventory_brand_variants')
        .update({ status: 'archived' })
        .eq('id', id)
      if (error) throw error
      const brand = (old as { brand?: string } | null)?.brand ?? null
      void logActivity({
        action: 'Brand Variant Archived',
        module: 'inventory',
        entity_id: id,
        entity_type: 'brand_variant',
        severity: 'warning',
        old_data: { name: brand, status: 'active' },
        new_data: { name: brand, status: 'archived' },
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.inventory.brandVariantsV2 }),
  })
}

// ─── FIFO layers ──────────────────────────────────────────────────────────────

export function useFifoLayers(brandVariantId: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.inventory.fifoLayersByVariant(brandVariantId),
    enabled: enabled && !!brandVariantId,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('fifo_cost_layers')
        .select('id, brand_variant_id, receival_number, receival_id, source_type, date, qty, remaining_qty, unit_cost, landed_cost_per_unit, total_unit_cost, created_at, warehouse_id, warehouses!fifo_cost_layers_warehouse_id_fkey(name)')
        .eq('brand_variant_id', brandVariantId!)
        .order('date', { ascending: true })
        .order('receival_number', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []).map((r) => {
        const row = r as unknown as {
          id: string
          brand_variant_id: string
          receival_number: string | null
          receival_id: string | null
          source_type: string | null
          date: string
          qty: number
          remaining_qty: number
          unit_cost: number
          landed_cost_per_unit: number
          total_unit_cost: number
          created_at: string
          warehouse_id: string | null
          warehouses: { name: string } | null
        }
        return {
          id: row.id,
          brand_variant_id: row.brand_variant_id,
          receival_number: row.receival_number,
          receival_id: row.receival_id,
          source_type: row.source_type,
          date: row.date,
          qty: row.qty,
          remaining_qty: row.remaining_qty,
          unit_cost: row.unit_cost,
          landed_cost_per_unit: row.landed_cost_per_unit,
          total_unit_cost: row.total_unit_cost,
          created_at: row.created_at,
          warehouse_id: row.warehouse_id,
          warehouse_name: row.warehouses?.name ?? null,
        }
      }) as FifoLayer[]
    },
    staleTime: 2 * 60 * 1000,
  })
}

// ─── Per-warehouse stock breakdown ────────────────────────────────────────────

export type WarehouseStockRow = { warehouse_id: string; qty: number }
export type VariantWarehouseStock = { perWarehouse: WarehouseStockRow[]; unassigned: number; hasReceivals: boolean }

export function useVariantWarehouseStock(variantId: string | undefined, enabled = true) {
  return useQuery<VariantWarehouseStock>({
    queryKey: queryKeys.inventory.variantWarehouseStockById(variantId),
    queryFn: async () => {
      if (!variantId) return { perWarehouse: [], unassigned: 0, hasReceivals: false }
      const supabase = createClient()
      const { data, error } = await supabase
        .from('fifo_cost_layers')
        .select('warehouse_id, remaining_qty, receival_id')
        .eq('brand_variant_id', variantId)
        .gt('remaining_qty', 0)
      if (error) throw error

      const whMap = new Map<string, number>()
      let unassigned = 0
      let hasReceivals = false
      for (const row of (data ?? []) as { warehouse_id: string | null; remaining_qty: number; receival_id: string | null }[]) {
        if (row.receival_id) hasReceivals = true
        if (!row.warehouse_id) {
          unassigned += row.remaining_qty
        } else {
          whMap.set(row.warehouse_id, (whMap.get(row.warehouse_id) ?? 0) + row.remaining_qty)
        }
      }

      return {
        perWarehouse: Array.from(whMap.entries()).map(([warehouse_id, qty]) => ({ warehouse_id, qty })),
        unassigned,
        hasReceivals,
      }
    },
    enabled: !!variantId && enabled,
    staleTime: 0,
  })
}

// ─── Category stock aggregates ────────────────────────────────────────────────

export type CategoryStockAggregate = {
  category_id: string
  total_stock: number
  total_reserved: number
  total_damaged: number
  total_incoming: number
  avg_cost: number
  variant_count: number
}

export function useCategoryStockAggregates(categoryType: string) {
  return useQuery({
    queryKey: queryKeys.inventory.categoryStockAggregates(categoryType),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('get_category_stock_aggregates', { p_type: categoryType })
      if (error) throw error
      const map = new Map<string, CategoryStockAggregate>()
      for (const row of (data ?? [])) {
        map.set(row.category_id, row as CategoryStockAggregate)
      }
      return map
    },
    staleTime: 60 * 1000,
  })
}

// ─── Tool asset hooks ─────────────────────────────────────────────────────────
// Unit-tracking only. The item catalog lives in inventory_items — see
// useInventoryItems / useInventoryItemsByCategory.

export function useToolAssetUnits(itemId: string | null) {
  return useQuery({
    queryKey: queryKeys.inventory.toolAssetUnits(itemId),
    enabled: !!itemId,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('tool_asset_units')
        .select('*')
        .eq('item_id', itemId!)
        .order('created_at', { ascending: true })
        .limit(500)
      if (error) throw error
      return (data ?? []) as ToolAssetUnit[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateToolAssetUnit() {
  const qc = useQueryClient()
  return useMutation<ToolAssetUnit, Error, { item_id: string; serial_number: string; brand: string; condition?: string; expiry?: string | null; status?: string; assigned_to?: string | null }>({
    mutationFn: async (payload) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('tool_asset_units')
        .insert({ condition: 'Good', status: 'available', ...payload } as unknown as DBInsert<'tool_asset_units'>)
        .select()
        .single()
      if (error) throw error
      void logActivity({
        action:      'Tool Unit Created',
        module:      'inventory',
        entity_id:   data.id,
        entity_type: 'tool_unit',
        new_data:    data as unknown as Record<string, unknown>,
      })
      return data as ToolAssetUnit
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: queryKeys.inventory.toolAssetUnits(v.item_id) })
    },
  })
}

export function useUpdateToolAssetUnit() {
  const qc = useQueryClient()
  return useMutation<ToolAssetUnit, Error, { id: string; item_id: string; serial_number?: string; brand?: string; condition?: string; status?: string; expiry?: string | null; assigned_to?: string | null }>({
    mutationFn: async ({ id, item_id: _item_id, ...payload }) => {
      const supabase = createClient()
      const { data: old } = await supabase
        .from('tool_asset_units').select('*').eq('id', id).maybeSingle()
      const { data, error } = await supabase
        .from('tool_asset_units')
        .update(payload as unknown as import('@/types/database.types').DBUpdate<'tool_asset_units'>)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      void logActivity({
        action:      'Tool Unit Updated',
        module:      'inventory',
        entity_id:   id,
        entity_type: 'tool_unit',
        old_data:    old as unknown as Record<string, unknown> | null,
        new_data:    data as unknown as Record<string, unknown>,
      })
      return data as ToolAssetUnit
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: queryKeys.inventory.toolAssetUnits(v.item_id) })
    },
  })
}

// ─── All items flat (for Service Links tab) ───────────────────────────────────

export function useInventoryItemsFlat(enabled = true) {
  return useQuery({
    queryKey: queryKeys.inventory.itemsAllV2,
    enabled,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
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

// ─── Cascade archive category ─────────────────────────────────────────────────

export function useArchiveInventoryCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (categoryId: string) => {
      const supabase = createClient()
      const { data: cat } = await supabase
        .from('inventory_categories').select('*').eq('id', categoryId).maybeSingle()
      const { data: items, error: fetchErr } = await supabase
        .from('inventory_items')
        .select('id')
        .eq('category_id', categoryId)
      if (fetchErr) throw fetchErr

      if (items && items.length > 0) {
        const itemIds = (items as { id: string }[]).map((i) => i.id)
        const { error: varErr } = await supabase
          .from('inventory_brand_variants')
          .update({ status: 'archived' })
          .in('item_id', itemIds)
        if (varErr) throw varErr
        const { error: itemErr } = await supabase
          .from('inventory_items')
          .update({ status: 'archived' })
          .in('id', itemIds)
        if (itemErr) throw itemErr
      }

      const { error } = await supabase
        .from('inventory_categories')
        .update({ status: 'archived' })
        .eq('id', categoryId)
      if (error) throw error
      const catName = (cat as { name_en?: string; name?: string } | null)?.name_en
        ?? (cat as { name_en?: string; name?: string } | null)?.name ?? null
      void logActivity({
        action: 'Category Archived',
        module: 'inventory',
        entity_id: categoryId,
        entity_type: 'category',
        severity: 'warning',
        old_data: { name: catName, status: 'active' },
        new_data: { name: catName, status: 'archived' },
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.inventory.categories })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.categoriesTree })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.itemsByCategory })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.brandVariantsV2 })
    },
  })
}

// ─── Sort order bulk update ───────────────────────────────────────────────────

export function useUpdateSortOrders(table: 'inventory_categories' | 'inventory_items' | 'inventory_brand_variants') {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (updates: { id: string; sort_order: number }[]) => {
      const supabase = createClient()
      const results = await Promise.all(
        updates.map(({ id, sort_order }) =>
          supabase.from(table).update({ sort_order }).eq('id', id)
        )
      )
      const failed = results.find((r: { error: unknown }) => r.error)
      if (failed) throw (failed as { error: unknown }).error
    },
    onSuccess: () => {
      if (table === 'inventory_categories') qc.invalidateQueries({ queryKey: queryKeys.inventory.categories })
      if (table === 'inventory_items') qc.invalidateQueries({ queryKey: queryKeys.inventory.itemsByCategory })
      if (table === 'inventory_brand_variants') qc.invalidateQueries({ queryKey: queryKeys.inventory.brandVariantsV2 })
    },
  })
}

// ─── Item attributes (chips) ──────────────────────────────────────────────────

export function useUpsertInventoryItemAttributes() {
  const qc = useQueryClient()
  return useMutation<void, Error, { itemId: string; attributes: string[] }>({
    mutationFn: async ({ itemId, attributes }) => {
      const supabase = createClient()
      // inventory_item_attributes not yet in generated DB types — cast to bypass type checks
      type AnyTable = { delete: () => { eq: (col: string, val: string) => Promise<{ error: Error | null }> }; insert: (v: unknown) => Promise<{ error: Error | null }> }
      const attrTable = (supabase as unknown as { from: (t: string) => AnyTable }).from('inventory_item_attributes')
      const { error: delErr } = await attrTable.delete().eq('item_id', itemId)
      if (delErr) throw delErr
      if (attributes.length > 0) {
        const rows = attributes.map((attr) => ({ item_id: itemId, attribute: attr }))
        const { error: insErr } = await attrTable.insert(rows)
        if (insErr) throw insErr
      }
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: queryKeys.inventory.itemAttributes(v.itemId) })
    },
  })
}

// ─── Staff profiles (for tool unit assignment) ────────────────────────────────

export function useStaffProfiles() {
  return useQuery({
    queryKey: queryKeys.inventory.staffProfiles,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .order('full_name')
      if (error) throw error
      return (data ?? []) as { id: string; full_name: string }[]
    },
    staleTime: 10 * 60 * 1000,
  })
}

// ─── LC Price Review helpers ───────────────────────────────────────────────────

export type BrandVariantPriceSummary = {
  id: string
  selling_price: number | null
  average_cost: number | null
}

export function useBrandVariantsByIds(ids: string[]) {
  return useQuery({
    queryKey: queryKeys.inventory.brandVariantsPriceSummaryByIds(ids.slice().sort().join(',')),
    enabled: ids.length > 0,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_brand_variants')
        .select('id, selling_price, average_cost')
        .in('id', ids)
      if (error) throw error
      return (data ?? []) as BrandVariantPriceSummary[]
    },
    staleTime: 0,
  })
}

export type SellingPriceUpdate = {
  id: string
  selling_price: number
}

export function useBatchUpdateSellingPrices() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (updates: SellingPriceUpdate[]) => {
      const supabase = createClient()
      // Single Postgres transaction via RPC — avoids N parallel HTTP requests
      const { error } = await supabase
        .rpc('batch_update_variant_prices', { p_updates: updates })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.inventory.brandVariants })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.inventoryBrandVariants })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.brandVariantsPriceSummary })
    },
  })
}

// ─── Reserved order lines (for the reserved-badge drill-down) ────────────────

export type ReservedOrderLine = {
  id: string
  qty: number
  delivered_qty: number
  sale_orders: {
    id: string
    so_number: string
    status: string
    expected_delivery: string | null
    customers: { name: string } | null
  } | null
}

export function useReservedOrderLines(brandVariantId: string | null) {
  return useQuery({
    queryKey: queryKeys.inventory.reservedOrderLinesByVariant(brandVariantId),
    enabled: !!brandVariantId,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('sale_order_lines')
        .select('id, qty, delivered_qty, sale_orders!inner(id, so_number, status, expected_delivery, customers(name))')
        .eq('brand_variant_id', brandVariantId!)
        .in('sale_orders.status', ['confirmed', 'partial_delivery'])
        .is('sale_orders.deleted_at', null)
      if (error) throw error
      return (data ?? []) as ReservedOrderLine[]
    },
    staleTime: 30 * 1000,
  })
}

export function useAllBrandNames() {
  return useQuery({
    queryKey: queryKeys.inventory.allBrandNames,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_brand_variants')
        .select('brand')
        .neq('status', 'archived')
        .order('brand')
      if (error) throw error
      return [...new Set((data ?? []).map((r: { brand: string }) => r.brand))] as string[]
    },
    staleTime: 10 * 60 * 1000,
  })
}

