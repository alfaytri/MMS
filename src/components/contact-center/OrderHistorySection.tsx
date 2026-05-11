'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'

interface OrderRow {
  id: string
  order_id: string
  status: string
  scheduled_date: string | null
  services_summary: string
  has_invoice: boolean
}

export function OrderHistorySection({ customerId }: { customerId: string | null }) {
  const supabase = createClient()

  const { data: orders = [], isLoading } = useQuery<OrderRow[]>({
    queryKey: ['cc-order-history', customerId],
    queryFn: async () => {
      if (!customerId) return []
      const { data, error } = await (supabase as any)
        .from('orders')
        .select('id, order_id, status, scheduled_date, services_summary, has_invoice')
        .eq('service_customer_id', customerId)
        .order('scheduled_date', { ascending: false, nullsFirst: false })
        .limit(20)
      if (error) throw error
      return data ?? []
    },
    enabled: !!customerId,
  })

  if (isLoading) return <p className="text-xs text-muted-foreground px-3 py-2">Loading…</p>
  if (orders.length === 0) return <p className="text-xs text-muted-foreground px-3 py-2">No orders found</p>

  const statusColor: Record<string, string> = {
    completed:  'text-emerald-600 border-emerald-300',
    cancelled:  'text-rose-600 border-rose-300',
    scheduled:  'text-blue-600 border-blue-300',
    confirmed:  'text-blue-600 border-blue-300',
    'in-progress': 'text-amber-600 border-amber-300',
  }

  return (
    <div className="flex flex-col gap-1.5 px-3 py-2">
      {orders.map((o) => (
        <div key={o.id} className="flex items-start justify-between gap-2 rounded-md border border-border p-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-mono text-muted-foreground">{o.order_id}</p>
            <p className="text-xs truncate">{o.services_summary}</p>
            {o.scheduled_date && (
              <p className="text-xs text-muted-foreground">{new Date(o.scheduled_date).toLocaleDateString()}</p>
            )}
          </div>
          <Badge
            variant="outline"
            className={`text-xs capitalize flex-shrink-0 ${statusColor[o.status] ?? 'text-muted-foreground'}`}
          >
            {o.status}
          </Badge>
        </div>
      ))}
    </div>
  )
}
