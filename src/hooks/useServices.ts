// src/hooks/useServices.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { DBTable, DBInsert, DBUpdate } from '@/types/database.types'

export type Service = DBTable<'services'>
export type ServiceInsert = DBInsert<'services'>
export type ServiceUpdate = DBUpdate<'services'>
export type Instruction = DBTable<'instructions'>

export function useServiceTree(
  treeType: string,
  divisionSlugs: string[],
  enabled = true,
) {
  return useQuery({
    queryKey: ['services', treeType, divisionSlugs],
    queryFn: async () => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase.from('services') as any)
        .select('*')
        .eq('tree_type', treeType)
        .order('sort_order', { ascending: true })
      if (divisionSlugs.length > 0) {
        query = query.in('division', divisionSlugs)
      }
      const { data, error } = await query
      if (error) throw error
      return data as Service[]
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  })
}

export function useInstructions(enabled = true) {
  return useQuery({
    queryKey: ['instructions'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('instructions')
        .select('id, name_en, name_ar')
        .order('name_en')
      if (error) throw error
      return data as Pick<Instruction, 'id' | 'name_en' | 'name_ar'>[]
    },
    enabled,
    staleTime: 10 * 60 * 1000,
  })
}

export function useCreateService() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: ServiceInsert & { treeType: string }) => {
      const supabase = createClient()
      const { treeType, ...payload } = values
      const { data, error } = await supabase
        .from('services')
        .insert(payload)
        .select()
        .single()
      if (error) throw error
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('activity_log') as any).insert({
        action: 'services/service-created',
        module: 'services',
        entity_type: 'service',
        entity_id: data.id,
        details: JSON.stringify({
          name_en: data.name_en,
          tree_type: data.tree_type,
          parent_id: data.parent_id,
        }),
      })
      return { ...data, treeType }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['services', data.treeType] })
    },
  })
}

export function useUpdateService() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (
      values: ServiceUpdate & { id: string; treeType: string; changedFields: string[] },
    ) => {
      const supabase = createClient()
      const { id, treeType, changedFields, ...payload } = values
      const { data, error } = await supabase
        .from('services')
        .update(payload)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('activity_log') as any).insert({
        action: 'services/service-updated',
        module: 'services',
        entity_type: 'service',
        entity_id: id,
        details: JSON.stringify({ changed_fields: changedFields }),
      })
      return { ...data, treeType }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['services', data.treeType] })
    },
  })
}

export function useReorderServices() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      movedId,
      parentId,
      direction,
      treeType,
    }: {
      movedId: string
      parentId: string | null
      direction: 'up' | 'down'
      treeType: string
    }) => {
      const supabase = createClient()
      // Re-fetch live siblings to handle sort_order gaps from concurrent inserts
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let siblingsQuery = (supabase.from('services') as any)
        .select('id, sort_order')
        .eq('tree_type', treeType)
        .order('sort_order', { ascending: true })
      if (parentId) {
        siblingsQuery = siblingsQuery.eq('parent_id', parentId)
      } else {
        siblingsQuery = siblingsQuery.is('parent_id', null)
      }
      const { data: siblings, error: fetchErr } = await siblingsQuery
      if (fetchErr) throw fetchErr

      const idx = (siblings as { id: string; sort_order: number }[]).findIndex(
        (s) => s.id === movedId,
      )
      if (idx === -1) throw new Error('Service not found in siblings')
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1
      if (targetIdx < 0 || targetIdx >= siblings.length) return null // boundary

      const moved = siblings[idx] as { id: string; sort_order: number }
      const sibling = siblings[targetIdx] as { id: string; sort_order: number }

      await Promise.all([
        supabase.from('services').update({ sort_order: sibling.sort_order }).eq('id', moved.id),
        supabase.from('services').update({ sort_order: moved.sort_order }).eq('id', sibling.id),
      ])

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('activity_log') as any).insert({
        action: 'services/service-reordered',
        module: 'services',
        entity_type: 'service',
        entity_id: movedId,
        details: JSON.stringify({
          direction,
          from_sort_order: moved.sort_order,
          to_sort_order: sibling.sort_order,
          swapped_with_id: sibling.id,
        }),
      })

      return { treeType }
    },
    onSuccess: (result) => {
      if (result) {
        queryClient.invalidateQueries({ queryKey: ['services', result.treeType] })
      }
    },
  })
}
