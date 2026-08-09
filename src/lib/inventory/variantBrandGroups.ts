import { groupVariants, type VariantLite } from './groupVariants'

// Minimal shape the picker groups on — the joined brand/country names plus the
// scalar FK ids. Kept structural (no hook import) so this stays pure.
export type BrandVariantLike = {
  id: string
  brand_id: string | null
  country_id: number | null
  brands?: { name: string } | null
  country_codes?: { name: string } | null
}

export type PickerBrandGroup<T> = {
  brandKey: string
  brandLabel: string
  origins: T[]
}

/**
 * Group joined variants by brand for the PO cascade, delegating the grouping +
 * ordering (Unbranded last, null-origin last) to the tested `groupVariants`,
 * then mapping each group's origins back to the ORIGINAL typed variant objects
 * (groupVariants only carries the VariantLite projection) so the caller can
 * pass a leaf straight to `handleVariantSelect`.
 */
export function variantsToBrandGroups<T extends BrandVariantLike>(variants: T[]): PickerBrandGroup<T>[] {
  const byId = new Map(variants.map((v) => [v.id, v]))
  const lite: VariantLite[] = variants.map((v) => ({
    id:           v.id,
    brand_id:     v.brand_id ?? null,
    brand_name:   v.brands?.name ?? null,
    country_id:   v.country_id ?? null,
    country_name: v.country_codes?.name ?? null,
  }))
  return groupVariants(lite).map((g) => ({
    brandKey:   g.brandKey,
    brandLabel: g.brandLabel,
    origins:    g.origins.map((o) => byId.get(o.id)!),
  }))
}
