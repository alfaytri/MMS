// src/hooks/useCreditGroups.ts
'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

export type CreditGroup = {
  id:                     string
  name:                   string
  credit_limit:           number
  payment_method_ids:     string[]
  max_days:               number | null
  default_payment_terms:  string | null
  created_at:             string
  updated_at:             string
}

type RawCreditGroupRow = {
  id: string
  name: string
  credit_limit: number
  max_days: number | null
  default_payment_terms: string | null
  created_at: string
  updated_at: string
  credit_group_payment_methods: { payment_method_id: string }[]
}

function mapRow(row: RawCreditGroupRow): CreditGroup {
  return {
    id:                    row.id,
    name:                  row.name,
    credit_limit:          row.credit_limit,
    payment_method_ids:    (row.credit_group_payment_methods ?? []).map(j => j.payment_method_id),
    max_days:              row.max_days,
    default_payment_terms: row.default_payment_terms,
    created_at:            row.created_at,
    updated_at:            row.updated_at,
  }
}

export function useCreditGroups() {
  return useQuery({
    queryKey: queryKeys.creditGroups.all,
    queryFn:  async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('credit_groups')
        .select('*, credit_group_payment_methods(payment_method_id)')
        .order('name')
      if (error) throw error
      return (data as unknown as RawCreditGroupRow[]).map(mapRow)
    },
    staleTime: 60 * 1000,
  })
}

async function syncJunctionRows(
  supabase: ReturnType<typeof createClient>,
  creditGroupId: string,
  paymentMethodIds: string[],
) {
  await supabase
    .from('credit_group_payment_methods')
    .delete()
    .eq('credit_group_id', creditGroupId)

  if (paymentMethodIds.length > 0) {
    const rows = paymentMethodIds.map(pmId => ({
      credit_group_id: creditGroupId,
      payment_method_id: pmId,
    }))
    const { error } = await supabase
      .from('credit_group_payment_methods')
      .insert(rows)
    if (error) throw error
  }
}

export function useCreateCreditGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      name:                   string
      credit_limit:           number
      payment_method_ids:     string[]
      max_days:               number | null
      default_payment_terms?: string | null
    }) => {
      const supabase = createClient()
      const { payment_method_ids, ...groupFields } = payload
      const { data, error } = await supabase
        .from('credit_groups')
        .insert(groupFields)
        .select()
        .single()
      if (error) throw error
      await syncJunctionRows(supabase, data.id, payment_method_ids)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.creditGroups.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.creditGroups.counts })
    },
  })
}

export function useUpdateCreditGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, payment_method_ids, ...patch }: {
      id: string
      payment_method_ids?: string[]
      name?: string
      credit_limit?: number
      max_days?: number | null
      default_payment_terms?: string | null
    }) => {
      const supabase = createClient()
      if (Object.keys(patch).length > 0) {
        const { error } = await supabase
          .from('credit_groups')
          .update(patch)
          .eq('id', id)
        if (error) throw error
      }
      if (payment_method_ids) {
        await syncJunctionRows(supabase, id, payment_method_ids)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.creditGroups.all })
    },
  })
}

export function useDeleteCreditGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('credit_groups')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.creditGroups.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.creditGroups.counts })
    },
  })
}

// Uses the DB view — aggregation done on the server, not the browser.
export function useCreditGroupCustomerCounts() {
  return useQuery({
    queryKey: queryKeys.creditGroups.counts,
    queryFn:  async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('credit_group_customer_counts')
        .select('credit_group_id, customer_count')
      if (error) throw error
      const counts: Record<string, number> = {}
      for (const row of (data ?? [])) {
        counts[row.credit_group_id ?? ''] = Number(row.customer_count)
      }
      return counts
    },
    staleTime: 30 * 1000,
  })
}

// Direct-write credit-group assignment was removed — the only supported path is
// now through the Edit Customer dialog, which routes limit-bearing groups
// through submit_credit_group_change (approval chain). Do not re-add a
// direct-write mutation here without discussion — it would bypass the doc gate
// and the approval workflow.
