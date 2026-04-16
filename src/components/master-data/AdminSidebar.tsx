'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Settings, Tag, List, FileText, Radio, MapPin, Briefcase } from 'lucide-react'

const ADMIN_SECTIONS = [
  {
    label: 'Catalog & Pricing',
    items: [
      { label: 'Brand Groups', href: '/master-data/admin/brand-groups', icon: Tag },
      { label: 'Reason Lists', href: '/master-data/admin/reason-lists', icon: List },
      { label: 'Pricing Factors', href: '/master-data/admin/pricing-factors', comingSoon: true, icon: Briefcase },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Document T&C', href: '/master-data/admin/document-terms', comingSoon: true, icon: FileText },
      { label: 'Work Schedule', href: '/master-data/admin/work-schedule', comingSoon: true, icon: Settings },
    ],
  },
  {
    label: 'Integrations',
    items: [
      { label: 'Call Center (3CX)', href: '/master-data/admin/call-center', comingSoon: true, icon: Radio },
      { label: 'Traccar GPS', href: '/master-data/admin/traccar', comingSoon: true, icon: MapPin },
    ],
  },
]

export function AdminSidebar() {
  const pathname = usePathname()

  return (
    <nav className="w-full lg:w-56 shrink-0 space-y-4">
      {ADMIN_SECTIONS.map((section) => (
        <div key={section.label}>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2 mb-1">{section.label}</h3>
          <div className="space-y-0.5">
            {section.items.map((item) => (
              item.comingSoon ? (
                <div key={item.href} className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground/60 cursor-not-allowed">
                  <item.icon className="h-4 w-4" />
                  {item.label}
                  <Badge variant="outline" className="text-[10px] h-4 ml-auto">Soon</Badge>
                </div>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2 px-2 py-1.5 text-sm rounded-md transition-colors',
                    pathname === item.href
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-foreground hover:bg-muted'
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              )
            ))}
          </div>
        </div>
      ))}
    </nav>
  )
}
