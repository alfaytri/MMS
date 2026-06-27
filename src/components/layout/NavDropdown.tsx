'use client'

import React, { useMemo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import {
  ChevronDown,
  Lock,
  Database,
  ShoppingCart,
  FileText,
  Receipt,
  ShoppingBag,
  Users,
  BarChart2,
  Warehouse,
  UserCog,
  ScrollText,
  Settings,
  Headset,
  Wrench,
  UsersRound,
  CreditCard,
  BookOpen,
  Bell,
  List,
  PlusCircle,
  FileSearch,
  FilePlus,
  FileCheck,
  Clock,
  Truck,
  UserCheck,
  ClipboardList,
  CheckCircle,
  Ship,
  Calculator,
  FileQuestion,
  BarChart3,
  RotateCcw,
  PackageCheck,
  FileX,
  PackageOpen,
  Wallet,
  MapPin,
  Calendar,
  Crown,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePermissions } from '@/hooks/usePermissions'
import type { NavEntry, NavItem } from './nav-config'

const ICON_MAP: Record<string, LucideIcon> = {
  Database,
  ShoppingCart,
  FileText,
  Receipt,
  ShoppingBag,
  Users,
  BarChart2,
  Warehouse,
  UserCog,
  ScrollText,
  Settings,
  Headset,
  Wrench,
  UsersRound,
  CreditCard,
  BookOpen,
  Bell,
  List,
  PlusCircle,
  FileSearch,
  FilePlus,
  FileCheck,
  Clock,
  Truck,
  UserCheck,
  ClipboardList,
  CheckCircle,
  Ship,
  Calculator,
  FileQuestion,
  BarChart3,
  RotateCcw,
  PackageCheck,
  FileX,
  PackageOpen,
  Wallet,
  MapPin,
  Calendar,
  Crown,
  ShieldCheck,
}

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

interface NavDropdownProps {
  entry: NavEntry
}

export function NavDropdown({ entry }: NavDropdownProps) {
  const pathname = usePathname()
  const { data: permData } = usePermissions()
  const userPerms = permData?.permissions ?? []
  const isSystemAdmin = permData?.isSystemAdmin ?? false
  const Icon = ICON_MAP[entry.icon]

  const filteredGroups = useMemo(() => {
    return entry.groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          canAccess(item.permission, userPerms, isSystemAdmin)
        ),
      }))
      .filter((group) => group.items.length > 0)
  }, [entry.groups, userPerms, isSystemAdmin])

  // Strict gate — match MobileNavDrawer. Top-level permission must be granted
  // AND at least one inner item must be visible. comingSoon entries always show.
  if (!entry.comingSoon) {
    if (!canAccess(entry.permission, userPerms, isSystemAdmin)) return null
    if (filteredGroups.length === 0) return null
  }

  const allHrefs = filteredGroups.flatMap((g) => g.items.map((i: NavItem) => i.href))

  const isItemActive = (href: string) => {
    if (pathname === href) return true
    if (!pathname.startsWith(href + '/')) return false
    const hasMoreSpecificMatch = allHrefs.some(
      (other) =>
        other !== href &&
        other.startsWith(href) &&
        (pathname === other || pathname.startsWith(other + '/'))
    )
    return !hasMoreSpecificMatch
  }

  const isActive = allHrefs.some(isItemActive)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'inline-flex h-9 items-center gap-1 rounded-md px-3 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          isActive
            ? 'text-primary border-b-2 border-primary rounded-none'
            : 'text-foreground hover:text-primary'
        )}
      >
        {Icon && <Icon className="h-4 w-4" />}
        {entry.label}
        <ChevronDown className="h-3 w-3 opacity-50" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-52">
        {entry.comingSoon ? (
          <DropdownMenuItem disabled className="flex items-center gap-2 text-muted-foreground">
            <Lock className="h-3.5 w-3.5" />
            <span>Coming Soon</span>
            <Badge variant="secondary" className="ml-auto text-xs h-4">Soon</Badge>
          </DropdownMenuItem>
        ) : (
          filteredGroups.map((group, groupIndex) => (
            <React.Fragment key={groupIndex}>
              {groupIndex > 0 && <DropdownMenuSeparator />}
              <DropdownMenuGroup>
                {group.label && (
                  <DropdownMenuLabel className="text-xs text-muted-foreground uppercase tracking-wider py-1">
                    {group.label}
                  </DropdownMenuLabel>
                )}
                {group.items.map((item) => {
                  const ItemIcon = item.icon ? ICON_MAP[item.icon] : null
                  return item.comingSoon ? (
                    <DropdownMenuItem
                      key={item.href}
                      disabled
                      className="flex items-center justify-between text-muted-foreground"
                    >
                      <span className="flex items-center gap-2">
                        {ItemIcon && <ItemIcon className="h-4 w-4" />}
                        {item.label}
                      </span>
                      <Badge variant="outline" className="text-xs h-4 font-normal">Soon</Badge>
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          'flex items-center gap-2 w-full cursor-pointer',
                          isItemActive(item.href) && 'text-primary font-medium'
                        )}
                      >
                        {ItemIcon && <ItemIcon className="h-4 w-4" />}
                        {item.label}
                      </Link>
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuGroup>
            </React.Fragment>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
