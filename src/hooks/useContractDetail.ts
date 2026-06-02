'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type {
  Contract,
  ContractService,
  ContractVisit,
  ContractPayment,
  ContractMilestone,
  PendingVisit,
} from '@/types/contracts'

export function useContractDetail(contractId: string | undefined) {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['contractDetail', contractId],
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

  const contract: Contract | null = query.data
    ? {
        ...(query.data as any),
        building_tree: (query.data as any).building_tree || { nodes: [] },
      }
    : null

  const services: ContractService[] =
    (query.data as any)?.contract_services || []
  const visits: ContractVisit[] = ((query.data as any)?.contract_visits || []).map(
    (v: any) => ({
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
    }),
  )
  const payments: ContractPayment[] =
    (query.data as any)?.contract_payments || []
  const milestones: ContractMilestone[] = (
    (query.data as any)?.contract_milestones || []
  ).sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0))

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
      const { error } = await supabase.from('contract_visits').insert(rows as any)
      if (error) throw error

      await supabase
        .from('contracts')
        .update({
          total_visits: ((contract as any)?.total_visits || 0) + pendingVisits.length,
        } as any)
        .eq('id', contractId!)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['contractDetail', contractId],
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
        .update(updates as any)
        .eq('id', visitId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['contractDetail', contractId],
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
        queryKey: ['contractDetail', contractId],
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
