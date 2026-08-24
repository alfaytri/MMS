import { describe, it, expect } from 'vitest'
import { computeDivisionRows, editableSelection } from './divisionRows'

const D = ['a', 'b', 'c', 'd']

describe('computeDivisionRows', () => {
  it('locks inherited, keeps explicit editable, unchecks the rest', () => {
    const rows = computeDivisionRows(D, { editableIds: ['b'], lockedIds: ['a'] })
    expect(rows).toEqual([
      { id: 'a', checked: true, locked: true },
      { id: 'b', checked: true, locked: false },
      { id: 'c', checked: false, locked: false },
      { id: 'd', checked: false, locked: false },
    ])
  })

  it('locked wins when an id is both inherited and explicit', () => {
    const rows = computeDivisionRows(D, { editableIds: ['a'], lockedIds: ['a'] })
    expect(rows.find(r => r.id === 'a')).toEqual({ id: 'a', checked: true, locked: true })
  })
})

describe('editableSelection', () => {
  it('returns only checked, non-locked ids', () => {
    const rows = computeDivisionRows(D, { editableIds: ['b'], lockedIds: ['a'] })
    expect(editableSelection(rows)).toEqual(['b'])
  })
})
