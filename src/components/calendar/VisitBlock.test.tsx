import { describe, it, expect } from 'vitest'
import { getVisitTypeConfig } from './VisitBlock'

describe('getVisitTypeConfig', () => {
  it('returns config for normal_order', () => {
    const cfg = getVisitTypeConfig('normal_order')
    expect(cfg.key).toBe('normal_order')
    expect(cfg.label).toBe('Normal Order')
    expect(cfg.color).toBeTruthy()
    expect(cfg.icon).toBeTruthy()
  })

  it('returns config for emergency', () => {
    const cfg = getVisitTypeConfig('emergency')
    expect(cfg.label).toBe('Emergency')
  })

  it('returns config for all 8 visit types', () => {
    const types = [
      'normal_order', 'emergency', 'follow_up', 'backwork',
      'site_visit', 'site_visit_contract', 'contract_visit', 'qc_visit',
    ]
    for (const t of types) {
      const cfg = getVisitTypeConfig(t)
      expect(cfg.key).toBe(t)
      expect(cfg.label).toBeTruthy()
    }
  })

  it('returns a fallback for unknown visit type', () => {
    const cfg = getVisitTypeConfig('unknown_type')
    expect(cfg.label).toBeTruthy()
    expect(cfg.key).toBe('unknown_type')
  })
})
