// Unified-roles era: approval roles are now custom_roles rows with
// is_approval_slot = true. The hard-coded enum union and label map are
// gone — role names are dynamic. Workflow scope values are the only
// remaining closed set.

export type WorkflowScope = 'po' | 'inv_check' | 'stock_adj' | 'sales_margin' | 'sales_credit'

export const WORKFLOW_SCOPE_LABELS: Record<WorkflowScope, string> = {
  po:            'Purchase Orders',
  inv_check:     'Inventory Checks',
  stock_adj:     'Stock Adjustments',
  sales_margin:  'Sales — Margin',
  sales_credit:  'Sales — Credit',
}

export type ApprovalChainTier = {
  id: string
  chain_id: string
  rank: number
  min_amount: number
  max_amount: number | null
  required_roles: string[]      // role names (custom_roles.name)
  deleted_at: string | null
}

export type ApprovalRoleAssignmentRow = {
  id: string
  profile_id: string
  role: string                  // role name (custom_roles.name) — kept for any legacy callers during transition
  division_id: string | null
  created_at: string
  deleted_at: string | null
}

export type ApprovalStepInsert = {
  po_id: string
  role: string                  // custom_roles.name
  tier_rank: number
  status: 'pending'
  is_active: boolean
  iteration: number
}

export function findApplicableTiers(amount: number, tiers: ApprovalChainTier[]): ApprovalChainTier[] {
  return tiers
    .filter((t) => !t.deleted_at && amount >= t.min_amount)
    .sort((a, b) => a.rank - b.rank)
}

// validateRoles helper kept in case any tier-builder UI still calls it.
// Roles list is now plain strings — just checks that every required role
// has at least one assignee in the assignments array.
export function validateRoles(
  tiers: ApprovalChainTier[],
  assignments: ApprovalRoleAssignmentRow[],
): string | null {
  const activeAssignments = assignments.filter((a) => !a.deleted_at)
  const allRoles = new Set(tiers.flatMap((t) => t.required_roles))
  for (const role of allRoles) {
    if (!activeAssignments.some((a) => a.role === role)) {
      return `No user assigned to required role: ${role}`
    }
  }
  return null
}

export function buildApprovalSteps(
  poId: string,
  tiers: ApprovalChainTier[],
  iteration: number,
): ApprovalStepInsert[] {
  const steps: ApprovalStepInsert[] = []
  for (const tier of tiers) {
    for (const role of tier.required_roles) {
      steps.push({
        po_id: poId,
        role,
        tier_rank: tier.rank,
        status: 'pending',
        is_active: true,
        iteration,
      })
    }
  }
  return steps
}

export function getNotificationRecipients(
  tiers: ApprovalChainTier[],
  assignments: ApprovalRoleAssignmentRow[],
): string[] {
  const allRoles = new Set(tiers.flatMap((t) => t.required_roles))
  const seen = new Set<string>()
  for (const a of assignments) {
    if (!a.deleted_at && allRoles.has(a.role)) {
      seen.add(a.profile_id)
    }
  }
  return [...seen]
}
