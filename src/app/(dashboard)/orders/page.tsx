// src/app/(dashboard)/orders/page.tsx
'use client'
import { useState, useRef, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Plus, Search, X, Filter as FilterIcon } from 'lucide-react'
import { PageContainer } from '@/components/shared/PageContainer'
import { OrderCard } from '@/components/orders/OrderCard'
import { SiteVisitListCard } from '@/components/orders/SiteVisitListCard'
import { OrderDetailDialog } from '@/components/orders/OrderDetailDialog'
import { SiteVisitDetailSheet } from '@/components/orders/SiteVisitDetailSheet'
import { useOrders, useOrderCounts } from '@/hooks/useOrders'
import { useSiteVisits } from '@/hooks/useSiteVisits'
import { useTeams, type TeamFull } from '@/hooks/useTeams'
import type { OrdersFilter } from '@/types/orders'
import { cn } from '@/lib/utils'

const ALL_STATUSES = [
  { value: 'scheduled',             label: 'Scheduled' },
  { value: 'confirmed',             label: 'Confirmed' },
  { value: 'pending-approval',      label: 'Pending Approval' },
  { value: 'waitlist',              label: 'Waiting List' },
  { value: 'in-progress',           label: 'In Progress' },
  { value: 'pending-confirmation',  label: 'Pending Confirm' },
  { value: 'completed',             label: 'Completed' },
  { value: 'cancelled',             label: 'Cancelled' },
]

const STATUS_LABEL: Record<string, string> = Object.fromEntries(
  ALL_STATUSES.map((s) => [s.value, s.label])
)

interface SearchState {
  orderType: string
  statuses: string[]
  addressMissing: string
  bookingDateFrom: string
  bookingDateTo: string
  visitDateFrom: string
  visitDateTo: string
  customerPhone: string
  orderNumber: string
  team: string
}

const EMPTY_SEARCH: SearchState = {
  orderType: '',
  statuses: [],
  addressMissing: '',
  bookingDateFrom: '',
  bookingDateTo: '',
  visitDateFrom: '',
  visitDateTo: '',
  customerPhone: '',
  orderNumber: '',
  team: '',
}

function searchToFilter(s: SearchState): OrdersFilter {
  return {
    ...(s.statuses.length       && { statuses: s.statuses }),
    ...(s.orderType             && { orderType: s.orderType }),
    ...(s.addressMissing === 'yes' && { addressMissing: true }),
    ...(s.bookingDateFrom       && { bookingDateFrom: s.bookingDateFrom }),
    ...(s.bookingDateTo         && { bookingDateTo: s.bookingDateTo }),
    ...(s.visitDateFrom         && { visitDateFrom: s.visitDateFrom }),
    ...(s.visitDateTo           && { visitDateTo: s.visitDateTo }),
    ...(s.customerPhone         && { customerPhone: s.customerPhone }),
    ...(s.orderNumber           && { orderNumber: s.orderNumber }),
  }
}

