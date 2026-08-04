'use client'

import { useMemo, useState } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  useEffectiveAttributes,
  useAttributeOptionsBatch,
  type AttributeOption,
} from '@/hooks/useAttributes'

const EMPTY_OPTIONS_MAP = new Map<string, AttributeOption[]>()

/**
 * Multi-select filter state. Each entry is a list of option ids picked for
 * that attribute definition. Missing key or empty list = no filter for that
 * attribute.
 *
 * Match semantics (STRICT + OR-within / AND-across):
 *   - Within one attribute: item passes if its picked option is IN the list (OR)
 *   - Across attributes:    item must pass every active attribute (AND)
 *   - Untagged items:       excluded when any filter is active
 */
export type AttributeFilterState = Record<string, string[]>

type Props = {
  categoryId: string | null
  value: AttributeFilterState
  onChange: (next: AttributeFilterState) => void
  /**
   * Definition ids to hide from the UI — used by descendant categories so
   * attributes already picked by an ancestor don't re-render further down
   * the tree (the ancestor pick already applies to everything below).
   */
  hideDefinitionIds?: Set<string>
  size?: 'sm' | 'md'
}

/**
 * Compact filter row — one dropdown per effective attribute of `categoryId`,
 * each opening a checkbox popover of that attribute's options. Bar hides
 * itself when there's nothing to show (no effective attributes, or every
 * attribute is in `hideDefinitionIds`).
 */
export function AttributeFilterBar({ categoryId, value, onChange, hideDefinitionIds, size = 'sm' }: Props) {
  const { data: effective = [] } = useEffectiveAttributes(categoryId)
  const definitionIds = useMemo(() => effective.map((e) => e.definition_id), [effective])
  const { data: optionsByDefinition = EMPTY_OPTIONS_MAP } = useAttributeOptionsBatch(definitionIds)

  const visible = useMemo(
    () => effective.filter((e) => !hideDefinitionIds?.has(e.definition_id)),
    [effective, hideDefinitionIds],
  )

  if (!categoryId || visible.length === 0) return null

  const triggerHeight = size === 'sm' ? 'h-6 text-[10px] px-2' : 'h-7 text-xs px-2.5'
  const activeCount = Object.values(value).reduce((n, ids) => n + (ids?.length ?? 0), 0)

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visible.map((attr) => {
        const opts = (optionsByDefinition.get(attr.definition_id) ?? []).filter((o) => !o.is_archived)
        if (opts.length === 0) return null
        return (
          <AttributeDropdown
            key={attr.definition_id}
            label={attr.label_en}
            options={opts}
            picked={value[attr.definition_id] ?? []}
            triggerHeight={triggerHeight}
            onChange={(next) => {
              const merged = { ...value, [attr.definition_id]: next }
              if (next.length === 0) delete merged[attr.definition_id]
              onChange(merged)
            }}
          />
        )
      })}
      {activeCount > 0 && (
        <button
          type="button"
          onClick={() => onChange({})}
          className={`${triggerHeight} inline-flex items-center justify-center rounded-full border border-dashed text-muted-foreground hover:text-destructive hover:border-destructive/50 transition`}
          title={`Clear ${activeCount} filter${activeCount > 1 ? 's' : ''}`}
          aria-label="Clear all filters"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}

function AttributeDropdown({
  label,
  options,
  picked,
  onChange,
  triggerHeight,
}: {
  label: string
  options: AttributeOption[]
  picked: string[]
  onChange: (next: string[]) => void
  triggerHeight: string
}) {
  const [open, setOpen] = useState(false)
  const pickedSet = useMemo(() => new Set(picked), [picked])
  const pickedLabels = options
    .filter((o) => pickedSet.has(o.id))
    .map((o) => o.value_en)
    .join(', ')

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={`${triggerHeight} inline-flex items-center gap-1.5 rounded-md border shrink-0 max-w-[220px] ${
          picked.length > 0
            ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-200 border-blue-300 dark:border-blue-800'
            : 'bg-white dark:bg-slate-900 text-foreground border-border hover:bg-muted'
        }`}
      >
        <span className="text-muted-foreground shrink-0">{label}:</span>
        <span className="truncate">
          {picked.length === 0 ? 'Any' : picked.length === 1 ? pickedLabels : `${picked.length} picked`}
        </span>
        <ChevronDown className="h-3 w-3 opacity-60 shrink-0" />
      </PopoverTrigger>
      <PopoverContent className="w-52 p-1" align="start">
        <div className="max-h-64 overflow-y-auto py-1">
          {options.map((o) => {
            const isPicked = pickedSet.has(o.id)
            return (
              <button
                key={o.id}
                type="button"
                onClick={() =>
                  onChange(
                    isPicked ? picked.filter((id) => id !== o.id) : [...picked, o.id],
                  )
                }
                className="w-full flex items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent text-left"
              >
                <span
                  className={`h-3.5 w-3.5 shrink-0 rounded border flex items-center justify-center ${
                    isPicked
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-background border-input'
                  }`}
                >
                  {isPicked && <Check className="h-2.5 w-2.5" />}
                </span>
                <span className="truncate">{o.value_en}</span>
              </button>
            )
          })}
        </div>
        {picked.length > 0 && (
          <div className="border-t pt-1 mt-1">
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full text-[10px] text-muted-foreground hover:text-foreground py-1 rounded-sm hover:bg-accent"
            >
              Clear {label}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

/**
 * STRICT match. An item passes if for every attribute with a non-empty
 * picked list, the item has a value for that attribute AND the value is in
 * the picked list. Untagged items get excluded — matches operator
 * expectation of a filter (unlike the picker, which was permissive so it
 * wouldn't prematurely narrow candidates).
 */
export function itemPassesAttributeFilter(
  itemAttrs: Map<string, string> | undefined,
  filter: AttributeFilterState,
): boolean {
  for (const [definitionId, optionIds] of Object.entries(filter)) {
    if (!optionIds || optionIds.length === 0) continue
    const picked = itemAttrs?.get(definitionId)
    if (!picked || !optionIds.includes(picked)) return false
  }
  return true
}

export function hasAnyAttributeFilter(filter: AttributeFilterState): boolean {
  for (const ids of Object.values(filter)) if (ids && ids.length > 0) return true
  return false
}
