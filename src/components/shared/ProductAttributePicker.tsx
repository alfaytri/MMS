'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { X, ChevronRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ItemPhoto } from '@/components/shared/ItemPhoto'
import { useInventoryCategories } from '@/hooks/useInventory'
import { useAttributePickerStep, type PickerStepResult } from '@/hooks/useAttributes'

type Props = {
  /** Fires when the operator lands on a specific item + brand-variant. */
  onPick: (itemId: string, brandVariantId: string) => void
  /** When provided, the operator can't change categories — they're locked in. */
  categoryFilter?: string
  /** Reserved for consumption. When set, the candidate list is filtered
   *  client-side to items with at least one active brand-variant with
   *  positive stock at the warehouse's variants. Placeholder — the picker
   *  doesn't currently do WH-level stock joins. Left in the signature so
   *  Task 5.4 can wire it without another prop churn. */
  warehouseScope?: string
  /** Optional heading — defaults to nothing. */
  title?: string
}

/**
 * Guided item picker: walks the operator through the effective attribute
 * schema for a category, narrowing candidates step by step. On the last
 * step (or when only one candidate remains) the operator clicks a
 * brand-variant to complete the pick.
 */
export function ProductAttributePicker({ onPick, categoryFilter, title }: Props) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(categoryFilter ?? null)
  // attribute_key → option_id — the current pick set.
  const [picks, setPicks] = useState<Record<string, string>>({})
  // Ordered history of picks (attribute_key entries in the order they were
  // picked). Lets us clear "everything picked after key X" without knowing
  // sort_order client-side.
  const [pickHistory, setPickHistory] = useState<string[]>([])

  // If categoryFilter changes, reset everything.
  useEffect(() => {
    if (categoryFilter !== undefined) {
      setSelectedCategoryId(categoryFilter)
      setPicks({})
      setPickHistory([])
    }
  }, [categoryFilter])

  const step = useAttributePickerStep(selectedCategoryId, picks)

  const handlePickOption = useCallback((attributeKey: string, optionId: string) => {
    setPicks((prev) => ({ ...prev, [attributeKey]: optionId }))
    setPickHistory((prev) => (prev.includes(attributeKey) ? prev : [...prev, attributeKey]))
  }, [])

  const handleClearFrom = useCallback((attributeKey: string) => {
    // Drop the pick AND every subsequent pick in history.
    setPickHistory((prev) => {
      const idx = prev.indexOf(attributeKey)
      if (idx === -1) return prev
      const kept = prev.slice(0, idx)
      const dropped = new Set(prev.slice(idx))
      setPicks((cur) => {
        const next: Record<string, string> = {}
        for (const [k, v] of Object.entries(cur)) if (!dropped.has(k)) next[k] = v
        return next
      })
      return kept
    })
  }, [])

  return (
    <div className="space-y-3">
      {title && <h3 className="text-sm font-semibold">{title}</h3>}

      {categoryFilter === undefined && (
        <CategoryPickerRow
          value={selectedCategoryId}
          onChange={(v) => {
            setSelectedCategoryId(v)
            setPicks({})
            setPickHistory([])
          }}
        />
      )}

      {selectedCategoryId && (
        <>
          <PickChipsRow picks={picks} history={pickHistory} step={step.data} onClear={handleClearFrom} />

          {step.isLoading ? (
            <div className="rounded border border-dashed p-4 text-xs text-muted-foreground text-center">
              <Loader2 className="h-3.5 w-3.5 inline animate-spin mr-1.5" />
              Loading…
            </div>
          ) : step.isError ? (
            <div className="rounded border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              {step.error instanceof Error ? step.error.message : 'Failed to load picker step'}
            </div>
          ) : step.data ? (
            <PickerBody data={step.data} onPickOption={handlePickOption} onPick={onPick} />
          ) : null}
        </>
      )}
    </div>
  )
}

