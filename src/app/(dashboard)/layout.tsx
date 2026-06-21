// src/app/(dashboard)/layout.tsx
import { Suspense } from 'react'
import { headers } from 'next/headers'
import { TopNav } from '@/components/layout/TopNav'
import { TopNavSkeleton } from '@/components/layout/TopNavSkeleton'
import { RealtimeSync } from '@/components/shared/RealtimeSync'
import { InactivityGuard } from '@/components/auth/InactivityGuard'
import { SessionGuard } from '@/components/auth/SessionGuard'
import { ContactCenterProvider } from '@/contexts/ContactCenterContext'
import { ContactCenterSidebarGate } from '@/components/contact-center/ContactCenterSidebarGate'
import { DashboardMain } from '@/components/layout/DashboardMain'
import { TopNavV2Offset } from '@/components/layout/TopNavV2Offset'
import { RoutePermissionGuard } from '@/components/auth/RoutePermissionGuard'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const headersList = await headers()
  const isTeamLeader = headersList.get('x-is-team-leader') === '1'

  // Stripped shell: no TopNav, no contact center, no inactivity guard
  // Team leaders stay active in the field
  if (isTeamLeader) {
    return (
      <SessionGuard>
        <div className="min-h-screen bg-background flex flex-col text-sm 2xl:text-base">
          {children}
        </div>
      </SessionGuard>
    )
  }

  // Full dashboard shell
  return (
    <SessionGuard>
      <ContactCenterProvider>
        <div className="h-screen bg-muted/30 flex flex-col overflow-hidden text-sm 2xl:text-base">
          <InactivityGuard />
          <RealtimeSync />
          <TopNavV2Offset>
            <Suspense fallback={<TopNavSkeleton />}>
              <TopNav />
            </Suspense>
          </TopNavV2Offset>
          <DashboardMain>
            <RoutePermissionGuard>{children}</RoutePermissionGuard>
          </DashboardMain>
          <ContactCenterSidebarGate />
        </div>
      </ContactCenterProvider>
    </SessionGuard>
  )
}
