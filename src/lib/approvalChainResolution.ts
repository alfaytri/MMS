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
  creatorProfileId: string,
): string | null {
  const eligibleAssignments = assignments.filter((a) => !a.deleted_at && a.profile_id !== creatorProfileId)
  const allRoles = new Set(tiers.flatMap((t) => t.required_roles))
  for (const role of allRoles) {
    if (!eligibleAssignments.some((a) => a.role === role)) {
      return `No eligible approver found for role: ${ROLE_LABELS[role] ?? role}. Assign someone to this role or ensure the approver is not the PO creator.`
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
  const lowestRank = tiers.length > 0 ? Math.min(...tiers.map((t) => t.rank)) : null
  for (const tier of tiers) {
    for (const role of tier.required_roles) {
      steps.push({
        po_id: poId,
        role,
        tier_rank: tier.rank,
        status: 'pending',
        is_active: tier.rank === lowestRank,
        iteration,
      })
    }
  }
  return steps
}

export function getNotificationRecipients(
  activeTierRank: number,
  tiers: ApprovalChainTier[],
  assignments: ApprovalRoleAssignmentRow[],
  creatorProfileId: string,
): string[] {
  const activeTier = tiers.find((t) => t.rank === activeTierRank)
  if (!activeTier) return []
  const activeRoles = new Set(activeTier.required_roles)
  const seen = new Set<string>()
  for (const a of assignments) {
    if (!a.deleted_at && activeRoles.has(a.role) && a.profile_id !== creatorProfileId) {
      seen.add(a.profile_id)
    }
  }
  return [...seen]
}
