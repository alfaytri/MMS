import { TopNav } from '@/components/layout/TopNav'
import { RealtimeSync } from '@/components/shared/RealtimeSync'
import { InactivityGuard } from '@/components/auth/InactivityGuard'
import { SessionGuard } from '@/components/auth/SessionGuard'
import { ContactCenterProvider } from '@/contexts/ContactCenterContext'
import { ContactCenterSidebarGate } from '@/components/contact-center/ContactCenterSidebarGate'

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
          <main className="flex-1 overflow-hidden flex flex-col print:overflow-visible lg:pl-80">
            {children}
          </main>
          <ContactCenterSidebarGate />
        </div>
      </ContactCenterProvider>
    </SessionGuard>
  )
}
