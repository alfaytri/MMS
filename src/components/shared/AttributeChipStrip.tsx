'use client'

import { useMemo } from 'react'
import {
  useEffectiveAttributes,
  useItemAttributes,
  useAttributeOptionsBatch,
  type EffectiveAttribute,
  type ItemAttributeRow,
  type AttributeOption,
} from '@/hooks/useAttributes'

type Props = {
  itemId: string
  categoryId: string
  /** Show at most this many chips before summarising the rest as "+N more". */
  maxChips?: number
}

/**
 * Compact per-item read-only strip: renders `label: value` chips for every
 * attribute the item has picked. Silent (renders nothing) when the item has
 * no picks or the schema/options aren't loaded yet.
 */
export function AttributeChipStrip({ itemId, categoryId, maxChips = 4 }: Props) {
  const { data: effective = [] } = useEffectiveAttributes(categoryId)
  const { data: picks = [] } = useItemAttributes(itemId)
  const { data: optionsByDefinition = new Map() } = useAttributeOptionsBatch(
    effective.map((e) => e.definition_id),
  )

  const chips = useMemo(() => buildChips(effective, picks, optionsByDefinition), [effective, picks, optionsByDefinition])
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
  picks: ItemAttributeRow[],
  optionsByDef: Map<string, AttributeOption[]>,
): Array<{ definition_id: string; label: string; value: string }> {
  const pickMap = new Map<string, string>()
  for (const p of picks) pickMap.set(p.definition_id, p.option_id)

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

