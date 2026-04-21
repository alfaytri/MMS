import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TopNav } from '@/components/layout/TopNav'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      <TopNav />
      <main className="flex-1 overflow-hidden flex flex-col">
        {children}
      </main>
    </div>
  )
}
