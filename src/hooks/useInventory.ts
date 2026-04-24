import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { DBTable, DBInsert, DBUpdate } from '@/types/database.types'

export type InventoryCategory = DBTable<'inventory_categories'>
export type InventoryItem = DBTable<'inventory_items'>
export type BrandVariant = DBTable<'inventory_brand_variants'>
export type InventoryItemInsert = DBInsert<'inventory_items'>
export type InventoryItemUpdate = DBUpdate<'inventory_items'>
// Manual type used instead of DBInsert<'inventory_brand_variants'> because generated
// types are stale (they include a non-existent required 'brand' column)
export type BrandVariantInsert = {
  item_id: string
  brand_id?: string | null
  code?: string | null
  cost_price?: number | null
  selling_price?: number | null
  average_cost?: number | null
}
export type BrandVariantUpdate = Partial<BrandVariantInsert>

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
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] })
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
