'use client'

import { Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import {
  ClipboardList, ClipboardCheck, ArrowRightLeft,
  WarehouseIcon, Layers, Activity, Truck,
} from 'lucide-react'
import { useWarehouses } from '@/hooks/useWarehouses'
import { useWarehouseTransfers, useReceivalsAndDeliveries } from '@/hooks/useWarehouseOperations'
import { useCurrentUserProfile } from '@/hooks/useProfiles'
// Tab components (will exist after later tasks):
import { WhWarehousesTab } from '@/components/purchase/wh/WhWarehousesTab'
import { WhStockOverviewTab } from '@/components/purchase/wh/WhStockOverviewTab'
import { WhTransfersTab } from '@/components/purchase/wh/WhTransfersTab'
import { WhAdjustmentsTab } from '@/components/purchase/wh/WhAdjustmentsTab'
import { WhInventoryChecksTab } from '@/components/purchase/wh/WhInventoryChecksTab'
import { WhMovementsTab } from '@/components/purchase/wh/WhMovementsTab'
import { ReceivalsDeliveriesTab } from '@/components/purchase/wh/ReceivalsDeliveriesTab'
import { WhAdjustmentDialog } from '@/components/purchase/wh/WhAdjustmentDialog'
import { WhInventoryCheckDialog } from '@/components/purchase/wh/WhInventoryCheckDialog'
import { WhTransferDialog } from '@/components/purchase/wh/WhTransferDialog'

function WarehousesPageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const activeTab = searchParams.get('tab') ?? 'warehouses'
  const setActiveTab = (val: string) =>
    router.replace(`/purchase/warehouses?tab=${val}`, { scroll: false })

  const { data: warehouses = [] } = useWarehouses()
  const { data: currentProfile } = useCurrentUserProfile()
  const { data: transfers = [] } = useWarehouseTransfers()
  const { data: receivalsDeliveries = [] } = useReceivalsAndDeliveries()

  const pendingTransferCount = transfers.filter(t => t.status === 'pending_approval').length
  const pendingReceivalCount = receivalsDeliveries.filter(
    r => r.direction === 'inbound' && r.status === 'pending_approval'
  ).length

  return (
    <div className="flex flex-col h-full">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-background flex items-start justify-between gap-2 px-4 md:px-6 py-4 border-b border-border">
        <div>
          <h1 className="text-lg font-semibold">Warehouses</h1>
          <p className="text-xs text-muted-foreground">
            Stock overview, transfers, adjustments &amp; movements
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <WhAdjustmentDialog warehouses={warehouses} currentProfile={currentProfile}>
            <Button size="sm" variant="outline" className="gap-1.5">
              <ClipboardList className="h-3.5 w-3.5" />
              Stock Adjustment
            </Button>
          </WhAdjustmentDialog>
          <WhInventoryCheckDialog warehouses={warehouses}>
            <Button size="sm" variant="outline" className="gap-1.5">
              <ClipboardCheck className="h-3.5 w-3.5" />
              Inventory Check
            </Button>
          </WhInventoryCheckDialog>
          <WhTransferDialog warehouses={warehouses} currentProfile={currentProfile}>
            <Button size="sm" variant="outline" className="gap-1.5">
              <ArrowRightLeft className="h-3.5 w-3.5" />
              Transfer Stock
            </Button>
          </WhTransferDialog>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
        <TabsList className="h-8 overflow-x-auto whitespace-nowrap px-4 md:px-6 border-b rounded-none justify-start bg-background flex-shrink-0">
          <TabsTrigger value="warehouses" className="text-xs gap-1">
            <WarehouseIcon className="h-3 w-3" />
            Warehouses
          </TabsTrigger>
          <TabsTrigger value="stock" className="text-xs gap-1">
            <Layers className="h-3 w-3" />
            Stock Overview
          </TabsTrigger>
          <TabsTrigger value="transfers" className="text-xs gap-1">
            <ArrowRightLeft className="h-3 w-3" />
            Transfers
            {pendingTransferCount > 0 && (
              <span className="ml-1 h-4 px-1 text-[9px] bg-warning/20 text-warning rounded inline-flex items-center">
                {pendingTransferCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="adjustments" className="text-xs gap-1">
            <ClipboardList className="h-3 w-3" />
            Adjustments
          </TabsTrigger>
          <TabsTrigger value="checks" className="text-xs gap-1">
            <ClipboardCheck className="h-3 w-3" />
            Inv. Checks
          </TabsTrigger>
          <TabsTrigger value="movements" className="text-xs gap-1">
            <Activity className="h-3 w-3" />
            Movements
          </TabsTrigger>
          <TabsTrigger value="receivals" className="text-xs gap-1">
            <Truck className="h-3 w-3" />
            Receivals &amp; Deliveries
            {pendingReceivalCount > 0 && (
              <span className="ml-1 h-4 px-1 text-[9px] bg-warning/20 text-warning rounded inline-flex items-center">
                {pendingReceivalCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-auto">
          <TabsContent value="warehouses" className="mt-0 p-4 md:p-6">
            <WhWarehousesTab warehouses={warehouses} />
          </TabsContent>
          <TabsContent value="stock" className="mt-0">
            <WhStockOverviewTab warehouses={warehouses} />
          </TabsContent>
          <TabsContent value="transfers" className="mt-0">
            <WhTransfersTab warehouses={warehouses} currentProfile={currentProfile} />
          </TabsContent>
          <TabsContent value="adjustments" className="mt-0">
            <WhAdjustmentsTab warehouses={warehouses} currentProfile={currentProfile} />
          </TabsContent>
          <TabsContent value="checks" className="mt-0">
            <WhInventoryChecksTab warehouses={warehouses} currentProfile={currentProfile} />
          </TabsContent>
          <TabsContent value="movements" className="mt-0">
            <WhMovementsTab warehouses={warehouses} />
          </TabsContent>
          <TabsContent value="receivals" className="mt-0">
            <ReceivalsDeliveriesTab warehouses={warehouses} currentProfile={currentProfile} />
          </TabsContent>
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
