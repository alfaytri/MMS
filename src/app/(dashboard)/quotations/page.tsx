// src/app/(dashboard)/quotations/page.tsx
'use client'
import { useState, useRef, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Plus, Search, X, Filter as FilterIcon } from 'lucide-react'
import { PageContainer } from '@/components/shared/PageContainer'
import { QuotationListCard } from '@/components/quotations/QuotationListCard'
import { useQuotations, useQuotationCounts } from '@/hooks/useQuotations'
import { cn } from '@/lib/utils'
import type { QuotationsFilter, QuotationStatus } from '@/types/quotations'

const ALL_STATUSES: { value: QuotationStatus; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent',  label: 'Sent'  },
]

const STATUS_LABEL: Record<string, string> = Object.fromEntries(
  ALL_STATUSES.map((s) => [s.value, s.label])
)

interface SearchState {
  statuses: QuotationStatus[]
  dateFrom: string
  dateTo: string
  customerPhone: string
  quotationNumber: string
}

const EMPTY_SEARCH: SearchState = {
  statuses: [],
  dateFrom: '',
  dateTo: '',
  customerPhone: '',
  quotationNumber: '',
}

function searchToFilter(s: SearchState): QuotationsFilter {
  return {
    ...(s.statuses.length     && { statuses: s.statuses }),
    ...(s.dateFrom            && { dateFrom: s.dateFrom }),
    ...(s.dateTo              && { dateTo: s.dateTo }),
    ...(s.customerPhone       && { customerPhone: s.customerPhone }),
    ...(s.quotationNumber     && { quotationNumber: s.quotationNumber }),
  }
}

