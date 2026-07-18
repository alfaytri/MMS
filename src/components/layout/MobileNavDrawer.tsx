'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronDown, Lock, Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { NAV_ITEMS } from './nav-config'
import { usePermissions } from '@/hooks/usePermissions'
import { cn } from '@/lib/utils'

function canAccess(
  permission: string | string[] | undefined,
  userPerms: string[],
): boolean {
  if (!permission) return true
  const required = Array.isArray(permission) ? permission : [permission]
  return required.some((p) => userPerms.includes(p))
}

export function MobileNavDrawer() {
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const pathname = usePathname()
  const { data: permData } = usePermissions()
  const userPerms = permData?.permissions ?? []

  const visibleEntries = NAV_ITEMS.map((entry) => {
    const filteredGroups = entry.groups
      .map((g) => ({ ...g, items: g.items.filter((i) => canAccess(i.permission, userPerms)) }))
      .filter((g) => g.items.length > 0)
    return { ...entry, filteredGroups }
  }).filter(
    (e) =>
      e.comingSoon ||
      (canAccess(e.permission, userPerms) && e.filteredGroups.length > 0),
  )

  const toggle = (label: string) => setExpanded((prev) => (prev === label ? null : label))

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open navigation"
            className="lg:hidden h-10 w-10"
          >
            <Menu className="h-5 w-5" />
          </Button>
        }
      />
      <SheetContent side="left" className="w-[85vw] max-w-xs p-0 gap-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b">
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>
        <nav className="flex-1 overflow-y-auto">
          {visibleEntries.map((entry) => {
            const isOpen = expanded === entry.label
            return (
              <div key={entry.label} className="border-b last:border-b-0">
                <button
                  type="button"
                  onClick={() => toggle(entry.label)}
                  className="w-full flex items-center justify-between px-4 py-3 min-h-11 text-sm font-medium hover:bg-accent text-left"
                  aria-expanded={isOpen}
                >
                  <span className="flex items-center gap-2">
                    {entry.label}
                    {entry.comingSoon && (
                      <Badge variant="secondary" className="text-xs h-4">Soon</Badge>
                    )}
                  </span>
                  <ChevronDown
                    className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')}
                    aria-hidden
                  />
                </button>
                {isOpen && (
                  <div className="pb-1">
                    {entry.comingSoon ? (
                      <div className="flex items-center gap-2 px-6 py-3 text-sm text-muted-foreground">
                        <Lock className="h-3.5 w-3.5" />
                        Coming Soon
                      </div>
                    ) : (
                      entry.filteredGroups.map((group, gi) => (
                        <div key={gi} className="py-1">
                          {group.label && (
                            <div className="px-6 pt-2 pb-1 text-xs uppercase tracking-wider text-muted-foreground">
                              {group.label}
                            </div>
                          )}
                          {group.items.map((item) => {
                            const isActive =
                              pathname === item.href || pathname.startsWith(item.href + '/')
                            return item.comingSoon ? (
                              <div
                                key={item.href}
                                className="flex items-center justify-between px-6 py-3 text-sm text-muted-foreground min-h-11"
                              >
                                <span>{item.label}</span>
                                <Badge variant="outline" className="text-xs h-4 font-normal">
                                  Soon
                                </Badge>
                              </div>
                            ) : (
                              <Link
                                key={item.href}
                                href={item.href}
                                onClick={() => setOpen(false)}
                                className={cn(
                                  'block px-6 py-3 text-sm min-h-11 hover:bg-accent',
                                  isActive && 'text-primary font-medium bg-accent/50',
                                )}
                              >
                                {item.label}
                              </Link>
                            )
                          })}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </nav>
      </SheetContent>
    </Sheet>
  )
}
