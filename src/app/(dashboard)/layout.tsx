// src/app/(dashboard)/layout.tsx
import { Suspense } from 'react'
import { TopNav } from '@/components/layout/TopNav'
import { TopNavSkeleton } from '@/components/layout/TopNavSkeleton'
import { InactivityGuard } from '@/components/auth/InactivityGuard'
import { SessionGuard } from '@/components/auth/SessionGuard'
import { DashboardMain } from '@/components/layout/DashboardMain'
import { TopNavV2Offset } from '@/components/layout/TopNavV2Offset'
import { RoutePermissionGuard } from '@/components/auth/RoutePermissionGuard'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SessionGuard>
      <div className="h-screen bg-muted/30 flex flex-col overflow-hidden text-sm 2xl:text-base">
        <InactivityGuard />
        <TopNavV2Offset>
          <Suspense fallback={<TopNavSkeleton />}>
            <TopNav />
          </Suspense>
        </TopNavV2Offset>
        <DashboardMain>
          <RoutePermissionGuard>{children}</RoutePermissionGuard>
        </DashboardMain>
      </div>
    </SessionGuard>
  )
}
