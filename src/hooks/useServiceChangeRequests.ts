// src/hooks/useServiceChangeRequests.ts
'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

export type ServiceChangeRequest = {
  id: string
  service_id: string | null
  division: string[]
  change_type: 'add' | 'edit' | 'delete'
  changes: Record<string, { old: unknown; new: unknown }>
  status: 'pending' | 'approved' | 'rejected'
  requested_by: string
  reviewed_by: string | null
  rejection_reason: string | null
  requested_at: string
  reviewed_at: string | null
  created_at: string
  updated_at: string
  requester?: { full_name: string; avatar_url: string | null }
  reviewer?: { full_name: string; avatar_url: string | null }
  service?: { name_en: string; name_ar: string | null }
}

export function useServiceChangeRequests(filters?: {
  status?: string
  division?: string
}) {
  return useQuery({
    queryKey: queryKeys.serviceChangeRequests.list(filters),
    queryFn: async () => {
      const supabase = createClient()
      let query = (supabase as any)
        .from('service_change_requests')
        .select(`
          *,
          requester:profiles!service_change_requests_requested_by_fkey(full_name, avatar_url),
          reviewer:profiles!service_change_requests_reviewed_by_fkey(full_name, avatar_url),
          service:services!service_change_requests_service_id_fkey(name_en, name_ar)
        `)
        .order('requested_at', { ascending: false })

      if (filters?.status) {
        query = query.eq('status', filters.status)
      }
      if (filters?.division) {
        query = query.contains('division', [filters.division])
      }

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as ServiceChangeRequest[]
    },
    staleTime: 30 * 1000,
  })
}

export function useServiceChangeHistory(serviceId: string | null) {
  return useQuery({
    queryKey: queryKeys.serviceChangeRequests.historyByService(serviceId),
    enabled: !!serviceId,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('service_change_requests')
        .select(`
          *,
          requester:profiles!service_change_requests_requested_by_fkey(full_name, avatar_url),
          reviewer:profiles!service_change_requests_reviewed_by_fkey(full_name, avatar_url)
        `)
        .eq('service_id', serviceId)
        .order('requested_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as ServiceChangeRequest[]
    },
    staleTime: 60 * 1000,
  })
}

export function usePendingAddRequests() {
  return useQuery({
    queryKey: queryKeys.serviceChangeRequests.pendingAdds,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('service_change_requests')
        .select(`
          *,
          requester:profiles!service_change_requests_requested_by_fkey(full_name, avatar_url)
        `)
        .eq('change_type', 'add')
        .eq('status', 'pending')
        .order('requested_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as ServiceChangeRequest[]
    },
    staleTime: 30 * 1000,
  })
}

export function usePendingServiceChangeCount() {
  return useQuery({
    queryKey: queryKeys.serviceChangeRequests.pendingCount,
    queryFn: async () => {
      const supabase = createClient()
      const { count, error } = await (supabase as any)
        .from('service_change_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
      if (error) throw error
      return count ?? 0
    },
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  })
}

export function useSubmitServiceChange() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      service_id?: string | null
      change_type: 'add' | 'edit' | 'delete'
      changes: Record<string, { old: unknown; new: unknown }>
      division: string[]
      tree_type: string
      parent_id: string | null
    }) => {
      const supabase = createClient()
      const { data, error } = await (supabase as any).rpc('submit_service_change', {
        p_payload: payload,
      })
      if (error) throw error
      return data as { action: 'applied' | 'pending'; id: string }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.services.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.serviceChangeRequests.all })
    },
  })
}

export function useApproveChangeRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (requestId: string) => {
      const supabase = createClient()
      const { data, error } = await (supabase as any).rpc('approve_service_change', {
        p_request_id: requestId,
      })
      if (error) throw error
      return data as { ok: boolean; service_id: string }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.services.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.serviceChangeRequests.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.serviceChangeRequests.history })
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all })
    },
  })
}

export function useRejectChangeRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ requestId, reason }: { requestId: string; reason: string }) => {
      const supabase = createClient()
      const { data, error } = await (supabase as any).rpc('reject_service_change', {
        p_request_id: requestId,
        p_reason: reason,
      })
      if (error) throw error
      return data as { ok: boolean }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.services.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.serviceChangeRequests.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.serviceChangeRequests.history })
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all })
    },
  })
}

export function useWithdrawChangeRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (requestId: string) => {
      const supabase = createClient()
      const { data, error } = await (supabase as any).rpc('withdraw_service_change', {
        p_request_id: requestId,
      })
      if (error) throw error
      return data as { ok: boolean }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.services.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.serviceChangeRequests.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.serviceChangeRequests.history })
    },
  })
}

export function useUpdatePendingChange() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ requestId, changes }: {
      requestId: string
      changes: Record<string, { old: unknown; new: unknown }>
    }) => {
      const supabase = createClient()
      const { data, error } = await (supabase as any).rpc('update_pending_service_change', {
        p_request_id: requestId,
        p_new_changes: changes,
      })
      if (error) throw error
      return data as { ok: boolean }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.serviceChangeRequests.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.serviceChangeRequests.history })
    },
  })
}
