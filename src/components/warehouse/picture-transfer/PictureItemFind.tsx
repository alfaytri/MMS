'use client'

import { useMemo, useState } from 'react'
import { Search, ChevronLeft, Camera } from 'lucide-react'
import { useWarehouseStock, type WarehouseStockItem } from '@/hooks/useWarehouseOperations'
import { useOftenMovedVariants } from '@/hooks/useOftenMovedVariants'
import { PicturePhoto } from './PicturePhoto'
import { QtyStepper } from './QtyStepper'
import { cn } from '@/lib/utils'
import { STAGGER_IN, REVEAL_IN, staggerDelay } from '@/lib/motion'

export type CartLine = { qty: number; item: WarehouseStockItem }
export type Cart = Map<string, CartLine>

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/**
 * "Find" step of Picture Send. Hundreds of items stay usable via:
 *   ⭐ Often moved (top transferred variants) + 🗂️ picture groups (by category)
 *   + a text search (📷 scan is P3 — button rendered but disabled).
 * Only items with stock where the worker stands are shown.
 */
export function PictureItemFind({
  source,
  cart,
  onCartChange,
}: {
  source: { warehouseId: string; subContainerId: string | null }
  cart: Cart
  onCartChange: (next: Cart) => void
}) {
  const { data: stock = [], isLoading } = useWarehouseStock(source.warehouseId, source.subContainerId)
  const { data: often = [] } = useOftenMovedVariants(source.warehouseId)
  const [q, setQ] = useState('')
  const [group, setGroup] = useState<string | null>(null)

  const inStock = useMemo(() => stock.filter((s) => (s.available_qty ?? 0) > 0), [stock])

  const groups = useMemo(() => {
    const m = new Map<string, WarehouseStockItem[]>()
    for (const s of inStock) {
      const key = s.category_name ?? 'Other'
      const arr = m.get(key)
      if (arr) arr.push(s)
      else m.set(key, [s])
    }
    return Array.from(m, ([name, items]) => ({
      name,
      items: [...items].sort((a, b) => collator.compare(a.item_name, b.item_name)),
    })).sort((a, b) => collator.compare(a.name, b.name))
  }, [inStock])

  const oftenItems = useMemo(() => {
    const byId = new Map(inStock.map((s) => [s.brand_variant_id, s]))
    return often
      .map((o) => byId.get(o.brand_variant_id))
      .filter((x): x is WarehouseStockItem => !!x)
      .slice(0, 8)
  }, [often, inStock])

  const qLower = q.trim().toLowerCase()
  const searchResults = useMemo(() => {
    if (!qLower) return []
    return inStock
      .filter(
        (s) => (s.item_name ?? '').toLowerCase().includes(qLower) || (s.sku ?? '').toLowerCase().includes(qLower),
      )
      .sort((a, b) => collator.compare(a.item_name, b.item_name))
  }, [inStock, qLower])

  function toggle(item: WarehouseStockItem) {
    const next = new Map(cart)
    if (next.has(item.brand_variant_id)) next.delete(item.brand_variant_id)
    else next.set(item.brand_variant_id, { qty: 1, item })
    onCartChange(next)
  }
  function setQty(item: WarehouseStockItem, qty: number) {
    const next = new Map(cart)
    if (qty <= 0) next.delete(item.brand_variant_id)
    else next.set(item.brand_variant_id, { qty, item })
    onCartChange(next)
  }

  const gridItems: WarehouseStockItem[] | null = qLower
    ? searchResults
    : group
      ? groups.find((g) => g.name === group)?.items ?? []
      : null

  return (
    <div className={cn('flex flex-col gap-4 p-4', REVEAL_IN)}>
      {/* Search bar */}
      <div className="flex items-center gap-2 rounded-2xl border bg-card px-3 py-2.5">
        <Search className="h-5 w-5 shrink-0 opacity-50" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setGroup(null)
          }}
          placeholder="Type name or SKU…"
          className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
        />
        <button
          type="button"
          disabled
          title="Scan barcode / QR — coming soon"
          aria-label="Scan barcode (coming soon)"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary opacity-50"
        >
          <Camera className="h-5 w-5" />
        </button>
      </div>

      {isLoading ? (
        <div className="grid place-items-center py-16 text-sm text-muted-foreground">Loading…</div>
      ) : gridItems ? (
        <>
          <button
            type="button"
            onClick={() => {
              setGroup(null)
              setQ('')
            }}
            className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary/10 px-3 py-2 text-sm font-bold text-primary"
          >
            <ChevronLeft className="h-4 w-4" /> All groups
          </button>
          {gridItems.length === 0 ? (
            <div className="grid place-items-center py-16 text-sm text-muted-foreground">Nothing here.</div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {gridItems.map((s, i) => (
                <div key={s.brand_variant_id} className={STAGGER_IN} style={staggerDelay(i)}>
                  <ItemCard s={s} line={cart.get(s.brand_variant_id)} onToggle={toggle} onQty={setQty} />
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {oftenItems.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">⭐ Often moved</h2>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {oftenItems.map((s, i) => {
                  const selected = cart.has(s.brand_variant_id)
                  return (
                    <button
                      key={s.brand_variant_id}
                      type="button"
                      onClick={() => toggle(s)}
                      className={`${STAGGER_IN} flex w-24 shrink-0 flex-col items-center gap-1.5 rounded-2xl border p-2 text-center ${selected ? 'border-primary ring-2 ring-primary/20' : 'border-transparent'}`}
                      style={staggerDelay(i)}
                    >
                      <PicturePhoto url={s.image_url} name={s.item_name} size={64} />
                      <span className="w-full min-h-[2.5em] break-words text-xs font-semibold leading-tight">{s.item_name}</span>
                      <span className="mt-auto text-[11px] font-bold text-muted-foreground">{Math.floor(s.available_qty ?? 0)} left</span>
                    </button>
                  )
                })}
              </div>
            </section>
          )}
          <section className="flex flex-col gap-2">
            <h2 className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">🗂️ Or pick a group</h2>
            {groups.length === 0 ? (
              <div className="grid place-items-center py-16 text-sm text-muted-foreground">No stock in your warehouse.</div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {groups.map((g, i) => (
                  <button
                    key={g.name}
                    type="button"
                    onClick={() => setGroup(g.name)}
                    className={cn('flex items-center gap-3 rounded-2xl border bg-card p-3 text-left', STAGGER_IN)}
                    style={staggerDelay(i)}
                  >
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-2xl">📦</span>
                    <span className="min-w-0">
                      <span className="break-words font-bold leading-tight">{g.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {g.items.length} item{g.items.length === 1 ? '' : 's'}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function ItemCard({
  s,
  line,
  onToggle,
  onQty,
}: {
  s: WarehouseStockItem
  line: CartLine | undefined
  onToggle: (i: WarehouseStockItem) => void
  onQty: (i: WarehouseStockItem, n: number) => void
}) {
  const selected = !!line
  const max = Math.max(1, Math.floor(s.available_qty ?? 0))
  return (
    <div className={`relative flex flex-col gap-2 rounded-2xl border bg-card p-3 ${selected ? 'border-primary ring-4 ring-primary/15' : ''}`}>
      {selected && (
        <span className="absolute right-2 top-2 z-10 grid h-6 w-6 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
          ✓
        </span>
      )}
      <button type="button" onClick={() => onToggle(s)} className="flex flex-col gap-1.5 text-left">
        <PicturePhoto url={s.image_url} name={s.item_name} />
        <span className="min-h-[2.5em] break-words text-sm font-bold leading-tight">{s.item_name}</span>
      </button>
      {/* Available qty is ALWAYS visible — even once selected, so the worker sees his ceiling while stepping. */}
      <span className="w-fit rounded-full bg-muted px-2 py-0.5 text-xs font-bold">{Math.floor(s.available_qty ?? 0)} left</span>
      {selected && <QtyStepper value={line!.qty} min={1} max={max} onChange={(n) => onQty(s, n)} />}
    </div>
  )
}
