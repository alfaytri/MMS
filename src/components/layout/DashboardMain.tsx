'use client'

import { useContactCenterContext } from '@/contexts/ContactCenterContext'

export function DashboardMain({ children }: { children: React.ReactNode }) {
  const { ccSidebar } = useContactCenterContext()

  const paddingClass =
    ccSidebar === 'expanded'  ? 'lg:pl-[328px]' :
    ccSidebar === 'collapsed' ? 'lg:pl-12' :
    ''  // 'none' — no CC sidebar, no padding

  return (
    <main className={`flex-1 min-h-0 overflow-y-auto flex flex-col print:overflow-visible transition-[padding] duration-200 ${paddingClass}`}>
      {children}
    </main>
  )
}
