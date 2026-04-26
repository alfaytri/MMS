import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { DBTable, DBInsert, DBUpdate } from '@/types/database.types'
import type { ServiceNode, ServiceInventoryLinkFull, LinkType } from '@/components/services/inventory/serviceInventoryHelpers'

export type InventoryCategory = DBTable<'inventory_categories'>
export type InventoryItem = DBTable<'inventory_items'>
export type BrandVariant = DBTable<'inventory_brand_variants'>
export type InventoryItemInsert = DBInsert<'inventory_items'>
export type InventoryItemUpdate = DBUpdate<'inventory_items'>
// Manual type used instead of DBInsert<'inventory_brand_variants'> because generated
// types are stale. The actual schema uses brand TEXT, not brand_id FK.
export type BrandVariantInsert = {
  item_id: string
  brand: string
  code?: string | null
  cost_price?: number | null
  selling_price?: number | null
  average_cost?: number | null
  reorder_point?: number
  margin_percent?: number | null
  stock_level?: number | null
}
export type BrandVariantUpdate = Partial<Omit<BrandVariantInsert, 'item_id'>> & { id?: string }

export function useInventoryCategories() {
  return useQuery({
    queryKey: ['inventory-categories'],
    queryFn: async () => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('inventory_categories') as any)
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
    queryKey: ['inventory-items', categoryType],
    queryFn: async () => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase as any)
        .from('inventory_items')
        .select('*, inventory_categories!inner(type, name_en)')
        .eq('status', 'active')
        .order('name_en')

      if (categoryType) {
        query = (query as any).eq('inventory_categories.type', categoryType)
      }

      const { data, error } = await query
      if (error) throw error
      return data
    },
  })
}

export function useBrandVariants(itemId: string | null) {
  return useQuery({
    queryKey: ['brand-variants', itemId],
    queryFn: async () => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
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
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-items-by-category'] })
    },
  })
}

export function useUpdateInventoryItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: InventoryItemUpdate & { id: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_items')
        .update(values)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] })
    },
  })
}

export function useCreateBrandVariant() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: BrandVariantInsert) => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('inventory_brand_variants')
        .insert(values)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_: unknown, variables: BrandVariantInsert) => {
      queryClient.invalidateQueries({ queryKey: ['brand-variants', variables.item_id] })
      queryClient.invalidateQueries({ queryKey: ['brand-variants-v2', variables.item_id] })
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] })
      queryClient.invalidateQueries({ queryKey: ['all-brand-names'] })
    },
  })
}

export function useUpdateBrandVariant() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: BrandVariantUpdate & { id: string }) => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('inventory_brand_variants')
        .update(values)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brand-variants'] })
      queryClient.invalidateQueries({ queryKey: ['brand-variants-v2'] })
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] })
    },
  })
}

export type ServiceWithInventory = {
  id: string
  name_en: string
  tree_type: string | null
  inventory_items: unknown
}

