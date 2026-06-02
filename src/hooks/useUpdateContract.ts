'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { isValidTransition, applyTransitionSideEffects } from '@/lib/contractStateMachine'
import type { ContractStatus, ContractFormData } from '@/types/contracts'

interface UpdateContractInput {
  contractId: string
  updates: Record<string, unknown>
  newStatus?: ContractStatus
  context?: { userId: string; userName: string; reason?: string }
  sessionId?: string
}

export function useUpdateContract() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ contractId, updates, newStatus, context, sessionId }: UpdateContractInput) => {
      if (newStatus && context) {
        const { data: current } = await supabase
          .from('contracts')
          .select('status, updated_at')
          .eq('id', contractId)
          .single()

        if (!current) throw new Error('Contract not found')
        if (!isValidTransition(current.status as ContractStatus, newStatus)) {
          throw new Error(`Invalid transition: ${current.status} → ${newStatus}`)
        }

        updates.status = newStatus
        await applyTransitionSideEffects(contractId, current.status as ContractStatus, newStatus, updates, context)
      }

      if (sessionId) {
        updates.last_saved_session = sessionId
      }

      const { error } = await supabase
        .from('contracts')
        .update(updates as any)
        .eq('id', contractId)
      if (error) throw error
    },
    onSuccess: (_, { contractId }) => {
      queryClient.invalidateQueries({ queryKey: ['contractDetail', contractId] })
      queryClient.invalidateQueries({ queryKey: ['contractQuotations'] })
      queryClient.invalidateQueries({ queryKey: ['contracts'] })
    },
  })
}

export async function saveContractFull(
  contractId: string,
  formData: ContractFormData,
  sessionId: string,
): Promise<void> {
  const supabase = createClient()

  if (formData.paymentMode === 'milestone' && formData.milestones.length > 0) {
    const milestoneSum = formData.milestones.reduce((sum, m) => sum + m.amount, 0)
    const netTotal = formData.subtotal - formData.discount
    if (Math.abs(milestoneSum - netTotal) > 1) {
      throw new Error('Milestone amounts do not sum to contract net total')
    }
  }

  const { error: updateError } = await supabase
    .from('contracts')
    .update({
      customer_name: formData.customerName,
      phone: formData.phone,
      address: formData.address,
      site_name: formData.siteName,
      divisions: formData.divisions,
      start_date: formData.startDate,
      end_date: formData.endDate,
      discount: formData.discount,
      payment_mode: formData.paymentMode,
      payment_frequency: formData.paymentFrequency,
      building_tree: formData.buildingTree as any,
      notes: formData.notes,
      total_value: formData.totalValue,
      monthly_value: formData.monthlyValue,
      services_summary: formData.servicesSummary,
      area_count: formData.areaCount,
      source_type: formData.sourceType,
      last_saved_session: sessionId,
    } as any)
    .eq('id', contractId)
  if (updateError) throw updateError

  const existingServiceIds = formData.services
    .filter((s) => !s._isNew)
    .map((s) => s.id)

  if (existingServiceIds.length > 0) {
    await supabase
      .from('contract_services')
      .delete()
      .eq('contract_id', contractId)
      .not('id', 'in', `(${existingServiceIds.join(',')})`)
  } else {
    await supabase
      .from('contract_services')
      .delete()
      .eq('contract_id', contractId)
  }

  for (const svc of formData.services) {
    const { _isNew, _isDirty, ...row } = svc
    if (_isNew) {
      await supabase
        .from('contract_services')
        .insert({ ...row, contract_id: contractId })
    } else if (_isDirty) {
      await supabase
        .from('contract_services')
        .update(row)
        .eq('id', svc.id)
    }
  }

  const existingMilestoneIds = formData.milestones
    .filter((m) => !m._isNew)
    .map((m) => m.id)

  if (existingMilestoneIds.length > 0) {
    await supabase
      .from('contract_milestones')
      .delete()
      .eq('contract_id', contractId)
      .not('id', 'in', `(${existingMilestoneIds.join(',')})`)
  } else if (formData.milestones.length === 0) {
    await supabase
      .from('contract_milestones')
      .delete()
      .eq('contract_id', contractId)
  }

  for (const m of formData.milestones) {
    const { _isNew, _isDirty, ...row } = m
    if (_isNew) {
      await supabase
        .from('contract_milestones')
        .insert({ ...row, contract_id: contractId })
    } else if (_isDirty) {
      await supabase
        .from('contract_milestones')
        .update(row)
        .eq('id', m.id)
    }
  }
}

export async function autoSaveContract(
  contractId: string,
  scalarFields: Record<string, unknown>,
  sessionId: string,
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('contracts')
    .update({ ...scalarFields, last_saved_session: sessionId } as any)
    .eq('id', contractId)
  if (error) throw error
}

export async function checkSaveConflict(
  contractId: string,
  mySessionId: string,
  lastFetchedAt: string,
): Promise<{ hasConflict: boolean; updatedAt?: string }> {
  const supabase = createClient()
  const { data } = await supabase
    .from('contracts')
    .select('last_saved_session, updated_at')
    .eq('id', contractId)
    .single()

  if (!data) return { hasConflict: false }
  if (data.last_saved_session === mySessionId) return { hasConflict: false }
  if (data.updated_at && data.updated_at > lastFetchedAt) {
    return { hasConflict: true, updatedAt: data.updated_at }
  }
  return { hasConflict: false }
}
