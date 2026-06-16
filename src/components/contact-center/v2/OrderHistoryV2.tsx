'use client'

import { useState, useMemo } from 'react'
import { Search, ChevronRight } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useLocalOrders } from '@/hooks/contact-center/local/useLocalOrders'
import { OrderDetailDialog } from '@/components/orders/OrderDetailDialog'

const TYPE_STYLE: Record<string, { label: string; cls: string }> = {
  order:        { label: 'Normal',     cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  quotation:    { label: 'Quotation',  cls: 'text-violet-700  bg-violet-50  border-violet-200'  },
  'site-visit': { label: 'Site Visit', cls: 'text-sky-700     bg-sky-50     border-sky-200'     },
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function fmtQar(n: number | null | undefined): string {
  return `QAR ${(n ?? 0).toLocaleString('en-US')}`
}

export function OrderHistoryV2({ authUserId, customerId }: { authUserId: string | null; customerId: string | null }) {
  const [search, setSearch] = useState('')
  const [from,   setFrom]   = useState('')
  const [to,     setTo]     = useState('')
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)

  const { orders, loading: isLoading } = useLocalOrders(authUserId, customerId)

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    const fromTs = from ? new Date(from).getTime() : null
    const toTs   = to   ? new Date(to).getTime() + 86_400_000 : null

    return orders
      .filter((o) => {
        if (term && !(o.order_id?.toLowerCase().includes(term) || o.type?.toLowerCase().includes(term))) return false
        if (fromTs && o.scheduled_date && new Date(o.scheduled_date).getTime() < fromTs) return false
        if (toTs   && o.scheduled_date && new Date(o.scheduled_date).getTime() > toTs)   return false
        return true
      })
      .sort((a, b) => (new Date(b.scheduled_date ?? 0).getTime()) - (new Date(a.scheduled_date ?? 0).getTime()))
  }, [orders, search, from, to])

  if (!customerId) return <p className="text-xs text-muted-foreground px-3 py-2">No customer linked</p>
  if (isLoading)   return <p className="text-xs text-muted-foreground px-3 py-2">Loading…</p>

  return (
    <>
      <div className="flex flex-col px-3 py-2 gap-2">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search orders…"
            className="pl-8 h-8 text-xs rounded-md"
          />
        </div>

        {/* Date range */}
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-8 text-[11px] px-2 flex-1 rounded-md"
            aria-label="From date"
          />
          <span className="text-[10px] text-muted-foreground">to</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-8 text-[11px] px-2 flex-1 rounded-md"
            aria-label="To date"
          />
        </div>

        {/* Cards — single column for a clean row layout */}
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">No orders match</p>
        ) : (
          <div className="flex flex-col gap-1.5 max-h-[280px] overflow-y-auto overscroll-contain pr-1">
            {filtered.map((o) => {
              const typeKey = (o.type ?? 'order').toLowerCase()
              const t = TYPE_STYLE[typeKey] ?? { label: typeKey || 'Order', cls: 'text-foreground bg-muted border-border' }
              const charged   = o.total_amount ?? 0
              const paid      = o.paid_amount ?? 0
              const owed      = Math.max(0, charged - paid)
              const owedColor = owed > 0 ? 'text-rose-600' : 'text-emerald-600'

              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setSelectedOrderId(o.id)}
                  className="group flex flex-col gap-1.5 rounded-lg border border-border bg-background p-2.5 text-left hover:border-primary/40 hover:bg-primary/5 transition-colors cursor-pointer"
                >
                  {/* Row 1: type badge + order number + date */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${t.cls} flex-shrink-0`}>
                        {t.label}
                      </span>
                      <span className="font-mono text-[11px] text-foreground truncate">{o.order_id}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">{fmtDate(o.scheduled_date)}</span>
                  </div>

                  {/* Row 2: services link */}
                  <div className="flex items-center gap-1 text-[11px] text-foreground/80 group-hover:text-primary">
                    <span>Services ({o.service_count ?? 0})</span>
                    <ChevronRight className="h-3 w-3" />
                  </div>

                  {/* Row 3: charged + owed */}
                  <div className="flex items-center justify-between gap-2 text-[11px] pt-0.5 border-t border-border/50">
                    <div className="flex flex-col">
                      <span className="text-[9px] uppercase tracking-wide text-muted-foreground">Charged</span>
                      <span className="font-medium text-foreground">{fmtQar(charged)}</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-[9px] uppercase tracking-wide text-muted-foreground">Owed</span>
                      <span className={`font-medium ${owedColor}`}>{fmtQar(owed)}</span>
                    </div>
                  </div>
                </button>
              )
            })}
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