function CategoryPickerRow({
  value,
  onChange,
}: {
  value: string | null
  onChange: (v: string | null) => void
}) {
  const { data: categories = [] } = useInventoryCategories()
  const active = useMemo(
    () => categories.filter((c) => c.status === 'active').sort((a, b) => a.name_en.localeCompare(b.name_en)),
    [categories],
  )
  return (
    <div className="space-y-1">
      <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Category</label>
      <Select value={value ?? ''} onValueChange={(v) => onChange(v || null)}>
        <SelectTrigger className="h-9 text-sm">
          <SelectValue placeholder="Pick a category…" />
        </SelectTrigger>
        <SelectContent className="max-h-60 overflow-y-auto">
          {active.map((c) => (
            <SelectItem key={c.id} value={c.id} className="text-sm">
              {c.name_en}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function PickChipsRow({
  picks,
  history,
  step,
  onClear,
}: {
  picks: Record<string, string>
  history: string[]
  step: PickerStepResult | undefined
  onClear: (attributeKey: string) => void
}) {
  if (Object.keys(picks).length === 0) return null
  // We only have the option/attribute labels from the CURRENT step call
  // (which reflects the current picks). To label past chips, we'd need a
  // separate cache — for now, show the key + option_id short prefix.
  // Callers can extend this later once we cache label lookups.
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {history.map((k) => {
        const optionId = picks[k]
        if (!optionId) return null
        return (
          <span
            key={k}
            className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20"
          >
            <span className="font-mono">{k}</span>
            <ChevronRight className="h-2.5 w-2.5" />
            <span className="font-medium">{shortId(optionId)}</span>
            <button
              type="button"
              onClick={() => onClear(k)}
              className="ml-0.5 hover:text-destructive"
              title="Clear this pick and everything after"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        )
      })}
      {step && step.next_attribute === null && (
        <span className="text-[11px] text-muted-foreground">— done, choose an item below</span>
      )}
    </div>
  )
}

function shortId(id: string): string {
  // First 6 hex chars — enough to distinguish picks visually. Real labels
  // come from a follow-up (cache attribute + option labels via effective
  // schema hook).
  return id.slice(0, 6)
}

function PickerBody({
  data,
  onPickOption,
  onPick,
}: {
  data: PickerStepResult
  onPickOption: (attributeKey: string, optionId: string) => void
  onPick: (itemId: string, brandVariantId: string) => void
}) {
  const { items, next_attribute, next_options } = data

  return (
    <div className="space-y-4">
      {next_attribute && next_options.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {next_attribute.label_en}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {next_options.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => onPickOption(next_attribute.key, o.id)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs bg-card hover:bg-primary/5 hover:border-primary/40 transition"
              >
                <span className="font-medium">{o.value_en}</span>
                <span className="text-[10px] text-muted-foreground">{o.item_count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 text-xs text-amber-800 dark:text-amber-200">
          No items match — clear a pick above to widen the search.
        </div>
      ) : (
        <div className="space-y-1">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {items.length} item{items.length === 1 ? '' : 's'}
            {next_attribute ? ' matching so far' : ''}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {items.map((it) => (
              <ItemCard key={it.id} item={it} onPick={onPick} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ItemCard({
  item,
  onPick,
}: {
  item: PickerStepResult['items'][number]
  onPick: (itemId: string, brandVariantId: string) => void
}) {
  const variants = item.brand_variants ?? []
  return (
    <div className="rounded border bg-card p-2 flex gap-2">
      <ItemPhoto url={item.image_url} name={item.name_en} size={48} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="text-xs font-medium truncate">{item.name_en}</div>
        {item.sku && <div className="text-[10px] font-mono text-muted-foreground truncate">{item.sku}</div>}
        {variants.length === 0 ? (
          <div className="text-[10px] text-muted-foreground italic">No brand variants</div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {variants.map((v) => {
              const stock = v.stock_level ?? 0
              const hasStock = stock > 0
              return (
                <Button
                  key={v.id}
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-6 text-[10px] gap-1 px-1.5"
                  onClick={() => onPick(item.id, v.id)}
                  title={`${v.brand}${v.code ? ` — ${v.code}` : ''} · ${stock} in stock`}
                >
                  <span className="font-medium">{v.brand}</span>
                  <span className={hasStock ? 'text-emerald-600' : 'text-muted-foreground'}>
                    {stock}
                  </span>
                </Button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
