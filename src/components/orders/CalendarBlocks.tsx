'use client'

import { useState, useRef } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { AlertTriangle, Phone, ClipboardList, Clock, User, X } from 'lucide-react'
import type { CalendarVisit } from '@/hooks/useCalendarVisits'
import type { OrderServiceDraft, TeamAssignmentDraft } from '@/types/orders'
import { cn } from '@/lib/utils'

// ─── Shared Constants ─────────────────────────────────────────────────────────

export const TRACK_H = 44
export const SIDEBAR_W = 128
export const DIVISION_HEADER_H = 36

/**
 * Off-hours cell background — a clear neutral fill so users can see
 * at a glance which slots are inside the team's work window.
 */
export const OFFHOURS_STYLE = {
  backgroundColor: 'hsl(220 14% 95%)',
  backgroundImage:
    'repeating-linear-gradient(-45deg, hsl(220 9% 80% / 0.35) 0px, hsl(220 9% 80% / 0.35) 1px, transparent 1px, transparent 6px)',
} as const

/**
 * Past-slot background for today's view — has to be visibly darker than
 * off-hours so "the day is gone" reads at a glance, and darker than the
 * occupied-slot muted background too.
 */
export const PAST_SLOT_STYLE = {
  backgroundColor: 'hsl(220 13% 88%)',
} as const

// ─── Shared Helpers ───────────────────────────────────────────────────────────

export function parseHour(t: string | null): number | null {
  if (!t) return null
  const n = parseInt(t)
  return isNaN(n) ? null : n
}

export function parseMinutes(t: string | null): number | null {
  if (!t) return null
  const [hStr, mStr] = t.split(':')
  const h = parseInt(hStr)
  const m = parseInt(mStr ?? '0')
  return isNaN(h) ? null : h * 60 + (isNaN(m) ? 0 : m)
}

