// src/hooks/useApprovalChains.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { ApprovalRole, ApprovalChainTier } from '@/lib/approvalChainResolution'

export type ApprovalChain = {
  id: string
  division_id: string | null
  name: string
  is_active: boolean
  created_at: string
  approval_chain_tiers?: ApprovalChainTier[]
}

export function useApprovalChains() {
  return useQuery({
    queryKey: ['approval-chains'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('approval_chains')
        .select('*, approval_chain_tiers(*)')
        .eq('is_active', true)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as ApprovalChain[]
    },
    staleTime: 60 * 1000,
  })
}

export function useChainForDivision(divisionId: string | null | undefined) {
  return useQuery({
    queryKey: ['approval-chain-for-division', divisionId],
    queryFn: async () => {
      const supabase = createClient()
      // Try division-specific chain first
      if (divisionId) {
        const { data } = await (supabase as any)
          .from('approval_chains')
          .select('*, approval_chain_tiers(*)')
          .eq('division_id', divisionId)
          .eq('is_active', true)
          .maybeSingle()
        if (data) return data as ApprovalChain
      }
      // Fall back to company default
      const { data, error } = await (supabase as any)
        .from('approval_chains')
        .select('*, approval_chain_tiers(*)')
        .is('division_id', null)
        .eq('is_active', true)
        .maybeSingle()
      if (error) throw error
      return data as ApprovalChain | null
    },
    enabled: divisionId !== undefined,
    staleTime: 60 * 1000,
  })
}

export function useUpsertApprovalChain() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { id?: string; division_id: string | null; name: string }) => {
      const supabase = createClient()
      if (payload.id) {
        const { data, error } = await (supabase as any)
          .from('approval_chains').update({ name: payload.name }).eq('id', payload.id).select().single()
        if (error) throw error
        return data as ApprovalChain
      }
      const { data, error } = await (supabase as any)
        .from('approval_chains').insert({ division_id: payload.division_id, name: payload.name, is_active: true }).select().single()
      if (error) throw error
      return data as ApprovalChain
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['approval-chains'] }),
  })
}

export function useUpsertApprovalChainTier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      id?: string
      chain_id: string
      rank: number
      min_amount: number
      max_amount: number | null
      required_roles: ApprovalRole[]
    }) => {
      const supabase = createClient()
      if (payload.id) {
        const { data, error } = await (supabase as any)
          .from('approval_chain_tiers').update({
            rank: payload.rank,
            min_amount: payload.min_amount,
            max_amount: payload.max_amount,
            required_roles: payload.required_roles,
          }).eq('id', payload.id).select().single()
        if (error) throw error
        return data
      }
      const { data, error } = await (supabase as any)
        .from('approval_chain_tiers').insert({
          chain_id: payload.chain_id,
          rank: payload.rank,
          min_amount: payload.min_amount,
          max_amount: payload.max_amount,
          required_roles: payload.required_roles,
        }).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['approval-chains'] }),
  })
}

export function useSoftDeleteApprovalChainTier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ tierId, chainId }: { tierId: string; chainId: string }) => {
      const supabase = createClient()
      // Block if any POs in flight reference this chain
      const { count } = await (supabase as any)
        .from('purchase_orders')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending_approval')
      if ((count ?? 0) > 0) {
        // Simplified check — full check would filter by chain. Good enough for now.
        throw new Error('Cannot delete tier: there are POs currently pending approval.')
      }
      const { error } = await (supabase as any)
        .from('approval_chain_tiers')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', tierId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['approval-chains'] }),
  })
}
