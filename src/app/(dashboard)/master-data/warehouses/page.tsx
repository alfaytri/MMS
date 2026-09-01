'use client'

import { useState, useMemo, useEffect, Suspense } from 'react'
import dynamic from 'next/dynamic'
import { useSearchParams } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import {
  ClipboardList, ClipboardCheck, ArrowRightLeft,
  WarehouseIcon, Layers, Activity, Truck, TrendingUp, PackageSearch, FolderKanban, Loader2,
} from 'lucide-react'
import { useWarehouses } from '@/hooks/useWarehouses'
import { useReceivalsAndDeliveries, useStockAdjustments } from '@/hooks/useWarehouseOperations'
import { useCurrentUserProfile } from '@/hooks/useProfiles'
import { usePermissions } from '@/hooks/usePermissions'
import { ResponsivePageHeader } from '@/components/shared/ResponsivePageHeader'
// Only the default tab (Warehouses) loads up-front; every other tab + the two
// action dialogs are code-split via next/dynamic, so their JS downloads on
// first use instead of inflating this route's first load.
import { WhWarehousesTab } from '@/components/purchase/wh/WhWarehousesTab'

const tabFallback = () => (
  <div className="flex items-center justify-center py-16 text-muted-foreground">
    <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading" />
  </div>
)
const WhStockOverviewTab = dynamic(() => import('@/components/purchase/wh/WhStockOverviewTab').then((m) => ({ default: m.WhStockOverviewTab })), { loading: tabFallback })
const WhTransfersTab = dynamic(() => import('@/components/purchase/wh/WhTransfersTab').then((m) => ({ default: m.WhTransfersTab })), { loading: tabFallback })
const WhAdjustmentsTab = dynamic(() => import('@/components/purchase/wh/WhAdjustmentsTab').then((m) => ({ default: m.WhAdjustmentsTab })), { loading: tabFallback })
const WhInventoryChecksTab = dynamic(() => import('@/components/purchase/wh/WhInventoryChecksTab').then((m) => ({ default: m.WhInventoryChecksTab })), { loading: tabFallback })
const WhMovementsTab = dynamic(() => import('@/components/purchase/wh/WhMovementsTab').then((m) => ({ default: m.WhMovementsTab })), { loading: tabFallback })
const WhStockValueTab = dynamic(() => import('@/components/purchase/wh/WhStockValueTab').then((m) => ({ default: m.WhStockValueTab })), { loading: tabFallback })
const ReceivalsDeliveriesTab = dynamic(() => import('@/components/purchase/wh/ReceivalsDeliveriesTab').then((m) => ({ default: m.ReceivalsDeliveriesTab })), { loading: tabFallback })
const WhItemRequestsTab = dynamic(() => import('@/components/purchase/wh/WhItemRequestsTab').then((m) => ({ default: m.WhItemRequestsTab })), { loading: tabFallback })
const ProjectsTab = dynamic(() => import('@/components/warehouse/projects/ProjectsTab').then((m) => ({ default: m.ProjectsTab })), { loading: tabFallback })
const WhAdjustmentDialog = dynamic(() => import('@/components/purchase/wh/WhAdjustmentDialog').then((m) => ({ default: m.WhAdjustmentDialog })))
const WhTransferDialog = dynamic(() => import('@/components/purchase/wh/WhTransferDialog').then((m) => ({ default: m.WhTransferDialog })))

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
  'item-requests': ['warehouse.item_requests.view'],
  projects:      ['warehouse.projects.view'],
}

