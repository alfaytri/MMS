'use client'

import { useContactCenterContext } from '@/contexts/ContactCenterContext'

// Left offset that reserves room for the fixed Contact Centre sidebar so the
// top nav is never hidden behind it. Widths match ContactCenterSidebarV2:
// collapsed strip = w-10 (40px), expanded = w-80 (320px). lg-only, since the
// sidebar itself is `hidden lg:flex`.
const CC_OFFSET: Record<string, string> = {
  none: '',
  collapsed: 'lg:pl-10',
  expanded: 'lg:pl-80',
}

export function TopNavV2Offset({ children }: { children: React.ReactNode }) {
  const { ccSidebar } = useContactCenterContext()
  return (
    <div className={`print:hidden transition-[padding] duration-200 ${CC_OFFSET[ccSidebar] ?? ''}`}>
      {children}
    </div>
  )
}
