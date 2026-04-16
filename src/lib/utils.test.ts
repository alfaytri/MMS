import { describe, it, expect } from 'vitest'
import { cn } from './utils'

describe('cn()', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('deduplicates conflicting Tailwind classes (last wins)', () => {
    expect(cn('p-4', 'p-6')).toBe('p-6')
  })

  it('handles falsy values', () => {
    expect(cn('foo', false && 'bar', null, undefined, 'baz')).toBe('foo baz')
  })

  it('handles conditional objects', () => {
    expect(cn({ 'text-primary': true, 'text-muted': false })).toBe('text-primary')
  })
})
