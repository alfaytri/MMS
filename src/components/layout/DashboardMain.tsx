'use client'

import { useContactCenterContext } from '@/contexts/ContactCenterContext'

// Content shifts right by the sidebar's width so nothing hides behind it.
export function DashboardMain({ children }: { children: React.ReactNode }) {
  const { ccSidebar } = useContactCenterContext()

  const paddingClass =
    ccSidebar === 'expanded'  ? 'lg:pl-[328px]' :
    ccSidebar === 'collapsed' ? 'lg:pl-12' :
    ''

  return (
    <main className={`flex-1 min-h-0 overflow-y-auto flex flex-col print:overflow-visible transition-[padding] duration-200 ${paddingClass}`}>
      {children}
    </main>
  )
}
