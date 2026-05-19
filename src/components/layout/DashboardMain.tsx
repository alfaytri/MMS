'use client'

import { useContactCenterContext } from '@/contexts/ContactCenterContext'

export function DashboardMain({ children }: { children: React.ReactNode }) {
  const { ccSidebar } = useContactCenterContext()

  const paddingClass =
    ccSidebar === 'expanded'  ? 'lg:pl-80' :
    ccSidebar === 'collapsed' ? 'lg:pl-10' :
    ''  // 'none' — no CC sidebar, no padding

  return (
    <main className={`flex-1 overflow-hidden flex flex-col print:overflow-visible transition-[padding] duration-200 ${paddingClass}`}>
      {children}
    </main>
  )
}
