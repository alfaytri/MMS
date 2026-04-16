import { describe, it, expect } from 'vitest'
import { formatCurrency, formatDate, formatDateTime, formatRelative, formatNumber } from './formatters'

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
    expect(formatDate('2026-04-16')).toBe('16 Apr 2026')
  })

  it('returns dash for null', () => {
    expect(formatDate(null)).toBe('—')
  })

  it('returns dash for undefined', () => {
    expect(formatDate(undefined)).toBe('—')
  })

  it('returns dash for invalid date string', () => {
    expect(formatDate('garbage')).toBe('—')
  })
})

describe('formatDateTime', () => {
  it('formats ISO date-time string', () => {
    expect(formatDateTime('2026-04-16T12:00:00Z')).toMatch(/16 Apr 2026/)
  })

  it('returns dash for null', () => {
    expect(formatDateTime(null)).toBe('—')
  })

  it('returns dash for undefined', () => {
    expect(formatDateTime(undefined)).toBe('—')
  })

  it('returns dash for invalid date string', () => {
    expect(formatDateTime('not-a-date')).toBe('—')
  })
})

describe('formatRelative', () => {
  it('returns a relative time string for a valid date', () => {
    expect(formatRelative(new Date().toISOString())).toMatch(/ago|second|minute|hour|day/)
  })

  it('returns dash for null', () => {
    expect(formatRelative(null)).toBe('—')
  })

  it('returns dash for undefined', () => {
    expect(formatRelative(undefined)).toBe('—')
  })

  it('returns dash for invalid date string', () => {
    expect(formatRelative('bad-date')).toBe('—')
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
