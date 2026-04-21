'use client'

import React from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { WarehouseIcon, MapPin, User, Package, DollarSign } from 'lucide-react'
import { Warehouse } from '@/hooks/useWarehouses'

interface Props {
  warehouses: Warehouse[]
}

export const WhWarehousesTab = React.memo(function WhWarehousesTab({ warehouses }: Props) {
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
              <span className="font-medium text-foreground">{(wh as any).manager_name ?? 'Unassigned'}</span>
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
          </CardContent>
        </Card>
      ))}
    </div>
  )
})
