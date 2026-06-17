// src/app/(dashboard)/orders/page.tsx
'use client'
import { useState, useRef, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Plus, Search, X, ChevronDown, ChevronUp, Filter as FilterIcon } from 'lucide-react'
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
  const [filter, setFilter] = useState<OrdersFilter>({})
  const [search, setSearch] = useState<SearchState>(EMPTY_SEARCH)
  const [searchOpen, setSearchOpen] = useState(true)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null)

  const activeFilterCount = useMemo(() => {
    let n = 0
    if (search.statuses.length) n++
    if (search.orderType) n++
    if (search.addressMissing) n++
    if (search.bookingDateFrom || search.bookingDateTo) n++
    if (search.visitDateFrom || search.visitDateTo) n++
    if (search.customerPhone) n++
    if (search.team) n++
    return n
  }, [search])

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

  function handleSearch() {
    setFilter(searchToFilter(search))
  }

  function handleClear() {
    setSearch(EMPTY_SEARCH)
    setFilter({})
  }

  // Quick-count badges that apply a preset filter
  const BADGES = [
    { label: 'All Orders',      count: counts?.all,          onClick: () => { setSearch(EMPTY_SEARCH); setFilter({}) } },
    { label: 'Active Orders',   count: counts?.active,       onClick: () => { const s = { ...EMPTY_SEARCH, statuses: ['scheduled','confirmed','in-progress','pending-confirmation'] }; setSearch(s); setFilter(searchToFilter(s)) } },
    { label: 'Missing Address', count: counts?.noAddress,    onClick: () => { const s = { ...EMPTY_SEARCH, addressMissing: 'yes' }; setSearch(s); setFilter(searchToFilter(s)) } },
    { label: 'Not Confirmed',   count: counts?.notConfirmed, onClick: () => { const s = { ...EMPTY_SEARCH, statuses: ['pending-confirmation'] }; setSearch(s); setFilter(searchToFilter(s)) } },
    { label: 'Not Invoiced',    count: counts?.notInvoiced,  onClick: () => { const s = { ...EMPTY_SEARCH }; setSearch(s); setFilter({ statuses: undefined, statusChip: 'past_due_no_invoice' }) } },
  ]

  return (
    <PageContainer compact className="flex flex-col h-full">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between gap-2 border-b px-4 sm:px-6 py-3 sm:py-4">
        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Orders</h1>
        <div className="flex items-center gap-2">
          {/* Mobile filter trigger */}
          <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
            <SheetTrigger
              render={
                <Button variant="outline" size="sm" className="md:hidden gap-1.5 h-9">
                  <FilterIcon className="h-4 w-4" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="rounded-full bg-primary text-primary-foreground px-1.5 text-xs">
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

                {/* Text + Team */}
                <div className="space-y-1.5">
                  <Label htmlFor="m-phone" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Customer Phone</Label>
                  <Input id="m-phone" placeholder="Search phone…" className="h-10" value={search.customerPhone}
                    onChange={(e) => setSearch((s) => ({ ...s, customerPhone: e.target.value }))} />
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
              </div>
              <div className="flex gap-2 border-t px-4 py-3">
                <Button variant="outline" className="flex-1 h-10" onClick={handleClear}>
                  Reset
                </Button>
                <SheetClose
                  render={
                    <Button className="flex-1 h-10" onClick={handleSearch}>
                      Apply
                    </Button>
                  }
                />
              </div>
            </SheetContent>
          </Sheet>

          <Button className="gap-1.5 h-9" onClick={() => router.push('/orders/create')}>
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">New Order</span><span className="sm:hidden">New</span>
          </Button>
        </div>
      </div>

      {/* Mobile sticky search bar */}
      <div className="md:hidden sticky top-0 z-20 border-b bg-background px-4 py-2">
        <Input
          placeholder="Search order no…"
          value={search.orderNumber}
          onChange={(e) => {
            const v = e.target.value
            setSearch((s) => ({ ...s, orderNumber: v }))
            setFilter((f) => ({ ...f, orderNumber: v || undefined }))
          }}
          className="h-10 w-full"
        />
      </div>

      {/* ── Search panel (desktop) ── */}
      <div className="hidden md:block border-b bg-muted">
        {/* Panel header */}
        <button
          onClick={() => setSearchOpen((v) => !v)}
          className="flex w-full items-center gap-2 px-6 py-3 text-sm font-semibold text-foreground hover:text-foreground"
        >
          <Search className="h-4 w-4 text-muted-foreground" />
          <span>Search</span>
          {searchOpen ? <ChevronUp className="ml-auto h-4 w-4 text-muted-foreground" /> : <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground" />}
        </button>

        {searchOpen && (
          <div className="px-6 pb-5 space-y-4">

            {/* Count badges */}
            <div className="flex flex-wrap gap-2">
              {BADGES.map((b) => (
                <button
                  key={b.label}
                  onClick={b.onClick}
                  className="flex items-center gap-1.5 rounded-md border border-border bg-white px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:border-orange-400 hover:text-orange-600"
                >
                  {b.label}
                  {b.count !== undefined && (
                    <span className="rounded bg-orange-500 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                      {b.count.toLocaleString()}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Row 1: type / status chips / address missing */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="orders-order-type" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Order Type</Label>
                <Select value={search.orderType} onValueChange={(v) => setSearch((s) => ({ ...s, orderType: v === 'all' ? '' : (v ?? '') }))}>
                  <SelectTrigger id="orders-order-type" className="h-9 text-sm">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="order">Order</SelectItem>
                    <SelectItem value="site-visit">Site Visit</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Order Status</Label>
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
                          : 'border-border bg-white text-muted-foreground hover:border-border'
                      )}
                    >
                      {s.label}
                      {search.statuses.includes(s.value) && (
                        <X className="h-3 w-3" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Row 2: dates */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="orders-booking-date-from" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">From Order Date</Label>
                <Input id="orders-booking-date-from" type="date" className="h-9 text-sm cursor-pointer" value={search.bookingDateFrom}
                  onClick={(e) => { try { (e.target as HTMLInputElement).showPicker() } catch {} }}
                  onChange={(e) => setSearch((s) => ({ ...s, bookingDateFrom: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="orders-booking-date-to" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">To Order Date</Label>
                <Input id="orders-booking-date-to" type="date" className="h-9 text-sm cursor-pointer" value={search.bookingDateTo}
                  onClick={(e) => { try { (e.target as HTMLInputElement).showPicker() } catch {} }}
                  onChange={(e) => setSearch((s) => ({ ...s, bookingDateTo: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="orders-visit-date-from" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">From Visit Date</Label>
                <Input id="orders-visit-date-from" type="date" className="h-9 text-sm cursor-pointer" value={search.visitDateFrom}
                  onClick={(e) => { try { (e.target as HTMLInputElement).showPicker() } catch {} }}
                  onChange={(e) => setSearch((s) => ({ ...s, visitDateFrom: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="orders-visit-date-to" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">To Visit Date</Label>
                <Input id="orders-visit-date-to" type="date" className="h-9 text-sm cursor-pointer" value={search.visitDateTo}
                  onClick={(e) => { try { (e.target as HTMLInputElement).showPicker() } catch {} }}
                  onChange={(e) => setSearch((s) => ({ ...s, visitDateTo: e.target.value }))} />
              </div>
            </div>

            {/* Row 3: text filters */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="orders-customer-phone" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Customer Phone</Label>
                <Input id="orders-customer-phone" placeholder="Search phone…" className="h-9 text-sm" value={search.customerPhone}
                  onChange={(e) => setSearch((s) => ({ ...s, customerPhone: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="orders-order-number" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Order No</Label>
                <Input id="orders-order-number" placeholder="N/2026/05/…" className="h-9 text-sm" value={search.orderNumber}
                  onChange={(e) => setSearch((s) => ({ ...s, orderNumber: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="orders-address-missing" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Address Missing</Label>
                <Select value={search.addressMissing || 'all'} onValueChange={(v) => setSearch((s) => ({ ...s, addressMissing: v === 'all' ? '' : (v ?? '') }))}>
                  <SelectTrigger id="orders-address-missing" className="h-9 text-sm">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="yes">Missing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="orders-team" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Team</Label>
                <Select
                  value={search.team || '__all__'}
                  onValueChange={(v) => setSearch((s) => ({ ...s, team: v === '__all__' ? '' : (v ?? '') }))}
                >
                  <SelectTrigger id="orders-team" className="h-9 w-full text-sm">
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
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={handleClear} className="gap-1.5 h-9">
                <X className="h-3.5 w-3.5" /> Clear Search
              </Button>
              <Button size="sm" onClick={handleSearch} className="gap-1.5 h-9">
                <Search className="h-3.5 w-3.5" /> Search
              </Button>
            </div>
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
