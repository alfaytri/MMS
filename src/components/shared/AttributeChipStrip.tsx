'use client'

import { useMemo } from 'react'
import {
  useEffectiveAttributes,
  useItemAttributes,
  useAttributeOptionsBatch,
  type EffectiveAttribute,
  type AttributeOption,
} from '@/hooks/useAttributes'
import { useItemAttributesContext } from './ItemAttributesContext'

type Props = {
  itemId: string
  categoryId: string
  /** Show at most this many chips before summarising the rest as "+N more". */
  maxChips?: number
}

// Stable empty reference so a provider-supplied item with no picks doesn't
// churn the memo below.
const EMPTY_PICKS: Map<string, string> = new Map()

/**
 * Compact per-item read-only strip: renders `label: value` chips for every
 * attribute the item has picked. Silent (renders nothing) when the item has
 * no picks or the schema/options aren't loaded yet.
 *
 * Picks come from a batched `ItemAttributesContext` when a list container
 * provides one (one query per expanded category — see CategoryRow); otherwise
 * the strip fetches its own per-item picks. When a provider is present we do
 * NOT fire the per-item query, even mid-load — that is what kills the N+1.
 */
export function AttributeChipStrip({ itemId, categoryId, maxChips = 4 }: Props) {
  const { data: effective = [] } = useEffectiveAttributes(categoryId)

  const batch = useItemAttributesContext()
  const hasProvider = batch !== null
  const { data: fallbackPicks = [] } = useItemAttributes(itemId, { enabled: !hasProvider })

  const { data: optionsByDefinition = new Map() } = useAttributeOptionsBatch(
    effective.map((e) => e.definition_id),
  )

  // definition_id → option_id, from whichever source is active.
  const pickMap = useMemo<Map<string, string>>(() => {
    if (hasProvider) return batch!.byItem.get(itemId) ?? EMPTY_PICKS
    const m = new Map<string, string>()
    for (const p of fallbackPicks) m.set(p.definition_id, p.option_id)
    return m
  }, [hasProvider, batch, itemId, fallbackPicks])

  const chips = useMemo(
    () => buildChips(effective, pickMap, optionsByDefinition),
    [effective, pickMap, optionsByDefinition],
  )
  if (chips.length === 0) return null

  const shown = chips.slice(0, maxChips)
  const overflow = chips.length - shown.length

  return (
    <div className="flex flex-wrap items-center gap-1 mt-0.5">
      {shown.map((c) => (
        <span
          key={c.definition_id}
          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-muted/60 border border-border/50"
          title={`${c.label}: ${c.value}`}
        >
          <span className="text-muted-foreground">{c.label}:</span>
          <span className="font-medium text-foreground/80">{c.value}</span>
        </span>
      ))}
      {overflow > 0 && (
        <span className="text-[10px] text-muted-foreground">+{overflow} more</span>
      )}
    </div>
  )
}

function buildChips(
  effective: EffectiveAttribute[],
  pickMap: Map<string, string>,
  optionsByDef: Map<string, AttributeOption[]>,
): Array<{ definition_id: string; label: string; value: string }> {
  const chips: Array<{ definition_id: string; label: string; value: string }> = []
  for (const attr of effective) {
    const optionId = pickMap.get(attr.definition_id)
    if (!optionId) continue
    const opts = optionsByDef.get(attr.definition_id) ?? []
    const opt = opts.find((o) => o.id === optionId)
    if (!opt) continue
    chips.push({
      definition_id: attr.definition_id,
      label: attr.label_en,
      value: opt.value_en,
    })
  }
  return chips
}