export default function QuotationsPage() {
  const router = useRouter()
  const [filter, setFilter] = useState<QuotationsFilter>({})
  const [search, setSearch] = useState<SearchState>(EMPTY_SEARCH)
  const [quickQuery, setQuickQuery] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  // ── Active filter chips ─────────────────────────────────────────────────
  type Chip = { key: string; label: string; onRemove: () => void }
  const chips: Chip[] = useMemo(() => {
    const out: Chip[] = []
    search.statuses.forEach((st) =>
      out.push({
        key: `status-${st}`,
        label: STATUS_LABEL[st] ?? st,
        onRemove: () => {
          const s = { ...search, statuses: search.statuses.filter((v) => v !== st) }
          setSearch(s); setFilter(searchToFilter(s))
        },
      })
    )
    if (search.dateFrom || search.dateTo) {
      out.push({
        key: 'date',
        label: `Date ${search.dateFrom || '…'} → ${search.dateTo || '…'}`,
        onRemove: () => {
          const s = { ...search, dateFrom: '', dateTo: '' }
          setSearch(s); setFilter(searchToFilter(s))
        },
      })
    }
    return out
  }, [search])
  const activeFilterCount = chips.length

  const quotationsQuery = useQuotations(filter)
  const quotations = useMemo(
    () => quotationsQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [quotationsQuery.data]
  )
  const isLoading = quotationsQuery.isLoading

  const { data: counts } = useQuotationCounts()

  // Infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!sentinelRef.current) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && quotationsQuery.hasNextPage && !quotationsQuery.isFetchingNextPage) {
          quotationsQuery.fetchNextPage()
        }
      },
      { rootMargin: '200px' }
    )
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- depends on specific query properties, not the unstable query object
  }, [quotationsQuery.hasNextPage, quotationsQuery.isFetchingNextPage, quotationsQuery.fetchNextPage])

  function toggleStatus(val: QuotationStatus) {
    setSearch((s) => ({
      ...s,
      statuses: s.statuses.includes(val)
        ? s.statuses.filter((v) => v !== val)
        : [...s.statuses, val],
    }))
  }

  function applyFilters() {
    setFilter(searchToFilter(search))
    setFiltersOpen(false)
    setMobileFiltersOpen(false)
  }

  function resetFilters() {
    setSearch(EMPTY_SEARCH)
    setFilter({})
    setQuickQuery('')
  }

  // Auto-detect quotation# vs phone in quick search
  function applyQuickQuery(v: string) {
    setQuickQuery(v)
    const trimmed = v.trim()
    const isPhone = /^[+\d\s-]+$/.test(trimmed) && trimmed.replace(/\D/g, '').length >= 4
    if (!trimmed) {
      setSearch((s) => ({ ...s, quotationNumber: '', customerPhone: '' }))
      setFilter((f) => ({ ...f, quotationNumber: undefined, customerPhone: undefined }))
      return
    }
    if (isPhone) {
      setSearch((s) => ({ ...s, quotationNumber: '', customerPhone: trimmed }))
      setFilter((f) => ({ ...f, quotationNumber: undefined, customerPhone: trimmed }))
    } else {
      setSearch((s) => ({ ...s, quotationNumber: trimmed, customerPhone: '' }))
      setFilter((f) => ({ ...f, quotationNumber: trimmed, customerPhone: undefined }))
    }
  }

  // Quick-count badges
  const isAllActive = !chips.length && !quickQuery
  const BADGES = [
    { label: 'All',    count: counts?.all,   active: isAllActive,
      onClick: () => { setSearch(EMPTY_SEARCH); setFilter({}); setQuickQuery('') } },
    { label: 'Drafts', count: counts?.draft, active: search.statuses.length === 1 && search.statuses[0] === 'draft',
      onClick: () => { const s = { ...EMPTY_SEARCH, statuses: ['draft' as QuotationStatus] }; setSearch(s); setFilter(searchToFilter(s)); setQuickQuery('') } },
    { label: 'Sent',   count: counts?.sent,  active: search.statuses.length === 1 && search.statuses[0] === 'sent',
      onClick: () => { const s = { ...EMPTY_SEARCH, statuses: ['sent' as QuotationStatus] }; setSearch(s); setFilter(searchToFilter(s)); setQuickQuery('') } },
  ]

  return (
    <PageContainer compact className="flex flex-col h-full">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between gap-2 border-b px-4 sm:px-6 py-3 sm:py-4">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Order Quotations</h1>
        <Button className="gap-1.5 h-9" onClick={() => router.push('/quotations/create')}>
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New Order Quotation</span>
          <span className="sm:hidden">New</span>
        </Button>
      </div>

      {/* ── Compact search bar (desktop) ── */}
      <div className="hidden md:block border-b bg-background">
        <div className="px-6 py-3 space-y-3">
          {/* Row 1 — search input + Filters button */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-xl">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search by quotation number or customer phone…"
                value={quickQuery}
                onChange={(e) => applyQuickQuery(e.target.value)}
                className="h-10 pl-9 pr-9 text-sm"
              />
              {quickQuery && (
                <button
                  type="button"
                  onClick={() => applyQuickQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
              <PopoverTrigger
                render={
                  <Button variant="outline" className="gap-2 h-10">
                    <FilterIcon className="h-4 w-4" />
                    Filters
                    {activeFilterCount > 0 && (
                      <span className="rounded-full bg-orange-500 text-white text-[11px] font-semibold px-1.5 leading-5 min-w-[20px] text-center">
                        {activeFilterCount}
                      </span>
                    )}
                  </Button>
                }
              />
              <PopoverContent align="end" className="w-[420px] max-w-[92vw] p-4">
                <div className="space-y-4">
                  {/* Status chips */}
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Status</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {ALL_STATUSES.map((s) => (
                        <button
                          key={s.value}
                          type="button"
                          onClick={() => toggleStatus(s.value)}
                          className={cn(
                            'flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                            search.statuses.includes(s.value)
                              ? 'border-orange-500 bg-orange-500 text-white'
                              : 'border-border bg-white text-muted-foreground hover:border-orange-300'
                          )}
                        >
                          {s.label}
                          {search.statuses.includes(s.value) && <X className="h-3 w-3" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Dates */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Date from</Label>
                      <Input type="date" className="h-9 text-sm cursor-pointer" value={search.dateFrom}
                        onClick={(e) => { try { (e.target as HTMLInputElement).showPicker() } catch {} }}
                        onChange={(e) => setSearch((s) => ({ ...s, dateFrom: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Date to</Label>
                      <Input type="date" className="h-9 text-sm cursor-pointer" value={search.dateTo}
                        onClick={(e) => { try { (e.target as HTMLInputElement).showPicker() } catch {} }}
                        onChange={(e) => setSearch((s) => ({ ...s, dateTo: e.target.value }))} />
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-1 border-t -mx-4 -mb-4 px-4 py-3 bg-muted/30 rounded-b-lg">
                    <Button variant="outline" size="sm" onClick={resetFilters} className="flex-1 h-9">
                      Reset
                    </Button>
                    <Button size="sm" onClick={applyFilters} className="flex-1 h-9">
                      Apply
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Row 2 — count badges */}
          <div className="flex flex-wrap gap-1.5">
            {BADGES.map((b) => (
              <button
                key={b.label}
                onClick={b.onClick}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  b.active
                    ? 'border-orange-500 bg-orange-50 text-orange-700'
                    : 'border-border bg-white text-foreground hover:border-orange-300 hover:text-orange-600'
                )}
              >
                {b.label}
                {b.count !== undefined && (
                  <span className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none',
                    b.active ? 'bg-orange-500 text-white' : 'bg-muted text-muted-foreground'
                  )}>
                    {b.count.toLocaleString('en-QA')}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Row 3 — active filter chips */}
          {chips.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Filters:</span>
              {chips.map((c) => (
                <span
                  key={c.key}
                  className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 text-orange-700 px-2.5 py-0.5 text-xs font-medium"
                >
                  {c.label}
                  <button
                    type="button"
                    onClick={c.onRemove}
                    className="rounded-full hover:bg-orange-100 p-0.5"
                    aria-label={`Remove ${c.label}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={resetFilters}
                className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 ml-1"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Mobile sticky search bar ── */}
      <div className="md:hidden sticky top-0 z-20 border-b bg-background px-4 py-2 space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search quotation # or phone…"
              value={quickQuery}
              onChange={(e) => applyQuickQuery(e.target.value)}
              className="h-10 pl-9 pr-9 w-full text-sm"
            />
            {quickQuery && (
              <button
                type="button"
                onClick={() => applyQuickQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
            <SheetTrigger
              render={
                <Button variant="outline" size="sm" className="gap-1.5 h-10 shrink-0">
                  <FilterIcon className="h-4 w-4" />
                  {activeFilterCount > 0 && (
                    <span className="rounded-full bg-orange-500 text-white text-[11px] px-1.5 leading-5 min-w-[20px] text-center">
                      {activeFilterCount}
                    </span>
                  )}
                </Button>
              }
            />
            <SheetContent side="bottom" className="h-[85vh] flex flex-col p-0">
              <SheetHeader className="px-4 py-3 border-b">
                <SheetTitle>Filters</SheetTitle>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                {/* Status chips */}
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Status</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_STATUSES.map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => toggleStatus(s.value)}
                        className={cn(
                          'flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-xs font-medium min-h-9',
                          search.statuses.includes(s.value)
                            ? 'border-orange-500 bg-orange-500 text-white'
                            : 'border-border bg-white text-muted-foreground'
                        )}
                      >
                        {s.label}
                        {search.statuses.includes(s.value) && <X className="h-3 w-3" />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Dates */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="m-quot-from" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">From Date</Label>
                    <Input id="m-quot-from" type="date" className="h-10" value={search.dateFrom}
                      onChange={(e) => setSearch((s) => ({ ...s, dateFrom: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="m-quot-to" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">To Date</Label>
                    <Input id="m-quot-to" type="date" className="h-10" value={search.dateTo}
                      onChange={(e) => setSearch((s) => ({ ...s, dateTo: e.target.value }))} />
                  </div>
                </div>
              </div>
              <div className="flex gap-2 border-t px-4 py-3">
                <Button variant="outline" className="flex-1 h-10" onClick={resetFilters}>
                  Reset
                </Button>
                <SheetClose
                  render={
                    <Button className="flex-1 h-10" onClick={applyFilters}>
                      Apply
                    </Button>
                  }
                />
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {/* Mobile count badges — horizontal scroll */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
          {BADGES.map((b) => (
            <button
              key={b.label}
              onClick={b.onClick}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap shrink-0',
                b.active
                  ? 'border-orange-500 bg-orange-50 text-orange-700'
                  : 'border-border bg-white text-foreground'
              )}
            >
              {b.label}
              {b.count !== undefined && (
                <span className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none',
                  b.active ? 'bg-orange-500 text-white' : 'bg-muted text-muted-foreground'
                )}>
                  {b.count.toLocaleString('en-QA')}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Mobile active chips */}
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <span
                key={c.key}
                className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 text-orange-700 px-2.5 py-0.5 text-xs font-medium"
              >
                {c.label}
                <button type="button" onClick={c.onRemove} className="rounded-full hover:bg-orange-100 p-0.5">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Card grid ── */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {isLoading ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
        ) : quotations.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">No quotations found</p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {quotations.map((q) => (
                <QuotationListCard
                  key={q.id}
                  quotation={q}
                  href={`/quotations/${q.id}`}
                />
              ))}
            </div>
            <div ref={sentinelRef} className="h-1" />
            {quotationsQuery.isFetchingNextPage && (
              <p className="text-center text-xs text-muted-foreground py-4">Loading more...</p>
            )}
          </>
        )}
      </div>
    </PageContainer>
  )
}
