'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import {
  useEffectiveAttributes,
  useAttributeOptionsForDefinition,
  useItemAttributes,
} from '@/hooks/useAttributes'

type Value = { definition_id: string; option_id: string | null }

type Props = {
  /** null = new-item flow (no existing rows to hydrate from). */
  itemId: string | null
  /** null before a category is selected — section renders nothing. */
  categoryId: string | null
  /** Called whenever the operator changes any pick. Payload is the FULL
   *  desired state (one row per effective attribute). */
  onChange: (values: Value[]) => void
}

export function ItemAttributesSection({ itemId, categoryId, onChange }: Props) {
  const { data: effective = [] } = useEffectiveAttributes(categoryId)
  const existingQuery = useItemAttributes(itemId)
  const existing = useMemo(() => existingQuery.data ?? [], [existingQuery.data])

  // For a new item there's nothing to hydrate; for an edit we wait for the
  // fetch to succeed before propagating anything upward. Without this guard
  // the parent could receive an all-null payload during load and, if the
  // operator hit Save before hydration finished, silently wipe every
  // existing attribute row.
  const isReady = itemId === null ? true : existingQuery.isSuccess

  // Local UI state: definition_id → option_id (null = cleared / not picked)
  const [values, setValues] = useState<Record<string, string | null>>({})

  // Hydrate once per (itemId, existing-content) load — signature avoids
  // resetting on every referentially-new but content-equal `existing`.
  const existingSignature = useMemo(
    () =>
      [...existing]
        .map((r) => `${r.definition_id}:${r.option_id}`)
        .sort()
        .join('|'),
    [existing],
  )
  const lastHydratedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!isReady) return
    const key = `${itemId ?? '__new__'}::${existingSignature}`
    if (lastHydratedRef.current === key) return
    lastHydratedRef.current = key
    const initial: Record<string, string | null> = {}
    for (const row of existing) initial[row.definition_id] = row.option_id
    setValues(initial)
  }, [itemId, existingSignature, existing, isReady])

  // Propagate the FULL desired state to parent on every change — but only
  // once the existing-values fetch has resolved, so an in-flight edit-load
  // can't overwrite live data with an empty payload.
  const effectiveSignature = useMemo(
    () => effective.map((e) => e.definition_id).sort().join('|'),
    [effective],
  )
  useEffect(() => {
    if (!isReady) return
    const payload: Value[] = effective.map((e) => ({
      definition_id: e.definition_id,
      option_id: values[e.definition_id] ?? null,
    }))
    onChange(payload)
    // effective identity changes when defs load; values is the picker state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveSignature, values, isReady])

  if (!categoryId || effective.length === 0) return null

  return (
    <div className="space-y-2">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">Attributes</Label>
      <div className="space-y-2 rounded border p-3 bg-muted/20">
        {effective.map((a) => (
          <AttributeRow
            key={a.definition_id}
            definitionId={a.definition_id}
            label={a.label_en}
            inherited={a.is_inherited}
            inheritedFrom={a.category_name}
            value={values[a.definition_id] ?? null}
            onValue={(v) =>
              setValues((prev) => ({ ...prev, [a.definition_id]: v }))
            }
          />
        ))}
      </div>
    </div>
  )
}

function AttributeRow({
  definitionId,
  label,
  inherited,
  inheritedFrom,
  value,
  onValue,
}: {
  definitionId: string
  label: string
  inherited: boolean
  inheritedFrom: string
  value: string | null
  onValue: (v: string | null) => void
}) {
  const { data: options = [] } = useAttributeOptionsForDefinition(definitionId)
  // Always keep the currently-picked value visible even if it was archived
  // after being picked — operators shouldn't lose sight of their own data.
  const visible = options.filter((o) => !o.is_archived || o.id === value)

  return (
    <div className="flex items-center gap-2">
      <div className="w-32 shrink-0 min-w-0">
        <div className="text-xs font-medium truncate">{label}</div>
        {inherited && (
          <div className="text-[10px] text-muted-foreground truncate">
            from {inheritedFrom}
          </div>
        )}
      </div>
      <Select value={value ?? ''} onValueChange={(v) => onValue(v || null)}>
        <SelectTrigger className="h-8 text-xs flex-1 min-w-0">
          <SelectValue placeholder={visible.length === 0 ? 'No options defined' : '—'} />
        </SelectTrigger>
        <SelectContent>
          {visible.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              This attribute has no options yet
            </div>
          ) : (
            visible.map((o) => (
              <SelectItem key={o.id} value={o.id} className="text-xs">
                {o.value_en}
                {o.is_archived ? ' (archived)' : ''}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
      {value && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => onValue(null)}
          title="Clear"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )
}
