'use client'

import { useMemo } from 'react'
import {
  useEffectiveAttributes,
  useItemAttributes,
  type EffectiveAttribute,
  type ItemAttributeRow,
} from '@/hooks/useAttributes'
import { createClient } from '@/lib/supabase/client'
import { useQuery } from '@tanstack/react-query'
import type { DBTable } from '@/types/database.types'

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
  const { data: optionsByDefinition = new Map() } = useOptionsForDefinitionsBatch(
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

type OptionRow = DBTable<'inventory_attribute_options'>

/**
 * One TanStack query that fetches every option row for the given definition
 * ids in a single request, then buckets them by definition_id. Prevents the
 * N-query fan-out that a per-row `useAttributeOptionsForDefinition` would
 * cause across a list view.
 */
function useOptionsForDefinitionsBatch(definitionIds: string[]) {
  const sortedKey = useMemo(() => [...definitionIds].sort().join(','), [definitionIds])
  return useQuery({
    queryKey: ['inventory-attributes', 'options-batch', sortedKey],
    enabled: definitionIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_attribute_options')
        .select('*')
        .in('definition_id', definitionIds)
        .limit(2000)
      if (error) throw error
      const map = new Map<string, OptionRow[]>()
      for (const row of (data ?? []) as OptionRow[]) {
        const list = map.get(row.definition_id) ?? []
        list.push(row)
        map.set(row.definition_id, list)
      }
      return map
    },
  })
}

function buildChips(
  effective: EffectiveAttribute[],
  picks: ItemAttributeRow[],
  optionsByDef: Map<string, OptionRow[]>,
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

