// src/hooks/useCreditGroups.ts
'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type CreditGroup = {
  id:               string
  name:             string
  credit_limit:     number
  payment_methods:  string[]
  max_days:         number | null
  created_at:       string
  updated_at:       string
}

export const PAYMENT_METHODS = [
  { key: 'cash',          label: 'Cash' },
  { key: 'online',        label: 'Online' },
  { key: 'pay_later',     label: 'Pay Later' },
  { key: 'fawran',        label: 'Fawran' },
  { key: 'bank_transfer', label: 'Bank Transfer' },
  { key: 'cdc',           label: 'CDC (Current-Dated Cheque)' },
  { key: 'pdc',           label: 'PDC (Post-Dated Cheque)' },
  { key: 'pos',           label: 'POS' },
] as const

export type PaymentMethodKey = (typeof PAYMENT_METHODS)[number]['key']

export function useCreditGroups() {
  return useQuery({
    queryKey: ['credit-groups'],
    queryFn:  async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('credit_groups')
        .select('*')
        .order('name')
      if (error) throw error
      return data as CreditGroup[]
    },
    staleTime: 60 * 1000,
  })
}

export function useCreateCreditGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      name:             string
      credit_limit:     number
      payment_methods:  string[]
      max_days:         number | null
    }) => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('credit_groups')
        .insert(payload)
        .select()
        .single()
      if (error) throw error
      return data as CreditGroup
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit-groups'] })
      queryClient.invalidateQueries({ queryKey: ['credit-group-counts'] })
    },
  })
}

export function useUpdateCreditGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<CreditGroup> & { id: string }) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('credit_groups')
        .update(patch)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit-groups'] })
    },
  })
}

export function useDeleteCreditGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('credit_groups')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit-groups'] })
      queryClient.invalidateQueries({ queryKey: ['credit-group-counts'] })
    },
  })
}

// Uses the DB view — aggregation done on the server, not the browser.
export function useCreditGroupCustomerCounts() {
  return useQuery({
    queryKey: ['credit-group-counts'],
    queryFn:  async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('credit_group_customer_counts')
        .select('credit_group_id, customer_count')
      if (error) throw error
      const counts: Record<string, number> = {}
      for (const row of (data ?? [])) {
        counts[row.credit_group_id] = Number(row.customer_count)
      }
      return counts
    },
    staleTime: 30 * 1000,
  })
}

// Assign a customer to a credit group via React Query mutation (not raw supabase call).
export function useAssignCreditGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ customerId, groupId }: { customerId: string; groupId: string }) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('customers')
        .update({ credit_group_id: groupId, customer_type: 'credit' })
        .eq('id', customerId)
      if (error) throw error
    },
    onMutate: async ({ customerId, groupId }) => {
      await queryClient.cancelQueries({ queryKey: ['all-customers'] })
      const snapshots = queryClient.getQueriesData({ queryKey: ['all-customers'] })
      queryClient.setQueriesData({ queryKey: ['all-customers'] }, (old: any) => {
        if (!old?.customers) return old
        return {
          ...old,
          customers: old.customers.map((c: any) =>
            c.id === customerId ? { ...c, credit_group_id: groupId } : c
          ),
        }
      })
      return { snapshots }
    },
    onError: (_err, _vars, context) => {
      context?.snapshots?.forEach(([key, data]) => queryClient.setQueryData(key, data))
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['all-customers'] })
      queryClient.invalidateQueries({ queryKey: ['credit-group-counts'] })
    },
  })
}
