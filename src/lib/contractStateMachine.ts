import type { ContractStatus } from '@/types/contracts'
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

export interface ActivationPaymentRow {
  due_date: string
  amount: number
  status: string
}

interface ContractPaymentInputs {
  total_value: number | null
  payment_mode: string | null
  payment_frequency: string | null
  start_date: string
  end_date: string
}

/**
 * Build the payment-schedule rows for activation.
 *
 * IMPORTANT: `total_value` is stored already **net** of discount (the create
 * and save flows persist `netTotal`). We must therefore NOT subtract discount
 * again here — doing so was the double-discount bug that under-billed fixed and
 * completion contracts by one discount amount.
 *
 * Pure: returns rows for the caller to hand to rpc_activate_contract, which
 * inserts them and flips the status in a single transaction.
 */
export function buildActivationPayments(
  contract: ContractPaymentInputs,
  milestones: { amount: number; due_date: string | null }[],
): ActivationPaymentRow[] {
  const netTotal = contract.total_value || 0
  const paymentMode = contract.payment_mode || 'fixed'
  const paymentFrequency = contract.payment_frequency || 'monthly'
  const { start_date: startDate, end_date: endDate } = contract

  if (paymentMode === 'milestone') {
    return milestones.map((m) => ({
      due_date: m.due_date || endDate,
      amount: m.amount,
      status: 'pending',
    }))
  }

  if (paymentMode === 'completion') {
    return [{ due_date: endDate, amount: netTotal, status: 'pending' }]
  }

  // fixed
  const stepFn: Record<string, (d: Date) => Date> = {
    monthly: (d) => addMonths(d, 1),
    quarterly: (d) => addMonths(d, 3),
    semi_annual: (d) => addMonths(d, 6),
    annual: (d) => addYears(d, 1),
  }
  const step = stepFn[paymentFrequency]
  // Unknown/unsupported frequency: fall back to a single payment rather than
  // silently generating none.
  if (!step) {
    return [{ due_date: endDate, amount: netTotal, status: 'pending' }]
  }

  const periods = paymentPeriodCount(startDate, endDate, paymentFrequency)
  const baseAmount = Math.round(netTotal / periods)
  const rows: ActivationPaymentRow[] = []
  let current = parseISO(startDate)
  for (let i = 0; i < periods; i++) {
    current = step(current)
    const amount =
      i === periods - 1 ? netTotal - baseAmount * (periods - 1) : baseAmount
    rows.push({ due_date: format(current, 'yyyy-MM-dd'), amount, status: 'pending' })
  }
  return rows
}

/**
 * Field-only side effects for the lightweight quotation transitions.
 *
 * The money-bearing transitions — approved→active and active→cancelled — are
 * NOT handled here; they run atomically server-side via rpc_activate_contract /
 * rpc_cancel_contract (see useUpdateContract). This function only mutates the
 * `updates` object with audit fields and writes an activity-log entry.
 */
export async function applyTransitionSideEffects(
  contractId: string,
  from: ContractStatus,
  to: ContractStatus,
  updates: Record<string, unknown>,
  context: { userId: string; userName: string; reason?: string },
): Promise<void> {
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

    case 'active_completed':
      await logActivity({
        action: 'contract_completed',
        module: 'contracts',
        entity_id: contractId,
        details: `Contract marked completed`,
        performer_name: context.userName,
      })
      break
  }
}
