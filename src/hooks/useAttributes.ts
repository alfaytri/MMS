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
