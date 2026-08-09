export type VariantLite = {
  id: string
  brand_id: string | null
  brand_name: string | null
  country_id: number | null
  country_name: string | null
  [key: string]: unknown
}

export type BrandGroup = {
  brandKey: string
  brandLabel: string
  origins: VariantLite[]
}

const NO_BRAND_KEY = '__nobrand__'
const NO_BRAND_LABEL = 'Unbranded'

/**
 * Groups variants by brand, then sorts variants within each brand group by
 * country_name (origin). Pure function — does not mutate the input array or
 * any of its elements.
 *
 * Grouping:
 * - brandKey = brand_id when set, else the literal '__nobrand__'
 * - brandLabel = brand_name when set, else 'Unbranded'
 *
 * Ordering:
 * - Brand groups: brandLabel ascending, case-insensitive; 'Unbranded' always last
 * - Origins within a group: country_name ascending, case-insensitive; null last
 */
export function groupVariants(variants: VariantLite[]): BrandGroup[] {
  const groupsByKey = new Map<string, BrandGroup>()

  for (const variant of variants) {
    const brandKey = variant.brand_id ?? NO_BRAND_KEY
    const brandLabel = variant.brand_name ?? NO_BRAND_LABEL

    let group = groupsByKey.get(brandKey)
    if (!group) {
      group = { brandKey, brandLabel, origins: [] }
      groupsByKey.set(brandKey, group)
    }
    group.origins.push(variant)
  }

  const groups = Array.from(groupsByKey.values()).map((group) => ({
    ...group,
    origins: [...group.origins].sort((a, b) => compareCountryName(a.country_name, b.country_name)),
  }))

  groups.sort((a, b) => compareBrandLabel(a, b))

  return groups
}

function compareBrandLabel(a: BrandGroup, b: BrandGroup): number {
  const aIsUnbranded = a.brandKey === NO_BRAND_KEY
  const bIsUnbranded = b.brandKey === NO_BRAND_KEY
  if (aIsUnbranded && !bIsUnbranded) return 1
  if (!aIsUnbranded && bIsUnbranded) return -1
  return a.brandLabel.toLowerCase().localeCompare(b.brandLabel.toLowerCase())
}

function compareCountryName(a: string | null, b: string | null): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  return a.toLowerCase().localeCompare(b.toLowerCase())
}
