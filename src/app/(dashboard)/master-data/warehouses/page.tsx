'use client'

import { useState, useMemo, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import {
  ClipboardList, ClipboardCheck, ArrowRightLeft,
  WarehouseIcon, Layers, Activity, Truck, TrendingUp,
} from 'lucide-react'
import { useWarehouses } from '@/hooks/useWarehouses'
import { useWarehouseTransfers, useReceivalsAndDeliveries, useStockAdjustments } from '@/hooks/useWarehouseOperations'
import { useCurrentUserProfile } from '@/hooks/useProfiles'
import { usePermissions } from '@/hooks/usePermissions'
import { ResponsivePageHeader } from '@/components/shared/ResponsivePageHeader'
import { WhWarehousesTab } from '@/components/purchase/wh/WhWarehousesTab'
import { WhStockOverviewTab } from '@/components/purchase/wh/WhStockOverviewTab'
import { WhTransfersTab } from '@/components/purchase/wh/WhTransfersTab'
import { WhAdjustmentsTab } from '@/components/purchase/wh/WhAdjustmentsTab'
import { WhInventoryChecksTab } from '@/components/purchase/wh/WhInventoryChecksTab'
import { WhMovementsTab } from '@/components/purchase/wh/WhMovementsTab'
import { WhStockValueTab } from '@/components/purchase/wh/WhStockValueTab'
import { ReceivalsDeliveriesTab } from '@/components/purchase/wh/ReceivalsDeliveriesTab'
import { WhAdjustmentDialog } from '@/components/purchase/wh/WhAdjustmentDialog'
import { WhTransferDialog } from '@/components/purchase/wh/WhTransferDialog'

// Per-tab permission keys. ANY-of semantics: if the user holds any one of
// the listed perms, the tab is shown. No system-admin bypass — every role
// must hold the explicit permission key for the tab to appear.
const TAB_PERMISSIONS: Record<string, string[]> = {
  warehouses:    ['warehouse.warehouses.view', 'warehouse.settings.manage'],
  stock:         ['warehouse.stock.view'],
  transfers:     ['warehouse.transfers.view'],
  adjustments:   ['warehouse.adjustments.view'],
  checks:        ['warehouse.checks.view'],
  'stock-value': ['warehouse.stock_value.view'],
  movements:     ['warehouse.movements.view'],
  receivals:     ['warehouse.receivals.view'],
}

function WarehousesPageInner() {
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') ?? 'warehouses')
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | undefined>(
    searchParams.get('warehouse') ?? undefined,
  )

  function handleViewStock(warehouseId: string) {
    setSelectedWarehouseId(warehouseId)
    setActiveTab('stock')
  }

  // Master data view opts in to virtual warehouses (repair-vendor shadows)
  // so admins can inspect them; operator pickers elsewhere exclude by default.
  const { data: warehouses = [] } = useWarehouses({ includeVirtual: true })
  const { data: currentProfile } = useCurrentUserProfile()
  const { data: transfers = [] } = useWarehouseTransfers()
  const { data: receivalsDeliveries = [] } = useReceivalsAndDeliveries()
  const { data: adjustments = [] } = useStockAdjustments()
  const { data: permData } = usePermissions()

  const visibleTabs = useMemo(() => {
    const userPerms = permData?.permissions ?? []
    const order = ['warehouses', 'stock', 'transfers', 'adjustments', 'checks', 'stock-value', 'movements', 'receivals']
    return new Set(
      order.filter((key) => {
        const required = TAB_PERMISSIONS[key] ?? []
        return required.length === 0 || required.some((p) => userPerms.includes(p))
      })
    )
  }, [permData])

  // If the current activeTab is hidden for this user (e.g. they landed on
  // ?tab=warehouses without master_data perms), fall back to the first one
  // they CAN see.
  useEffect(() => {
    if (visibleTabs.size === 0) return
    if (!visibleTabs.has(activeTab)) {
      setActiveTab(Array.from(visibleTabs)[0])
    }
  }, [visibleTabs, activeTab])

  const pendingTransferCount = transfers.filter(t => t.status === 'pending_approval').length
  const pendingReceivalCount = receivalsDeliveries.filter(
    r => r.direction === 'inbound' && r.status === 'pending_approval'
  ).length
  const pendingAdjustmentCount = adjustments.filter(a => a.status === 'pending_approval').length

  return (
    <div className="flex flex-col h-full">
      <ResponsivePageHeader
        sticky
        title="Warehouses"
        description="Stock overview, transfers, adjustments & movements"
        actions={
          <>
            {activeTab === 'adjustments' && visibleTabs.has('adjustments') && (
              <WhAdjustmentDialog warehouses={warehouses} currentProfile={currentProfile ?? null}>
                <Button size="sm" variant="outline" className="gap-1.5 min-h-11 md:min-h-0">
                  <ClipboardList className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Stock Adjustment</span>
                  <span className="sm:hidden">Adjust</span>
                </Button>
              </WhAdjustmentDialog>
            )}
            {activeTab === 'transfers' && visibleTabs.has('transfers') && (
              <WhTransferDialog warehouses={warehouses} currentProfile={currentProfile ?? null}>
                <Button size="sm" variant="outline" className="gap-1.5 min-h-11 md:min-h-0">
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Transfer Stock</span>
                  <span className="sm:hidden">Transfer</span>
                </Button>
              </WhTransferDialog>
            )}
          </>
        }
      />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
        <TabsList className="h-8 min-h-11 md:min-h-0 max-w-full overflow-x-auto whitespace-nowrap px-4 md:px-6 border-b rounded-none justify-start bg-background flex-shrink-0">
          {visibleTabs.has('warehouses') && (
            <TabsTrigger value="warehouses" className="text-xs gap-1">
              <WarehouseIcon className="h-3 w-3" />
              Warehouses
            </TabsTrigger>
          )}
          {visibleTabs.has('stock') && (
            <TabsTrigger value="stock" className="text-xs gap-1">
              <Layers className="h-3 w-3" />
              Stock Overview
            </TabsTrigger>
          )}
          {visibleTabs.has('transfers') && (
            <TabsTrigger value="transfers" className="text-xs gap-1">
              <ArrowRightLeft className="h-3 w-3" />
              Transfers
              {pendingTransferCount > 0 && (
                <span className="ml-1 h-4 px-1 text-[9px] bg-warning/20 text-warning rounded inline-flex items-center">
                  {pendingTransferCount}
                </span>
              )}
            </TabsTrigger>
          )}
          {visibleTabs.has('adjustments') && (
            <TabsTrigger value="adjustments" className="text-xs gap-1">
              <ClipboardList className="h-3 w-3" />
              Adjustments
              {pendingAdjustmentCount > 0 && (
                <span className="ml-1 h-4 px-1 text-[9px] bg-warning/20 text-warning rounded inline-flex items-center">
                  {pendingAdjustmentCount}
                </span>
              )}
            </TabsTrigger>
          )}
          {visibleTabs.has('checks') && (
            <TabsTrigger value="checks" className="text-xs gap-1">
              <ClipboardCheck className="h-3 w-3" />
              Inv. Checks
            </TabsTrigger>
          )}
          {visibleTabs.has('stock-value') && (
            <TabsTrigger value="stock-value" className="text-xs gap-1">
              <TrendingUp className="h-3 w-3" />
              Stock Value
            </TabsTrigger>
          )}
          {visibleTabs.has('movements') && (
            <TabsTrigger value="movements" className="text-xs gap-1">
              <Activity className="h-3 w-3" />
              Movements
            </TabsTrigger>
          )}
          {visibleTabs.has('receivals') && (
            <TabsTrigger value="receivals" className="text-xs gap-1">
              <Truck className="h-3 w-3" />
              Receivals &amp; Deliveries
              {pendingReceivalCount > 0 && (
                <span className="ml-1 h-4 px-1 text-[9px] bg-warning/20 text-warning rounded inline-flex items-center">
                  {pendingReceivalCount}
                </span>
              )}
            </TabsTrigger>
          )}
        </TabsList>

        <div className="flex-1 overflow-auto">
          {visibleTabs.has('warehouses') && (
            <TabsContent value="warehouses" className="mt-0 p-4 md:p-6">
              <WhWarehousesTab warehouses={warehouses} onViewStock={handleViewStock} />
            </TabsContent>
          )}
          {visibleTabs.has('stock') && (
            <TabsContent value="stock" className="mt-0">
              <WhStockOverviewTab warehouses={warehouses} initialWarehouseId={selectedWarehouseId} />
            </TabsContent>
          )}
          {visibleTabs.has('transfers') && (
            <TabsContent value="transfers" className="mt-0">
              <WhTransfersTab warehouses={warehouses} currentProfile={currentProfile ?? null} />
            </TabsContent>
          )}
          {visibleTabs.has('adjustments') && (
            <TabsContent value="adjustments" className="mt-0">
              <WhAdjustmentsTab warehouses={warehouses} currentProfile={currentProfile ?? null} />
            </TabsContent>
          )}
          {visibleTabs.has('checks') && (
            <TabsContent value="checks" className="mt-0">
              <WhInventoryChecksTab warehouses={warehouses} currentProfile={currentProfile ?? null} />
            </TabsContent>
          )}
          {visibleTabs.has('stock-value') && (
            <TabsContent value="stock-value" className="mt-0">
              <WhStockValueTab warehouses={warehouses} />
            </TabsContent>
          )}
          {visibleTabs.has('movements') && (
            <TabsContent value="movements" className="mt-0">
              <WhMovementsTab warehouses={warehouses} />
            </TabsContent>
          )}
          {visibleTabs.has('receivals') && (
            <TabsContent value="receivals" className="mt-0">
              <ReceivalsDeliveriesTab warehouses={warehouses} currentProfile={currentProfile ?? null} />
            </TabsContent>
          )}
        </div>
      </Tabs>
    </div>
  )
}

export default function WarehousesPage() {
  return (
    <Suspense fallback={null}>
      <WarehousesPageInner />
    </Suspense>
  )
}
