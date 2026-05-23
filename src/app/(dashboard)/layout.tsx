// src/app/(dashboard)/layout.tsx
import { headers } from 'next/headers'
import { TopNav } from '@/components/layout/TopNav'
import { RealtimeSync } from '@/components/shared/RealtimeSync'
import { InactivityGuard } from '@/components/auth/InactivityGuard'
import { SessionGuard } from '@/components/auth/SessionGuard'
import { ContactCenterProvider } from '@/contexts/ContactCenterContext'
import { ContactCenterSidebarGate } from '@/components/contact-center/ContactCenterSidebarGate'
import { DashboardMain } from '@/components/layout/DashboardMain'

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
        <div className="min-h-screen bg-background flex flex-col">
          {children}
        </div>
      </SessionGuard>
    )
  }

  // Full dashboard shell
  return (
    <SessionGuard>
      <ContactCenterProvider>
        <div className="min-h-screen bg-muted/30 flex flex-col">
          <InactivityGuard />
          <RealtimeSync />
          <div className="print:hidden"><TopNav /></div>
          <DashboardMain>
            {children}
          </DashboardMain>
          <ContactCenterSidebarGate />
        </div>
      </ContactCenterProvider>
    </SessionGuard>
  )
}
