'use client'

import React, { useMemo, useState, useRef, useCallback, useEffect, createContext, useContext } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
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
  BarChart3,
  RotateCcw,
  Package,
  PackageCheck,
  FileX,
  FileX2,
  PackageOpen,
  Wallet,
  MapPin,
  Calendar,
  Crown,
  ShieldCheck,
  CheckSquare,
  LayoutDashboard,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePermissions } from '@/hooks/usePermissions'
import type { NavEntry, NavItem } from './nav-config'

// ─── Shared context: only one dropdown open at a time ─────────────────────

type NavDropdownCtx = {
  activeId: string | null
  open: (id: string) => void
  close: (id: string) => void
}

const NavDropdownContext = createContext<NavDropdownCtx>({
  activeId: null,
  open: () => {},
  close: () => {},
})

export function NavDropdownGroup({ children }: { children: React.ReactNode }) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancelTimer = useCallback(() => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null }
  }, [])

  const open = useCallback((id: string) => {
    cancelTimer()
    setActiveId(id)
  }, [cancelTimer])

  const close = useCallback((id: string) => {
    cancelTimer()
    closeTimer.current = setTimeout(() => {
      setActiveId(prev => prev === id ? null : prev)
    }, 120)
  }, [cancelTimer])

  return (
    <NavDropdownContext.Provider value={{ activeId, open, close }}>
      {children}
    </NavDropdownContext.Provider>
  )
}

// ─── Icon map ─────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, LucideIcon> = {
  Database, ShoppingCart, FileText, Receipt, ShoppingBag, Users, BarChart2,
  Warehouse, UserCog, ScrollText, Settings, Headset, Wrench, UsersRound,
  CreditCard, BookOpen, Bell, List, PlusCircle, FileSearch, FilePlus,
  FileCheck, Clock, Truck, UserCheck, ClipboardList, CheckCircle, Ship,
  Calculator, BarChart3, RotateCcw, Package, PackageCheck, FileX, FileX2,
  PackageOpen, Wallet, MapPin, Calendar, Crown, ShieldCheck, CheckSquare,
  LayoutDashboard, TrendingUp,
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

// ─── Portal panel (rendered at body, positioned via trigger rect) ─────────

function DropdownPanel({
  isOpen,
  triggerRef,
  onMouseEnter,
  onMouseLeave,
  children,
}: {
  isOpen: boolean
  triggerRef: React.RefObject<HTMLDivElement | null>
  onMouseEnter: () => void
  onMouseLeave: () => void
  children: React.ReactNode
}) {
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!isOpen || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setPos({ top: rect.bottom + 4, left: rect.left })
  }, [isOpen, triggerRef])

  if (!mounted) return null

  return createPortal(
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={cn(
        'fixed z-[70] w-52 rounded-lg bg-popover p-1 shadow-lg ring-1 ring-foreground/10',
        'transition-all duration-200 ease-out origin-top',
        isOpen
          ? 'opacity-100 scale-y-100 translate-y-0 pointer-events-auto'
          : 'opacity-0 scale-y-[0.97] -translate-y-1 pointer-events-none',
      )}
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="max-h-[calc(100vh-5rem)] overflow-y-auto">
        {children}
      </div>
    </div>,
    document.body,
  )
}

// ─── NavDropdown ──────────────────────────────────────────────────────────

interface NavDropdownProps {
  entry: NavEntry
}

export function NavDropdown({ entry }: NavDropdownProps) {
  const pathname = usePathname()
  const { data: permData } = usePermissions()
  const userPerms = permData?.permissions ?? []
  const isSystemAdmin = permData?.isSystemAdmin ?? false
  const Icon = ICON_MAP[entry.icon]
  const ctx = useContext(NavDropdownContext)
  const id = entry.label
  const triggerRef = useRef<HTMLDivElement>(null)

  const isOpen = ctx.activeId === id

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') ctx.close(id)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, ctx, id])

  const filteredGroups = useMemo(() => {
    const perms = permData?.permissions ?? []
    return entry.groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          canAccess(item.permission, userPerms, isSystemAdmin)
        ),
      }))
      .filter((group) => group.items.length > 0)
  }, [entry.groups, permData?.permissions])

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
    <div
      ref={triggerRef}
      className="relative"
      onMouseEnter={() => ctx.open(id)}
      onMouseLeave={() => ctx.close(id)}
    >
      {/* Trigger */}
      <button
        type="button"
        onClick={() => isOpen ? ctx.close(id) : ctx.open(id)}
        className={cn(
          'inline-flex h-9 items-center gap-1 rounded-md px-3 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          isActive
            ? 'text-primary border-b-2 border-primary rounded-none'
            : 'text-foreground hover:text-primary'
        )}
      >
        {Icon && <Icon className="h-4 w-4" />}
        {entry.label}
        <ChevronDown className={cn(
          'h-3 w-3 opacity-50 transition-transform duration-200',
          isOpen && 'rotate-180',
        )} />
      </button>

      {/* Dropdown panel — portaled to body, animated via CSS transitions */}
      <DropdownPanel
        isOpen={isOpen}
        triggerRef={triggerRef}
        onMouseEnter={() => ctx.open(id)}
        onMouseLeave={() => ctx.close(id)}
      >
        {entry.comingSoon ? (
          <div className="flex items-center gap-2 text-muted-foreground rounded-md px-2 py-1.5 text-sm">
            <Lock className="h-3.5 w-3.5" />
            <span>Coming Soon</span>
            <Badge variant="secondary" className="ml-auto text-xs h-4">Soon</Badge>
          </div>
        ) : (
          filteredGroups.map((group, groupIndex) => (
            <React.Fragment key={groupIndex}>
              {groupIndex > 0 && <div className="-mx-1 my-1 h-px bg-border" />}
              <div role="group">
                {group.label && (
                  <div className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {group.label}
                  </div>
                )}
                {group.items.map((item) => {
                  const ItemIcon = item.icon ? ICON_MAP[item.icon] : null
                  return item.comingSoon ? (
                    <div
                      key={item.href}
                      className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm text-muted-foreground"
                    >
                      <span className="flex items-center gap-2">
                        {ItemIcon && <ItemIcon className="h-4 w-4" />}
                        {item.label}
                      </span>
                      <Badge variant="outline" className="text-xs h-4 font-normal">Soon</Badge>
                    </div>
                  ) : (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => ctx.close(id)}
                      className={cn(
                        'flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer',
                        isItemActive(item.href) && 'text-primary font-medium'
                      )}
                    >
                      {ItemIcon && <ItemIcon className="h-4 w-4" />}
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            </React.Fragment>
          ))
        )}
      </DropdownPanel>
    </div>
  )
}
