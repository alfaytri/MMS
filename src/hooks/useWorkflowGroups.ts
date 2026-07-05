import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

export type WorkflowGroup = {
  id: string
  workflow: string
  group_label: string
  group_order: number
  mode: 'any_one' | 'all_must'
  is_active: boolean
  created_at: string
}

export function useWorkflowGroups() {
  return useQuery({
    queryKey: queryKeys.roles.workflowGroups,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('approval_workflow_groups')
        .select('*')
        .order('workflow')
        .order('group_order')
      if (error) throw error
      return data as WorkflowGroup[]
    },
  })
}

export function useCreateWorkflowGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: {
      workflow: string
      group_label: string
      mode?: 'any_one' | 'all_must'
    }) => {
      const supabase = createClient()
      const { data: existing } = await supabase
        .from('approval_workflow_groups')
        .select('group_order')
        .eq('workflow', args.workflow)
        .order('group_order', { ascending: false })
        .limit(1)
      const nextOrder = ((existing?.[0]?.group_order as number) ?? 0) + 1

      const { data, error } = await supabase
        .from('approval_workflow_groups')
        .insert({
          workflow: args.workflow,
          group_label: args.group_label,
          group_order: nextOrder,
          mode: args.mode ?? 'any_one',
        })
        .select()
        .single()
      if (error) throw error
      return data as WorkflowGroup
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.roles.workflowGroups })
    },
  })
}

export function useUpdateWorkflowGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: {
      id: string
      group_label?: string
      mode?: 'any_one' | 'all_must'
      is_active?: boolean
    }) => {
      const supabase = createClient()
      const patch: Record<string, unknown> = {}
      if (args.group_label !== undefined) patch.group_label = args.group_label
      if (args.mode !== undefined) patch.mode = args.mode
      if (args.is_active !== undefined) patch.is_active = args.is_active

      const { error } = await supabase
        .from('approval_workflow_groups')
        .update(patch as any)
        .eq('id', args.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.roles.workflowGroups })
    },
  })
}

export function useDeleteWorkflowGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { count } = await supabase
        .from('approval_workflow_steps')
        .select('id', { count: 'exact', head: true })
        .eq('group_id', id)
        .is('archived_at', null)
      if ((count ?? 0) > 0) {
        throw new Error('Move or archive all steps before deleting this path')
      }
      const { error } = await supabase
        .from('approval_workflow_groups')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.roles.workflowGroups })
      qc.invalidateQueries({ queryKey: queryKeys.roles.workflowSteps })
    },
  })
}
