import { describe, it, expect } from 'vitest'
import { variantPickerLabel, brandOriginText, GENERIC_VARIANT_LABEL } from './variantPickerLabel'

describe('variantPickerLabel', () => {
  it('branded + origin: brand is primary, origin kept as a segment', () => {
    expect(variantPickerLabel({ brand_name: 'Bosch', country_name: 'Germany' }))
      .toEqual({ primary: 'Bosch', origin: 'Germany' })
  })

  it('prefers the joined brand_name over the denormalized brand text', () => {
    expect(variantPickerLabel({ brand_name: 'Bosch', brand: 'BOSCH LEGACY', country_name: 'Germany' }))
      .toEqual({ primary: 'Bosch', origin: 'Germany' })
  })

  it('falls back to the denormalized brand text when the join is absent', () => {
    expect(variantPickerLabel({ brand: 'Bosch', country_name: 'Germany' }))
      .toEqual({ primary: 'Bosch', origin: 'Germany' })
  })

  it('origin-only: origin becomes primary, no duplicate origin segment', () => {
    expect(variantPickerLabel({ brand_name: null, country_name: 'Italy' }))
      .toEqual({ primary: 'Italy', origin: null })
  })

  it('generic (no brand, no origin): shows the Generic label', () => {
    expect(variantPickerLabel({ brand_name: null, brand: '', country_name: null }))
      .toEqual({ primary: GENERIC_VARIANT_LABEL, origin: null })
  })

  it('treats a literal "generic" brand text as no brand', () => {
    expect(variantPickerLabel({ brand: 'generic', country_name: 'China' }))
      .toEqual({ primary: 'China', origin: null })
  })

  it('trims and ignores whitespace-only values', () => {
    expect(variantPickerLabel({ brand_name: '  ', brand: '  ', country_name: '  ' }))
      .toEqual({ primary: GENERIC_VARIANT_LABEL, origin: null })
  })
})

describe('brandOriginText', () => {
  it('brand + origin → "Brand · Origin"', () => {
    expect(brandOriginText('Bosch', 'Germany')).toBe('Bosch · Germany')
  })

  it('brand only → just the brand', () => {
    expect(brandOriginText('Bosch', null)).toBe('Bosch')
  })

  it('origin only → just the origin', () => {
    expect(brandOriginText(null, 'Italy')).toBe('Italy')
  })

  it('neither → null (so callers keep their own em-dash fallback)', () => {
    expect(brandOriginText(null, null)).toBeNull()
  })

  it('treats a literal "generic" brand with no origin as null', () => {
    expect(brandOriginText('generic', null)).toBeNull()
  })
})
