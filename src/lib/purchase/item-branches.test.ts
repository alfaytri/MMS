import { describe, it, expect } from 'vitest'
import { buildVariantBranchMap } from './item-branches'

describe('buildVariantBranchMap', () => {
  it('maps a variant to its item\'s branch names', () => {
    const map = buildVariantBranchMap(
      [{ id: 'v1', item_id: 'i1' }],
      [{ item_id: 'i1', name: 'Maintenance' }, { item_id: 'i1', name: 'Trading' }],
    )
    expect(map.get('v1')).toEqual(['Maintenance', 'Trading'])
  })

  it('de-duplicates repeated division links (doubled inventory_item_divisions rows)', () => {
    const map = buildVariantBranchMap(
      [{ id: 'v1', item_id: 'i1' }],
      [
        { item_id: 'i1', name: 'Maintenance' },
        { item_id: 'i1', name: 'Maintenance' },
        { item_id: 'i1', name: 'Trading' },
        { item_id: 'i1', name: 'Trading' },
      ],
    )
    expect(map.get('v1')).toEqual(['Maintenance', 'Trading'])
  })

  it('gives a variant with no division links an empty list', () => {
    const map = buildVariantBranchMap([{ id: 'v1', item_id: 'i1' }], [])
    expect(map.get('v1')).toEqual([])
  })

  it('shares branches across variants of the same item', () => {
    const map = buildVariantBranchMap(
      [{ id: 'v1', item_id: 'i1' }, { id: 'v2', item_id: 'i1' }],
      [{ item_id: 'i1', name: 'Trading' }],
    )
    expect(map.get('v1')).toEqual(['Trading'])
    expect(map.get('v2')).toEqual(['Trading'])
  })

  it('keeps items independent and skips blank rows', () => {
    const map = buildVariantBranchMap(
      [{ id: 'v1', item_id: 'i1' }, { id: 'v2', item_id: 'i2' }],
      [
        { item_id: 'i1', name: 'Maintenance' },
        { item_id: 'i2', name: 'Pest Control & Cleaning' },
        { item_id: 'i2', name: '' },
      ],
    )
    expect(map.get('v1')).toEqual(['Maintenance'])
    expect(map.get('v2')).toEqual(['Pest Control & Cleaning'])
  })
})
