import { describe, it, expect } from 'vitest'
import { normalizeBrandName, sameBrand } from './brandNormalize'
describe('brandNormalize', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeBrandName('  LG   Electronics ')).toBe('LG Electronics')
  })
  it('sameBrand is case + space insensitive', () => {
    expect(sameBrand(' lg ', 'LG')).toBe(true)
    expect(sameBrand('LG', 'LG Electronics')).toBe(false)
  })
})
