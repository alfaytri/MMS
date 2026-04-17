'use client'

import { useWarehouses } from '@/hooks/useWarehouses'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'

const TYPE_CONFIG: Record<string, { label: string; className: string }> = {
  central:      { label: 'Central',  className: 'border-blue-500 text-blue-500' },
  local:        { label: 'Local',    className: 'border-orange-500 text-orange-500' },
  team_vehicle: { label: 'Vehicle',  className: 'border-success text-success' },
}

export function WhWarehousesTab() {
  const { data: warehouses, isLoading } = useWarehouses()

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-lg" />)}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
      {(warehouses ?? []).map((wh: any) => {
        const cfg = TYPE_CONFIG[wh.warehouse_type] ?? { label: wh.warehouse_type, className: '' }
        return (
          <div key={wh.id} className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">{wh.name}</h3>
              <Badge variant="outline" className={cn('text-xs', cfg.className)}>{cfg.label}</Badge>
            </div>
            {wh.location && <p className="text-xs text-muted-foreground">{wh.location}</p>}
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="text-muted-foreground text-xs">Items</div>
                <div className="font-medium">{wh.item_count ?? 0}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Value (QAR)</div>
                <div className="font-medium">{formatCurrency(wh.total_value ?? 0, 'QAR')}</div>
              </div>
            </div>
          </div>
        )
      })}
      {(warehouses ?? []).length === 0 && (
        <div className="col-span-full text-center text-muted-foreground text-sm py-8">No warehouses found</div>
      )}
    </div>
  )
}
