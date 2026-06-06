'use client'

import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import type {
  Contract,
  ContractService,
  ContractVisit,
  ContractPayment,
  ContractMilestone,
  PendingVisit,
} from '@/types/contracts'

/** Shape of the joined row returned by the contract detail query */
interface ContractDetailRow {
  building_tree: { nodes: unknown[] } | null
  total_visits: number | null
  contract_services: Array<Record<string, unknown>>
  contract_visits: Array<{
    id: string
    contract_id: string
    contract_service_id: string | null
    service_name: string
    scheduled_date: string
    team_id: string | null
    completed: boolean
    teams: { name_en: string } | null
    contract_services: {
      building_node_id: string | null
      service_path: string[] | null
      brand_name: string | null
      frequency: string | null
      divisions: string[] | null
    } | null
    [key: string]: unknown
  }>
  contract_payments: Array<Record<string, unknown>>
  contract_milestones: Array<{ sort_order: number | null; [key: string]: unknown }>
  [key: string]: unknown
}

export function useContractDetail(contractId: string | undefined) {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: queryKeys.contracts.detail(contractId),
    queryFn: async () => {
      if (!contractId) return null
      const { data, error } = await supabase
        .from('contracts')
        .select(`
          *,
          contract_services(*),
          contract_visits(
            *,
            teams(name_en),
            contract_services(
              building_node_id,
              service_path,
              brand_name,
              frequency,
              divisions
            )
          ),
          contract_payments(*),
          contract_milestones(*)
        `)
        .eq('id', contractId)
        .single()

      if (error) throw error
      return data
    },
    enabled: !!contractId,
  })

  // Memoize all derived values so references stay stable across renders.
  // Without this, useEffect([services]) in consumers loops infinitely because
  // `[] || ...` returns a new array reference on every render.
  const detail = query.data as ContractDetailRow | undefined

  const contract: Contract | null = useMemo(
    () =>
      detail
        ? {
            ...detail,
            building_tree: detail.building_tree || { nodes: [] },
          } as unknown as Contract
        : null,
    [detail],
  )

  const services: ContractService[] = useMemo(
    () => (detail?.contract_services ?? []) as unknown as ContractService[],
    [detail],
  )

  const visits: ContractVisit[] = useMemo(
    () =>
      (detail?.contract_visits ?? []).map((v) => ({
        id: v.id,
        contract_id: v.contract_id,
        contract_service_id: v.contract_service_id,
        service_name: v.service_name,
        scheduled_date: v.scheduled_date,
        team_id: v.team_id,
        team_name: v.teams?.name_en,
        completed: v.completed || false,
        building_node_id: v.contract_services?.building_node_id,
        service_path: v.contract_services?.service_path,
        brand_name: v.contract_services?.brand_name,
        frequency: v.contract_services?.frequency,
        divisions: v.contract_services?.divisions,
      })) as ContractVisit[],
    [detail],
  )

  const payments: ContractPayment[] = useMemo(
    () => (detail?.contract_payments ?? []) as unknown as ContractPayment[],
    [detail],
  )

  const milestones: ContractMilestone[] = useMemo(
    () =>
      (detail?.contract_milestones ?? [])
        .slice()
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)) as unknown as ContractMilestone[],
    [detail],
  )

  const createTentativeVisits = useMutation({
    mutationFn: async (pendingVisits: PendingVisit[]) => {
      const rows = pendingVisits.map((v) => ({
        contract_id: contractId,
        contract_service_id: v.service_id,
        service_name: v.service_name,
        scheduled_date: v.scheduled_date,
        team_id: v.team_id,
        completed: false,
      }))
      const { error } = await supabase.from('contract_visits').insert(rows as unknown as import('@/types/database.types').DBInsert<'contract_visits'>[])
      if (error) throw error

      const currentTotal = (detail?.total_visits ?? 0) as number
      await supabase
        .from('contracts')
        .update({ total_visits: currentTotal + pendingVisits.length })
        .eq('id', contractId!)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.contracts.detail(contractId),
      })
    },
  })

  const updateVisit = useMutation({
    mutationFn: async ({
      visitId,
      updates,
    }: {
      visitId: string
      updates: Record<string, unknown>
    }) => {
      const { error } = await supabase
        .from('contract_visits')
        .update(updates as import('@/types/database.types').DBUpdate<'contract_visits'>)
        .eq('id', visitId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.contracts.detail(contractId),
      })
    },
  })

  const deleteVisit = useMutation({
    mutationFn: async (visitId: string) => {
      const { error } = await supabase
        .from('contract_visits')
        .delete()
        .eq('id', visitId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.contracts.detail(contractId),
      })
    },
  })

  return {
    contract,
    services,
    visits,
    payments,
    milestones,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    createTentativeVisits,
    updateVisit,
    deleteVisit,
  }
}
