import { TopNav } from '@/components/layout/TopNav'
import { RealtimeSync } from '@/components/shared/RealtimeSync'
import { InactivityGuard } from '@/components/auth/InactivityGuard'
import { SessionGuard } from '@/components/auth/SessionGuard'
import { ContactCenterProvider } from '@/contexts/ContactCenterContext'
import { ContactCenterSidebarGate } from '@/components/contact-center/ContactCenterSidebarGate'
import { DashboardMain } from '@/components/layout/DashboardMain'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
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
