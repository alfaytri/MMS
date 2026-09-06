import { describe, it, expect } from 'vitest'
import { resolveRiskTier, daysOverdue, DEFAULT_RISK_TIERS } from '../risk'

const NOW = new Date('2026-09-06T00:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString()

describe('resolveRiskTier', () => {
  it('null date → no tier', () => {
    expect(resolveRiskTier(null, DEFAULT_RISK_TIERS, NOW)).toBeNull()
  })
  it('picks greatest min_days ≤ age', () => {
    expect(resolveRiskTier(daysAgo(0), DEFAULT_RISK_TIERS, NOW)?.id).toBe('good')
    expect(resolveRiskTier(daysAgo(45), DEFAULT_RISK_TIERS, NOW)?.id).toBe('watch')
    expect(resolveRiskTier(daysAgo(65), DEFAULT_RISK_TIERS, NOW)?.id).toBe('late')
    expect(resolveRiskTier(daysAgo(200), DEFAULT_RISK_TIERS, NOW)?.id).toBe('high')
  })
  it('boundary: exactly 30d → watch', () => {
    expect(resolveRiskTier(daysAgo(30), DEFAULT_RISK_TIERS, NOW)?.id).toBe('watch')
  })
  it('boundary: 29d → good, 90d → high', () => {
    expect(resolveRiskTier(daysAgo(29), DEFAULT_RISK_TIERS, NOW)?.id).toBe('good')
    expect(resolveRiskTier(daysAgo(90), DEFAULT_RISK_TIERS, NOW)?.id).toBe('high')
  })
  it('daysOverdue null-safe', () => {
    expect(daysOverdue(null, NOW)).toBeNull()
    expect(daysOverdue(daysAgo(45), NOW)).toBe(45)
  })
})
