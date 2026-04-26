// src/hooks/useServices.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { DBTable, DBInsert, DBUpdate } from '@/types/database.types'

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
    queryKey: ['services', treeType, divisionSlugs],
    queryFn: async () => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase.from('services') as any)
        .select('*')
        .eq('tree_type', treeType)
        .order('sort_order', { ascending: true })
      query = query.is('deleted_at', null)
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

export function useInstructionsFull(enabled = true) {
  return useQuery({
    queryKey: ['instructions', 'full'],
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
      // Prefix match — invalidates all divisionSlug variants for this treeType
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
      // Prefix match — invalidates all divisionSlug variants for this treeType
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

      // Filter rows with null sort_order — they can't participate in a swap safely
      const sortedSiblings = (siblings as { id: string; sort_order: number | null }[])
        .filter((s): s is { id: string; sort_order: number } => s.sort_order !== null)

      const idx = sortedSiblings.findIndex((s) => s.id === movedId)
      if (idx === -1) throw new Error('Service not found in siblings')
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1
      if (targetIdx < 0 || targetIdx >= sortedSiblings.length) return null // boundary

      const moved = sortedSiblings[idx]
      const sibling = sortedSiblings[targetIdx]

      // Two-write swap — not atomic. If a UNIQUE constraint is ever added to
      // (tree_type, parent_id, sort_order), replace with an RPC in a single transaction.
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
        // Prefix match — invalidates all divisionSlug variants for this treeType
        queryClient.invalidateQueries({ queryKey: ['services', result.treeType] })
      }
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
        })
        .eq('id', id)
      if (error) throw error
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('activity_log') as any).insert({
        action: 'services/service-archived',
        module: 'services',
        entity_type: 'service',
        entity_id: id,
        details: JSON.stringify({ archived_at: archivedAt }),
      })
      return { treeType }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['services', data.treeType] })
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
        .insert(values)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instructions'] })
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
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instructions'] })
    },
  })
}

export function useArchiveInstruction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('instructions') as any)
        .update({ deleted_at: new Date().toISOString(), status: 'inactive' })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instructions'] })
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
    queryKey: ['service_instructions', serviceId],
    enabled: enabled && !!serviceId,
    queryFn: async () => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from('service_instructions')
        .select('service_id, instruction_id, created_at, instructions(id, name_en, type, content_type)')
        .eq('service_id', serviceId)
      if (error) throw error
      return (data ?? []) as ServiceInstructionLink[]
    },
    staleTime: 2 * 60 * 1000,
  })
}

export function useAllServiceInstructionLinks(enabled = true) {
  return useQuery({
    queryKey: ['service_instructions', 'all'],
    enabled,
    queryFn: async () => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from('service_instructions')
        .select(`
          service_id,
          instruction_id,
          created_at,
          instructions(id, name_en, type, content_type),
          services(id, name_en, tree_type)
        `)
        .order('created_at', { ascending: false })
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('service_instructions')
        .insert({ service_id: serviceId, instruction_id: instructionId })
      if (error && error.code !== '23505') throw error // 23505 = duplicate key, ignore
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service_instructions'] })
    },
  })
}

export function useUnlinkInstruction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ serviceId, instructionId }: { serviceId: string; instructionId: string }) => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('service_instructions')
        .delete()
        .eq('service_id', serviceId)
        .eq('instruction_id', instructionId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service_instructions'] })
    },
  })
}
