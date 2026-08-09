import { describe, it, expect } from 'vitest'
import { ancestorPath, buildLevels, type CategoryNode } from './categoryLevels'

// Fixture: a 4-deep chain with siblings at several levels.
//
//   R (root)              R2 (root, sibling of R, no children)
//   ├── A                 (child of R)
//   ├── A2                (child of R, sibling of A, no children)
//   A's children:
//   ├── B                 (grandchild of R, child of A)
//   ├── B2                (child of A, sibling of B, no children)
//   B's children:
//   └── C                 (great-grandchild of R, child of B, LEAF)
//
// Chain: R -> A -> B -> C
function buildFixture(): CategoryNode[] {
  return [
    { id: 'R', name_en: 'Root', parent_id: null },
    { id: 'R2', name_en: 'Root Sibling', parent_id: null },
    { id: 'A', name_en: 'Level 2 A', parent_id: 'R' },
    { id: 'A2', name_en: 'Level 2 Sibling', parent_id: 'R' },
    { id: 'B', name_en: 'Level 3 B', parent_id: 'A' },
    { id: 'B2', name_en: 'Level 3 Sibling', parent_id: 'A' },
    { id: 'C', name_en: 'Level 4 Leaf', parent_id: 'B' },
  ]
}

describe('ancestorPath', () => {
  it('returns ids root to node inclusive for a 4-deep chain', () => {
    const flat = buildFixture()
    expect(ancestorPath(flat, 'C')).toEqual(['R', 'A', 'B', 'C'])
  })

  it('returns [] for a null/absent id', () => {
    const flat = buildFixture()
    // @ts-expect-error - exercising runtime behavior for a null id
    expect(ancestorPath(flat, null)).toEqual([])
    expect(ancestorPath(flat, 'does-not-exist')).toEqual([])
  })

  it('returns a single-element path for a root node', () => {
    const flat = buildFixture()
    expect(ancestorPath(flat, 'R')).toEqual(['R'])
  })

  it('returns a two-element path for a depth-2 node', () => {
    const flat = buildFixture()
    expect(ancestorPath(flat, 'A')).toEqual(['R', 'A'])
  })
})

describe('buildLevels', () => {
  it('selectedId = null -> 1 level (roots, selectedId null)', () => {
    const flat = buildFixture()
    const levels = buildLevels(flat, null)

    expect(levels).toHaveLength(1)
    expect(levels[0].selectedId).toBeNull()
    expect(levels[0].options.map((o) => o.id).sort()).toEqual(['R', 'R2'])
  })

  it('selectedId = a root with NO children -> 1 level (roots, selectedId = that root)', () => {
    const flat = buildFixture()
    const levels = buildLevels(flat, 'R2')

    expect(levels).toHaveLength(1)
    expect(levels[0].selectedId).toBe('R2')
    expect(levels[0].options.map((o) => o.id).sort()).toEqual(['R', 'R2'])
  })

  it('selectedId = a depth-2 node that HAS children -> 3 levels; 3rd level lists its children with selectedId null', () => {
    const flat = buildFixture()
    const levels = buildLevels(flat, 'A')

    expect(levels).toHaveLength(3)

    // Level 0: roots, selected = R (A's parent)
    expect(levels[0].selectedId).toBe('R')
    expect(levels[0].options.map((o) => o.id).sort()).toEqual(['R', 'R2'])

    // Level 1: children of R, selected = A
    expect(levels[1].selectedId).toBe('A')
    expect(levels[1].options.map((o) => o.id).sort()).toEqual(['A', 'A2'])

    // Level 2: children of A (B, B2), selectedId null - the "empty next level"
    // while children exist, because the path ended at A.
    expect(levels[2].selectedId).toBeNull()
    expect(levels[2].options.map((o) => o.id).sort()).toEqual(['B', 'B2'])
  })

  it('selectedId = a depth-4 leaf -> 4 levels, selectedIds [root, L2, L3, L4], no 5th level', () => {
    const flat = buildFixture()
    const levels = buildLevels(flat, 'C')

    expect(levels).toHaveLength(4)

    expect(levels[0].selectedId).toBe('R')
    expect(levels[0].options.map((o) => o.id).sort()).toEqual(['R', 'R2'])

    expect(levels[1].selectedId).toBe('A')
    expect(levels[1].options.map((o) => o.id).sort()).toEqual(['A', 'A2'])

    expect(levels[2].selectedId).toBe('B')
    expect(levels[2].options.map((o) => o.id).sort()).toEqual(['B', 'B2'])

    expect(levels[3].selectedId).toBe('C')
    expect(levels[3].options.map((o) => o.id).sort()).toEqual(['C'])

    // No 5th level - C is a leaf (no children)
    expect(levels).toHaveLength(4)
  })

  it('selectedId = a depth-3 node (B) that HAS a child -> 4 levels; 4th level lists B\'s children with selectedId null', () => {
    const flat = buildFixture()
    const levels = buildLevels(flat, 'B')

    expect(levels).toHaveLength(4)

    expect(levels[0].selectedId).toBe('R')
    expect(levels[1].selectedId).toBe('A')
    expect(levels[2].selectedId).toBe('B')
    expect(levels[2].options.map((o) => o.id).sort()).toEqual(['B', 'B2'])

    // 4th level: children of B (just C), selectedId null
    expect(levels[3].selectedId).toBeNull()
    expect(levels[3].options.map((o) => o.id)).toEqual(['C'])
  })

  it('is pure: does not mutate the input array or its nodes', () => {
    const flat = buildFixture()
    const originalOrder = [...flat]
    const snapshots = flat.map((n) => ({ ...n }))

    buildLevels(flat, 'C')
    ancestorPath(flat, 'C')

    expect(flat).toEqual(originalOrder)
    flat.forEach((n, i) => {
      expect(n).toBe(originalOrder[i])
      expect(n).toEqual(snapshots[i])
    })
  })

  it('returns an empty roots level for empty input with null selection', () => {
    const levels = buildLevels([], null)
    expect(levels).toEqual([{ options: [], selectedId: null }])
  })
})
