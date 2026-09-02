import { describe, it, expect } from 'vitest'
import { filterCustodyDestinationsByDivision } from './filterCustodyDestinationsByDivision'
import type { CustodyLocationRow } from '@/hooks/useCustodyLocations'

const row = (id: string, division_id: string | null): CustodyLocationRow => ({
  id,
  name: id,
  warehouse_id: 'w',
  warehouse_name: 'w',
  division_id,
  division_name: division_id,
  is_active: true,
  responsible_person_profile_id: null,
  responsible_person_name: null,
  responsible_person_phone: null,
  created_at: null,
  updated_at: null,
  team_id: null,
  team_name: null,
})

describe('filterCustodyDestinationsByDivision', () => {
  const locs = [row('a', 'd1'), row('b', 'd2'), row('c', null)]

  it('super-viewers see everything', () => {
    expect(filterCustodyDestinationsByDivision(locs, [], true)).toHaveLength(3)
  })

  it('members see only their divisions', () => {
    expect(filterCustodyDestinationsByDivision(locs, ['d1'], false).map((l) => l.id)).toEqual(['a'])
  })

  it('hides division-less locations for non-super-viewers', () => {
    expect(filterCustodyDestinationsByDivision(locs, ['d1', 'd2'], false).map((l) => l.id)).toEqual(['a', 'b'])
  })

  it('empty division scope yields nothing for non-super-viewers', () => {
    expect(filterCustodyDestinationsByDivision(locs, [], false)).toHaveLength(0)
  })
})