function formatOvertimeDuration(overtimeMinutes: number): string {
  const h = Math.floor(overtimeMinutes / 60)
  const m = overtimeMinutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function fmt12(t: string): string {
  const [hStr, mStr] = t.split(':')
  const h = parseInt(hStr)
  const m = mStr ?? '00'
  const period = h < 12 ? 'AM' : 'PM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${m} ${period}`
}

// ─── Track Assignment — greedy interval scheduling ────────────────────────────

interface Block {
  id: string
  start: number
  end: number
}

export function assignTracks(blocks: Block[]): Map<string, number> {
  const sorted = [...blocks].sort((a, b) => a.start - b.start)
  const trackEnds: number[] = []
  const result = new Map<string, number>()

  for (const b of sorted) {
    let placed = false
    for (let t = 0; t < trackEnds.length; t++) {
      if (trackEnds[t] <= b.start) {
        trackEnds[t] = b.end
        result.set(b.id, t)
        placed = true
        break
      }
    }
    if (!placed) {
      result.set(b.id, trackEnds.length)
      trackEnds.push(b.end)
    }
  }

  return result
}

// ─── Shared Types ─────────────────────────────────────────────────────────────

export interface PendingDrop {
  service: OrderServiceDraft
  teamId: string
  teamName: string
  timeSlot: string
}

export interface DraftInfo {
  orderId: string
  customerName: string
  phone: string
  notes: string
  mode: import('@/types/orders').OrderMode
}

// ─── DroppableCell ────────────────────────────────────────────────────────────

interface DroppableCellProps {
  teamId: string
  slot: number
  isOccupied: boolean
  isPast: boolean
  isSkillMatch: boolean | null
  rowHeight: number
  workStart: number
  workEnd: number
  cellW: number
}

export function DroppableCell({ teamId, slot, isOccupied, isPast, isSkillMatch, rowHeight, workStart, workEnd, cellW }: DroppableCellProps) {
  const hour = Math.floor(slot)
  const minute = slot % 1 !== 0 ? 30 : 0
  // Only occupied cells block drops — past slots stay droppable so the user can
  // drop the day-window pill anywhere on a team row; the actual start time comes
  // from the pill's fromTime, not from which cell the cursor landed on.
  const blocked = isOccupied
  const { isOver, setNodeRef } = useDroppable({
    id: `${teamId}-${slot}`,
    data: { teamId, hour, minute },
    disabled: blocked,
  })

  const isWorking = slot >= workStart && slot < workEnd
  const isHalf = slot % 1 !== 0
  // Work-zone boundary markers — a stronger left border on the cell that
  // opens the work window and the cell that closes it. Lets the eye snap
  // straight to "this is where the day starts/ends".
  const isWorkStart = slot === workStart
  const isWorkEnd   = slot === workEnd

  // Layered backgrounds: past beats off-hours; both lose to dnd hover.
  const cellStyle: React.CSSProperties = {
    width: cellW, minWidth: cellW, height: rowHeight,
  }
  if (isPast && !isOccupied) {
    Object.assign(cellStyle, PAST_SLOT_STYLE)
  } else if (!isWorking && !blocked) {
    Object.assign(cellStyle, OFFHOURS_STYLE)
  }

  return (
    <div
      ref={setNodeRef}
      style={cellStyle}
      className={cn(
        'shrink-0 transition-colors',
        // Default cell separators
        isHalf ? 'border-r border-slate-100/60' : 'border-r border-slate-200/70',
        // Stronger separators at the work window's edges
        isWorkStart && 'border-l-2 border-l-emerald-400/70',
        isWorkEnd   && 'border-r-2 border-r-emerald-400/70',
        // Past + occupied states already handled by inline styles above.
        blocked && 'bg-muted/80 cursor-not-allowed',
        !blocked && isOver && 'bg-orange-100 ring-1 ring-inset ring-orange-400',
        !blocked && !isOver && isSkillMatch === true && 'bg-emerald-50',
        !blocked && isSkillMatch === false && 'opacity-30',
      )}
    />
  )
}

// ─── DivisionHeaderRow ────────────────────────────────────────────────────────

export function DivisionHeaderRow({ name, scheduleLabel, cellW, slotCount }: { name: string; scheduleLabel?: string; cellW: number; slotCount: number }) {
  const contentW = SIDEBAR_W + slotCount * cellW
  return (
    <div style={{ height: DIVISION_HEADER_H }}>
      <div
        className="sticky left-0 z-10 flex items-center gap-3 px-4 bg-orange-100/80 border-y border-orange-200"
        style={{ height: DIVISION_HEADER_H, width: `min(100vw, ${contentW}px)` }}
      >
        <span className="text-xs font-bold text-orange-700 tracking-wider uppercase shrink-0">
          {name}
        </span>
        {scheduleLabel && (
          <span className="flex items-center gap-1 text-[11px] text-orange-700/80 font-medium shrink-0">
            <Clock className="h-3 w-3" />
            {scheduleLabel}
          </span>
        )}
        <div className="flex-1 h-px bg-orange-300/60" />
      </div>
    </div>
  )
}

// ─── DraftBlock ───────────────────────────────────────────────────────────────

interface DraftBlockProps {
  assignment: TeamAssignmentDraft
  draftServices: OrderServiceDraft[]
  draftInfo: DraftInfo
  trackMap: Map<string, number>
  assignmentEndFn: (a: TeamAssignmentDraft, start: number) => number
  assignmentLabelFn: (a: TeamAssignmentDraft) => string
  hourLeftFn: (h: number) => number
  onRemove: (id: string) => void
  workStart: number
  workEnd: number
  cellW: number
}

export function DraftBlock({
  assignment: a,
  draftServices,
  draftInfo,
  trackMap,
  assignmentEndFn,
  assignmentLabelFn,
  hourLeftFn,
  onRemove,
  workStart,
  workEnd,
  cellW,
}: DraftBlockProps) {
  const [hovered, setHovered] = useState(false)
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const start = parseHour(a.timeSlot)
  if (start === null) return null

  const end = assignmentEndFn(a, start)
  const isEarlyStart = start < workStart
  const isLateEnd    = end > workEnd
  const isOvertime   = isEarlyStart || isLateEnd
  const earlyMinutes = isEarlyStart
    ? Math.max(0, workStart * 60 - (parseMinutes(a.timeSlot) ?? start * 60))
    : 0
  const lateMinutes = isLateEnd
    ? Math.max(0, (parseMinutes(a.toTime) ?? (end - 1) * 60) - workEnd * 60)
    : 0
  const overtimeMinutes = earlyMinutes + lateMinutes
  const track = trackMap.get(`a-${a.id}`) ?? 0
  const label = assignmentLabelFn(a)
  const blockW = (end - start) * 2 * cellW - 2

  // Width of the OT portion at each end of the block — used to overlay a
  // red diagonal stripe ONLY on the segment that's outside work hours,
  // instead of staining the whole block red.
  const earlyOtPx = isEarlyStart ? (workStart - start) * 2 * cellW : 0
  const lateOtPx  = isLateEnd ? (end - workEnd) * 2 * cellW : 0

  const timeLabel = a.toTime
    ? `${fmt12(a.timeSlot)} – ${fmt12(a.toTime)}`
    : fmt12(a.timeSlot)

  const serviceLines = a.services.map((s) => {
    const draft = draftServices.find((ds) => ds.serviceId === s.serviceId)
    return { name: draft?.serviceName ?? 'Service', qty: s.qty, price: draft ? draft.price * s.qty : 0 }
  })

  function handleMouseEnter() {
    if (leaveTimer.current) clearTimeout(leaveTimer.current)
    setHovered(true)
  }
  function handleMouseLeave() {
    leaveTimer.current = setTimeout(() => setHovered(false), 120)
  }

  return (
    <div
      className="absolute"
      style={{
        left: hourLeftFn(start) + 1,
        width: blockW,
        top: track * TRACK_H + 2,
        height: TRACK_H - 4,
        zIndex: hovered ? 40 : 20,
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className={cn(
        'relative h-full w-full overflow-hidden rounded border px-1.5 text-[11px] font-medium flex flex-col justify-center cursor-default group/block',
        isOvertime
          ? 'bg-orange-200 border-red-400 text-orange-900 shadow-[inset_0_0_0_1px_rgb(239_68_68_/_0.4)]'
          : 'bg-orange-200 border-orange-300 text-orange-900',
      )}>
        {/* Red diagonal stripe ONLY on the segment outside work hours */}
        {earlyOtPx > 0 && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0"
            style={{
              width: earlyOtPx,
              backgroundImage:
                'repeating-linear-gradient(-45deg, rgb(220 38 38 / 0.35) 0px, rgb(220 38 38 / 0.35) 3px, transparent 3px, transparent 7px)',
            }}
          />
        )}
        {lateOtPx > 0 && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0"
            style={{
              width: lateOtPx,
              backgroundImage:
                'repeating-linear-gradient(-45deg, rgb(220 38 38 / 0.35) 0px, rgb(220 38 38 / 0.35) 3px, transparent 3px, transparent 7px)',
            }}
          />
        )}

        {isOvertime && blockW >= 60 && (
          <span className="absolute left-1 top-0.5 flex items-center gap-0.5 rounded bg-red-600 px-1 py-px text-[9px] font-bold text-white leading-none z-10">
            <AlertTriangle className="h-2.5 w-2.5" />
            OT
          </span>
        )}

        <span className={cn('truncate leading-tight font-mono pr-4 relative z-[1]', isOvertime && 'pl-7')}>
          {draftInfo.orderId || label}
        </span>
        {blockW >= 80 && (
          <span className={cn('truncate text-[10px] leading-tight relative z-[1]', isOvertime ? 'text-red-700 font-semibold' : 'text-orange-600', isOvertime && 'pl-7')}>{timeLabel}</span>
        )}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(a.id) }}
          className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded opacity-0 transition-opacity hover:bg-orange-400 group-hover/block:opacity-100 z-10"
          aria-label="Remove assignment"
        >
          <X className="h-2.5 w-2.5 text-orange-900" />
        </button>
      </div>

      {hovered && (
        <div
          className="absolute top-full left-0 mt-1 w-64 bg-white border border-border rounded-lg shadow-xl p-3 space-y-2.5 text-xs"
          style={{ zIndex: 50 }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {draftInfo.orderId && (
            <p className="font-mono font-bold text-foreground text-sm">{draftInfo.orderId}</p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="rounded border border-orange-200 bg-orange-100 px-2 py-0.5 text-[10px] font-bold uppercase text-orange-700">
              {draftInfo.mode === 'emergency' ? 'Emergency' : draftInfo.mode === 'waitlist' ? 'Waitlist' : 'Scheduled'}
            </span>
            <span className="rounded border border-border bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              Draft
            </span>
          </div>

          {draftInfo.customerName && (
            <div className="flex items-center gap-1.5 text-foreground">
              <User className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="font-medium">{draftInfo.customerName}</span>
            </div>
          )}

          {draftInfo.phone && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Phone className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span>{draftInfo.phone}</span>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span>{timeLabel}</span>
          </div>

          <div className="flex items-start gap-1.5">
            <ClipboardList className="h-3 w-3 shrink-0 mt-0.5 text-muted-foreground" />
            <div className="space-y-0.5">
              {serviceLines.map((s, i) => (
                <div key={i} className="flex items-center justify-between gap-4 text-foreground">
                  <span>{s.qty}&times; {s.name}</span>
                  {s.price > 0 && (
                    <span className="font-semibold text-foreground shrink-0">QAR {s.price.toFixed(0)}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {isOvertime && (
            <div className="rounded bg-destructive/10 border border-red-200 px-2 py-1.5 text-red-700 flex items-start gap-1.5">
              <span className="text-base leading-none shrink-0">&#x26A0;</span>
              <div className="space-y-0.5">
                <p className="font-semibold">Outside schedule ({formatOvertimeDuration(overtimeMinutes)} total)</p>
                {isEarlyStart && <p className="text-[11px]">{formatOvertimeDuration(earlyMinutes)} before schedule start</p>}
                {isLateEnd    && <p className="text-[11px]">{formatOvertimeDuration(lateMinutes)} past schedule end</p>}
              </div>
            </div>
          )}

          {draftInfo.notes && (
            <div className="rounded bg-amber-50 border border-amber-100 px-2 py-1.5 text-muted-foreground">
              <span className="font-semibold text-amber-700">Note: </span>
              {draftInfo.notes}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── VisitBlock ───────────────────────────────────────────────────────────────

interface VisitBlockProps {
  visit: CalendarVisit
  trackMap: Map<string, number>
  hourLeftFn: (h: number) => number
  workStart: number
  workEnd: number
  cellW: number
}

export function VisitBlock({ visit: v, trackMap, hourLeftFn, workStart, workEnd, cellW }: VisitBlockProps) {
  const [hovered, setHovered] = useState(false)
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const start = parseHour(v.start_time)
  if (start === null) return null
  const rawEnd = v.end_time ? parseHour(v.end_time) : null
  const end = rawEnd !== null && rawEnd > start ? rawEnd : start + 1
  const isEarlyStart = start < workStart
  const isLateEnd    = end > workEnd
  const isOvertime   = isEarlyStart || isLateEnd
  const earlyMinutes = isEarlyStart
    ? Math.max(0, workStart * 60 - (parseMinutes(v.start_time) ?? start * 60))
    : 0
  const lateMinutes = isLateEnd
    ? Math.max(0, (parseMinutes(v.end_time) ?? end * 60) - workEnd * 60)
    : 0
  const overtimeMinutes = earlyMinutes + lateMinutes

  const track = trackMap.get(`v-${v.id}`) ?? 0
  const blockW = (end - start) * 2 * cellW - 2
  const isSiteVisit       = v.source_type === 'site_visit'
  const isFollowUpRequest = v.visit_type === 'follow_up_request'
  const isFollowUp        = !isFollowUpRequest && (v.visit_type === 'follow_up' || v.visit_type === 'follow-up')

  // OT segment widths in px — see DraftBlock for the rationale.
  const earlyOtPx = isEarlyStart ? (workStart - start) * 2 * cellW : 0
  const lateOtPx  = isLateEnd ? (end - workEnd) * 2 * cellW : 0

  const timeLabel = [v.start_time, v.end_time]
    .filter(Boolean)
    .map((t) => fmt12(t!.substring(0, 5)))
    .join(' – ')

  function handleMouseEnter() {
    if (leaveTimer.current) clearTimeout(leaveTimer.current)
    setHovered(true)
  }
  function handleMouseLeave() {
    leaveTimer.current = setTimeout(() => setHovered(false), 120)
  }

  // Hue per visit_type — soft palette for booking calendar blocks.
  // Stays in sync with the solid palette in src/components/calendar/VisitBlock.tsx.
  // normal_order → orange, follow_up → yellow, follow_up_request → dashed yellow,
  // site_visit → green, contract_visit → purple, backwork → rose, emergency → red,
  // qc_visit → indigo.
  const styles = (() => {
    if (isFollowUpRequest) return {
      block:  'bg-yellow-50 border-yellow-400 border-dashed text-yellow-900',
      number: 'text-yellow-700',
      badge:  'border-yellow-300 bg-yellow-100 text-yellow-800',
    }
    if (isFollowUp) return {
      block:  'bg-yellow-100 border-yellow-400 text-yellow-900',
      number: 'text-yellow-700',
      badge:  'border-yellow-300 bg-yellow-50 text-yellow-800',
    }
    if (isSiteVisit) return {
      block:  'bg-green-100 border-green-300 text-green-900',
      number: 'text-green-700',
      badge:  'border-green-200 bg-green-50 text-green-700',
    }
    switch (v.visit_type) {
      case 'emergency':
        return {
          block:  'bg-red-100 border-red-300 text-red-900',
          number: 'text-red-700',
          badge:  'border-red-200 bg-red-50 text-red-700',
        }
      case 'backwork':
        return {
          block:  'bg-rose-100 border-rose-300 text-rose-900',
          number: 'text-rose-700',
          badge:  'border-rose-200 bg-rose-50 text-rose-700',
        }
      case 'contract_visit':
        return {
          block:  'bg-purple-100 border-purple-300 text-purple-900',
          number: 'text-purple-700',
          badge:  'border-purple-200 bg-purple-50 text-purple-700',
        }
      case 'site_visit_contract':
        return {
          block:  'bg-teal-100 border-teal-300 text-teal-900',
          number: 'text-teal-700',
          badge:  'border-teal-200 bg-teal-50 text-teal-700',
        }
      case 'qc_visit':
        return {
          block:  'bg-indigo-100 border-indigo-300 text-indigo-900',
          number: 'text-indigo-700',
          badge:  'border-indigo-200 bg-indigo-50 text-indigo-700',
        }
      default:
        // normal_order and unknown types — orange.
        return {
          block:  'bg-orange-100 border-orange-300 text-orange-900',
          number: 'text-orange-700',
          badge:  'border-orange-200 bg-orange-50 text-orange-700',
        }
    }
  })()
  const colorBlock = styles.block
  const colorNumber = styles.number
  const colorBadge = styles.badge

  return (
    <div
      className="absolute"
      style={{
        left: hourLeftFn(start) + 1,
        width: blockW,
        top: track * TRACK_H + 2,
        height: TRACK_H - 4,
        zIndex: hovered ? 40 : 10,
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className={cn(
        'relative h-full w-full overflow-hidden rounded border px-1 text-[11px] font-medium flex flex-col justify-center cursor-default',
        colorBlock,
        isOvertime && 'border-red-400 shadow-[inset_0_0_0_1px_rgb(239_68_68_/_0.4)]',
      )}>
        {/* OT stripes — only on the portion outside the team's work window */}
        {earlyOtPx > 0 && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0"
            style={{
              width: earlyOtPx,
              backgroundImage:
                'repeating-linear-gradient(-45deg, rgb(220 38 38 / 0.35) 0px, rgb(220 38 38 / 0.35) 3px, transparent 3px, transparent 7px)',
            }}
          />
        )}
        {lateOtPx > 0 && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0"
            style={{
              width: lateOtPx,
              backgroundImage:
                'repeating-linear-gradient(-45deg, rgb(220 38 38 / 0.35) 0px, rgb(220 38 38 / 0.35) 3px, transparent 3px, transparent 7px)',
            }}
          />
        )}

        {isOvertime && blockW >= 60 && (
          <span className="absolute left-1 top-0.5 flex items-center gap-0.5 rounded bg-red-600 px-1 py-px text-[9px] font-bold text-white leading-none z-10">
            <AlertTriangle className="h-2.5 w-2.5" />
            OT
          </span>
        )}

        {isFollowUpRequest && blockW >= 60 && (
          <span className="absolute right-1 top-0.5 rounded bg-yellow-200 px-1 py-px text-[9px] font-bold uppercase leading-none text-yellow-900 ring-1 ring-yellow-400 z-10">
            Requested
          </span>
        )}
        {v.order_number && (
          <span className={cn(`truncate font-mono leading-none relative z-[1]`, colorNumber, isOvertime && 'pl-7', isFollowUpRequest && blockW >= 60 && 'pr-16')} style={{ fontSize: 9 }}>
            {v.order_number}
          </span>
        )}
        <span className={cn('truncate leading-none relative z-[1]', isOvertime && 'pl-7')}>{v.customer_name ?? '—'}</span>
      </div>

      {hovered && (
        <div
          className="absolute top-full left-0 mt-1 w-64 bg-white border border-border rounded-lg shadow-xl p-3 space-y-2.5 text-xs"
          style={{ zIndex: 50 }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {v.order_number && (
            <p className="font-mono font-bold text-foreground text-sm">{v.order_number}</p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase ${colorBadge}`}>
              {v.status}
            </span>
            {isSiteVisit && (
              <span className="rounded border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] text-purple-600">
                Site Visit
              </span>
            )}
            {isFollowUpRequest && (
              <span className="rounded border border-yellow-300 bg-yellow-100 px-2 py-0.5 text-[10px] font-semibold text-yellow-800">
                Customer Follow-Up Request
              </span>
            )}
          </div>

          {v.customer_name && (
            <div className="flex items-center gap-1.5 text-foreground">
              <User className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="font-medium">{v.customer_name}</span>
            </div>
          )}

          {v.customer_phone && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Phone className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span>{v.customer_phone}</span>
            </div>
          )}

          {timeLabel && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span>{timeLabel}</span>
            </div>
          )}

          {v.services_summary && (
            <div className="flex items-start gap-1.5">
              <ClipboardList className="h-3 w-3 shrink-0 mt-0.5 text-muted-foreground" />
              <span className="text-foreground">{v.services_summary}</span>
            </div>
          )}

          {isOvertime && (
            <div className="rounded bg-destructive/10 border border-red-200 px-2 py-1.5 text-red-700 flex items-start gap-1.5">
              <span className="text-base leading-none shrink-0">&#x26A0;</span>
              <div className="space-y-0.5">
                <p className="font-semibold">Outside schedule ({formatOvertimeDuration(overtimeMinutes)} total)</p>
                {isEarlyStart && <p className="text-[11px]">{formatOvertimeDuration(earlyMinutes)} before schedule start</p>}
                {isLateEnd    && <p className="text-[11px]">{formatOvertimeDuration(lateMinutes)} past schedule end</p>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
