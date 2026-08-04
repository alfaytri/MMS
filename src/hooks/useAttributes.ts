'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import type { DBTable, DBInsert } from '@/types/database.types'

export type AttributeDefinition = DBTable<'inventory_attribute_definitions'>
export type AttributeOption     = DBTable<'inventory_attribute_options'>
export type ItemAttributeValue  = DBTable<'inventory_item_attributes'>

export type EffectiveAttribute = {
  definition_id: string
  category_id: string
  category_name: string
  attribute_key: string
  label_en: string
  label_ar: string | null
  sort_order: number
  depth: number
  is_inherited: boolean
}

// ─── Definitions ────────────────────────────────────────────────────────

export function useAttributeDefinitionsForCategory(categoryId: string | null) {
  return useQuery({
    queryKey: queryKeys.attributes.definitionsForCategory(categoryId ?? '__none__'),
    enabled: !!categoryId,
    staleTime: 60_000,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_attribute_definitions')
        .select('*')
        .eq('category_id', categoryId!)
        .order('sort_order', { ascending: true })
        .limit(200)
      if (error) throw error
      return (data ?? []) as AttributeDefinition[]
    },
  })
}

export function useEffectiveAttributes(categoryId: string | null) {
  return useQuery({
    queryKey: queryKeys.attributes.effectiveForCategory(categoryId ?? '__none__'),
    enabled: !!categoryId,
    staleTime: 60_000,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('get_effective_attributes', {
        p_category_id: categoryId!,
      })
      if (error) throw error
      return (data ?? []) as EffectiveAttribute[]
    },
  })
}

export function useUpsertAttributeDefinition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      id?: string
      category_id: string
      attribute_key: string
      label_en: string
      label_ar?: string | null
      sort_order?: number
    }) => {
      const supabase = createClient()
      const row: DBInsert<'inventory_attribute_definitions'> = {
        id: payload.id,
        category_id: payload.category_id,
        attribute_key: payload.attribute_key,
        label_en: payload.label_en,
        label_ar: payload.label_ar ?? null,
        sort_order: payload.sort_order ?? 0,
      }
      const { data, error } = await supabase
        .from('inventory_attribute_definitions')
        .upsert(row)
        .select('*')
        .single()
      if (error) throw error
      return data as AttributeDefinition
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: queryKeys.attributes.definitionsForCategory(data.category_id) })
      qc.invalidateQueries({ queryKey: queryKeys.attributes.effectiveForCategory(data.category_id) })
      qc.invalidateQueries({ queryKey: queryKeys.attributes.all })
    },
  })
}

export function useDeleteAttributeDefinition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ definitionId }: { definitionId: string }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('inventory_attribute_definitions')
        .delete()
        .eq('id', definitionId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.attributes.all })
    },
  })
}

// ─── Options ────────────────────────────────────────────────────────────

export function useAttributeOptionsForDefinition(definitionId: string | null) {
  return useQuery({
    queryKey: queryKeys.attributes.optionsForDefinition(definitionId ?? '__none__'),
    enabled: !!definitionId,
    staleTime: 60_000,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_attribute_options')
        .select('*')
        .eq('definition_id', definitionId!)
        .order('sort_order', { ascending: true })
        .limit(500)
      if (error) throw error
      return (data ?? []) as AttributeOption[]
    },
  })
}

export function useUpsertAttributeOption() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      id?: string
      definition_id: string
      value_en: string
      value_ar?: string | null
      sort_order?: number
      is_archived?: boolean
    }) => {
      const supabase = createClient()
      const row: DBInsert<'inventory_attribute_options'> = {
        id: payload.id,
        definition_id: payload.definition_id,
        value_en: payload.value_en,
        value_ar: payload.value_ar ?? null,
        sort_order: payload.sort_order ?? 0,
        is_archived: payload.is_archived ?? false,
      }
      const { data, error } = await supabase
        .from('inventory_attribute_options')
        .upsert(row)
        .select('*')
        .single()
      if (error) throw error
      return data as AttributeOption
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: queryKeys.attributes.optionsForDefinition(data.definition_id) })
      qc.invalidateQueries({ queryKey: queryKeys.attributes.all })
    },
  })
}

