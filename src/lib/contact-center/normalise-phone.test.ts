import { describe, it, expect } from 'vitest'
import { normalisePhone, tryNormalisePhone, NormalisePhoneError } from './normalise-phone'

describe('normalisePhone — Qatar numbers', () => {
  it('8-digit local → +974XXXXXXXX', () => {
    expect(normalisePhone('33445566')).toBe('+97433445566')
  })

  it('974 prefix (11 digits) → +974XXXXXXXX', () => {
    expect(normalisePhone('97433445566')).toBe('+97433445566')
  })

  it('00974 prefix (13 digits) → +974XXXXXXXX', () => {
    expect(normalisePhone('0097433445566')).toBe('+97433445566')
  })

  it('+974 already canonical → unchanged', () => {
    expect(normalisePhone('+97433445566')).toBe('+97433445566')
  })

  it('strips spaces and dashes', () => {
    expect(normalisePhone('3344 5566')).toBe('+97433445566')
    expect(normalisePhone('+974-3344-5566')).toBe('+97433445566')
  })
})

describe('normalisePhone — spec phone shapes for Teams tab', () => {
  it("strips parentheses and mixed separators '(+974) 5555 1234'", () => {
    expect(normalisePhone('(+974) 5555 1234')).toBe('+97455551234')
  })

  it("'+974-5555-1234' (dashed) → +97455551234", () => {
    expect(normalisePhone('+974-5555-1234')).toBe('+97455551234')
  })

  it("'00974 5555 1234' (00 prefix with spaces) → +97455551234", () => {
    expect(normalisePhone('00974 5555 1234')).toBe('+97455551234')
  })

  it("'974 55551234' (bare 974 prefix) → +97455551234", () => {
    expect(normalisePhone('974 55551234')).toBe('+97455551234')
  })

  it('is idempotent on already-normalised input', () => {
    const n1 = normalisePhone('+974-5555-1234')
    const n2 = normalisePhone(n1)
    expect(n2).toBe(n1)
  })
})

describe('normalisePhone — international numbers', () => {
  it('+44 UK number returned unchanged', () => {
    expect(normalisePhone('+447911123456')).toBe('+447911123456')
  })

  it('+1 US number returned unchanged', () => {
    expect(normalisePhone('+12125551234')).toBe('+12125551234')
  })

  it('+966 Saudi number returned unchanged', () => {
    expect(normalisePhone('+966501234567')).toBe('+966501234567')
  })
})

describe('normalisePhone — invalid inputs throw', () => {
  it('throws NormalisePhoneError for 7-digit input', () => {
    expect(() => normalisePhone('1234567')).toThrow(NormalisePhoneError)
  })

  it('throws for ambiguous 10-digit without country code', () => {
    expect(() => normalisePhone('1234567890')).toThrow(NormalisePhoneError)
  })

  it('throws for empty string', () => {
    expect(() => normalisePhone('')).toThrow(NormalisePhoneError)
  })
})

describe('tryNormalisePhone', () => {
  it('returns null for invalid input instead of throwing', () => {
    expect(tryNormalisePhone('abc')).toBeNull()
    expect(tryNormalisePhone('123')).toBeNull()
  })

  it('returns normalised form for valid input', () => {
    expect(tryNormalisePhone('33445566')).toBe('+97433445566')
  })
})
