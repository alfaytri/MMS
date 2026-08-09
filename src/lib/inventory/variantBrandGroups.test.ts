import { describe, it, expect } from 'vitest'
import { variantsToBrandGroups } from './variantBrandGroups'

type V = {
  id: string
  brand_id: string | null
  country_id: number | null
  brands?: { name: string } | null
  country_codes?: { name: string } | null
  code?: string | null
}

const mk = (o: Partial<V> & { id: string }): V => ({
  brand_id: null, country_id: null, brands: null, country_codes: null, ...o,
})

describe('variantsToBrandGroups', () => {
  it('groups by brand and keeps origin objects (full variant passthrough)', () => {
    const daikinEg = mk({ id: 'v1', brand_id: 'b1', brands: { name: 'DAIKIN' }, country_id: 1, country_codes: { name: 'Egypt' }, code: 'A' })
    const daikinDe = mk({ id: 'v2', brand_id: 'b1', brands: { name: 'DAIKIN' }, country_id: 2, country_codes: { name: 'Germany' }, code: 'B' })
    const lg = mk({ id: 'v3', brand_id: 'b2', brands: { name: 'LG' }, code: 'C' })
    const groups = variantsToBrandGroups([daikinDe, lg, daikinEg])
    const daikin = groups.find((g) => g.brandLabel === 'DAIKIN')!
    expect(daikin.origins.map((o) => o.id)).toEqual(['v1', 'v2']) // Egypt before Germany (A-Z)
    expect(daikin.origins[0].code).toBe('A')                       // original object preserved
    const lgGroup = groups.find((g) => g.brandLabel === 'LG')!
    expect(lgGroup.origins).toHaveLength(1)
  })

  it('labels brandless leaves "Unbranded" and sorts that group last', () => {
    const groups = variantsToBrandGroups([
      mk({ id: 'g1' }),                                              // no brand, no origin
      mk({ id: 'b1', brand_id: 'bx', brands: { name: 'Bosch' } }),
    ])
    expect(groups.map((g) => g.brandLabel)).toEqual(['Bosch', 'Unbranded'])
  })

  it('single generic leaf -> one Unbranded group with one origin', () => {
    const groups = variantsToBrandGroups([mk({ id: 'only' })])
    expect(groups).toHaveLength(1)
    expect(groups[0].brandLabel).toBe('Unbranded')
    expect(groups[0].origins).toHaveLength(1)
  })
})
