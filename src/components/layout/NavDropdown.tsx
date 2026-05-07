'use client'

import React from 'react'
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
  CalendarDays,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { NavEntry } from './nav-config'

const ICON_MAP: Record<string, LucideIcon> = {
  Database,
  ShoppingCart,
  FileText,
  Receipt,
  ShoppingBag,
  Users,
}

interface NavDropdownProps {
  entry: NavEntry
}

export function NavDropdown({ entry }: NavDropdownProps) {
  const pathname = usePathname()
  const Icon = ICON_MAP[entry.icon]

  const isActive = entry.groups.some((group) =>
    group.items.some((item) => pathname.startsWith(item.href))
  )

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
          entry.groups.map((group, groupIndex) => (
            <React.Fragment key={groupIndex}>
              {groupIndex > 0 && <DropdownMenuSeparator />}
              <DropdownMenuGroup>
                {group.label && (
                  <DropdownMenuLabel className="text-xs text-muted-foreground uppercase tracking-wider py-1">
                    {group.label}
                  </DropdownMenuLabel>
                )}
                {group.items.map((item) =>
                  item.comingSoon ? (
                    <DropdownMenuItem
                      key={item.href}
                      disabled
                      className="flex items-center justify-between text-muted-foreground"
                    >
                      <span>{item.label}</span>
                      <Badge variant="outline" className="text-xs h-4 font-normal">Soon</Badge>
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          'w-full cursor-pointer',
                          pathname.startsWith(item.href) && 'text-primary font-medium'
                        )}
                      >
                        {item.label}
                      </Link>
                    </DropdownMenuItem>
                  )
                )}
              </DropdownMenuGroup>
            </React.Fragment>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
