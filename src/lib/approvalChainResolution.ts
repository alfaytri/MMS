export type ApprovalRole = 'purchase_manager' | 'accountant' | 'owner'

export type ApprovalChainTier = {
  id: string
  chain_id: string
  rank: number
  min_amount: number
  max_amount: number | null
  required_roles: ApprovalRole[]
  deleted_at: string | null
}

export type ApprovalRoleAssignmentRow = {
  id: string
  profile_id: string
  role: ApprovalRole
  division_id: string | null
  created_at: string
  deleted_at: string | null
}

export type ApprovalStepInsert = {
  po_id: string
  role: ApprovalRole
  tier_rank: number
  status: 'pending'
  is_active: boolean
  iteration: number
}

const ROLE_LABELS: Record<ApprovalRole, string> = {
  purchase_manager: 'Purchase Manager',
  accountant: 'Accountant',
  owner: 'Owner',
}

export function findApplicableTiers(amount: number, tiers: ApprovalChainTier[]): ApprovalChainTier[] {
  return tiers
    .filter((t) => !t.deleted_at && amount >= t.min_amount)
    .sort((a, b) => a.rank - b.rank)
}

export function validateRoles(
  tiers: ApprovalChainTier[],
  assignments: ApprovalRoleAssignmentRow[],
): string | null {
  const activeAssignments = assignments.filter((a) => !a.deleted_at)
  const allRoles = new Set(tiers.flatMap((t) => t.required_roles))
  for (const role of allRoles) {
    if (!activeAssignments.some((a) => a.role === role)) {
      return `No approver assigned for role: ${ROLE_LABELS[role] ?? role}. Go to Approval Settings → Role Assignments to add one.`
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
