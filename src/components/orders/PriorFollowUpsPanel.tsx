'use client'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

interface Row {
  id: string
  order_id: string
  scheduled_date: string | null
  status: string
  total_amount: number | null
  service_count: number
}

interface SbRow {
  id: string
  order_id: string
  scheduled_date: string | null
  status: string
  total_amount: number | null
  order_services: Array<{ count: number }> | null
}

export function PriorFollowUpsPanel({ parentOrderId }: { parentOrderId: string }) {
  const { data = [] } = useQuery<Row[]>({
    queryKey: ['prior-follow-ups', parentOrderId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_id, scheduled_date, status, total_amount, order_services(count)')
        .eq('parent_order_id', parentOrderId)
        .order('scheduled_date', { ascending: false })
        .limit(20)
      if (error) throw error
      const rows = (data ?? []) as unknown as SbRow[]
      return rows.map((r) => ({
        id: r.id,
        order_id: r.order_id,
        scheduled_date: r.scheduled_date,
        status: r.status,
        total_amount: r.total_amount,
        service_count: r.order_services?.[0]?.count ?? 0,
      }))
    },
  })

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-center text-xs text-muted-foreground">
        No prior follow-ups on this order.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prior follow-ups</p>
      {data.map((r) => (
        <div key={r.id} className="rounded-lg border bg-card p-2 text-xs">
          <p className="font-medium">{r.order_id}</p>
          <p className="text-muted-foreground">{r.scheduled_date ?? '—'} · {r.status} · {r.service_count} svc · {r.total_amount ?? 0} QAR</p>
        </div>
      ))}
    </div>
  )
}
