'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { Bell, Package, ShoppingCart, Wrench, ArrowLeftRight, AlertTriangle, ClipboardCheck, CreditCard, FileEdit, Info } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow, format, isToday, isYesterday, isThisWeek } from 'date-fns'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  usePendingNotificationCount,
  usePendingNotifications,
  useCompletedNotifications,
  useMarkNotificationRead,
  type NotificationRow,
} from '@/hooks/useNotifications'
import { getNotificationRoute, getNotificationIcon } from '@/lib/notification-routes'
import { cn } from '@/lib/utils'

const ICON_MAP: Record<string, typeof Bell> = {
  po: Package,
  so: ShoppingCart,
  service: Wrench,
  transfer: ArrowLeftRight,
  stock: AlertTriangle,
  inventory: ClipboardCheck,
  credit: CreditCard,
  receival: FileEdit,
  info: Info,
}

function playNotificationDing() {
  try {
    const ctx = new AudioContext()
    const master = ctx.createGain()
    master.gain.setValueAtTime(0.25, ctx.currentTime)
    master.connect(ctx.destination)
    const tones = [
      { freq: 440,    start: 0,    dur: 0.15 },
      { freq: 659.25, start: 0.1,  dur: 0.25 },
    ]
    for (const { freq, start, dur } of tones) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(master)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start)
      const t0 = ctx.currentTime + start
      gain.gain.setValueAtTime(0, t0)
      gain.gain.linearRampToValueAtTime(1, t0 + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
      osc.start(t0)
      osc.stop(t0 + dur)
    }
    setTimeout(() => ctx.close(), 500)
  } catch {
    // AudioContext blocked by autoplay policy — fail silently
  }
}

function getDateGroup(dateStr: string): string {
  const d = new Date(dateStr)
  if (isToday(d)) return 'Today'
  if (isYesterday(d)) return 'Yesterday'
  if (isThisWeek(d)) return 'This Week'
  return format(d, 'dd MMM yyyy')
}

function groupByDate(items: NotificationRow[]): Array<{ label: string; items: NotificationRow[] }> {
  const groups: Map<string, NotificationRow[]> = new Map()
  for (const n of items) {
    const label = getDateGroup(n.actioned_at ?? n.created_at)
    if (!groups.has(label)) groups.set(label, [])
    groups.get(label)!.push(n)
  }
  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }))
}

