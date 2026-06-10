'use client'

import { useState, useMemo } from 'react'
import { Search, ArrowUpDown } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useLocalOrders } from '@/hooks/contact-center/local/useLocalOrders'
import { OrderDetailDialog } from '@/components/orders/OrderDetailDialog'

type SortMode = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc'

const STATUS_COLOR: Record<string, string> = {
  completed:     'text-emerald-600 border-emerald-300 bg-emerald-50',
  cancelled:     'text-rose-600    border-rose-300    bg-rose-50',
  scheduled:     'text-blue-600    border-blue-300    bg-blue-50',
  confirmed:     'text-blue-600    border-blue-300    bg-blue-50',
  'in-progress': 'text-amber-600   border-amber-300   bg-amber-50',
}

export function OrderHistoryV2({ authUserId, customerId }: { authUserId: string | null; customerId: string | null }) {
  const [search, setSearch] = useState('')
  const [from,   setFrom]   = useState('')
  const [to,     setTo]     = useState('')
  const [sort,   setSort]   = useState<SortMode>('date-desc')
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)

  const { orders, loading: isLoading } = useLocalOrders(authUserId, customerId)

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    const fromTs = from ? new Date(from).getTime() : null
    const toTs   = to   ? new Date(to).getTime()   + 86_400_000 : null // inclusive

    let rows = orders.filter((o) => {
      if (term && !(o.order_id?.toLowerCase().includes(term) || o.type?.toLowerCase().includes(term))) return false
      if (fromTs && o.scheduled_date && new Date(o.scheduled_date).getTime() < fromTs) return false
      if (toTs   && o.scheduled_date && new Date(o.scheduled_date).getTime() > toTs)   return false
      return true
    })

    rows = [...rows].sort((a, b) => {
      switch (sort) {
        case 'date-desc':   return (new Date(b.scheduled_date ?? 0).getTime()) - (new Date(a.scheduled_date ?? 0).getTime())
        case 'date-asc':    return (new Date(a.scheduled_date ?? 0).getTime()) - (new Date(b.scheduled_date ?? 0).getTime())
        case 'amount-desc': return (b.total_amount ?? 0) - (a.total_amount ?? 0)
        case 'amount-asc':  return (a.total_amount ?? 0) - (b.total_amount ?? 0)
      }
    })

    return rows
  }, [orders, search, from, to, sort])

  if (!customerId) return <p className="text-xs text-muted-foreground px-3 py-2">No customer linked</p>
  if (isLoading)   return <p className="text-xs text-muted-foreground px-3 py-2">Loading…</p>

  return (
    <>
      <div className="flex flex-col px-3 py-2 gap-1.5">
        {/* Filters */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search orders…"
            className="pl-7 h-7 text-xs"
          />
        </div>
        <div className="flex items-center gap-1">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-7 text-[10px] px-1.5 flex-1" />
          <span className="text-[10px] text-muted-foreground">to</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-7 text-[10px] px-1.5 flex-1" />
        </div>
        <div className="flex items-center gap-1">
          <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortMode)}
            className="flex-1 h-6 text-[11px] border border-border rounded px-1 bg-background"
          >
            <option value="date-desc">Date · Newest first</option>
            <option value="date-asc">Date · Oldest first</option>
            <option value="amount-desc">Amount · High to low</option>
            <option value="amount-asc">Amount · Low to high</option>
          </select>
        </div>

        {/* Card grid — 2 columns, scrollable */}
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">No orders match</p>
        ) : (
          <div className="grid grid-cols-2 gap-1.5 max-h-[220px] overflow-y-auto overscroll-contain pr-1">
            {filtered.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setSelectedOrderId(o.id)}
                className="flex flex-col gap-0.5 rounded border border-border bg-background p-1.5 text-[11px] leading-tight text-left hover:border-primary/40 hover:bg-primary/5 transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-mono text-muted-foreground truncate">{o.order_id}</span>
                  {o.status && (
                    <Badge
                      variant="outline"
                      className={`text-[9px] capitalize px-1 py-0 leading-tight flex-shrink-0 ${STATUS_COLOR[o.status] ?? 'text-muted-foreground'}`}
                    >
                      {o.status}
                    </Badge>
                  )}
                </div>
                {o.type && (
                  <span className="capitalize text-foreground/80 truncate">{o.type.replace('_', ' ')}</span>
                )}
                {o.scheduled_date && (
                  <span className="text-muted-foreground">{new Date(o.scheduled_date).toLocaleDateString()}</span>
                )}
                {o.total_amount != null && o.total_amount > 0 && (
                  <span className="text-muted-foreground">QAR {o.total_amount.toLocaleString('en-US')}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <OrderDetailDialog
        orderId={selectedOrderId}
        open={!!selectedOrderId}
        onOpenChange={(open) => { if (!open) setSelectedOrderId(null) }}
      />
    </>
  )
}
