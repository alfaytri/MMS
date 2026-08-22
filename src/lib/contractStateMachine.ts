import type { ContractStatus } from '@/types/contracts'
import { createClient } from '@/lib/supabase/client'
import { logActivity } from '@/lib/logActivity'
import { paymentPeriodCount } from '@/lib/contractUtils'
import { parseISO, format, addMonths, addYears } from 'date-fns'

export const VALID_TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  draft: ['manager_review'],
  manager_review: ['customer_pending', 'rejected'],
  customer_pending: ['approved', 'rejected'],
  approved: ['active'],
  rejected: ['draft'],
  expired: [],
  active: ['expiring_soon', 'overdue_payment', 'completed', 'cancelled'],
  expiring_soon: ['active', 'completed', 'cancelled'],
  overdue_payment: ['active', 'cancelled'],
  completed: [],
  cancelled: [],
}

export function isValidTransition(
  from: ContractStatus,
  to: ContractStatus,
): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

async function generateContractId(): Promise<string> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('generate_contract_id')
  if (error)
    throw new Error(`Failed to generate contract ID: ${error.message}`)
  return data as string
}

export async function applyTransitionSideEffects(
  contractId: string,
  from: ContractStatus,
  to: ContractStatus,
  updates: Record<string, unknown>,
  context: { userId: string; userName: string; reason?: string },
): Promise<void> {
  const supabase = createClient()

  switch (`${from}_${to}`) {
    case 'draft_manager_review':
      updates.sent_at = new Date().toISOString()
      await logActivity({
        action: 'contract_sent_for_review',
        module: 'contracts',
        entity_id: contractId,
        details: `Quotation sent for manager review`,
        performer_name: context.userName,
      })
      break

    case 'manager_review_customer_pending':
      updates.approved_by = context.userId
      updates.approved_at = new Date().toISOString()
      await logActivity({
        action: 'contract_approved_by_manager',
        module: 'contracts',
        entity_id: contractId,
        details: `Approved by ${context.userName}`,
        performer_name: context.userName,
      })
      break

    case 'manager_review_rejected':
    case 'customer_pending_rejected':
      updates.rejected_by = context.userId
      updates.rejected_at = new Date().toISOString()
      updates.rejected_reason = context.reason || ''
      await logActivity({
        action: 'contract_rejected',
        module: 'contracts',
        entity_id: contractId,
        severity: 'warning',
        details: `Rejected by ${context.userName}: ${context.reason}`,
        performer_name: context.userName,
      })
      break

    case 'customer_pending_approved':
      await logActivity({
        action: 'contract_customer_approved',
        module: 'contracts',
        entity_id: contractId,
        details: `Customer approved the quotation`,
        performer_name: context.userName,
      })
      break

    case 'rejected_draft':
      updates.rejected_by = null
      updates.rejected_at = null
      updates.rejected_reason = null
      await logActivity({
        action: 'contract_reverted_to_draft',
        module: 'contracts',
        entity_id: contractId,
        details: `Reverted to draft for editing`,
        performer_name: context.userName,
      })
      break

    case 'approved_active': {
      const newContractId = await generateContractId()
      updates.contract_id = newContractId
      updates.has_signed_doc = true

      const { data: contract } = await supabase
        .from('contracts')
        .select('start_date, end_date, total_value, discount, payment_mode, payment_frequency')
        .eq('id', contractId)
        .single()

      if (contract) {
        const netTotal = (contract.total_value || 0) - (contract.discount || 0)
        await generatePayments(
          supabase,
          contractId,
          contract.payment_mode,
          contract.payment_frequency,
          contract.start_date,
          contract.end_date,
          netTotal,
        )
      }

      const { data: terms } = await supabase
        .from('contracts')
        .select('terms_snapshot')
        .eq('id', contractId)
        .single()
      if (!terms?.terms_snapshot) {
        updates.terms_snapshot = { captured_at: new Date().toISOString() }
      }

      await logActivity({
        action: 'contract_activated',
        module: 'contracts',
        entity_id: contractId,
        details: `Contract activated as ${newContractId}`,
        performer_name: context.userName,
      })
      break
    }

    case 'active_cancelled': {
      updates.cancelled_date = new Date().toISOString()
      updates.cancel_reason = context.reason || ''

      const today = new Date().toISOString().split('T')[0]
      await supabase
        .from('contract_visits')
        .delete()
        .eq('contract_id', contractId)
        .gt('scheduled_date', today)
        .eq('completed', false)

      await logActivity({
        action: 'contract_cancelled',
        module: 'contracts',
        entity_id: contractId,
        severity: 'critical',
        details: `Cancelled by ${context.userName}: ${context.reason}`,
        performer_name: context.userName,
      })
      break
    }

    case 'active_completed':
      await logActivity({
        action: 'contract_completed',
        module: 'contracts',
        entity_id: contractId,
        details: `Contract completed — all visits done and payments collected`,
        performer_name: context.userName,
      })
      break
  }
}

async function generatePayments(
  supabase: ReturnType<typeof createClient>,
  contractId: string,
  paymentMode: string,
  paymentFrequency: string,
  startDate: string,
  endDate: string,
  netTotal: number,
): Promise<void> {
  let payments: { contract_id: string; due_date: string; amount: number; status: string }[] = []

  if (paymentMode === 'fixed') {
    const periods = paymentPeriodCount(startDate, endDate, paymentFrequency)
    const baseAmount = Math.round(netTotal / periods)
    const stepFn: Record<string, (d: Date) => Date> = {
      monthly: (d) => addMonths(d, 1),
      quarterly: (d) => addMonths(d, 3),
      semi_annual: (d) => addMonths(d, 6),
      annual: (d) => addYears(d, 1),
    }
    const step = stepFn[paymentFrequency]
    if (!step) return

    let current = parseISO(startDate)
    for (let i = 0; i < periods; i++) {
      current = step(current)
      const amount = i === periods - 1 ? netTotal - baseAmount * (periods - 1) : baseAmount
      payments.push({
        contract_id: contractId,
        due_date: format(current, 'yyyy-MM-dd'),
        amount,
        status: 'pending',
      })
    }
  } else if (paymentMode === 'milestone') {
    const { data: milestones } = await supabase
      .from('contract_milestones')
      .select('*')
      .eq('contract_id', contractId)
      .order('sort_order')

    if (milestones) {
      payments = milestones.map((m: Record<string, unknown>) => ({
        contract_id: contractId,
        due_date: (m.due_date as string) || endDate,
        amount: m.amount as number,
        status: 'pending',
      }))
    }
  } else if (paymentMode === 'completion') {
    payments = [{
      contract_id: contractId,
      due_date: endDate,
      amount: netTotal,
      status: 'pending',
    }]
  }

  if (payments.length > 0) {
    await supabase.from('contract_payments').insert(payments)
    await supabase
      .from('contracts')
      .update({ total_payments: netTotal, paid_amount: 0 })
      .eq('id', contractId)
  }
}
