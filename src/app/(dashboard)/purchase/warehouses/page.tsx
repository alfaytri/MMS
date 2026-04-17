'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/shared/PageHeader'
import { WhWarehousesTab } from '@/components/purchase/wh/WhWarehousesTab'
import { WhStockOverviewTab } from '@/components/purchase/wh/WhStockOverviewTab'
import { WhMovementsTab } from '@/components/purchase/wh/WhMovementsTab'
import { WhTransfersTab } from '@/components/purchase/wh/WhTransfersTab'
import { WhReceivalsTab } from '@/components/purchase/wh/WhReceivalsTab'
import { WhAdjustmentsTab } from '@/components/purchase/wh/WhAdjustmentsTab'
import { WhInventoryChecksTab } from '@/components/purchase/wh/WhInventoryChecksTab'

export default function WarehousesHubPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Warehouses"
        description="Stock overview, movements, transfers, receivals, adjustments, and inventory checks"
      />
      <Tabs defaultValue="warehouses">
        <TabsList className="overflow-x-auto w-full justify-start flex-nowrap">
          <TabsTrigger value="warehouses">Warehouses</TabsTrigger>
          <TabsTrigger value="stock">Stock</TabsTrigger>
          <TabsTrigger value="movements">Movements</TabsTrigger>
          <TabsTrigger value="transfers">Transfers</TabsTrigger>
          <TabsTrigger value="receivals">Receivals</TabsTrigger>
          <TabsTrigger value="adjustments">Adjustments</TabsTrigger>
          <TabsTrigger value="checks">Inv. Checks</TabsTrigger>
        </TabsList>
        <TabsContent value="warehouses"><WhWarehousesTab /></TabsContent>
        <TabsContent value="stock"><WhStockOverviewTab /></TabsContent>
        <TabsContent value="movements"><WhMovementsTab /></TabsContent>
        <TabsContent value="transfers"><WhTransfersTab /></TabsContent>
        <TabsContent value="receivals"><WhReceivalsTab /></TabsContent>
        <TabsContent value="adjustments"><WhAdjustmentsTab /></TabsContent>
        <TabsContent value="checks"><WhInventoryChecksTab /></TabsContent>
      </Tabs>
    </div>
  )
}
