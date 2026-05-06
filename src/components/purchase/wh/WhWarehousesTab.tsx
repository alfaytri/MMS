'use client'

import React, { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { WarehouseIcon, MapPin, User, Package, DollarSign, ArrowRight } from 'lucide-react'
import { Warehouse } from '@/hooks/useWarehouses'

interface Props {
  warehouses: Warehouse[]
}

const SEGMENT_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500',
  'bg-violet-500', 'bg-cyan-500', 'bg-orange-500', 'bg-teal-500',
  'bg-indigo-500', 'bg-pink-500', 'bg-lime-500', 'bg-sky-500',
]

export const WhWarehousesTab = React.memo(function WhWarehousesTab({ warehouses }: Props) {
  const router = useRouter()

  const totalValue = useMemo(
    () => warehouses.reduce((sum, wh) => sum + (wh.total_value ?? 0), 0),
    [warehouses],
  )

  function viewStock(warehouseId: string) {
    router.replace(`/purchase/warehouses?tab=stock&warehouse=${warehouseId}`, { scroll: false })
  }

  if (warehouses.length === 0) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-xs text-muted-foreground text-center">
          No warehouses configured. Add warehouses in Admin Settings.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Warehouse cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {warehouses.map((wh) => (
          <Card key={wh.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <WarehouseIcon className="h-4 w-4 text-primary" />
                {wh.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3 flex-shrink-0" />
                {wh.location ?? 'No location set'}
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <User className="h-3 w-3 flex-shrink-0" />
                <span className="text-muted-foreground">Manager:</span>
                <span className="font-medium text-foreground">{wh.manager_name ?? 'Unassigned'}</span>
              </div>
              <div className="pt-2 border-t flex justify-between items-center">
                <div className="flex items-center gap-1 text-xs">
                  <Package className="h-3.5 w-3.5 text-primary" />
                  {(wh.item_count ?? 0).toLocaleString()} items
                </div>
                <div className="flex items-center gap-1 text-xs">
                  <DollarSign className="h-3.5 w-3.5 text-success" />
                  QR {(wh.total_value ?? 0).toLocaleString()}
                </div>
              </div>
              <div className="pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs w-full justify-end gap-1 text-muted-foreground hover:text-foreground"
                  onClick={() => viewStock(wh.id)}
                >
                  View Stock
                  <ArrowRight className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Value comparison bar ── */}
      {warehouses.length > 1 && totalValue > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Stock Value by Warehouse</p>
          <TooltipProvider delayDuration={200}>
            <div className="flex h-8 rounded-md overflow-hidden border border-border">
              {warehouses
                .filter((wh) => (wh.total_value ?? 0) > 0)
                .map((wh, idx) => {
                  const pct = totalValue > 0 ? ((wh.total_value ?? 0) / totalValue) * 100 : 0
                  const color = SEGMENT_COLORS[idx % SEGMENT_COLORS.length]
                  return (
                    <Tooltip key={wh.id}>
                      <TooltipTrigger asChild>
                        <button
                          className={`${color} h-full flex items-center justify-center cursor-pointer hover:brightness-110 transition-all overflow-hidden`}
                          style={{ width: `${pct}%`, minWidth: pct > 0 ? '2px' : '0' }}
                          onClick={() => viewStock(wh.id)}
                          aria-label={`View ${wh.name} stock`}
                        >
                          {pct > 8 && (
                            <span className="text-[10px] font-medium text-white px-1 truncate">
                              {wh.name}
                            </span>
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">
                        <p className="font-medium">{wh.name}</p>
                        <p>QR {(wh.total_value ?? 0).toLocaleString()} · {(wh.item_count ?? 0).toLocaleString()} items</p>
                      </TooltipContent>
                    </Tooltip>
                  )
                })}
            </div>
          </TooltipProvider>
          <div className="flex flex-wrap gap-3">
            {warehouses
              .filter((wh) => (wh.total_value ?? 0) > 0)
              .map((wh, idx) => (
                <div key={wh.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={`w-2.5 h-2.5 rounded-sm inline-block ${SEGMENT_COLORS[idx % SEGMENT_COLORS.length]}`} />
                  {wh.name}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  )
})
