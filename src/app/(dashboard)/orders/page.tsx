// src/app/(dashboard)/orders/page.tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Search, X, ChevronDown, ChevronUp } from 'lucide-react'
import { OrderCard } from '@/components/orders/OrderCard'
import { OrderDetailDialog } from '@/components/orders/OrderDetailDialog'
import { useOrders, useOrderCounts } from '@/hooks/useOrders'
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
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)

  const { data: orders = [], isLoading } = useOrders(filter)
  const { data: counts } = useOrderCounts()

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
    <div className="flex h-full flex-col">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <h1 className="text-2xl font-bold text-slate-900">Orders</h1>
        <Button className="gap-2" onClick={() => router.push('/orders/create')}>
          <Plus className="h-4 w-4" /> New Order
        </Button>
      </div>

      {/* ── Search panel ── */}
      <div className="border-b bg-slate-50">
        {/* Panel header */}
        <button
          onClick={() => setSearchOpen((v) => !v)}
          className="flex w-full items-center gap-2 px-6 py-3 text-sm font-semibold text-slate-700 hover:text-slate-900"
        >
          <Search className="h-4 w-4 text-slate-400" />
          <span>Search</span>
          {searchOpen ? <ChevronUp className="ml-auto h-4 w-4 text-slate-400" /> : <ChevronDown className="ml-auto h-4 w-4 text-slate-400" />}
        </button>

        {searchOpen && (
          <div className="px-6 pb-5 space-y-4">

            {/* Count badges */}
            <div className="flex flex-wrap gap-2">
              {BADGES.map((b) => (
                <button
                  key={b.label}
                  onClick={b.onClick}
                  className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:border-orange-400 hover:text-orange-600"
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
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Order Type</Label>
                <Select value={search.orderType} onValueChange={(v) => setSearch((s) => ({ ...s, orderType: v === 'all' ? '' : v }))}>
                  <SelectTrigger className="h-9 text-sm">
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
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Order Status</Label>
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
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
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
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">From Order Date</Label>
                <Input type="date" className="h-9 text-sm" value={search.bookingDateFrom}
                  onChange={(e) => setSearch((s) => ({ ...s, bookingDateFrom: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">To Order Date</Label>
                <Input type="date" className="h-9 text-sm" value={search.bookingDateTo}
                  onChange={(e) => setSearch((s) => ({ ...s, bookingDateTo: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">From Visit Date</Label>
                <Input type="date" className="h-9 text-sm" value={search.visitDateFrom}
                  onChange={(e) => setSearch((s) => ({ ...s, visitDateFrom: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">To Visit Date</Label>
                <Input type="date" className="h-9 text-sm" value={search.visitDateTo}
                  onChange={(e) => setSearch((s) => ({ ...s, visitDateTo: e.target.value }))} />
              </div>
            </div>

            {/* Row 3: text filters */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Customer Phone</Label>
                <Input placeholder="Search phone…" className="h-9 text-sm" value={search.customerPhone}
                  onChange={(e) => setSearch((s) => ({ ...s, customerPhone: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Order No</Label>
                <Input placeholder="N/2026/05/…" className="h-9 text-sm" value={search.orderNumber}
                  onChange={(e) => setSearch((s) => ({ ...s, orderNumber: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Address Missing</Label>
                <Select value={search.addressMissing || 'all'} onValueChange={(v) => setSearch((s) => ({ ...s, addressMissing: v === 'all' ? '' : v }))}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="yes">Missing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Team</Label>
                <Input placeholder="Team name…" className="h-9 text-sm" value={search.team}
                  onChange={(e) => setSearch((s) => ({ ...s, team: e.target.value }))} />
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

      {/* ── Order grid ── */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {isLoading ? (
          <p className="py-12 text-center text-sm text-slate-400">Loading orders…</p>
        ) : orders.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">No orders found</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} onClick={() => setSelectedOrderId(order.id)} />
            ))}
          </div>
        )}
      </div>

      <OrderDetailDialog
        orderId={selectedOrderId}
        open={!!selectedOrderId}
        onOpenChange={(v) => { if (!v) setSelectedOrderId(null) }}
      />
    </div>
  )
}
