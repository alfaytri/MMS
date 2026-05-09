// src/app/(dashboard)/orders/page.tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Filter } from 'lucide-react'
import { OrderCard } from '@/components/orders/OrderCard'
import { useOrders } from '@/hooks/useOrders'
import type { OrdersFilter } from '@/types/orders'
import { cn } from '@/lib/utils'

const CHIPS = [
  { key: 'scheduled',         label: 'Scheduled' },
  { key: 'pending_approval',  label: 'Pending Approval' },
  { key: 'no_confirmation',   label: 'No Confirmation' },
  { key: 'no_address',        label: 'No Address' },
  { key: 'past_due_no_invoice', label: 'Past Due · No Invoice' },
]

export default function OrdersPage() {
  const router = useRouter()
  const [filter, setFilter] = useState<OrdersFilter>({})
  const [activeChip, setActiveChip] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)

  const { data: orders = [], isLoading } = useOrders(filter)

  function handleChip(key: string) {
    const next = activeChip === key ? null : key
    setActiveChip(next)
    setFilter((f) => ({ ...f, statusChip: next ?? undefined }))
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">Orders</h1>
          <Button className="gap-2" onClick={() => router.push('/orders/create')}>
            <Plus className="h-4 w-4" /> New Order
          </Button>
        </div>

        {/* Chips */}
        <div className="mt-3 flex flex-wrap gap-2">
          {CHIPS.map((chip) => (
            <button
              key={chip.key}
              onClick={() => handleChip(chip.key)}
              className={cn(
                'rounded-full border px-3 py-1 text-sm font-medium transition-colors',
                activeChip === chip.key
                  ? 'border-orange-500 bg-orange-500 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              )}
            >
              {chip.label}
            </button>
          ))}
          <button
            onClick={() => setShowFilters((v) => !v)}
            className="ml-auto flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-sm text-slate-600 hover:border-slate-300"
          >
            <Filter className="h-3.5 w-3.5" /> Filter
          </button>
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            <Input placeholder="Order number" className="h-8 text-sm" onChange={(e) => setFilter((f) => ({ ...f, orderNumber: e.target.value || undefined }))} />
            <Input type="date" className="h-8 text-sm" onChange={(e) => setFilter((f) => ({ ...f, visitDateFrom: e.target.value || undefined }))} />
            <Input type="date" className="h-8 text-sm" onChange={(e) => setFilter((f) => ({ ...f, visitDateTo: e.target.value || undefined }))} />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <p className="text-center text-sm text-slate-400 py-8">Loading orders…</p>
        ) : orders.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-8">No orders found</p>
        ) : (
          <div className="space-y-2 max-w-4xl mx-auto">
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} onClick={() => setSelectedOrderId(order.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
