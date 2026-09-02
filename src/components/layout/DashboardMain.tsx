'use client'

import { useContactCenterContext } from '@/contexts/ContactCenterContext'

// Mirror the top-nav offset so the page content also makes room for the fixed
// Contact Centre sidebar (see TopNavV2Offset for the width rationale).
const CC_OFFSET: Record<string, string> = {
  none: '',
  collapsed: 'lg:pl-10',
  expanded: 'lg:pl-80',
}

export function DashboardMain({ children }: { children: React.ReactNode }) {
  const { ccSidebar } = useContactCenterContext()
  return (
    <main className={`flex-1 min-h-0 overflow-y-auto flex flex-col print:overflow-visible transition-[padding] duration-200 ${CC_OFFSET[ccSidebar] ?? ''}`}>
      {children}
    </main>
  )
}
