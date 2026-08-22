// src/hooks/useServices.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { DBTable, DBInsert, DBUpdate } from '@/types/database.types'
import { queryKeys } from '@/lib/queryKeys'

export type Service = DBTable<'services'>
export type ServiceInsert = DBInsert<'services'>
export type ServiceUpdate = DBUpdate<'services'>
export type Instruction = DBTable<'instructions'>
export type InstructionFull = DBTable<'instructions'>

export function useServiceTree(
  treeType: string,
  divisionSlugs: string[],
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.services.byType(treeType, divisionSlugs),
    queryFn: async () => {
      const supabase = createClient()
      let query = supabase
        .from('services')
        .select('id, name_en, name_ar, parent_id, division, price, price_unit, duration, warranty, reminder_days, service_type, invoice_text_en, invoice_text_ar, emergency_price, inventory_items, qc_checklist, qc_items, spare_parts, contract_type, item_kind, pricing_mode, discount_scope, discount, status, has_pending_change, sort_order, tree_type, deleted_at')
        .eq('tree_type', treeType)
        .order('sort_order', { ascending: true })
      query = query.is('deleted_at', null)
      if (divisionSlugs.length > 0) {
        query = query.overlaps('division', divisionSlugs)
      }
      const { data, error } = await query.returns<Service[]>()
      if (error) throw error
      return data as Service[]
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  })
}

export function useInstructions(enabled = true) {
  return useQuery({
    queryKey: queryKeys.services.instructions,
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

export function useInstructionsFull(enabled = true) {
  return useQuery({
    queryKey: queryKeys.services.instructionsFull,
    enabled,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('instructions')
        .select('id,name_en,name_ar,type,content_type,content_preview,status,created_at')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as InstructionFull[]
    },
    staleTime: 5 * 60 * 1000,
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
        .insert(payload as ServiceInsert)
        .select('*')
        .single()
      if (error) throw error
      await supabase.from('activity_log').insert({
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
      // Prefix match — invalidates all divisionSlug variants for this treeType
      queryClient.invalidateQueries({ queryKey: queryKeys.services.byType(data.treeType) })
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
        .update(payload as ServiceUpdate)
        .eq('id', id)
        .select('*')
        .single()
      if (error) throw error
      await supabase.from('activity_log').insert({
        action: 'services/service-updated',
        module: 'services',
        entity_type: 'service',
        entity_id: id,
        details: JSON.stringify({ changed_fields: changedFields }),
      })
      return { ...data, treeType }
    },
    onSuccess: (data) => {
      // Prefix match — invalidates all divisionSlug variants for this treeType
      queryClient.invalidateQueries({ queryKey: queryKeys.services.byType(data.treeType) })
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
      // Re-fetch live siblings to get authoritative sort_order values for the swap
      let siblingsQuery = supabase
        .from('services')
        .select('id, sort_order')
        .eq('tree_type', treeType)
        .order('sort_order', { ascending: true })
      if (parentId) {
        siblingsQuery = siblingsQuery.eq('parent_id', parentId)
      } else {
        siblingsQuery = siblingsQuery.is('parent_id', null)
      }
      const { data: siblings, error: fetchErr } = await siblingsQuery.returns<{ id: string; sort_order: number | null }[]>()
      if (fetchErr) throw fetchErr

      const sortedSiblings = (siblings ?? [])
        .filter((s): s is { id: string; sort_order: number } => s.sort_order !== null)

      const idx = sortedSiblings.findIndex((s) => s.id === movedId)
      if (idx === -1) throw new Error('Service not found in siblings')
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1
      if (targetIdx < 0 || targetIdx >= sortedSiblings.length) return null

      const moved = sortedSiblings[idx]
      const sibling = sortedSiblings[targetIdx]

      await Promise.all([
        supabase.from('services').update({ sort_order: sibling.sort_order } as ServiceUpdate).eq('id', moved.id),
        supabase.from('services').update({ sort_order: moved.sort_order } as ServiceUpdate).eq('id', sibling.id),
      ])

      await supabase.from('activity_log').insert({
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

    onMutate: async ({ movedId, parentId, direction, treeType }) => {
      // Cancel any in-flight refetches so they don't overwrite the optimistic update
      await queryClient.cancelQueries({ queryKey: queryKeys.services.byType(treeType) })

      // Snapshot all matching queries for rollback on error
      const previousQueries = queryClient.getQueriesData<Service[]>({ queryKey: queryKeys.services.byType(treeType) })

      // Optimistically swap sort_order in every cached variant of this tree
      queryClient.setQueriesData<Service[]>({ queryKey: queryKeys.services.byType(treeType) }, (old) => {
        if (!old) return old
        const siblings = old
          .filter((s) => (s.parent_id ?? null) === parentId && s.sort_order !== null)
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        const idx = siblings.findIndex((s) => s.id === movedId)
        if (idx === -1) return old
        const targetIdx = direction === 'up' ? idx - 1 : idx + 1
        if (targetIdx < 0 || targetIdx >= siblings.length) return old
        const moved = siblings[idx]
        const sibling = siblings[targetIdx]
        return old.map((s) => {
          if (s.id === moved.id) return { ...s, sort_order: sibling.sort_order }
          if (s.id === sibling.id) return { ...s, sort_order: moved.sort_order }
          return s
        })
      })

      return { previousQueries }
    },

    onError: (_err, { treeType }, context) => {
      // Roll back to snapshot on failure
      context?.previousQueries.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data)
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.services.byType(treeType) })
    },

    onSettled: (_data, _err, { treeType }) => {
      // Sync with server once the mutation has settled (success or error)
      queryClient.invalidateQueries({ queryKey: queryKeys.services.byType(treeType) })
    },
  })
}

export function useReorderServicesBulk() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      updates,
      treeType,
    }: {
      updates: { id: string; sort_order: number }[]
      treeType: string
    }) => {
      const supabase = createClient()
      await Promise.all(
        updates.map(({ id, sort_order }) =>
          supabase.from('services').update({ sort_order }).eq('id', id),
        ),
      )
      return { treeType }
    },
    onMutate: async ({ updates, treeType }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.services.byType(treeType) })
      const previous = queryClient.getQueriesData<Service[]>({ queryKey: queryKeys.services.byType(treeType) })
      const orderMap = new Map(updates.map(({ id, sort_order }) => [id, sort_order]))
      queryClient.setQueriesData<Service[]>({ queryKey: queryKeys.services.byType(treeType) }, (old) => {
        if (!old) return old
        return old.map((s) => (orderMap.has(s.id) ? { ...s, sort_order: orderMap.get(s.id)! } : s))
      })
      return { previous }
    },
    onError: (_err, { treeType }, context) => {
      context?.previous.forEach(([key, data]) => queryClient.setQueryData(key, data))
      queryClient.invalidateQueries({ queryKey: queryKeys.services.byType(treeType) })
    },
    onSettled: (_data, _err, { treeType }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.services.byType(treeType) })
    },
  })
}

