'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  isValidTransition,
  applyTransitionSideEffects,
  buildActivationPayments,
} from '@/lib/contractStateMachine'
import { logActivity } from '@/lib/logActivity'
import type { ContractStatus, ContractFormData } from '@/types/contracts'
import { queryKeys } from '@/lib/queryKeys'

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
      // Money-bearing transitions run atomically server-side (idempotent RPCs),
      // so a partial failure can never double-generate an id or duplicate the
      // payment schedule, and cancellation gets its money treatment.
      if (newStatus === 'active' && context) {
        const { data: c } = await supabase
          .from('contracts')
          .select('total_value, payment_mode, payment_frequency, start_date, end_date')
          .eq('id', contractId)
          .single()
        if (!c) throw new Error('Contract not found')

        let milestones: { amount: number; due_date: string | null }[] = []
        if ((c.payment_mode || 'fixed') === 'milestone') {
          const { data: ms } = await supabase
            .from('contract_milestones')
            .select('amount, due_date')
            .eq('contract_id', contractId)
            .order('sort_order')
          milestones = ms ?? []
        }

        const payments = buildActivationPayments(c, milestones)
        const { data: newId, error } = await supabase.rpc('rpc_activate_contract' as never, {
          p_contract_id: contractId,
          p_payments: payments,
          p_user_id: context.userId,
          p_user_name: context.userName,
        } as never)
        if (error) throw error
        await logActivity({
          action: 'contract_activated',
          module: 'contracts',
          entity_id: contractId,
          details: `Contract activated as ${newId}`,
          performer_name: context.userName,
        })
        return
      }

      if (newStatus === 'cancelled' && context) {
        const { error } = await supabase.rpc('rpc_cancel_contract' as never, {
          p_contract_id: contractId,
          p_reason: context.reason || '',
          p_user_id: context.userId,
          p_user_name: context.userName,
        } as never)
        if (error) throw error
        await logActivity({
          action: 'contract_cancelled',
          module: 'contracts',
          entity_id: contractId,
          severity: 'critical',
          details: `Cancelled by ${context.userName}: ${context.reason}`,
          performer_name: context.userName,
        })
        return
      }

      // Lightweight field-only transitions (draft→review, approvals, rejections).
      if (newStatus && context) {
        const { data: current } = await supabase
          .from('contracts')
          .select('status')
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
        .update(updates as import('@/types/database.types').DBUpdate<'contracts'>)
        .eq('id', contractId)
      if (error) throw error
    },
    onSuccess: (_, { contractId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.contracts.detail(contractId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.contracts.quotationsAll })
      queryClient.invalidateQueries({ queryKey: queryKeys.contracts.all })
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
      building_tree: formData.buildingTree as unknown as import('@/types/database.types').Json,
      notes: formData.notes,
      total_value: formData.totalValue,
      monthly_value: formData.monthlyValue,
      services_summary: formData.servicesSummary,
      area_count: formData.areaCount,
      source_type: formData.sourceType,
      last_saved_session: sessionId,
    })
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
    .update({ ...scalarFields, last_saved_session: sessionId })
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
