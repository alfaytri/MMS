'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, CornerDownLeft, Search, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useServiceTree } from '@/hooks/useServices'
import { useServiceSearch, MIN_SEARCH_LENGTH, type ServiceSearchHit } from '@/hooks/useServiceSearch'

/**
 * The service a caller ends up with. Structurally what the old
 * `CascadePickedService` was; the panel owns it now because the cascade picker
 * it used to live in is gone.
 */
export interface PickedService {
  id: string
  name_en: string
  parent_id: string | null
  price: number | null
  emergency_price: number | null
  duration: number | null
  division: string[] | null
}

export interface BasketLine {
  service: PickedService
  qty: number
  /** Root → leaf names. Two services can share a name; this is what tells them apart. */
  pathNames: string[]
}

export interface ServicePickerPanelProps {
  /** Called once with every basket line when the user commits. */
  onCommit: (lines: BasketLine[]) => void
  treeType?: string
  divisionFilters?: string[]
  /**
   * Focus the search box on mount. True inside the picker dialog, whose whole
   * reason to exist is searching. False when embedded partway down a
   * team-leader dialog, where stealing focus scrolls the body and raises the
   * soft keyboard on a surface the operator opened for something else.
   */
  autoFocusSearch?: boolean
  /** Label for the commit button — not every caller is adding to an order. */
  commitLabel?: string
}

/** Row shape shared by search hits and browse nodes, so one renderer serves both. */
interface Row {
  id: string
  name: string
  path: string[]
  price: number | null
  thumbUrl: string | null
  isLeaf: boolean
  service: PickedService
}

const SEP = ' › '

/** Keystrokes settle before a round trip. */
const SEARCH_DEBOUNCE_MS = 250

function hitToRow(h: ServiceSearchHit): Row {
  return {
    id: h.id,
    name: h.name_en,
    path: h.path,
    price: h.price,
    thumbUrl: h.thumb_url,
    isLeaf: h.is_leaf,
    service: {
      id: h.id,
      name_en: h.name_en,
      parent_id: null,
      price: h.price,
      emergency_price: h.emergency_price,
      duration: h.duration,
      division: h.division,
    },
  }
}

