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

/**
 * Flatten variantPickerLabel to a single compact "Brand · Origin" (or just
 * "Brand" / "Origin") string for one-line displays — the warehouse stock tree,
 * overview, and value tables. Returns null when the variant has neither a real
 * brand nor an origin, so callers keep their own em-dash fallback.
 */
export function brandOriginText(
  brand: string | null | undefined,
  origin: string | null | undefined,
): string | null {
  const label = variantPickerLabel({ brand, country_name: origin })
  if (label.primary === GENERIC_VARIANT_LABEL && !label.origin) return null
  return label.origin ? `${label.primary} · ${label.origin}` : label.primary
}
