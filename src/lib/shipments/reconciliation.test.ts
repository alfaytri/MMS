import { describe, it, expect } from 'vitest'
import { remainingUnshipped, exceedsRemaining } from './reconciliation'

describe('reconciliation', () => {
  it('remaining never negative', () => {
    expect(remainingUnshipped(10, 4)).toBe(6)
    expect(remainingUnshipped(10, 15)).toBe(0)
    expect(remainingUnshipped(10, 0)).toBe(10)
  })
  it('exceeds when new qty beats the remainder elsewhere', () => {
    expect(exceedsRemaining(14, 12, 0)).toBe(true)   // 14 > 12
    expect(exceedsRemaining(6, 10, 4)).toBe(false)   // 6 == remainder 6
    expect(exceedsRemaining(7, 10, 4)).toBe(true)    // 7 > remainder 6
  })
})