export function useInventoryItemsAll(enabled = true) {
  return useQuery({
    queryKey: ['inventory_items_all'],
    enabled,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_items')
        .select('*')
        .order('name_en')
      if (error) throw error
      return (data ?? []) as InventoryItem[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useServicesWithInventory(enabled = true) {
  return useQuery({
    queryKey: ['services_with_inventory'],
    enabled,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('services')
        .select('id, name_en, tree_type, inventory_items')
        .not('inventory_items', 'is', null)
        .order('name_en')
      if (error) throw error
      return (data ?? []).map((row) => ({
        id: row.id,
        name_en: row.name_en,
        tree_type: row.tree_type ?? null,
        inventory_items: row.inventory_items,
      })) as ServiceWithInventory[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

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
  quantity: number
  notes: string | null
}

// ─── Category hooks (new) ─────────────────────────────────────────────────────

export function useInventoryCategoriesByType(type: string, showArchived = false) {
  return useQuery({
    queryKey: ['inventory-categories', type, showArchived],
    queryFn: async () => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  return useMutation<InventoryCategory, Error, { name_en: string; name_ar?: string | null; sku?: string | null; type: string }>({
    mutationFn: async (payload) => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('inventory_categories')
        .insert(payload)
        .select()
        .single()
      if (error) throw error
      return data as InventoryCategory
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['inventory-categories', v.type] })
      qc.invalidateQueries({ queryKey: ['inventory-categories'] })
    },
  })
}

export function useUpdateInventoryCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...payload }: { id: string; name_en?: string; name_ar?: string | null; sku?: string | null; status?: string }) => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// ─── Item hooks (new) ─────────────────────────────────────────────────────────

export function useInventoryItemsByCategory(categoryId: string | null, showArchived = false) {
  return useQuery({
    queryKey: ['inventory-items-by-category', categoryId, showArchived],
    enabled: !!categoryId,
    queryFn: async () => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('inventory_items')
        .update({ status: 'archived' })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory-items-by-category'] })
      qc.invalidateQueries({ queryKey: ['brand-variants-v2'] })
    },
  })
}

// ─── Brand variant hooks (new) ────────────────────────────────────────────────

export function useInventoryBrandVariants(itemId: string | null, showArchived = false) {
  return useQuery({
    queryKey: ['brand-variants-v2', itemId, showArchived],
    enabled: !!itemId,
    queryFn: async () => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  return useMutation<ToolAssetUnit, Error, { item_id: string; serial_number: string; brand: string; condition?: string; expiry?: string | null; status?: string; assigned_to?: string | null }>({
    mutationFn: async (payload) => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('tool_asset_units')
        .insert({ condition: 'Good', status: 'available', ...payload })
        .select()
        .single()
      if (error) throw error
      return data as ToolAssetUnit
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['tool-asset-units', v.item_id] })
    },
  })
}

export function useUpdateToolAssetUnit() {
  const qc = useQueryClient()
  return useMutation<ToolAssetUnit, Error, { id: string; item_id: string; serial_number?: string; brand?: string; condition?: string; status?: string; expiry?: string | null; assigned_to?: string | null }>({
    mutationFn: async ({ id, item_id: _item_id, ...payload }) => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('tool_asset_units')
        .update(payload)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as ToolAssetUnit
    },
    onSuccess: (_, v) => {
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('service_inventory')
        .select('id, service_id, brand_variant_id, quantity, notes')
        .eq('brand_variant_id', brandVariantId!)
      if (error) throw error
      return (data ?? []) as ServiceInventoryLink[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useUpdateServiceInventoryLinks() {
  const qc = useQueryClient()
  return useMutation<void, Error, { brandVariantId: string; serviceIds: string[] }>({
    mutationFn: async ({ brandVariantId, serviceIds }) => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from('service_inventory')
          .delete()
          .in('id', toRemove)
        if (error) throw error
      }
      if (toAdd.length > 0) {
        const rows = toAdd.map((sid) => ({ service_id: sid, brand_variant_id: brandVariantId, quantity: 1 }))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).from('service_inventory').insert(rows)
        if (error) throw error
      }
    },
    onSuccess: (_, v) => {
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

// ─── All items flat (for Service Links tab) ───────────────────────────────────

export function useInventoryItemsFlat(enabled = true) {
  return useQuery({
    queryKey: ['inventory-items-all'],
    enabled,
    queryFn: async () => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// ─── Cascade archive category ─────────────────────────────────────────────────

export function useArchiveInventoryCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (categoryId: string) => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: items, error: fetchErr } = await (supabase as any)
        .from('inventory_items')
        .select('id')
        .eq('category_id', categoryId)
      if (fetchErr) throw fetchErr

      if (items && items.length > 0) {
        const itemIds = (items as { id: string }[]).map((i) => i.id)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: varErr } = await (supabase as any)
          .from('inventory_brand_variants')
          .update({ status: 'archived' })
          .in('item_id', itemIds)
        if (varErr) throw varErr
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: itemErr } = await (supabase as any)
          .from('inventory_items')
          .update({ status: 'archived' })
          .in('id', itemIds)
        if (itemErr) throw itemErr
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      const results = await Promise.all(
        updates.map(({ id, sort_order }) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any).from(table).update({ sort_order }).eq('id', id)
        )
      )
      const failed = results.find((r: { error: unknown }) => r.error)
      if (failed) throw (failed as { error: unknown }).error
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
  return useMutation<void, Error, { itemId: string; attributes: string[] }>({
    mutationFn: async ({ itemId, attributes }) => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: delErr } = await (supabase as any)
        .from('inventory_item_attributes')
        .delete()
        .eq('item_id', itemId)
      if (delErr) throw delErr
      if (attributes.length > 0) {
        const rows = attributes.map((attr) => ({ item_id: itemId, attribute: attr }))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: insErr } = await (supabase as any)
          .from('inventory_item_attributes')
          .insert(rows)
        if (insErr) throw insErr
      }
    },
    onSuccess: (_, v) => {
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// ─── LC Price Review helpers ───────────────────────────────────────────────────

export type BrandVariantPriceSummary = {
  id: string
  selling_price: number | null
  margin_percent: number | null
  average_cost: number | null
}

export function useBrandVariantsByIds(ids: string[]) {
  return useQuery({
    queryKey: ['brand-variants-price-summary', ids.slice().sort().join(',')],
    enabled: ids.length > 0,
    queryFn: async () => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('inventory_brand_variants')
        .select('id, selling_price, margin_percent, average_cost')
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
  margin_percent: number
}

export function useBatchUpdateSellingPrices() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (updates: SellingPriceUpdate[]) => {
      const supabase = createClient()
      // Single Postgres transaction via RPC — avoids N parallel HTTP requests
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .rpc('batch_update_variant_prices', { p_updates: updates })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brand-variants'] })
      qc.invalidateQueries({ queryKey: ['inventory-brand-variants'] })
      qc.invalidateQueries({ queryKey: ['brand-variants-price-summary'] })
    },
  })
}

export function useAllBrandNames() {
  return useQuery({
    queryKey: ['all-brand-names'],
    queryFn: async () => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
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

// ─── Service-centric service inventory hooks ──────────────────────────────────

/** All services — used to build leaves list and breadcrumbs. */
export function useServicesForLinks() {
  return useQuery({
    queryKey: ['services-for-links'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('services')
        .select('id, name_en, parent_id, tree_type')
        .order('name_en')
      if (error) throw error
      return (data ?? []) as ServiceNode[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * All service_inventory rows with joined variant + item details.
 * Uses LEFT JOIN (no !inner) so links with a missing/archived variant
 * appear with a null inventory_brand_variants field rather than silently
 * disappearing from the view and making the counters lie.
 */
export function useAllServiceLinks() {
  return useQuery({
    queryKey: ['service-links-all'],
    queryFn: async () => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('service_inventory')
        .select(`
          id,
          service_id,
          brand_variant_id,
          link_type,
          warranty_months,
          quantity,
          group_label,
          inventory_brand_variants(
            brand,
            selling_price,
            inventory_items(name_en, sku, unit)
          )
        `)
      if (error) throw error
      return (data ?? []) as ServiceInventoryLinkFull[]
    },
    staleTime: 2 * 60 * 1000,
  })
}

/** Insert a single new service↔variant link. */
export function useAddServiceInventoryLink() {
  const qc = useQueryClient()
  return useMutation<void, Error, {
    service_id: string
    brand_variant_id: string
    link_type: LinkType
    quantity: number
    warranty_months: number
    group_label?: string | null
  }>({
    mutationFn: async (row) => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('service_inventory')
        .insert(row)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['service-links-all'] })
    },
  })
}

/** Delete a service↔variant link by its primary key id. */
export function useDeleteServiceInventoryLink() {
  const qc = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('service_inventory')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['service-links-all'] })
    },
  })
}

/**
 * Patch link_type, warranty_months, or quantity on an existing link.
 * Uses optimistic updates to avoid table flicker on inline edits — the
 * cache is updated immediately; rolled back if the server rejects.
 */
export function useUpdateServiceInventoryLink() {
  const qc = useQueryClient()
  return useMutation<
    void,
    Error,
    { id: string; link_type?: LinkType; warranty_months?: number; quantity?: number; group_label?: string | null },
    { prev: ServiceInventoryLinkFull[] | undefined }
  >({
    mutationFn: async ({ id, ...patch }) => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('service_inventory')
        .update(patch)
        .eq('id', id)
      if (error) throw error
    },
    onMutate: async (variables) => {
      await qc.cancelQueries({ queryKey: ['service-links-all'] })
      const prev = qc.getQueryData<ServiceInventoryLinkFull[]>(['service-links-all'])
      qc.setQueryData<ServiceInventoryLinkFull[]>(['service-links-all'], (old) =>
        old?.map((l) => l.id === variables.id ? { ...l, ...variables } : l) ?? []
      )
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['service-links-all'], ctx.prev)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['service-links-all'] })
    },
  })
}
