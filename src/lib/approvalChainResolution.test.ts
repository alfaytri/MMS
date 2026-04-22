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

  it('returns null when all roles have eligible assignees', () => {
    expect(validateRoles(tiers, [assign('pm', 'purchase_manager'), assign('ac', 'accountant')], 'creator')).toBeNull()
  })

  it('returns error message naming the missing role', () => {
    const result = validateRoles(tiers, [assign('pm', 'purchase_manager')], 'creator')
    expect(result).toContain('Accountant')
  })

  it('excludes the creator from eligible assignees', () => {
    const result = validateRoles(tiers, [assign('pm', 'purchase_manager'), assign('creator', 'accountant')], 'creator')
    expect(result).toContain('Accountant')
  })

  it('excludes soft-deleted assignments', () => {
    const result = validateRoles(tiers, [assign('pm', 'purchase_manager'), { ...assign('ac', 'accountant'), deleted_at: '2026-01-01' }], 'creator')
    expect(result).toContain('Accountant')
  })
})

describe('buildApprovalSteps', () => {
  it('first tier is active, others dormant', () => {
    const tiers = [tier(1, 0, ['purchase_manager']), tier(2, 5000, ['accountant'])]
    const steps = buildApprovalSteps('po1', tiers, 1)
    expect(steps.filter((s) => s.tier_rank === 1).every((s) => s.is_active)).toBe(true)
    expect(steps.filter((s) => s.tier_rank === 2).every((s) => !s.is_active)).toBe(true)
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

  it('returns users holding the active tier role', () => {
    const result = getNotificationRecipients(1, tiers, [assign('pm', 'purchase_manager'), assign('ac', 'accountant')], 'creator')
    expect(result).toEqual(['pm'])
  })

  it('deduplicates user holding multiple roles in same tier', () => {
    const multiTier = [tier(1, 0, ['purchase_manager', 'accountant'])]
    const result = getNotificationRecipients(1, multiTier, [assign('multi', 'purchase_manager'), assign('multi', 'accountant')], 'creator')
    expect(result).toEqual(['multi'])
  })

  it('excludes the creator', () => {
    const result = getNotificationRecipients(1, tiers, [assign('creator', 'purchase_manager')], 'creator')
    expect(result).toEqual([])
  })

  it('excludes soft-deleted assignments', () => {
    const result = getNotificationRecipients(
      1,
      tiers,
      [{ ...assign('pm', 'purchase_manager'), deleted_at: '2026-01-01' }],
      'creator'
    )
    expect(result).toEqual([])
  })
})
