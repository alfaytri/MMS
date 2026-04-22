// src/hooks/useApprovalRoleAssignments.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { ApprovalRole, ApprovalRoleAssignmentRow } from '@/lib/approvalChainResolution'

export type ApprovalRoleAssignmentWithProfile = ApprovalRoleAssignmentRow & {
  profiles: { id: string; full_name: string; email: string | null } | null
}

export function useApprovalRoleAssignments() {
  return useQuery({
    queryKey: ['approval-role-assignments'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('approval_role_assignments')
        .select('*, profiles(id, full_name, email)')
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as ApprovalRoleAssignmentWithProfile[]
    },
    staleTime: 60 * 1000,
  })
}

export function useApprovalRoleAssignmentsForDivision(divisionId: string | null | undefined) {
  return useQuery({
    queryKey: ['approval-role-assignments', divisionId],
    queryFn: async () => {
      const supabase = createClient()
      const query = (supabase as any)
        .from('approval_role_assignments')
        .select('*')
        .is('deleted_at', null)
      const { data, error } = divisionId
        ? await query.or(`division_id.eq.${divisionId},division_id.is.null`)
        : await query.is('division_id', null)
      if (error) throw error
      return data as ApprovalRoleAssignmentRow[]
    },
    enabled: divisionId !== undefined,
    staleTime: 60 * 1000,
  })
}

export function useCurrentUserApprovalRoles() {
  return useQuery({
    queryKey: ['my-approval-roles'],
    queryFn: async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return [] as ApprovalRole[]
      const { data: profile } = await (supabase as any)
        .from('profiles').select('id').eq('auth_user_id', user.id).maybeSingle()
      if (!profile) return [] as ApprovalRole[]
      const { data, error } = await (supabase as any)
        .from('approval_role_assignments')
        .select('role')
        .eq('profile_id', profile.id)
        .is('deleted_at', null)
      if (error) throw error
      return (data ?? []).map((r: { role: ApprovalRole }) => r.role) as ApprovalRole[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useAddApprovalRoleAssignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { profile_id: string; role: ApprovalRole; division_id: string | null }) => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('approval_role_assignments')
        .insert(payload)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approval-role-assignments'] })
      qc.invalidateQueries({ queryKey: ['my-approval-roles'] })
    },
  })
}

export function useSoftDeleteApprovalRoleAssignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('approval_role_assignments')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approval-role-assignments'] })
      qc.invalidateQueries({ queryKey: ['my-approval-roles'] })
    },
  })
}
