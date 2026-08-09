// Pure display-label logic for the PO/SO inventory pickers. Given a brand
// variant's brand + origin fields, produce the parts a picker row shows: a
// bold PRIMARY label and an optional ORIGIN segment. Kept pure + framework-free
// so it can be unit-tested and reused across the cascade popover, the search
// rows, and (Phase 2) the SO picker. Mirrors OriginVariantRow's catalog rules:
// brand wins as the primary label; an origin-only leaf shows its country as the
// primary; a leaf with neither shows "Generic".

export type VariantLabelInput = {
  /** Joined brands.name — the authoritative brand label. */
  brand_name?: string | null
  /** Denormalized brand text column — fallback when the join is absent. */
  brand?: string | null
  /** Joined country_codes.name — the origin. */
  country_name?: string | null
}

export type VariantPickerLabel = {
  /** Bold primary label: brand, else origin, else "Generic". */
  primary: string
  /**
   * Origin segment for the muted secondary line. Non-null ONLY when a brand is
   * the primary label — so origin isn't repeated when it's already the primary.
   */
  origin: string | null
}

export const GENERIC_VARIANT_LABEL = 'Generic'

/** Resolve the human brand label, or null for origin-only / generic leaves. */
function resolveBrandLabel(v: VariantLabelInput): string | null {
  const joined = v.brand_name?.trim()
  if (joined) return joined
  const text = v.brand?.trim()
  if (!text || text.toLowerCase() === 'generic') return null
  return text
}

export function variantPickerLabel(v: VariantLabelInput): VariantPickerLabel {
  const brand = resolveBrandLabel(v)
  const origin = v.country_name?.trim() || null
  if (brand) return { primary: brand, origin }
  if (origin) return { primary: origin, origin: null }
  return { primary: GENERIC_VARIANT_LABEL, origin: null }
}