function NotificationItem({
  n,
  onNavigate,
}: {
  n: NotificationRow
  onNavigate: (n: NotificationRow) => void
}) {
  const iconKey = getNotificationIcon(n.type)
  const Icon = ICON_MAP[iconKey] ?? Bell
  const isUnread = !n.read_at

  return (
    <button
      type="button"
      className={cn(
        'flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-muted/60',
        isUnread && 'bg-muted/40'
      )}
      onClick={() => onNavigate(n)}
    >
      <div className={cn(
        'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
        isUnread ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
      )}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className={cn('text-sm leading-snug', isUnread && 'font-medium')}>
          {n.title}
        </p>
        {n.body && (
          <p className="text-xs text-muted-foreground line-clamp-2">{n.body}</p>
        )}
        <p className="text-[11px] text-muted-foreground/70">
          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
        </p>
      </div>
      {isUnread && (
        <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
      )}
    </button>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <Bell className="h-8 w-8 text-muted-foreground/40 mb-2" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}

export function NotificationBell() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'pending' | 'completed'>('pending')
  const { data: pendingCount = 0 } = usePendingNotificationCount()
  // Only fetch the lists while the popover is open — the count above drives the
  // badge, so the lists don't need to load on every page.
  const { data: pending = [] } = usePendingNotifications(open)
  const { data: completed = [] } = useCompletedNotifications(open && tab === 'completed')
  const markRead = useMarkNotificationRead()
  const hasPlayedSound = useRef(false)
  const [showPing, setShowPing] = useState(false)

  useEffect(() => {
    if (pendingCount > 0 && !hasPlayedSound.current) {
      hasPlayedSound.current = true
      setShowPing(true)
      playNotificationDing()
      const t = setTimeout(() => setShowPing(false), 2500)
      return () => clearTimeout(t)
    }
  }, [pendingCount])

  const completedGroups = useMemo(() => groupByDate(completed), [completed])

  function handleNavigate(n: NotificationRow) {
    if (!n.read_at) markRead.mutate(n.id)
    const route = getNotificationRoute(n.type, n.related_id)
    if (route) {
      setOpen(false)
      router.push(route)
    }
  }

  const hasNotifications = pendingCount > 0

  return (
    <>
      <style>{`
        @keyframes bell-ring {
          0%, 50%, 100% { transform: rotate(0deg); }
          5% { transform: rotate(14deg); }
          10% { transform: rotate(-12deg); }
          15% { transform: rotate(10deg); }
          20% { transform: rotate(-8deg); }
          25% { transform: rotate(6deg); }
          30% { transform: rotate(-4deg); }
          35% { transform: rotate(2deg); }
          40% { transform: rotate(-1deg); }
        }
        @keyframes sonar-ping {
          0% { transform: scale(1); opacity: 0.7; }
          70% { transform: scale(2.8); opacity: 0; }
          100% { transform: scale(2.8); opacity: 0; }
        }
      `}</style>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label="Notifications"
        >
          {showPing && (
            <>
              <span
                className="absolute inset-0 rounded-full bg-destructive/30"
                style={{ animation: 'sonar-ping 0.8s ease-out forwards' }}
              />
              <span
                className="absolute inset-0 rounded-full bg-destructive/20"
                style={{ animation: 'sonar-ping 0.8s ease-out 0.3s forwards' }}
              />
              <span
                className="absolute inset-0 rounded-full bg-destructive/10"
                style={{ animation: 'sonar-ping 0.8s ease-out 0.6s forwards' }}
              />
            </>
          )}
          <Bell
            className="h-5 w-5"
            style={hasNotifications ? {
              animation: 'bell-ring 4s ease-in-out infinite',
              transformOrigin: 'top center',
            } : undefined}
          />
          {hasNotifications && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white animate-pulse">
              {pendingCount > 99 ? '99+' : pendingCount}
            </span>
          )}
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={8}
          className="w-[380px] p-0 gap-0"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <h3 className="text-sm font-semibold">Notifications</h3>
          </div>

          {/* Tab buttons */}
          <div className="flex border-b">
            <button
              type="button"
              className={cn(
                'flex-1 py-2 text-sm font-medium text-center transition-colors border-b-2',
                tab === 'pending'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setTab('pending')}
            >
              Pending
              {pendingCount > 0 && (
                <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive/10 px-1.5 text-[11px] font-semibold text-destructive dark:bg-destructive/20">
                  {pendingCount > 99 ? '99+' : pendingCount}
                </span>
              )}
            </button>
            <button
              type="button"
              className={cn(
                'flex-1 py-2 text-sm font-medium text-center transition-colors border-b-2',
                tab === 'completed'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setTab('completed')}
            >
              Completed
            </button>
          </div>

          {/* Content */}
          <div className="max-h-[400px] overflow-y-auto">
            {tab === 'pending' ? (
              <div className="p-2 space-y-0.5">
                {pending.length === 0 ? (
                  <EmptyState message="You're all caught up!" />
                ) : (
                  pending.map((n) => (
                    <NotificationItem key={n.id} n={n} onNavigate={handleNavigate} />
                  ))
                )}
              </div>
            ) : (
              completed.length === 0 ? (
                <EmptyState message="No completed notifications" />
              ) : (
                completedGroups.map((group) => (
                  <div key={group.label}>
                    <div className="sticky top-0 z-10 bg-popover/95 backdrop-blur-sm px-4 py-1.5 border-b">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {group.label}
                      </span>
                    </div>
                    <div className="p-2 space-y-0.5">
                      {group.items.map((n) => (
                        <NotificationItem key={n.id} n={n} onNavigate={handleNavigate} />
                      ))}
                    </div>
                  </div>
                ))
              )
            )}
          </div>
        </PopoverContent>
      </Popover>
    </>
  )
}
