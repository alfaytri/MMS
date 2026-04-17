'use client'

import { useState } from 'react'
import { useWarehouses } from '@/hooks/useWarehouses'
import { useStockMovements } from '@/hooks/useWarehouseOperations'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'

const MOVEMENT_CONFIG: Record<string, { label: string; colorClass: string }> = {
  purchase_receival: { label: 'Purchase Receival', colorClass: 'text-success' },
  sale_delivery:     { label: 'Sale Delivery',     colorClass: 'text-destructive' },
  transfer_in:       { label: 'Transfer In',        colorClass: 'text-success' },
  transfer_out:      { label: 'Transfer Out',       colorClass: 'text-destructive' },
  adjustment:        { label: 'Adjustment',         colorClass: 'text-orange-500' },
  return:            { label: 'Return',             colorClass: 'text-blue-500' },
  sale_return:       { label: 'Sale Return',        colorClass: 'text-blue-500' },
}

export function WhMovementsTab() {
  const [warehouseId, setWarehouseId] = useState('')
  const { data: warehouses } = useWarehouses()
  const { data: movements, isLoading } = useStockMovements({ warehouseId: warehouseId || undefined, limit: 200 })

  const fmtDt = (ts: string) => new Date(ts).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })

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
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : (movements ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No movements found</p>
      ) : (
        <div className="space-y-1">
          {(movements ?? []).map((m) => {
            const cfg = MOVEMENT_CONFIG[m.movement_type] ?? { label: m.movement_type, colorClass: '' }
            return (
              <div key={m.id} className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{m.item_name}</div>
                  {m.sku && <div className="text-xs text-muted-foreground">{m.sku}</div>}
                </div>
                <Badge variant="outline" className={cn('text-xs shrink-0', cfg.colorClass)}>
                  {cfg.label}
                </Badge>
                <span className={cn('font-semibold shrink-0 tabular-nums', m.qty > 0 ? 'text-success' : 'text-destructive')}>
                  {m.qty > 0 ? '+' : ''}{m.qty}
                </span>
                {m.unit_cost > 0 && (
                  <span className="text-xs text-muted-foreground hidden md:block shrink-0">
                    @ {formatCurrency(m.unit_cost, 'QAR')}
                  </span>
                )}
                <span className="text-xs text-muted-foreground hidden sm:block shrink-0">
                  {fmtDt(m.created_at)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
