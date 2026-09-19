'use client'

import { useState } from 'react'
import { HardHat, Milestone } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { DisciplinesManager } from '@/components/master-data/mep/DisciplinesManager'
import { MilestoneCodesManager } from '@/components/master-data/mep/MilestoneCodesManager'

/**
 * Master Data → MEP: Disciplines + Milestone Codes admin, as two tabs.
 * Both managers are self-contained (own PageWrapper/PageHeader, mirroring
 * `CustodyLocationsManager`), so this shell stays intentionally thin — just
 * the tab switcher. The route is already gated to managers only
 * (`warehouse.projects.manage` in route-permissions.ts), so unlike the
 * Warehouses page there's no broader view-only audience to filter tabs for.
 *
 * The margin scale on TabsList mirrors PageContainer's own horizontal/top
 * padding (px-3 sm:px-4 lg:px-6 2xl:px-10, py-3 sm:py-4 lg:py-6) so the tab
 * strip lines up with whichever manager's content is showing beneath it.
 */
export default function MepMasterDataPage() {
  const [activeTab, setActiveTab] = useState('disciplines')

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList className="self-start mx-3 mt-3 sm:mx-4 sm:mt-4 lg:mx-6 lg:mt-6 2xl:mx-10">
        <TabsTrigger value="disciplines" className="gap-1.5">
          <HardHat className="h-3.5 w-3.5" /> Disciplines
        </TabsTrigger>
        <TabsTrigger value="milestone-codes" className="gap-1.5">
          <Milestone className="h-3.5 w-3.5" /> Milestone Codes
        </TabsTrigger>
      </TabsList>

      <TabsContent value="disciplines" className="mt-0">
        <DisciplinesManager />
      </TabsContent>
      <TabsContent value="milestone-codes" className="mt-0">
        <MilestoneCodesManager />
      </TabsContent>
    </Tabs>
  )
}
