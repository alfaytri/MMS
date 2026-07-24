'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type AgingBucket = 'current' | '1_30' | '31_60' | '61_90' | 'over_90' | 'total'

export type AgingBillRow = {
  id: string
  bill_number: string
  purchase_order_id: string | null
  po_number: string | null
  issued_date: string
  due_date: string
  total_amount: number
  paid_amount: number
  outstanding: number
  days_overdue: number
  payment_status: string
}

function bucketFilter(bucket: AgingBucket): { gte?: string; lt?: string } | null {
  const today = new Date()
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  const sub = (days: number) => {
    const d = new Date(today)
    d.setDate(d.getDate() - days)
    return d
  }

  switch (bucket) {
    case 'current':  return { gte: fmt(today) }
    case '1_30':     return { gte: fmt(sub(30)), lt: fmt(today) }
    case '31_60':    return { gte: fmt(sub(60)), lt: fmt(sub(30)) }
    case '61_90':    return { gte: fmt(sub(90)), lt: fmt(sub(60)) }
    case 'over_90':  return { lt: fmt(sub(90)) }
    case 'total':    return null
  }
}

export function useAgingDrillDown(
  supplierId: string | null,
  bucket: AgingBucket | null,
) {
  return useQuery({
    queryKey: ['aging-drill-down', supplierId, bucket],
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase
        .from('bills')
        .select('id, bill_number, purchase_order_id, issued_date, due_date, total_amount, paid_amount, payment_status')
        .eq('supplier_id', supplierId!)
        .neq('payment_status', 'paid')
        .order('due_date', { ascending: true })
        .limit(100)

      const range = bucket ? bucketFilter(bucket) : null
      if (range) {
        if (range.gte) q = q.gte('due_date', range.gte)
        if (range.lt)  q = q.lt('due_date', range.lt)
      }

      const { data: bills, error } = await q
      if (error) throw error

      const today = new Date()
      const todayMs = today.getTime()

      const poIds = (bills ?? [])
        .map((b) => b.purchase_order_id)
        .filter((id): id is string => !!id)
      const uniquePoIds = [...new Set(poIds)]

      let poMap = new Map<string, string>()
      if (uniquePoIds.length > 0) {
        const { data: pos } = await supabase
          .from('purchase_orders')
          .select('id, po_number')
          .in('id', uniquePoIds)
        if (pos) {
          poMap = new Map(pos.map((p) => [p.id, p.po_number]))
        }
      }

      return (bills ?? [])
        .filter((b) => (b.total_amount ?? 0) - (b.paid_amount ?? 0) > 0)
        .map((b): AgingBillRow => {
          const outstanding = (b.total_amount ?? 0) - (b.paid_amount ?? 0)
          const dueMs = new Date(b.due_date).getTime()
          const daysOverdue = Math.max(0, Math.floor((todayMs - dueMs) / 86400000))
          return {
            id: b.id,
            bill_number: b.bill_number,
            purchase_order_id: b.purchase_order_id,
            po_number: b.purchase_order_id ? (poMap.get(b.purchase_order_id) ?? null) : null,
            issued_date: b.issued_date,
            due_date: b.due_date,
            total_amount: b.total_amount ?? 0,
            paid_amount: b.paid_amount ?? 0,
            outstanding,
            days_overdue: daysOverdue,
            payment_status: b.payment_status,
          }
        })
    },
    enabled: !!supplierId && bucket !== null,
    staleTime: 2 * 60 * 1000,
  })
}
