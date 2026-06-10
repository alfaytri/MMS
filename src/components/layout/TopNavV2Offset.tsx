'use client'

import { useContactCenterContext } from '@/contexts/ContactCenterContext'

// Sidebar widths: collapsed = w-10 (40px), expanded = w-80 (320px)
// Add a small visible gap so the navbar doesn't butt up against the sidebar edge.
export function TopNavV2Offset({ children }: { children: React.ReactNode }) {
  const { ccSidebar } = useContactCenterContext()

  const paddingClass =
    ccSidebar === 'expanded'  ? 'lg:pl-[328px]' :
    ccSidebar === 'collapsed' ? 'lg:pl-12' :
    ''

  return (
    <div className={`print:hidden transition-[padding] duration-200 ${paddingClass}`}>
      {children}
    </div>
  )
}