export function useDeleteAttributeOption() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ optionId }: { optionId: string }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('inventory_attribute_options')
        .delete()
        .eq('id', optionId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.attributes.all })
    },
  })
}

// ─── Item values ────────────────────────────────────────────────────────

export type ItemAttributeRow = {
  id: string
  item_id: string
  definition_id: string
  option_id: string
}

export function useItemAttributes(itemId: string | null) {
  return useQuery({
    queryKey: queryKeys.attributes.itemValues(itemId ?? '__none__'),
    enabled: !!itemId,
    staleTime: 30_000,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_item_attributes')
        .select('id, item_id, definition_id, option_id')
        .eq('item_id', itemId!)
      if (error) throw error
      return (data ?? []) as ItemAttributeRow[]
    },
  })
}

/**
 * Upsert / clear an item's attribute values.
 *
 * `values` is the FULL desired state — every effective attribute for the
 * item's category, with `option_id: null` meaning "clear this attribute
 * (delete the row)" and a set `option_id` meaning "this is the picked
 * value." Rows for definitions not present in `values` are left untouched.
 */
export function useUpsertItemAttributes() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ itemId, values }: {
      itemId: string
      values: Array<{ definition_id: string; option_id: string | null }>
    }) => {
      const supabase = createClient()
      const toDelete = values.filter((v) => v.option_id === null).map((v) => v.definition_id)
      const toUpsert = values
        .filter((v) => v.option_id !== null)
        .map((v) => ({
          item_id: itemId,
          definition_id: v.definition_id,
          option_id: v.option_id!,
        }))
      if (toDelete.length > 0) {
        const { error } = await supabase
          .from('inventory_item_attributes')
          .delete()
          .eq('item_id', itemId)
          .in('definition_id', toDelete)
        if (error) throw error
      }
      if (toUpsert.length > 0) {
        const { error } = await supabase
          .from('inventory_item_attributes')
          .upsert(toUpsert, { onConflict: 'item_id,definition_id' })
        if (error) throw error
      }
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.attributes.itemValues(vars.itemId) })
      qc.invalidateQueries({ queryKey: queryKeys.attributes.all })
    },
  })
}

// ─── Picker step (RPC) ─────────────────────────────────────────────────

export type PickerStepResult = {
  items: Array<{
    id: string
    name_en: string
    name_ar: string | null
    sku: string | null
    image_url: string | null
    brand_variants: Array<{
      id: string
      brand: string
      code: string | null
      stock_level: number | null
    }>
  }>
  next_attribute: {
    id: string
    key: string
    label_en: string
    label_ar: string | null
  } | null
  next_options: Array<{
    id: string
    value_en: string
    value_ar: string | null
    item_count: number
  }>
}

/**
 * One round-trip for the ProductAttributePicker. Given a category and the
 * current set of picks (attribute_key → option_id), returns candidate items,
 * the next attribute to ask about (null when narrowed enough), and the
 * options for that next attribute with per-option item counts.
 */
export function useAttributePickerStep(
  categoryId: string | null,
  picks: Record<string, string>,
) {
  const picksKey = JSON.stringify(picks) // stable key for query cache
  return useQuery({
    queryKey: queryKeys.attributes.pickerStep(categoryId ?? '__none__', picksKey),
    enabled: !!categoryId,
    staleTime: 30_000,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('rpc_attribute_picker_step', {
        p_category_id: categoryId!,
        p_picks: picks,
      })
      if (error) {
        // PostgrestError isn't an Error subclass — wrap so useQuery / consumers
        // see a real Error with all diagnostic fields in the message.
        const parts = [
          error.code ? `[${error.code}]` : null,
          error.message ?? 'RPC failed',
          error.details ? `details: ${error.details}` : null,
          error.hint ? `hint: ${error.hint}` : null,
        ].filter(Boolean)
        throw new Error(parts.join(' · '))
      }
      return (data ?? {
        items: [],
        next_attribute: null,
        next_options: [],
      }) as unknown as PickerStepResult
    },
  })
}
