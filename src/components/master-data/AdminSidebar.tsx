'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import {
  Settings2,
  Tag,
  List,
  FileText,
  Phone,
  Radio,
  Users,
  Warehouse,
  Clock,
  Percent,
  CreditCard,
  Bot,
} from 'lucide-react'

type SidebarItem = {
  label: string
  href: string
  icon: React.ElementType
  comingSoon?: boolean
}

type SidebarSection = {
  label: string
  items: SidebarItem[]
}

const ADMIN_SECTIONS: SidebarSection[] = [
  {
    label: 'Organization',
    items: [
      { label: 'Companies & Divisions', href: '/master-data/admin/companies', icon: Users },
      { label: 'Warehouses', href: '/master-data/admin/warehouses', icon: Warehouse },
      { label: 'Work Schedule', href: '/master-data/admin/work-schedule', icon: Clock, comingSoon: true },
    ],
  },
  {
    label: 'Catalog & Pricing',
    items: [
      { label: 'Brand Groups', href: '/master-data/admin/brand-groups', icon: Tag },
      { label: 'Pricing Factors', href: '/master-data/admin/pricing-factors', icon: Percent, comingSoon: true },
      { label: 'Credit Categories', href: '/master-data/admin/credit-categories', icon: CreditCard, comingSoon: true },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Reason Lists', href: '/master-data/admin/reason-lists', icon: List },
      { label: 'Document T&C', href: '/master-data/admin/document-terms', icon: FileText, comingSoon: true },
    ],
  },
  {
    label: 'Integrations',
    items: [
      { label: 'Call Center', href: '/master-data/admin/call-center', icon: Phone, comingSoon: true },
      { label: 'Traccar Devices', href: '/master-data/admin/traccar', icon: Radio, comingSoon: true },
      { label: 'Agent Resources', href: '/master-data/admin/agent-resources', icon: Bot, comingSoon: true },
    ],
  },
]

export function AdminSidebar() {
  const pathname = usePathname()

  return (
    <nav className="w-full lg:w-56 shrink-0">
      {/* Title */}
      <div className="flex items-center gap-2 px-2 pb-4 mb-1 border-b border-border">
        <Settings2 className="h-5 w-5 text-primary" />
        <span className="font-semibold text-base text-foreground">Admin Settings</span>
      </div>

      <div className="space-y-4 pt-3">
        {ADMIN_SECTIONS.map((section) => (
          <div key={section.label}>
            <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-2 mb-1">
              {section.label}
            </h3>
            <div className="space-y-0.5">
              {section.items.map((item) =>
                item.comingSoon ? (
                  <div
                    key={item.href}
                    className="flex items-center gap-2.5 px-2 py-1.5 text-sm text-muted-foreground/50 cursor-not-allowed select-none"
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1 ml-auto">Soon</Badge>
                  </div>
                ) : (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-2.5 px-2 py-1.5 text-sm rounded-md transition-colors',
                      pathname === item.href || pathname.startsWith(item.href + '/')
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-foreground hover:bg-muted'
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                )
              )}
            </div>
          </div>
        ))}
      </div>
    </nav>
  )
}