export default function OrdersPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [filter, setFilter] = useState<OrdersFilter>({})
  const [search, setSearch] = useState<SearchState>(EMPTY_SEARCH)
  const [quickQuery, setQuickQuery] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null)

  // Open the detail dialog / visit sheet automatically when arriving with
  // ?openOrderId=<uuid> or ?openVisitId=<uuid> — used after order/site-visit
  // creation. Clear the query string once handled so refreshes don't replay it.
  useEffect(() => {
    const openOrderId = searchParams.get('openOrderId')
    const openVisitId = searchParams.get('openVisitId')
    if (openOrderId && openOrderId !== selectedOrderId) {
      setSelectedOrderId(openOrderId)
      router.replace('/orders', { scroll: false })
    } else if (openVisitId && openVisitId !== selectedVisitId) {
      setSelectedVisitId(openVisitId)
      router.replace('/orders', { scroll: false })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // ── Active filter chips ────────────────────────────────────────────────
  type Chip = { key: string; label: string; onRemove: () => void }
  const chips: Chip[] = useMemo(() => {
    const out: Chip[] = []
    if (search.orderType) {
      out.push({
        key: 'orderType',
        label: `Type: ${search.orderType === 'site-visit' ? 'Site Visit' : 'Order'}`,
        onRemove: () => {
          const s = { ...search, orderType: '' }
          setSearch(s); setFilter(searchToFilter(s))
        },
      })
    }
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
    if (search.bookingDateFrom || search.bookingDateTo) {
      out.push({
        key: 'bookingDate',
        label: `Order ${search.bookingDateFrom || '…'} → ${search.bookingDateTo || '…'}`,
        onRemove: () => {
          const s = { ...search, bookingDateFrom: '', bookingDateTo: '' }
          setSearch(s); setFilter(searchToFilter(s))
        },
      })
    }
    if (search.visitDateFrom || search.visitDateTo) {
      out.push({
        key: 'visitDate',
        label: `Visit ${search.visitDateFrom || '…'} → ${search.visitDateTo || '…'}`,
        onRemove: () => {
          const s = { ...search, visitDateFrom: '', visitDateTo: '' }
          setSearch(s); setFilter(searchToFilter(s))
        },
      })
    }
    if (search.addressMissing === 'yes') {
      out.push({
        key: 'addressMissing',
        label: 'Address missing',
        onRemove: () => {
          const s = { ...search, addressMissing: '' }
          setSearch(s); setFilter(searchToFilter(s))
        },
      })
    }
    if (search.team) {
      out.push({
        key: 'team',
        label: `Team: ${search.team}`,
        onRemove: () => {
          const s = { ...search, team: '' }
          setSearch(s); setFilter(searchToFilter(s))
        },
      })
    }
    return out
  }, [search])
  const activeFilterCount = chips.length

  const isSiteVisitOnly = search.orderType === 'site-visit'
  const isOrderOnly     = search.orderType === 'order'

  const ordersQuery = useOrders({ ...filter, orderType: isOrderOnly ? 'order' : undefined })
  const orders = useMemo(() => ordersQuery.data?.pages.flatMap((p) => p.items) ?? [], [ordersQuery.data])
  const isLoading = ordersQuery.isLoading

  const siteVisitsQuery = useSiteVisits()
  const siteVisits = useMemo(() => siteVisitsQuery.data?.pages.flatMap((p) => p.items) ?? [], [siteVisitsQuery.data])
  const isLoadingSV = siteVisitsQuery.isLoading

  const { data: counts } = useOrderCounts()
  const { data: teamsRaw = [] } = useTeams()

  // Infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!sentinelRef.current) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          if (ordersQuery.hasNextPage && !ordersQuery.isFetchingNextPage) ordersQuery.fetchNextPage()
          if (siteVisitsQuery.hasNextPage && !siteVisitsQuery.isFetchingNextPage) siteVisitsQuery.fetchNextPage()
        }
      },
      { rootMargin: '200px' }
    )
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [ordersQuery.hasNextPage, ordersQuery.isFetchingNextPage, ordersQuery.fetchNextPage, siteVisitsQuery.hasNextPage, siteVisitsQuery.isFetchingNextPage, siteVisitsQuery.fetchNextPage])
  const teams: TeamFull[] = teamsRaw

  function toggleStatus(val: string) {
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
  }

  function resetFilters() {
    setSearch(EMPTY_SEARCH)
    setFilter({})
    setQuickQuery('')
  }

  // Auto-detect order# vs phone in quick search
  function applyQuickQuery(v: string) {
    setQuickQuery(v)
    const trimmed = v.trim()
    const isPhone = /^[+\d\s-]+$/.test(trimmed) && trimmed.replace(/\D/g, '').length >= 4
    if (!trimmed) {
      setSearch((s) => ({ ...s, orderNumber: '', customerPhone: '' }))
      setFilter((f) => ({ ...f, orderNumber: undefined, customerPhone: undefined }))
      return
    }
    if (isPhone) {
      setSearch((s) => ({ ...s, orderNumber: '', customerPhone: trimmed }))
      setFilter((f) => ({ ...f, orderNumber: undefined, customerPhone: trimmed }))
    } else {
      setSearch((s) => ({ ...s, orderNumber: trimmed, customerPhone: '' }))
      setFilter((f) => ({ ...f, orderNumber: trimmed, customerPhone: undefined }))
    }
  }

  // Quick-count badges
  const BADGES = [
    { label: 'All',              count: counts?.all,          active: !chips.length && !quickQuery,
      onClick: () => { setSearch(EMPTY_SEARCH); setFilter({}); setQuickQuery('') } },
    { label: 'Active',           count: counts?.active,
      onClick: () => { const s = { ...EMPTY_SEARCH, statuses: ['scheduled','confirmed','in-progress','pending-confirmation'] }; setSearch(s); setFilter(searchToFilter(s)) } },
    { label: 'Missing Address',  count: counts?.noAddress,
      onClick: () => { const s = { ...EMPTY_SEARCH, addressMissing: 'yes' }; setSearch(s); setFilter(searchToFilter(s)) } },
    { label: 'Not Confirmed',    count: counts?.notConfirmed,
      onClick: () => { const s = { ...EMPTY_SEARCH, statuses: ['pending-confirmation'] }; setSearch(s); setFilter(searchToFilter(s)) } },
    { label: 'Not Invoiced',     count: counts?.notInvoiced,
      onClick: () => { setSearch(EMPTY_SEARCH); setFilter({ statusChip: 'past_due_no_invoice' }) } },
  ]

  return (
    <PageContainer compact className="flex flex-col h-full">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between gap-2 border-b px-4 sm:px-6 py-3 sm:py-4">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Orders</h1>
        <Button className="gap-1.5 h-9" onClick={() => router.push('/orders/create')}>
          <Plus className="h-4 w-4" /> <span className="hidden sm:inline">New Order</span><span className="sm:hidden">New</span>
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
                placeholder="Search by order number or customer phone…"
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
                  {/* Type */}
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Order Type</Label>
                    <Select value={search.orderType || 'all'} onValueChange={(v) => setSearch((s) => ({ ...s, orderType: v === 'all' ? '' : (v ?? '') }))}>
                      <SelectTrigger className="h-9 text-sm w-full">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="order">Order</SelectItem>
                        <SelectItem value="site-visit">Site Visit</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

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
                      <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Order date from</Label>
                      <Input type="date" className="h-9 text-sm cursor-pointer" value={search.bookingDateFrom}
                        onClick={(e) => { try { (e.target as HTMLInputElement).showPicker() } catch {} }}
                        onChange={(e) => setSearch((s) => ({ ...s, bookingDateFrom: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Order date to</Label>
                      <Input type="date" className="h-9 text-sm cursor-pointer" value={search.bookingDateTo}
                        onClick={(e) => { try { (e.target as HTMLInputElement).showPicker() } catch {} }}
                        onChange={(e) => setSearch((s) => ({ ...s, bookingDateTo: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Visit date from</Label>
                      <Input type="date" className="h-9 text-sm cursor-pointer" value={search.visitDateFrom}
                        onClick={(e) => { try { (e.target as HTMLInputElement).showPicker() } catch {} }}
                        onChange={(e) => setSearch((s) => ({ ...s, visitDateFrom: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Visit date to</Label>
                      <Input type="date" className="h-9 text-sm cursor-pointer" value={search.visitDateTo}
                        onClick={(e) => { try { (e.target as HTMLInputElement).showPicker() } catch {} }}
                        onChange={(e) => setSearch((s) => ({ ...s, visitDateTo: e.target.value }))} />
                    </div>
                  </div>

                  {/* Team + Address */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Team</Label>
                      <Select
                        value={search.team || '__all__'}
                        onValueChange={(v) => setSearch((s) => ({ ...s, team: v === '__all__' ? '' : (v ?? '') }))}
                      >
                        <SelectTrigger className="h-9 text-sm w-full">
                          <SelectValue placeholder="All teams" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all__">All teams</SelectItem>
                          {teams.map((t) => (
                            <SelectItem key={t.id} value={t.name_en ?? t.name}>
                              {t.name_en ?? t.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Address</Label>
                      <Select value={search.addressMissing || 'all'} onValueChange={(v) => setSearch((s) => ({ ...s, addressMissing: v === 'all' ? '' : (v ?? '') }))}>
                        <SelectTrigger className="h-9 text-sm w-full">
                          <SelectValue placeholder="All" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="yes">Missing</SelectItem>
                        </SelectContent>
                      </Select>
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
              placeholder="Search order # or phone…"
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
                {/* Order type */}
                <div className="space-y-1.5">
                  <Label htmlFor="m-order-type" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Order Type</Label>
                  <Select value={search.orderType || 'all'} onValueChange={(v) => setSearch((s) => ({ ...s, orderType: v === 'all' ? '' : (v ?? '') }))}>
                    <SelectTrigger id="m-order-type" className="h-10 text-sm w-full">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="order">Order</SelectItem>
                      <SelectItem value="site-visit">Site Visit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Status chips */}
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Order Status</Label>
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
                    <Label htmlFor="m-booking-from" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">From Order Date</Label>
                    <Input id="m-booking-from" type="date" className="h-10" value={search.bookingDateFrom}
                      onChange={(e) => setSearch((s) => ({ ...s, bookingDateFrom: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="m-booking-to" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">To Order Date</Label>
                    <Input id="m-booking-to" type="date" className="h-10" value={search.bookingDateTo}
                      onChange={(e) => setSearch((s) => ({ ...s, bookingDateTo: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="m-visit-from" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">From Visit Date</Label>
                    <Input id="m-visit-from" type="date" className="h-10" value={search.visitDateFrom}
                      onChange={(e) => setSearch((s) => ({ ...s, visitDateFrom: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="m-visit-to" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">To Visit Date</Label>
                    <Input id="m-visit-to" type="date" className="h-10" value={search.visitDateTo}
                      onChange={(e) => setSearch((s) => ({ ...s, visitDateTo: e.target.value }))} />
                  </div>
                </div>

                {/* Team + Address */}
                <div className="space-y-1.5">
                  <Label htmlFor="m-team" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Team</Label>
                  <Select
                    value={search.team || '__all__'}
                    onValueChange={(v) => setSearch((s) => ({ ...s, team: v === '__all__' ? '' : (v ?? '') }))}
                  >
                    <SelectTrigger id="m-team" className="h-10 w-full">
                      <SelectValue placeholder="All teams" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All teams</SelectItem>
                      {teams.map((t) => (
                        <SelectItem key={t.id} value={t.name_en ?? t.name}>
                          {t.name_en ?? t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="m-addr" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Address Missing</Label>
                  <Select value={search.addressMissing || 'all'} onValueChange={(v) => setSearch((s) => ({ ...s, addressMissing: v === 'all' ? '' : (v ?? '') }))}>
                    <SelectTrigger id="m-addr" className="h-10 w-full">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="yes">Missing</SelectItem>
                    </SelectContent>
                  </Select>
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

      {/* ── Order / Site Visit grid ── */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {(isLoading || isLoadingSV) ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
        ) : (() => {
          // Build a unified sorted list based on type filter
          type Row =
            | { kind: 'order'; item: typeof orders[0] }
            | { kind: 'visit'; item: typeof siteVisits[0] }

          let rows: Row[] = []
          if (!isSiteVisitOnly) rows.push(...orders.map((o) => ({ kind: 'order' as const, item: o })))
          if (!isOrderOnly)     rows.push(...siteVisits.map((v) => ({ kind: 'visit' as const, item: v })))

          // Sort combined list by scheduled_date descending
          rows.sort((a, b) => {
            const da = a.item.scheduled_date ?? ''
            const db = b.item.scheduled_date ?? ''
            return db.localeCompare(da)
          })

          if (rows.length === 0) {
            return <p className="py-12 text-center text-sm text-muted-foreground">No orders found</p>
          }

          return (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {rows.map((row) =>
                  row.kind === 'order' ? (
                    <OrderCard key={row.item.id} order={row.item} onClick={() => setSelectedOrderId(row.item.id)} />
                  ) : (
                    <SiteVisitListCard key={row.item.id} visit={row.item} onClick={() => setSelectedVisitId(row.item.id)} />
                  )
                )}
              </div>
              <div ref={sentinelRef} className="h-1" />
              {(ordersQuery.isFetchingNextPage || siteVisitsQuery.isFetchingNextPage) && (
                <p className="text-center text-xs text-muted-foreground py-4">Loading more...</p>
              )}
            </>
          )
        })()}
      </div>

      <OrderDetailDialog
        orderId={selectedOrderId}
        open={!!selectedOrderId}
        onOpenChange={(v) => { if (!v) setSelectedOrderId(null) }}
      />
      <SiteVisitDetailSheet
        visitId={selectedVisitId}
        open={!!selectedVisitId}
        onOpenChange={(v) => { if (!v) setSelectedVisitId(null) }}
      />
    </PageContainer>
  )
}
