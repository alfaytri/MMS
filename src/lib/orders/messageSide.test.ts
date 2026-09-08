import { describe, it, expect } from 'vitest'
import { messageSide } from './messageSide'

describe('messageSide', () => {
  it('my own message is on the right', () => {
    expect(messageSide('u1', 'u1')).toBe('right')
  })
  it("someone else's message is on the left", () => {
    expect(messageSide('u2', 'u1')).toBe('left')
  })
  it('null author is on the left', () => {
    expect(messageSide(null, 'u1')).toBe('left')
  })
  it('null current user is on the left', () => {
    expect(messageSide('u1', null)).toBe('left')
  })
})
