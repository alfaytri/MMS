import { describe, it, expect } from 'vitest'
import { getAncestorIds } from '../useTeamServiceFilter'

describe('getAncestorIds', () => {
  // Split › Level 1 › Cleaning of inner AC
  const tree = [
    { id: 'split', parent_id: null },
    { id: 'l1', parent_id: 'split' },
    { id: 'clean', parent_id: 'l1' },
    { id: 'duct', parent_id: null },
  ]

  it('walks a leaf up to the root, inclusive', () => {
    expect(getAncestorIds('clean', tree)).toEqual(['clean', 'l1', 'split'])
  })

  it('a root node returns just itself', () => {
    expect(getAncestorIds('duct', tree)).toEqual(['duct'])
  })

  it('an id not in the tree returns just itself', () => {
    expect(getAncestorIds('missing', tree)).toEqual(['missing'])
  })

  it('ancestor-aware match: a parent-level skill covers a descendant service', () => {
    // Employee skilled in "l1" (a parent) should match the "clean" sub-service.
    const skillIds = ['l1']
    const matchable = getAncestorIds('clean', tree)
    expect(skillIds.some((s) => matchable.includes(s))).toBe(true)
  })
})
