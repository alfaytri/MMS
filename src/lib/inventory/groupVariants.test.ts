import { describe, it, expect } from 'vitest'
import { groupVariants, type VariantLite } from './groupVariants'

describe('groupVariants', () => {
  it('groups a variant with both brand and origin set', () => {
    const variants: VariantLite[] = [
      {
        id: 'v1',
        brand_id: 'b1',
        brand_name: 'LG',
        country_id: 1,
        country_name: 'South Korea',
        price: 100,
      },
    ]

    const result = groupVariants(variants)

    expect(result).toEqual([
      {
        brandKey: 'b1',
        brandLabel: 'LG',
        origins: [
          {
            id: 'v1',
            brand_id: 'b1',
            brand_name: 'LG',
            country_id: 1,
            country_name: 'South Korea',
            price: 100,
          },
        ],
      },
    ])
  })

  it('places a brand-only variant (null origin) in its brand group, sorted last within the group', () => {
    const variants: VariantLite[] = [
      {
        id: 'v1',
        brand_id: 'b1',
        brand_name: 'LG',
        country_id: null,
        country_name: null,
      },
      {
        id: 'v2',
        brand_id: 'b1',
        brand_name: 'LG',
        country_id: 2,
        country_name: 'Japan',
      },
    ]

    const result = groupVariants(variants)

    expect(result).toHaveLength(1)
    expect(result[0].brandKey).toBe('b1')
    expect(result[0].brandLabel).toBe('LG')
    // Japan sorts before the null-origin variant (null last)
    expect(result[0].origins.map((o) => o.id)).toEqual(['v2', 'v1'])
  })

  it('places an origin-only variant (null brand) into the Unbranded group', () => {
    const variants: VariantLite[] = [
      {
        id: 'v1',
        brand_id: null,
        brand_name: null,
        country_id: 3,
        country_name: 'China',
      },
    ]

    const result = groupVariants(variants)

    expect(result).toEqual([
      {
        brandKey: '__nobrand__',
        brandLabel: 'Unbranded',
        origins: [
          {
            id: 'v1',
            brand_id: null,
            brand_name: null,
            country_id: 3,
            country_name: 'China',
          },
        ],
      },
    ])
  })

  it('places a fully generic variant (null brand, null origin) into the Unbranded group with null country_name', () => {
    const variants: VariantLite[] = [
      {
        id: 'v1',
        brand_id: null,
        brand_name: null,
        country_id: null,
        country_name: null,
      },
    ]

    const result = groupVariants(variants)

    expect(result).toEqual([
      {
        brandKey: '__nobrand__',
        brandLabel: 'Unbranded',
        origins: [
          {
            id: 'v1',
            brand_id: null,
            brand_name: null,
            country_id: null,
            country_name: null,
          },
        ],
      },
    ])
  })

  it('sorts brand groups by label case-insensitively ascending, with Unbranded always last', () => {
    const variants: VariantLite[] = [
      { id: 'v1', brand_id: null, brand_name: null, country_id: null, country_name: null },
      { id: 'v2', brand_id: 'b-samsung', brand_name: 'samsung', country_id: null, country_name: null },
      { id: 'v3', brand_id: 'b-lg', brand_name: 'LG', country_id: null, country_name: null },
      { id: 'v4', brand_id: 'b-apple', brand_name: 'Apple', country_id: null, country_name: null },
    ]

    const result = groupVariants(variants)

    expect(result.map((g) => g.brandKey)).toEqual(['b-apple', 'b-lg', 'b-samsung', '__nobrand__'])
    expect(result.map((g) => g.brandLabel)).toEqual(['Apple', 'LG', 'samsung', 'Unbranded'])
  })

  it('sorts origins within a group by country_name case-insensitively ascending, with null last', () => {
    const variants: VariantLite[] = [
      { id: 'v1', brand_id: 'b1', brand_name: 'LG', country_id: 1, country_name: 'vietnam' },
      { id: 'v2', brand_id: 'b1', brand_name: 'LG', country_id: 2, country_name: null },
      { id: 'v3', brand_id: 'b1', brand_name: 'LG', country_id: 3, country_name: 'China' },
      { id: 'v4', brand_id: 'b1', brand_name: 'LG', country_id: 4, country_name: 'Japan' },
    ]

    const result = groupVariants(variants)

    expect(result).toHaveLength(1)
    expect(result[0].origins.map((o) => o.id)).toEqual(['v3', 'v4', 'v1', 'v2'])
  })

  it('is pure: does not mutate the input array or its objects', () => {
    const v1: VariantLite = {
      id: 'v1',
      brand_id: 'b-samsung',
      brand_name: 'Samsung',
      country_id: 2,
      country_name: 'Japan',
    }
    const v2: VariantLite = {
      id: 'v2',
      brand_id: 'b-apple',
      brand_name: 'Apple',
      country_id: 1,
      country_name: 'China',
    }
    const variants: VariantLite[] = [v1, v2]
    const originalOrder = [...variants]
    const v1Snapshot = { ...v1 }
    const v2Snapshot = { ...v2 }

    groupVariants(variants)

    // Original array order/identity untouched
    expect(variants).toEqual(originalOrder)
    expect(variants[0]).toBe(v1)
    expect(variants[1]).toBe(v2)
    // Original objects untouched
    expect(v1).toEqual(v1Snapshot)
    expect(v2).toEqual(v2Snapshot)
  })

  it('carries through extra fields on each variant unchanged', () => {
    const variants: VariantLite[] = [
      {
        id: 'v1',
        brand_id: 'b1',
        brand_name: 'LG',
        country_id: 1,
        country_name: 'South Korea',
        price: 250,
        stock: 40,
        sku: 'LG-TV-55',
      },
    ]

    const result = groupVariants(variants)

    expect(result[0].origins[0]).toEqual({
      id: 'v1',
      brand_id: 'b1',
      brand_name: 'LG',
      country_id: 1,
      country_name: 'South Korea',
      price: 250,
      stock: 40,
      sku: 'LG-TV-55',
    })
  })

  it('returns an empty array for empty input', () => {
    expect(groupVariants([])).toEqual([])
  })
})