export function useArchiveService() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      treeType,
    }: {
      id: string
      treeType: string
    }) => {
      const supabase = createClient()
      const archivedAt = new Date().toISOString()
      const { error } = await supabase
        .from('services')
        .update({
          deleted_at: archivedAt,
          status: 'inactive',
        } as ServiceUpdate)
        .eq('id', id)
      if (error) throw error
      await supabase.from('activity_log').insert({
        action: 'services/service-archived',
        module: 'services',
        entity_type: 'service',
        entity_id: id,
        details: JSON.stringify({ archived_at: archivedAt }),
      })
      return { treeType }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.services.byType(data.treeType) })
    },
  })
}

export function useCreateInstruction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: Omit<DBInsert<'instructions'>, 'id' | 'created_at' | 'updated_at'>) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('instructions')
        .insert(values as DBInsert<'instructions'>)
        .select('*')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.services.instructions })
    },
  })
}

export function useUpdateInstruction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: Partial<DBUpdate<'instructions'>> & { id: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('instructions')
        .update(values)
        .eq('id', id)
        .select('*')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.services.instructions })
    },
  })
}

export function useArchiveInstruction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('instructions')
        .update({ deleted_at: new Date().toISOString(), status: 'inactive' } as DBUpdate<'instructions'>)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.services.instructions })
    },
  })
}

export type ServiceInstructionLink = {
  service_id: string
  instruction_id: string
  created_at: string
  instructions: { id: string; name_en: string; type: string; content_type: string | null } | null
  services: { id: string; name_en: string; tree_type: string | null } | null
}

export function useServiceInstructions(serviceId: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.services.serviceInstructionsByService(serviceId),
    enabled: enabled && !!serviceId,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('service_instructions')
        .select('service_id, instruction_id, created_at, instructions(id, name_en, type, content_type)')
        .eq('service_id', serviceId as string)
        .returns<ServiceInstructionLink[]>()
      if (error) throw error
      return (data ?? []) as ServiceInstructionLink[]
    },
    staleTime: 2 * 60 * 1000,
  })
}

export function useAllServiceInstructionLinks(enabled = true) {
  return useQuery({
    queryKey: queryKeys.services.serviceInstructionsAll,
    enabled,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('service_instructions')
        .select(`
          service_id,
          instruction_id,
          created_at,
          instructions(id, name_en, type, content_type),
          services(id, name_en, tree_type)
        `)
        .order('created_at', { ascending: false })
        .returns<ServiceInstructionLink[]>()
      if (error) throw error
      return (data ?? []) as ServiceInstructionLink[]
    },
    staleTime: 2 * 60 * 1000,
  })
}

export function useLinkInstruction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ serviceId, instructionId }: { serviceId: string; instructionId: string }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('service_instructions')
        .insert({ service_id: serviceId, instruction_id: instructionId })
      if (error && error.code !== '23505') throw error // 23505 = duplicate key, ignore
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.services.serviceInstructions })
    },
  })
}

export function useUnlinkInstruction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ serviceId, instructionId }: { serviceId: string; instructionId: string }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('service_instructions')
        .delete()
        .eq('service_id', serviceId)
        .eq('instruction_id', instructionId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.services.serviceInstructions })
    },
  })
}
