import { TopNav } from '@/components/layout/TopNav'
import { RealtimeSync } from '@/components/shared/RealtimeSync'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      <RealtimeSync />
      <TopNav />
      <main className="flex-1 overflow-hidden flex flex-col">
        {children}
      </main>
    </div>
  )
}
