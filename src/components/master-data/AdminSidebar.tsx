'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { usePermissions } from '@/hooks/usePermissions'
import {
  Settings2,
  Tag,
  List,
  FileText,
  Radio,
  Users,
  Warehouse,
  Clock,
  Percent,
  CreditCard,
  Banknote,
  Bot,
  CheckSquare,
  Workflow,
  Coins,
  Globe,
  Headphones,
  Receipt,
} from 'lucide-react'

type SidebarItem = {
  label: string
  href: string
  icon: React.ElementType
  comingSoon?: boolean
  permission?: string | string[]
}

type SidebarSection = {
  label: string
  items: SidebarItem[]
}

const ADMIN_SECTIONS: SidebarSection[] = [
  {
    label: 'Organization',
    items: [
      { label: 'Companies & Divisions', href: '/master-data/admin/companies',     icon: Users,     permission: 'master_data.admin.view' },
      { label: 'Warehouses',            href: '/master-data/admin/warehouses',    icon: Warehouse, permission: 'master_data.warehouses.manage' },
      { label: 'Work Schedule',         href: '/master-data/admin/work-schedule', icon: Clock,     permission: 'master_data.admin.view' },
    ],
  },
  {
    label: 'Catalog & Pricing',
    items: [
      { label: 'Brand Groups',     href: '/master-data/admin/brand-groups',    icon: Tag,        permission: 'master_data.admin.view' },
      { label: 'Pricing Factors',  href: '/master-data/admin/pricing-factors', icon: Percent,    comingSoon: true },
      { label: 'Credit Groups',    href: '/master-data/admin/credit-groups',   icon: CreditCard, permission: 'master_data.admin.view' },
      { label: 'Credit Group Approvals', href: '/master-data/credit-group-approvals', icon: CheckSquare, permission: 'master_data.customers.view' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Reason Lists',       href: '/master-data/admin/reason-lists',       icon: List,        permission: 'master_data.admin.view' },
      { label: 'Payment Methods',    href: '/master-data/admin/payment-methods',    icon: Banknote,    permission: 'master_data.admin.view' },
      { label: 'Currencies',         href: '/master-data/admin/currencies',         icon: Coins,       permission: 'master_data.admin.view' },
      { label: 'Country Codes',      href: '/master-data/admin/country-codes',      icon: Globe,       permission: 'master_data.admin.view' },
      { label: 'PO Approval Chains', href: '/master-data/admin/approval-settings',  icon: CheckSquare, permission: 'purchase.approvals.chain.manage' },
      { label: 'Approval Workflows', href: '/master-data/admin/approval-workflows', icon: Workflow,    permission: 'master_data.admin.view' },
      { label: 'Order Quotation',    href: '/master-data/admin/order-quotation',    icon: Receipt,     permission: 'master_data.admin.view' },
      { label: 'Document T&C',       href: '/master-data/admin/document-terms',     icon: FileText,    comingSoon: true },
    ],
  },
  {
    label: 'Contact Centre',
    items: [
      { label: 'Extensions', href: '/master-data/admin/contact-centre-extensions', icon: Headphones, permission: 'master_data.users.manage' },
    ],
  },
  {
    label: 'Integrations',
    items: [
      { label: 'Traccar Devices',  href: '/master-data/admin/traccar',         icon: Radio, comingSoon: true },
      { label: 'Agent Resources',  href: '/master-data/admin/agent-resources', icon: Bot,   comingSoon: true },
    ],
  },
]

function canAccess(
  permission: string | string[] | undefined,
  userPerms: string[],
  isSystemAdmin: boolean,
): boolean {
  if (!permission) return true
  if (isSystemAdmin) return true
  const required = Array.isArray(permission) ? permission : [permission]
  return required.some((p) => userPerms.includes(p))
}

export function AdminSidebar() {
  const pathname = usePathname()
  const { data: permData } = usePermissions()
  const userPerms = permData?.permissions ?? []
  const isSystemAdmin = permData?.isSystemAdmin ?? false

  const visibleSections = ADMIN_SECTIONS
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => item.comingSoon || canAccess(item.permission, userPerms, isSystemAdmin)
      ),
    }))
    .filter((section) => section.items.length > 0)

  return (
    <nav className="w-full lg:w-56 shrink-0 outline-none">
      {/* Title */}
      <div className="flex items-center gap-2 px-2 pb-4 mb-1 border-b border-border">
        <Settings2 className="h-5 w-5 text-primary" />
        <span className="font-semibold text-base text-foreground">Admin Settings</span>
      </div>

      <div className="space-y-4 pt-3">
        {visibleSections.map((section) => (
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
