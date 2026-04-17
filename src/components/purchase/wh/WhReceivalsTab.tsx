'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useWarehouses } from '@/hooks/useWarehouses'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/lib/utils/formatters'

function useAllReceivalsHub(warehouseId?: string) {
  return useQuery({
    queryKey: ['receivals_hub', { warehouseId }],
    queryFn: async () => {
      const supabase = createClient()
      let q = (supabase as any)
        .from('receivals')
        .select('*, purchase_orders(po_number, supplier_name), receival_items(item_name, qty_received, sku)')
        .order('created_at', { ascending: false })
        .limit(200)
      if (warehouseId) q = q.eq('warehouse_id', warehouseId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as any[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function WhReceivalsTab() {
  const [warehouseId, setWarehouseId] = useState('')
  const { data: warehouses } = useWarehouses()
  const { data: receivals, isLoading } = useAllReceivalsHub(warehouseId || undefined)

  return (
    <div className="space-y-4 pt-4">
      <select
        value={warehouseId}
        onChange={(e) => setWarehouseId(e.target.value)}
        className="h-9 rounded-md border border-input bg-background px-3 text-sm w-full sm:w-56"
      >
        <option value="">All warehouses</option>
        {(warehouses ?? []).map((w: any) => (
          <option key={w.id} value={w.id}>{w.name}</option>
        ))}
      </select>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
        </div>
      ) : (receivals ?? []).length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
          No receivals found
        </div>
      ) : (
        <div className="space-y-3">
          {(receivals ?? []).map((r) => (
            <div key={r.id} className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-semibold text-sm">{r.receival_number}</span>
                <Badge variant="outline" className="text-xs">{r.status}</Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                {formatDate(r.date)}
                {r.purchase_orders?.po_number && ` · PO: ${r.purchase_orders.po_number}`}
                {r.purchase_orders?.supplier_name && ` · ${r.purchase_orders.supplier_name}`}
              </div>
              {r.receival_items && r.receival_items.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  {r.receival_items.length} item(s): {(r.receival_items as any[]).slice(0, 3).map((i: any) => i.item_name).join(', ')}
                  {r.receival_items.length > 3 ? `… +${r.receival_items.length - 3} more` : ''}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