function WarehousesPageInner() {
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') ?? 'warehouses')
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | undefined>(
    searchParams.get('warehouse') ?? undefined,
  )
  const [selectedSubContainerId, setSelectedSubContainerId] = useState<string | null>(
    searchParams.get('sub_container') ?? null,
  )

  function handleViewStock(warehouseId: string, subContainerId?: string | null) {
    setSelectedWarehouseId(warehouseId)
    setSelectedSubContainerId(subContainerId ?? null)
    setActiveTab('stock')
  }

  // Fetch ALL warehouses (including repair-vendor virtual shadows) at the page
  // level, then split per tab policy (D.6.a):
  //   - warehousesStandard (no virtual) → Warehouses card grid, Stock Overview,
  //     Stock Value, new-adjustment picker, new-transfer picker. Repair
  //     vendors have their own send/return flow; they must not appear in
  //     general stock/pick surfaces.
  //   - warehousesAll → Transfers / Adjustments / Inv Checks / Movements /
  //     Receivals & Deliveries list views. Operators still need to see
  //     historical repair activity in ledger views.
  // Show real warehouses + Repair, but hide Teams / Places — those have
  // their own admin pages under Master Data.
  // Show ALL warehouses (real + virtual: Repair, Teams, Places) so the
  // consolidated Master Data → Warehouses admin surface can manage every
  // sub-container in one place. Callers that need real-only warehouses
  // (transfer picker, delivery picker, etc.) filter locally.
  const { data: warehousesAll = [] } = useWarehouses({ includeVirtual: true })
  const warehouses = useMemo(
    () => warehousesAll.filter((w) => !w.is_virtual),
    [warehousesAll],
  )
  // Transfers can move stock between any two sub-containers, including custody
  // discipline buckets (VWh Projects). Offer real warehouses + custody, but not
  // repair-vendor virtual shadows.
  const transferWarehouses = useMemo(
    () => warehousesAll.filter((w) => !w.is_virtual || w.warehouse_kind === 'custody'),
    [warehousesAll],
  )
  const { data: currentProfile } = useCurrentUserProfile()
  const { data: receivalsDeliveries = [] } = useReceivalsAndDeliveries()
  const { data: adjustments = [] } = useStockAdjustments()
  const { data: permData } = usePermissions()

  const visibleTabs = useMemo(() => {
    const userPerms = permData?.permissions ?? []
    const order = ['warehouses', 'stock', 'transfers', 'adjustments', 'checks', 'stock-value', 'movements', 'receivals', 'item-requests', 'projects']
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
              <WhTransferDialog warehouses={transferWarehouses} currentProfile={currentProfile ?? null}>
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
          {visibleTabs.has('item-requests') && (
            <TabsTrigger value="item-requests" className="text-xs gap-1">
              <PackageSearch className="h-3 w-3" />
              Requested Items
            </TabsTrigger>
          )}
          {visibleTabs.has('projects') && (
            <TabsTrigger value="projects" className="text-xs gap-1">
              <FolderKanban className="h-3 w-3" />
              Projects
            </TabsTrigger>
          )}
        </TabsList>

        {/* key={activeTab} remounts on every tab switch so the entrance
            animation replays (Base UI already unmounts inactive panels). */}
        <div key={activeTab} className="flex-1 overflow-auto animate-in fade-in-0 slide-in-from-top-1 duration-200 ease-out-quint">
          {visibleTabs.has('warehouses') && (
            <TabsContent value="warehouses" className="mt-0 p-4 md:p-6">
              <WhWarehousesTab warehouses={warehousesAll} onViewStock={handleViewStock} />
            </TabsContent>
          )}
          {visibleTabs.has('stock') && (
            <TabsContent value="stock" className="mt-0">
              <WhStockOverviewTab warehouses={warehouses} initialWarehouseId={selectedWarehouseId} initialSubContainerId={selectedSubContainerId} />
            </TabsContent>
          )}
          {visibleTabs.has('transfers') && (
            <TabsContent value="transfers" className="mt-0">
              <WhTransfersTab warehouses={warehousesAll} currentProfile={currentProfile ?? null} />
            </TabsContent>
          )}
          {visibleTabs.has('adjustments') && (
            <TabsContent value="adjustments" className="mt-0">
              <WhAdjustmentsTab warehouses={warehousesAll} currentProfile={currentProfile ?? null} />
            </TabsContent>
          )}
          {visibleTabs.has('checks') && (
            <TabsContent value="checks" className="mt-0">
              <WhInventoryChecksTab warehouses={warehousesAll} currentProfile={currentProfile ?? null} />
            </TabsContent>
          )}
          {visibleTabs.has('stock-value') && (
            <TabsContent value="stock-value" className="mt-0">
              <WhStockValueTab warehouses={warehouses} />
            </TabsContent>
          )}
          {visibleTabs.has('movements') && (
            <TabsContent value="movements" className="mt-0">
              <WhMovementsTab warehouses={warehousesAll} />
            </TabsContent>
          )}
          {visibleTabs.has('receivals') && (
            <TabsContent value="receivals" className="mt-0">
              <ReceivalsDeliveriesTab warehouses={warehousesAll} currentProfile={currentProfile ?? null} />
            </TabsContent>
          )}
          {visibleTabs.has('item-requests') && (
            <TabsContent value="item-requests" className="mt-0">
              <WhItemRequestsTab warehouses={warehousesAll} />
            </TabsContent>
          )}
          {visibleTabs.has('projects') && (
            <TabsContent value="projects" className="mt-0">
              <ProjectsTab />
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
