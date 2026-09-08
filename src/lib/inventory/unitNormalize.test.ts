import { describe, it, expect } from 'vitest'
import { normalizeUnitName, sameUnit } from './unitNormalize'

describe('unitNormalize', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeUnitName('  Sq   Metre ')).toBe('Sq Metre')
  })
  it('sameUnit is case + space insensitive', () => {
    expect(sameUnit(' piece ', 'Piece')).toBe(true)
    expect(sameUnit('Metre', 'Sq Metre')).toBe(false)
  })
})
