import { describe, it, expect } from 'vitest'
import {
  findApplicableTiers,
  validateRoles,
  buildApprovalSteps,
  getNotificationRecipients,
  type ApprovalRole,
  type ApprovalChainTier,
  type ApprovalRoleAssignmentRow,
} from './approvalChainResolution'

function tier(rank: number, minAmount: number, roles: ApprovalRole[]): ApprovalChainTier {
  return { id: `t${rank}`, chain_id: 'c1', rank, min_amount: minAmount, max_amount: null, required_roles: roles, deleted_at: null }
}

function assign(profileId: string, role: ApprovalRole, divisionId: string | null = null): ApprovalRoleAssignmentRow {
  return { id: `a-${profileId}-${role}`, profile_id: profileId, role, division_id: divisionId, deleted_at: null, created_at: '' }
}

describe('findApplicableTiers', () => {
  const tiers = [tier(1, 0, ['purchase_manager']), tier(2, 5000, ['accountant']), tier(3, 50000, ['owner'])]

  it('returns only tier 1 for amount under 5000', () => {
    expect(findApplicableTiers(2000, tiers).map((t) => t.rank)).toEqual([1])
  })

  it('returns tiers 1+2 for 10000', () => {
    expect(findApplicableTiers(10000, tiers).map((t) => t.rank)).toEqual([1, 2])
  })

  it('returns all tiers for 100000', () => {
    expect(findApplicableTiers(100000, tiers).map((t) => t.rank)).toEqual([1, 2, 3])
  })

  it('skips soft-deleted tiers', () => {
    const withDeleted = [...tiers, { ...tier(4, 0, ['owner']), deleted_at: '2026-01-01' }]
    expect(findApplicableTiers(100000, withDeleted)).toHaveLength(3)
  })

  it('sorts by rank ascending regardless of input order', () => {
    expect(findApplicableTiers(100000, [tiers[2], tiers[0], tiers[1]]).map((t) => t.rank)).toEqual([1, 2, 3])
  })

  it('includes tier when amount equals min_amount exactly', () => {
    expect(findApplicableTiers(5000, tiers).map((t) => t.rank)).toEqual([1, 2])
  })
})

describe('validateRoles', () => {
  const tiers = [tier(1, 0, ['purchase_manager']), tier(2, 5000, ['accountant'])]

  it('returns null when all roles have assignees', () => {
    expect(validateRoles(tiers, [assign('pm', 'purchase_manager'), assign('ac', 'accountant')])).toBeNull()
  })

  it('returns error message naming the missing role', () => {
    const result = validateRoles(tiers, [assign('pm', 'purchase_manager')])
    expect(result).toContain('Accountant')
  })

  it('allows creator to be an approver', () => {
    const result = validateRoles(tiers, [assign('pm', 'purchase_manager'), assign('creator', 'accountant')])
    expect(result).toBeNull()
  })

  it('excludes soft-deleted assignments', () => {
    const result = validateRoles(tiers, [assign('pm', 'purchase_manager'), { ...assign('ac', 'accountant'), deleted_at: '2026-01-01' }])
    expect(result).toContain('Accountant')
  })
})

describe('buildApprovalSteps', () => {
  it('all steps are active from the start (parallel approval)', () => {
    const tiers = [tier(1, 0, ['purchase_manager']), tier(2, 5000, ['accountant'])]
    const steps = buildApprovalSteps('po1', tiers, 1)
    expect(steps.every((s) => s.is_active)).toBe(true)
  })

  it('creates one step per role per tier', () => {
    const steps = buildApprovalSteps('po1', [tier(1, 0, ['purchase_manager', 'accountant'])], 1)
    expect(steps).toHaveLength(2)
  })

  it('stamps all steps with the iteration number', () => {
    const steps = buildApprovalSteps('po1', [tier(1, 0, ['purchase_manager'])], 3)
    expect(steps.every((s) => s.iteration === 3)).toBe(true)
  })

  it('returns empty array for empty tiers', () => {
    expect(buildApprovalSteps('po1', [], 1)).toEqual([])
  })
})

describe('getNotificationRecipients', () => {
  const tiers = [tier(1, 0, ['purchase_manager']), tier(2, 5000, ['accountant'])]

  it('returns all users across all tiers', () => {
    const result = getNotificationRecipients(tiers, [assign('pm', 'purchase_manager'), assign('ac', 'accountant')])
    expect(result).toContain('pm')
    expect(result).toContain('ac')
    expect(result).toHaveLength(2)
  })

  it('deduplicates user holding multiple roles', () => {
    const multiTier = [tier(1, 0, ['purchase_manager', 'accountant'])]
    const result = getNotificationRecipients(multiTier, [assign('multi', 'purchase_manager'), assign('multi', 'accountant')])
    expect(result).toEqual(['multi'])
  })

  it('includes creator as notification recipient', () => {
    const result = getNotificationRecipients(tiers, [assign('creator', 'purchase_manager')])
    expect(result).toEqual(['creator'])
  })

  it('excludes soft-deleted assignments', () => {
    const result = getNotificationRecipients(
      tiers,
      [{ ...assign('pm', 'purchase_manager'), deleted_at: '2026-01-01' }],
    )
    expect(result).toEqual([])
  })
})
