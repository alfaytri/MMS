import { describe, it, expect } from 'vitest'
import { formatCurrency, formatDate, formatNumber } from './formatters'

describe('formatCurrency', () => {
  it('formats QAR amounts', () => {
    expect(formatCurrency(1234.5)).toMatch(/1,234\.50/)
  })

  it('returns dash for null', () => {
    expect(formatCurrency(null)).toBe('—')
  })

  it('returns dash for undefined', () => {
    expect(formatCurrency(undefined)).toBe('—')
  })
})

describe('formatDate', () => {
  it('formats ISO date string', () => {
    expect(formatDate('2026-04-16T10:30:00Z')).toBe('16 Apr 2026')
  })

  it('returns dash for null', () => {
    expect(formatDate(null)).toBe('—')
  })
})

describe('formatNumber', () => {
  it('formats with thousand separators', () => {
    expect(formatNumber(400000)).toMatch(/400,000/)
  })

  it('returns dash for null', () => {
    expect(formatNumber(null)).toBe('—')
  })
})
