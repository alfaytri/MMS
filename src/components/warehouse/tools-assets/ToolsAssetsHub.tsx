'use client'

import { History, Users2 } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { PageHeader } from '@/components/shared/PageHeader'
import { TeamsTab } from './TeamsTab'
import { HistoryUsageTab } from './HistoryUsageTab'

/**
 * Operations → Tools & Assets. Team-centric lifecycle hub for serialized tool
 * units: assign to teams, move between same-division teams, and track custody
 * history (usage-days). Phase 1 — Assign & Track. (Monthly checks + repair +
 * scrap → P&L land in Phase 2.)
 */
export function ToolsAssetsHub() {
  return (
    <PageWrapper>
      <PageHeader
        title="Tools & Assets"
        description="Assign serialized tools and assets to teams, move them between teams in the same division, and track how long each tool has been held."
      />
      <Tabs defaultValue="teams" className="flex flex-col gap-4">
        <TabsList className="self-start max-w-full overflow-x-auto">
          <TabsTrigger value="teams" className="gap-1.5">
            <Users2 className="h-3.5 w-3.5" /> Teams
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <History className="h-3.5 w-3.5" /> History &amp; Usage
          </TabsTrigger>
        </TabsList>
        <TabsContent value="teams" className="mt-0">
          <TeamsTab />
        </TabsContent>
        <TabsContent value="history" className="mt-0">
          <HistoryUsageTab />
        </TabsContent>
      </Tabs>
    </PageWrapper>
  )
}
