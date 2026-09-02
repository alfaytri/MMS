import { describe, it, expect } from 'vitest'
import { deriveHoldsStock } from './teamCustody'

describe('deriveHoldsStock', () => {
  it('false when no linked custody sub exists', () => {
    expect(deriveHoldsStock(null)).toBe(false)
    expect(deriveHoldsStock(undefined)).toBe(false)
  })
  it('true only when the linked sub is active', () => {
    expect(deriveHoldsStock({ is_active: true })).toBe(true)
    expect(deriveHoldsStock({ is_active: false })).toBe(false)
  })
})
