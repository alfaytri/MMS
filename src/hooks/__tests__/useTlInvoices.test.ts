import { describe, it, expect } from 'vitest'
import { validateTlPaymentAmount } from '@/hooks/useTlInvoices'

describe('validateTlPaymentAmount', () => {
  it('accepts an amount that reaches but does not exceed the remaining', () => {
    expect(validateTlPaymentAmount({ total: 100, alreadyPaid: 40, newAmount: 60 })).toBeNull()
  })
  it('rejects an amount that overshoots the remaining', () => {
    const err = validateTlPaymentAmount({ total: 100, alreadyPaid: 40, newAmount: 61 })
    expect(err).toMatch(/exceeds remaining/i)
  })
  it('rejects zero or negative amounts', () => {
    expect(validateTlPaymentAmount({ total: 100, alreadyPaid: 0, newAmount: 0 })).toMatch(/greater than zero/i)
    expect(validateTlPaymentAmount({ total: 100, alreadyPaid: 0, newAmount: -5 })).toMatch(/greater than zero/i)
  })
  it('handles floating-point noise within 0.005 tolerance', () => {
    // Real-world: total 100.00, paid 99.995, entering 0.005 should be OK
    expect(validateTlPaymentAmount({ total: 100, alreadyPaid: 99.995, newAmount: 0.006 })).toBeNull()
    expect(validateTlPaymentAmount({ total: 100, alreadyPaid: 99.995, newAmount: 0.02 })).toMatch(/exceeds remaining/i)
  })
})
