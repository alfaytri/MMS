'use client'

import { useEffect, useMemo, useState } from 'react'
import { useCustodyLocations } from '@/hooks/useCustodyLocations'
import { cn } from '@/lib/utils'
import { STAGGER_IN, REVEAL_IN, staggerDelay } from '@/lib/motion'

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
const NODIV = '__nodiv__'

export type Destination = { toWarehouseId: string; toSubContainerId: string; label: string }

function typeIcon(name: string): string {
  const n = (name || '').toLowerCase()
  if (n.includes('team')) return '👷'
  if (n.includes('van') || n.includes('vehicle')) return '🚐'
  if (n.includes('project')) return '🏗️'
  return '📍'
}

/**
 * "Where" step of Picture Send — the custody Type → Division → pick cascade
 * (same logic as the consumption dialog) rendered as big tap-tiles. Emits a
 * Destination = { custody warehouse id, custody sub-container id, label }.
 */
export function PictureWhere({
  value,
  onChange,
}: {
  value: Destination | null
  onChange: (d: Destination | null) => void
}) {
  const { data: locations = [], isLoading } = useCustodyLocations()
  const active = useMemo(() => locations.filter((l) => l.is_active), [locations])
  const [whId, setWhId] = useState('')
  const [divId, setDivId] = useState('')

  const types = useMemo(() => {
    const m = new Map<string, string>()
    for (const l of active) if (!m.has(l.warehouse_id)) m.set(l.warehouse_id, l.warehouse_name)
    return Array.from(m, ([id, name]) => ({ id, name })).sort((a, b) => collator.compare(a.name, b.name))
  }, [active])

  const divisions = useMemo(() => {
    const m = new Map<string, string>()
    for (const l of active) if (l.warehouse_id === whId) m.set(l.division_id ?? NODIV, l.division_name ?? 'No division')
    return Array.from(m, ([id, name]) => ({ id, name })).sort((a, b) => collator.compare(a.name, b.name))
  }, [active, whId])

  const needsDivision = divisions.length > 1

  const locs = useMemo(
    () =>
      active
        .filter((l) => l.warehouse_id === whId && (!needsDivision || (l.division_id ?? NODIV) === divId))
        .sort((a, b) => collator.compare(a.name, b.name)),
    [active, whId, divId, needsDivision],
  )

  // Auto-select the only type / division so the worker sees fewer choices.
  useEffect(() => {
    if (types.length === 1 && whId !== types[0].id) setWhId(types[0].id)
  }, [types, whId])
  useEffect(() => {
    if (!whId) {
      if (divId) setDivId('')
      return
    }
    if (divisions.length === 1 && divId !== divisions[0].id) setDivId(divisions[0].id)
    else if (divId && !divisions.some((d) => d.id === divId)) setDivId('')
  }, [whId, divisions, divId])

  if (isLoading) return <div className="grid place-items-center py-16 text-sm text-muted-foreground">Loading…</div>
  if (types.length === 0)
    return <div className="grid place-items-center py-16 text-center text-sm text-muted-foreground">No teams, vans or projects set up yet.</div>

  const whName = types.find((t) => t.id === whId)?.name ?? ''

  return (
    <div className={cn('flex flex-col gap-5 p-4', REVEAL_IN)}>
      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">1 · Choose a place</h2>
        <div className="flex flex-wrap gap-3">
          {types.map((t, i) => {
            const on = t.id === whId
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setWhId(t.id)
                  setDivId('')
                  onChange(null)
                }}
                className={`${STAGGER_IN} flex min-w-24 flex-1 flex-col items-center gap-2 rounded-2xl border-2 p-4 ${on ? 'border-primary ring-4 ring-primary/15' : 'border-border'}`}
                style={staggerDelay(i)}
              >
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-3xl">{typeIcon(t.name)}</span>
                <span className="text-sm font-bold">{t.name}</span>
              </button>
            )
          })}
        </div>
      </section>

      {whId && needsDivision && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">2 · Which division</h2>
          <div className="flex flex-wrap gap-3">
            {divisions.map((d, i) => {
              const on = d.id === divId
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => {
                    setDivId(d.id)
                    onChange(null)
                  }}
                  className={`${STAGGER_IN} rounded-2xl border-2 px-5 py-3 text-sm font-bold ${on ? 'border-primary ring-4 ring-primary/15' : 'border-border'}`}
                  style={staggerDelay(i)}
                >
                  {d.name}
                </button>
              )
            })}
          </div>
        </section>
      )}

      {whId && (!needsDivision || divId) && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">{needsDivision ? '3' : '2'} · Pick the place</h2>
          {locs.length === 0 ? (
            <div className="grid place-items-center py-10 text-sm text-muted-foreground">Nothing here.</div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {locs.map((l, i) => {
                const on = value?.toSubContainerId === l.id
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => onChange({ toWarehouseId: l.warehouse_id, toSubContainerId: l.id, label: l.name })}
                    className={`${STAGGER_IN} flex items-center gap-3 rounded-2xl border-2 p-3 text-left ${on ? 'border-primary ring-4 ring-primary/15' : 'border-border'}`}
                    style={staggerDelay(i)}
                  >
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-xl">{typeIcon(whName)}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-bold">{l.name}</span>
                      {l.division_name && <span className="block truncate text-xs text-muted-foreground">{l.division_name}</span>}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
