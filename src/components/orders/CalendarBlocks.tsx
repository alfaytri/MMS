'use client'

import { useState, useRef } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { Phone, ClipboardList, Clock, User, X } from 'lucide-react'
import type { CalendarVisit } from '@/hooks/useCalendarVisits'
import type { OrderServiceDraft, TeamAssignmentDraft } from '@/types/orders'
import { cn } from '@/lib/utils'

// ─── Shared Constants ─────────────────────────────────────────────────────────

export const TRACK_H = 44
export const SIDEBAR_W = 128
export const DIVISION_HEADER_H = 32

export const OFFHOURS_STYLE = {
  backgroundImage: 'repeating-linear-gradient(-45deg, rgb(0 0 0 / 0.04) 0px, rgb(0 0 0 / 0.04) 2px, transparent 2px, transparent 8px)',
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
  const blocked = isOccupied || isPast
  const { isOver, setNodeRef } = useDroppable({
    id: `${teamId}-${slot}`,
    data: { teamId, hour, minute },
    disabled: blocked,
  })

  const isWorking = slot >= workStart && slot < workEnd
  const isHalf = slot % 1 !== 0

  return (
    <div
      ref={setNodeRef}
      style={{
        width: cellW, minWidth: cellW, height: rowHeight,
        ...(!isWorking && !blocked ? OFFHOURS_STYLE : {}),
      }}
      className={cn(
        'shrink-0 transition-colors',
        isHalf ? 'border-r border-slate-100/50' : 'border-r border-slate-100',
        blocked && 'bg-muted cursor-not-allowed',
        isPast && !isOccupied && 'bg-muted',
        !blocked && isOver && 'bg-orange-50 ring-1 ring-inset ring-orange-300',
        !blocked && !isOver && isSkillMatch === true && 'bg-success/10',
        !blocked && isSkillMatch === false && 'opacity-40',
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
        className="sticky left-0 z-10 flex items-center gap-3 px-4 bg-orange-50/80 border-y border-orange-100"
        style={{ height: DIVISION_HEADER_H, width: `min(100vw, ${contentW}px)` }}
      >
        <div className="flex-1 h-px bg-orange-300/50" />
        <div className="flex flex-col items-center shrink-0 gap-0.5">
          <span className="text-[11px] font-bold text-orange-600 tracking-widest uppercase">{name}</span>
          {scheduleLabel && (
            <span className="text-[9px] text-orange-400/80">{scheduleLabel}</span>
          )}
        </div>
        <div className="flex-1 h-px bg-orange-300/50" />
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
        isOvertime ? 'bg-red-100 border-red-300 text-red-900' : 'bg-orange-200 border-orange-300 text-orange-900',
      )}>
        <span className="truncate leading-tight font-mono pr-4">
          {draftInfo.orderId || label}
        </span>
        {blockW >= 80 && (
          <span className={cn('truncate text-[10px] leading-tight', isOvertime ? 'text-destructive' : 'text-orange-600')}>{timeLabel}</span>
        )}
        {isOvertime && (
          <span className="absolute right-5 top-0.5 rounded bg-red-500 px-1 text-[8px] font-bold text-white leading-tight py-px">OT</span>
        )}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(a.id) }}
          className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded opacity-0 transition-opacity hover:bg-orange-400 group-hover/block:opacity-100"
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
  const isSiteVisit = v.source_type === 'site_visit'

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

  const colorBlock = isSiteVisit
    ? 'bg-purple-100 border-purple-300 text-purple-900'
    : 'bg-blue-100 border-blue-300 text-blue-900'
  const colorNumber = isSiteVisit ? 'text-purple-600' : 'text-blue-600'
  const colorBadge = isSiteVisit
    ? 'border-purple-200 bg-purple-50 text-purple-700'
    : 'border-blue-200 bg-blue-50 text-blue-700'

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
      <div className={`relative h-full w-full overflow-hidden rounded border px-1 text-[11px] font-medium flex flex-col justify-center cursor-default ${colorBlock}`}>
        {v.order_number && (
          <span className={`truncate font-mono leading-none ${colorNumber}`} style={{ fontSize: 9 }}>
            {v.order_number}
          </span>
        )}
        <span className="truncate leading-none">{v.customer_name ?? '—'}</span>
        {isOvertime && (
          <span className="absolute right-0.5 top-0.5 rounded bg-red-500 px-1 text-[8px] font-bold text-white leading-tight py-px">OT</span>
        )}
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
