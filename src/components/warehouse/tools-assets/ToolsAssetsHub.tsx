'use client'

import { useState } from 'react'
import { ClipboardCheck, History, Lock, Users2, Wrench } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageWrapper } from '@/components/shared/PageWrapper'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { Skeleton } from '@/components/ui/skeleton'
import { usePermissions } from '@/hooks/usePermissions'
import { useActiveDivision } from '@/components/providers/DivisionProvider'
import { TeamsTab } from './TeamsTab'
import { RepairTab } from './RepairTab'
import { ToolCheckPage } from './checks/ToolCheckPage'
import { HistoryUsageTab } from './HistoryUsageTab'

/**
 * Operations → Tools & Assets. Team-centric lifecycle hub for serialized tool
 * units: assign to teams, move between same-division teams, run on-demand
 * condition checks, collect Under-repair units in the Repair tab (→ Repaired or
 * Scrap → P&L), and track custody history (usage-days).
 */
export function ToolsAssetsHub() {
  const { data: perms, isLoading } = usePermissions()
  const { setActiveDivision } = useActiveDivision()
  const [tab, setTab] = useState('teams')
  const canView = !!perms && (perms.isSystemAdmin || perms.permissions.includes('tools.assets.view'))

  // From a division header in the Teams tab: scope the top bar to that division
  // and jump to the Monthly Check tab (which reads the single active division).
  const handleStartCheck = (divisionId: string) => {
    void setActiveDivision(divisionId)
    setTab('checks')
  }

  if (isLoading) {
    return (
      <PageWrapper>
        <PageHeader title="Tools & Assets" description="Assign serialized tools and assets to teams, move them between teams in the same division, and track how long each tool has been held." />
        <Skeleton className="h-40 w-full" />
      </PageWrapper>
    )
  }

  if (!canView) {
    return (
      <PageWrapper>
        <PageHeader title="Tools & Assets" description="Assign serialized tools and assets to teams, move them between teams in the same division, and track how long each tool has been held." />
        <EmptyState
          icon={<Lock className="h-6 w-6 text-muted-foreground" />}
          title="No access"
          description="You don’t have permission to view Tools & Assets. Ask an admin to grant “View Tools & Assets” to your role."
        />
      </PageWrapper>
    )
  }

  return (
    <PageWrapper>
      <PageHeader
        title="Tools & Assets"
        description="Assign serialized tools and assets to teams, move them between teams in the same division, and track how long each tool has been held."
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as string)} className="flex flex-col gap-4">
        <TabsList className="self-start max-w-full overflow-x-auto">
          <TabsTrigger value="teams" className="gap-1.5">
            <Users2 className="h-3.5 w-3.5" /> Teams
          </TabsTrigger>
          <TabsTrigger value="repair" className="gap-1.5">
            <Wrench className="h-3.5 w-3.5" /> Repair
          </TabsTrigger>
          <TabsTrigger value="checks" className="gap-1.5">
            <ClipboardCheck className="h-3.5 w-3.5" /> Monthly Check
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <History className="h-3.5 w-3.5" /> History &amp; Usage
          </TabsTrigger>
        </TabsList>
        <TabsContent value="teams" className="mt-0">
          <TeamsTab onStartCheck={handleStartCheck} />
        </TabsContent>
        <TabsContent value="repair" className="mt-0">
          <RepairTab />
        </TabsContent>
        <TabsContent value="checks" className="mt-0">
          <ToolCheckPage />
        </TabsContent>
        <TabsContent value="history" className="mt-0">
          <HistoryUsageTab />
        </TabsContent>
      </Tabs>
    </PageWrapper>
  )
}