export function ServicePickerPanel({
  onCommit,
  treeType = 'normal',
  divisionFilters = [],
  autoFocusSearch = true,
  commitLabel = 'Add',
}: ServicePickerPanelProps) {
  const [query, setQuery] = useState('')
  /**
   * What actually reaches the server. Without this, every keystroke is its own
   * query key and its own RPC — typing "cleaning" fired seven full-tree walks,
   * on a Free plan this project has twice exhausted.
   */
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  /** Node being browsed, with the breadcrumb that led here. null = search mode. */
  const [browse, setBrowse] = useState<{ id: string | null; path: string[] } | null>(null)
  const [basket, setBasket] = useState<BasketLine[]>([])
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (autoFocusSearch) searchRef.current?.focus() }, [autoFocusSearch])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [query])

  const searching = debouncedQuery.trim().length >= MIN_SEARCH_LENGTH && !browse
  const { data: hits = [], isFetching } = useServiceSearch(debouncedQuery, treeType, divisionFilters)
  const { data: tree = [] } = useServiceTree(treeType, divisionFilters, !!browse)

  // Browse rows: children of the node being browsed, read from the flat tree.
  const browseRows: Row[] = useMemo(() => {
    if (!browse) return []
    type Node = {
      id: string; name_en: string; parent_id: string | null; price: number | null
      emergency_price: number | null; duration: number | null; division: string[] | null
    }
    const nodes = tree as unknown as Node[]
    return nodes
      .filter((n) => n.parent_id === browse.id)
      .map((n) => ({
        id: n.id,
        name: n.name_en,
        path: [...browse.path, n.name_en],
        price: n.price,
        thumbUrl: null,
        isLeaf: !nodes.some((c) => c.parent_id === n.id),
        service: {
          id: n.id, name_en: n.name_en, parent_id: n.parent_id, price: n.price,
          emergency_price: n.emergency_price, duration: n.duration, division: n.division,
        },
      }))
  }, [browse, tree])

  const rows: Row[] = browse ? browseRows : searching ? hits.map(hitToRow) : []

  function addToBasket(row: Row) {
    setBasket((prev) =>
      prev.some((l) => l.service.id === row.id)
        ? prev.map((l) => (l.service.id === row.id ? { ...l, qty: l.qty + 1 } : l))
        : [...prev, { service: row.service, qty: 1, pathNames: row.path }],
    )
  }

  /** A branch is drilled into, never added. Only leaves can be ordered. */
  function choose(row: Row) {
    if (row.isLeaf) { addToBasket(row); return }
    setBrowse({ id: row.id, path: row.path })
    // The child list is a different, usually shorter list — a carried-over
    // highlight would point past its end and make Enter silently do nothing.
    setActiveIndex(0)
  }

  /**
   * Step back one level, rather than dumping the user out to search. Six levels
   * deep, "start over" is not a usable way to correct one wrong turn.
   */
  function goBack() {
    if (!browse?.id) { setBrowse(null); return }
    const node = (tree as unknown as Array<{ id: string; parent_id: string | null }>)
      .find((n) => n.id === browse.id)
    const parentId = node?.parent_id ?? null
    setActiveIndex(0)
    if (!parentId) { setBrowse({ id: null, path: [] }); return }
    setBrowse({ id: parentId, path: browse.path.slice(0, -1) })
  }

  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, rows.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const row = rows[activeIndex]
      if (row) choose(row)        // query is deliberately left alone
    }
  }

  const total = basket.reduce((sum, l) => sum + (l.service.price ?? 0) * l.qty, 0)

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-3 md:flex-row">
      {/* ── Find ─────────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="relative shrink-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={searchRef}
            type="search"
            autoFocus={autoFocusSearch}
            value={query}
            placeholder="Search services…"
            aria-label="Search services"
            onChange={(e) => {
              setQuery(e.target.value)
              setActiveIndex(0)
              setBrowse(null)
            }}
            onKeyDown={onSearchKeyDown}
            className="h-11 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {browse && (
          <button
            type="button"
            aria-label={`Back to ${browse.path.slice(0, -1).join(SEP) || 'search'}`}
            onClick={goBack}
            className="mt-2 flex min-h-11 shrink-0 items-center self-start text-xs text-muted-foreground hover:text-foreground"
          >
            ← {browse.path.join(SEP)}
          </button>
        )}

        {!browse && (
          <button
            type="button"
            onClick={() => { setBrowse({ id: null, path: [] }); setActiveIndex(0) }}
            className="mt-2 flex min-h-11 shrink-0 items-center self-start text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Browse all categories
          </button>
        )}

        {/* max-h bounds the list when the parent has no definite height — the
            team-leader dialogs embed this panel in an auto-height container,
            where 50 rows would otherwise push the submit button off-screen. */}
        <div className="mt-2 max-h-[50vh] min-h-0 flex-1 overflow-y-auto rounded-md border border-border">
          {rows.length === 0 ? (
            <p className="p-4 text-center text-xs text-muted-foreground">
              {isFetching
                ? 'Searching…'
                : debouncedQuery.trim().length >= MIN_SEARCH_LENGTH
                  ? 'No services match that.'
                  : 'Type to search, or pick a category to browse.'}
            </p>
          ) : (
            <ul>
              {rows.map((row, i) => (
                <li key={row.id}>
                  <button
                    type="button"
                    data-testid={`result-${row.id}`}
                    onClick={() => choose(row)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={cn(
                      'flex min-h-11 w-full items-center gap-3 border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-muted',
                      i === activeIndex && 'bg-muted',
                    )}
                  >
                    {/* No photo means no image slot at all — rows go ragged on purpose. */}
                    {row.thumbUrl && (
                      <img
                        src={row.thumbUrl}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded object-cover"
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {row.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {row.path.join(SEP)}
                      </span>
                    </span>
                    {row.isLeaf ? (
                      <span className="shrink-0 text-xs font-medium text-foreground">
                        QAR {(row.price ?? 0).toLocaleString('en-QA')}
                      </span>
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="mt-1 shrink-0 text-xs text-muted-foreground">
          <CornerDownLeft className="mr-1 inline h-3 w-3" />
          Enter adds the highlighted service
        </p>
      </div>

      {/* ── Basket ───────────────────────────────────────────────────── */}
      <div className="flex min-h-0 w-full flex-col md:w-72">
        <h3 className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Selected ({basket.length})
        </h3>
        <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
          {basket.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">Nothing selected yet.</p>
          ) : (
            <ul className="space-y-2">
              {basket.map((line) => (
                <li
                  key={line.service.id}
                  data-testid={`basket-${line.service.id}`}
                  className="rounded-md border border-border p-2"
                >
                  <div className="flex items-start gap-2">
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-sm font-medium text-foreground">
                        {line.service.name_en}
                      </span>
                      <span className="block break-words text-xs text-muted-foreground">
                        {line.pathNames.join(SEP)}
                      </span>
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${line.service.name_en}`}
                      onClick={() => setBasket((p) => p.filter((l) => l.service.id !== line.service.id))}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <input
                      type="number"
                      min={1}
                      value={line.qty}
                      aria-label={`Quantity for ${line.service.name_en}`}
                      onChange={(e) => {
                        const qty = Math.max(1, parseInt(e.target.value, 10) || 1)
                        setBasket((p) =>
                          p.map((l) => (l.service.id === line.service.id ? { ...l, qty } : l)),
                        )
                      }}
                      className="h-9 w-16 rounded border border-border bg-background px-2 text-center text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <span className="text-xs text-muted-foreground">
                      QAR {((line.service.price ?? 0) * line.qty).toLocaleString('en-QA')}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-2 shrink-0 border-t border-border pt-2">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="font-semibold text-foreground">
              QAR {total.toLocaleString('en-QA')}
            </span>
          </div>
          <Button
            type="button"
            className="h-11 w-full"
            disabled={basket.length === 0}
            onClick={() => {
              onCommit(basket)
              // Clear it: the team-leader surfaces never remount this panel, so
              // a surviving basket means a second tap doubles the quantities.
              setBasket([])
            }}
          >
            {commitLabel} {basket.length > 0 ? basket.length : ''}
          </Button>
        </div>
      </div>
    </div>
  )
}
