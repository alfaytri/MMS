import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

export type WorkflowStep = {
  id: string
  workflow: 'po' | 'inv_check' | 'stock_adj' | 'sales_margin' | 'sales_credit'
  role_id: string
  step_key: string
  step_label: string
  step_order: number
  is_active: boolean
  is_conditional: boolean
  condition_types: string[]
  archived_at: string | null
  archived_by: string | null
  created_at: string
  custom_roles?: { name: string } | null
}

export function useWorkflowSteps() {
  return useQuery({
    queryKey: queryKeys.roles.workflowSteps,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('approval_workflow_steps')
        .select('*, custom_roles(name)')
        .is('archived_at', null)
        .order('workflow')
        .order('step_order')
      if (error) throw error
      return data as WorkflowStep[]
    },
  })
}

export function useAddWorkflowStep() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: {
      workflow: string
      role_name: string
      role_desc?: string
      is_conditional?: boolean
      condition_types?: string[]
    }) => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('add_workflow_step', {
        p_workflow: args.workflow,
        p_role_name: args.role_name,
        p_role_desc: args.role_desc ?? '',
        p_is_conditional: args.is_conditional ?? false,
        p_condition_types: args.condition_types ?? [],
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.roles.workflowSteps })
      qc.invalidateQueries({ queryKey: queryKeys.roles.custom })
    },
  })
}

export function useToggleWorkflowStep() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ stepId, active }: { stepId: string; active: boolean }) => {
      const supabase = createClient()
      const { error } = await supabase.rpc('toggle_workflow_step', {
        p_step_id: stepId,
        p_active: active,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.roles.workflowSteps })
    },
  })
}

export function useAddWorkflowStepForRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: {
      workflow: string
      role_id: string
      is_conditional?: boolean
      condition_types?: string[]
    }) => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('add_workflow_step_for_role', {
        p_workflow: args.workflow,
        p_role_id: args.role_id,
        p_is_conditional: args.is_conditional ?? false,
        p_condition_types: args.condition_types ?? [],
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.roles.workflowSteps })
    },
  })
}

export function useUpdateWorkflowStepRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ stepId, roleId }: { stepId: string; roleId: string }) => {
      const supabase = createClient()
      const { error } = await supabase.rpc('update_workflow_step_role', {
        p_step_id: stepId,
        p_role_id: roleId,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.roles.workflowSteps })
    },
  })
}

export function useUpdateWorkflowStepConditions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: {
      stepId: string
      isConditional: boolean
      conditionTypes: string[]
    }) => {
      const supabase = createClient()
      const { error } = await supabase.rpc('update_workflow_step_conditions', {
        p_step_id:         args.stepId,
        p_is_conditional:  args.isConditional,
        p_condition_types: args.conditionTypes,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.roles.workflowSteps })
    },
  })
}

export function useArchiveWorkflowStep() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ stepId, profileId }: { stepId: string; profileId: string }) => {
      const supabase = createClient()
      const { error } = await supabase.rpc('archive_workflow_step', {
        p_step_id: stepId,
        p_profile_id: profileId,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.roles.workflowSteps })
    },
  })
}
