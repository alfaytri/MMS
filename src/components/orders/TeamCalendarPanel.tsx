// src/components/orders/TeamCalendarPanel.tsx
'use client'
import { useState, useMemo, useRef, useEffect } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Phone, ClipboardList, Clock, User, X, AlignJustify, Columns2 } from 'lucide-react'
import { format, addDays, subDays } from 'date-fns'
import { useTeams } from '@/hooks/useTeams'
import { useCalendarVisits, type CalendarVisit } from '@/hooks/useCalendarVisits'
import { useAllDivisionSchedules } from '@/hooks/useCalendarSchedule'
import { AllocateQuantityDialog } from './AllocateQuantityDialog'
import type { OrderServiceDraft, TeamAssignmentDraft, OrderMode } from '@/types/orders'
import { cn } from '@/lib/utils'

interface TeamRow {
  id: string
  name: string
  name_en: string | null
  name_ar: string | null
  members: Array<{ skills: string[] | null }>
  division: { slug: string; short_name: string | null; name: string } | null
}

const OFFHOURS_STYLE = {
  backgroundImage: 'repeating-linear-gradient(-45deg, rgb(0 0 0 / 0.04) 0px, rgb(0 0 0 / 0.04) 2px, transparent 2px, transparent 8px)',
} as const

/** Full day: 12 AM – 11 PM */
const HOURS = Array.from({ length: 24 }, (_, i) => i)
const DEFAULT_CELL_W  = 56   // px per hour column in scroll mode
const FIT_MIN_CELL_W  = 36   // minimum cell width in fit mode
const SIDEBAR_W       = 128  // team label column width
const TRACK_H         = 44   // px per stacking track

function formatHour(h: number): string {
  if (h === 0) return '12AM'
  if (h < 12) return `${h}AM`
  if (h === 12) return '12PM'
  return `${h - 12}PM`
}

/** Parse "HH:MM" or plain integer string → integer hour */
function parseHour(t: string | null): number | null {
  if (!t) return null
  const n = parseInt(t)
  return isNaN(n) ? null : n
}

/** Parse "HH:MM" → total minutes from midnight */
function parseMinutes(t: string | null): number | null {
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

// ---------------------------------------------------------------------------
// Track assignment — greedy interval scheduling
// ---------------------------------------------------------------------------

interface Block {
  id: string
  start: number   // hour
  end: number     // hour (exclusive)
}

/** Returns a map of block.id → track index (0-based). */
function assignTracks(blocks: Block[]): Map<string, number> {
  const sorted = [...blocks].sort((a, b) => a.start - b.start)
  const trackEnds: number[] = []  // trackEnds[i] = end hour of last block on track i
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

interface PendingDrop {
  service: OrderServiceDraft
  teamId: string
  teamName: string
  timeSlot: string
}

interface DraftInfo {
  orderId: string
  customerName: string
  phone: string
  notes: string
  mode: OrderMode
}

interface Props {
  visitDate: string
  /** The first date in the order's visit window — draft blocks are only rendered on this date */
  primaryVisitDate?: string
  mode: OrderMode
  onModeChange: (mode: OrderMode) => void
  assignments: TeamAssignmentDraft[]
  draftServices: OrderServiceDraft[]
  draftInfo: DraftInfo
  draggingService: OrderServiceDraft | null
  onAssign: (assignment: Omit<TeamAssignmentDraft, 'id'>) => void
  onRemoveAssignment: (id: string) => void
  onDateChange: (date: string) => void
  /** When editing an existing order, exclude its visits from the calendar so they don't double-render alongside the draft blocks */
  editingOrderNumber?: string | null
  /** All selected division slugs — only teams belonging to any of these are shown */
  divisionSlugs?: string[]
  /** When navigating from the main calendar, scroll to this team row on mount */
  initialTeamId?: string
  /** When navigating from the main calendar, scroll the timeline to this hour on mount */
  initialHour?: number
}

// ---------------------------------------------------------------------------
// DroppableCell — one hour slot per team row
// ---------------------------------------------------------------------------

interface DroppableCellProps {
  teamId: string
  hour: number
  isOccupied: boolean
  isSkillMatch: boolean | null
  rowHeight: number
  workStart: number
  workEnd: number
  cellW: number
}

function DroppableCell({ teamId, hour, isOccupied, isSkillMatch, rowHeight, workStart, workEnd, cellW }: DroppableCellProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: `${teamId}-${hour}`,
    data: { teamId, hour },
    disabled: isOccupied,
  })

  const isWorking = hour >= workStart && hour < workEnd

  return (
    <div
      ref={setNodeRef}
      style={{
        width: cellW, minWidth: cellW, height: rowHeight,
        ...(!isWorking && !isOccupied ? OFFHOURS_STYLE : {}),
      }}
      className={cn(
        'shrink-0 border-r border-slate-100 transition-colors',
        isOccupied && 'bg-slate-100 cursor-not-allowed',
        !isOccupied && isOver && 'bg-orange-50 ring-1 ring-inset ring-orange-300',
        !isOccupied && !isOver && isSkillMatch === true && 'bg-green-50',
        !isOccupied && isSkillMatch === false && 'opacity-40',
      )}
    />
  )
}

// ---------------------------------------------------------------------------
// DraftBlock — hoverable assignment block with popup card
// ---------------------------------------------------------------------------

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

function fmt12(t: string): string {
  const [hStr, mStr] = t.split(':')
  const h = parseInt(hStr)
  const m = mStr ?? '00'
  const period = h < 12 ? 'AM' : 'PM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${m} ${period}`
}

function DraftBlock({
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
  const blockW = (end - start) * cellW - 2

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
      {/* Block */}
      <div className={cn(
        'relative h-full w-full overflow-hidden rounded border px-1.5 text-[11px] font-medium flex flex-col justify-center cursor-default group/block',
        isOvertime ? 'bg-red-100 border-red-300 text-red-900' : 'bg-orange-200 border-orange-300 text-orange-900',
      )}>
        <span className="truncate leading-tight font-mono pr-4">
          {draftInfo.orderId || label}
        </span>
        {blockW >= 80 && (
          <span className={cn('truncate text-[10px] leading-tight', isOvertime ? 'text-red-600' : 'text-orange-600')}>{timeLabel}</span>
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

      {/* Hover popup */}
      {hovered && (
        <div
          className="absolute top-full left-0 mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-xl p-3 space-y-2.5 text-xs"
          style={{ zIndex: 50 }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {/* Order number + status */}
          {draftInfo.orderId && (
            <p className="font-mono font-bold text-slate-900 text-sm">{draftInfo.orderId}</p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="rounded border border-orange-200 bg-orange-100 px-2 py-0.5 text-[10px] font-bold uppercase text-orange-700">
              {draftInfo.mode === 'emergency' ? 'Emergency' : draftInfo.mode === 'waitlist' ? 'Waitlist' : 'Scheduled'}
            </span>
            <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-500">
              Draft
            </span>
          </div>

          {/* Customer */}
          {draftInfo.customerName && (
            <div className="flex items-center gap-1.5 text-slate-700">
              <User className="h-3 w-3 shrink-0 text-slate-400" />
              <span className="font-medium">{draftInfo.customerName}</span>
            </div>
          )}

          {/* Phone */}
          {draftInfo.phone && (
            <div className="flex items-center gap-1.5 text-slate-600">
              <Phone className="h-3 w-3 shrink-0 text-slate-400" />
              <span>{draftInfo.phone}</span>
            </div>
          )}

          {/* Time */}
          <div className="flex items-center gap-1.5 text-slate-600">
            <Clock className="h-3 w-3 shrink-0 text-slate-400" />
            <span>{timeLabel}</span>
          </div>

          {/* Services */}
          <div className="flex items-start gap-1.5">
            <ClipboardList className="h-3 w-3 shrink-0 mt-0.5 text-slate-400" />
            <div className="space-y-0.5">
              {serviceLines.map((s, i) => (
                <div key={i} className="flex items-center justify-between gap-4 text-slate-700">
                  <span>{s.qty}× {s.name}</span>
                  {s.price > 0 && (
                    <span className="font-semibold text-slate-900 shrink-0">QAR {s.price.toFixed(0)}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Overtime warning */}
          {isOvertime && (
            <div className="rounded bg-red-50 border border-red-200 px-2 py-1.5 text-red-700 flex items-start gap-1.5">
              <span className="text-base leading-none shrink-0">⚠</span>
              <div className="space-y-0.5">
                <p className="font-semibold">Outside schedule ({formatOvertimeDuration(overtimeMinutes)} total)</p>
                {isEarlyStart && <p className="text-[11px]">{formatOvertimeDuration(earlyMinutes)} before schedule start</p>}
                {isLateEnd    && <p className="text-[11px]">{formatOvertimeDuration(lateMinutes)} past schedule end</p>}
              </div>
            </div>
          )}

          {/* Notes */}
          {draftInfo.notes && (
            <div className="rounded bg-amber-50 border border-amber-100 px-2 py-1.5 text-slate-600">
              <span className="font-semibold text-amber-700">Note: </span>
              {draftInfo.notes}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// VisitBlock — hoverable existing calendar visit block with popup card
// ---------------------------------------------------------------------------

interface VisitBlockProps {
  visit: CalendarVisit
  trackMap: Map<string, number>
  hourLeftFn: (h: number) => number
  workStart: number
  workEnd: number
  cellW: number
}

function VisitBlock({ visit: v, trackMap, hourLeftFn, workStart, workEnd, cellW }: VisitBlockProps) {
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
  const blockW = (end - start) * cellW - 2
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
      {/* Block */}
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

      {/* Hover popup */}
      {hovered && (
        <div
          className="absolute top-full left-0 mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-xl p-3 space-y-2.5 text-xs"
          style={{ zIndex: 50 }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {v.order_number && (
            <p className="font-mono font-bold text-slate-900 text-sm">{v.order_number}</p>
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
            <div className="flex items-center gap-1.5 text-slate-700">
              <User className="h-3 w-3 shrink-0 text-slate-400" />
              <span className="font-medium">{v.customer_name}</span>
            </div>
          )}

          {v.customer_phone && (
            <div className="flex items-center gap-1.5 text-slate-600">
              <Phone className="h-3 w-3 shrink-0 text-slate-400" />
              <span>{v.customer_phone}</span>
            </div>
          )}

          {timeLabel && (
            <div className="flex items-center gap-1.5 text-slate-600">
              <Clock className="h-3 w-3 shrink-0 text-slate-400" />
              <span>{timeLabel}</span>
            </div>
          )}

          {v.services_summary && (
            <div className="flex items-start gap-1.5">
              <ClipboardList className="h-3 w-3 shrink-0 mt-0.5 text-slate-400" />
              <span className="text-slate-700">{v.services_summary}</span>
            </div>
          )}

          {/* Overtime warning */}
          {isOvertime && (
            <div className="rounded bg-red-50 border border-red-200 px-2 py-1.5 text-red-700 flex items-start gap-1.5">
              <span className="text-base leading-none shrink-0">⚠</span>
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

// ---------------------------------------------------------------------------
// DivisionHeaderRow
// ---------------------------------------------------------------------------

const DIVISION_HEADER_H = 32

function DivisionHeaderRow({ name, scheduleLabel, cellW }: { name: string; scheduleLabel?: string; cellW: number }) {
  // cap at content width so the row never causes extra horizontal scroll
  const contentW = SIDEBAR_W + HOURS.length * cellW
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

// ---------------------------------------------------------------------------
// TeamCalendarPanel
// ---------------------------------------------------------------------------

export function TeamCalendarPanel({
  visitDate,
  primaryVisitDate,
  mode,
  onModeChange,
  assignments,
  draftServices,
  draftInfo,
  draggingService,
  onAssign,
  onRemoveAssignment,
  onDateChange,
  editingOrderNumber,
  divisionSlugs,
  initialTeamId,
  initialHour,
}: Props) {
  // Only show draft blocks when viewing the primary assignment date.
  // On other days the user is checking availability, not placing assignments.
  const showDraftBlocks = !primaryVisitDate || visitDate === primaryVisitDate
  const { data: teamsRaw } = useTeams(
    divisionSlugs && divisionSlugs.length > 0 ? { divisionIds: divisionSlugs } : undefined
  )
  const teams = (teamsRaw ?? []) as unknown as TeamRow[]
  const { data: visits } = useCalendarVisits(visitDate, null)
  const divisionSchedules = useAllDivisionSchedules()
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null)
  const [fitMode, setFitMode] = useState(false)
  const [containerWidth, setContainerWidth] = useState(0)

  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const update = () => setContainerWidth(el.getBoundingClientRect().width)
    const ro = new ResizeObserver(update)
    ro.observe(el)
    update()
    return () => ro.disconnect()
  // scrollContainerRef is stable — intentional empty-dep here
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cellWidth = fitMode && containerWidth > SIDEBAR_W
    ? Math.max(Math.floor((containerWidth - SIDEBAR_W) / HOURS.length), FIT_MIN_CELL_W)
    : DEFAULT_CELL_W

  const divisionGroups = useMemo(() => {
    const groups = new Map<string, { slug: string; name: string; teams: TeamRow[] }>()
    for (const team of teams) {
      const slug = team.division?.slug ?? '__none__'
      const name = team.division?.name ?? team.division?.short_name ?? 'Unassigned'
      if (!groups.has(slug)) groups.set(slug, { slug, name, teams: [] })
      groups.get(slug)!.teams.push(team)
    }
    return Array.from(groups.values())
  }, [teams])

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const teamRowRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const hasScrolled = useRef(false)

  useEffect(() => {
    if (hasScrolled.current || !initialTeamId || teams.length === 0) return
    hasScrolled.current = true
    const container = scrollContainerRef.current
    if (!container) return
    if (typeof initialHour === 'number') {
      container.scrollLeft = Math.max(0, initialHour * cellWidth - SIDEBAR_W)
    }
    const row = teamRowRefs.current.get(initialTeamId)
    if (row) {
      const rowTop = row.offsetTop
      container.scrollTop = Math.max(0, rowTop - container.clientHeight / 3)
    }
  }, [initialTeamId, initialHour, teams])

  const date = useMemo(() => new Date(visitDate), [visitDate])

  const teamSkillMap = useMemo<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {}
    teams.forEach((t) => { map[t.id] = t.members.flatMap((e) => e.skills ?? []) })
    return map
  }, [teams])

  function getSkillMatch(teamId: string): boolean | null {
    if (!draggingService?.rootSkillId) return null
    return (teamSkillMap[teamId] ?? []).includes(draggingService.rootSkillId)
  }

  function teamDisplayName(team: TeamRow): string {
    return team.name_en ?? team.name
  }

  /** Build a human-readable label for a draft assignment block */
  function assignmentLabel(a: TeamAssignmentDraft): string {
    return a.services.map((s) => {
      const draft = draftServices.find((ds) => ds.serviceId === s.serviceId)
      const name = draft?.serviceName ?? 'Service'
      return s.qty > 1 ? `${s.qty}× ${name}` : name
    }).join(', ')
  }

  /**
   * Compute block end hour for an assignment.
   * toTime is INCLUSIVE: "10:00" means the 10AM cell is occupied → end = 11
   */
  function assignmentEnd(a: TeamAssignmentDraft, start: number): number {
    if (a.toTime) {
      const h = parseHour(a.toTime)
      return h !== null ? h + 1 : start + Math.max(1, Math.ceil(a.duration / 60))
    }
    return start + Math.max(1, Math.ceil(a.duration / 60))
  }

  /** Returns true if the team already has an existing visit covering this hour */
  function isOccupied(teamId: string, hour: number): boolean {
    return (visits ?? []).some((v) => {
      if (v.team_id !== teamId || !v.start_time) return false
      const start = parseHour(v.start_time)
      if (start === null) return false
      const rawEnd = v.end_time ? parseHour(v.end_time) : null
      const end = rawEnd !== null && rawEnd > start ? rawEnd : start + 1
      return hour >= start && hour < end
    })
  }

  /** Visits belonging to one team, excluding the order currently being edited */
  function visitsForTeam(teamId: string): CalendarVisit[] {
    return (visits ?? []).filter((v) =>
      v.team_id === teamId &&
      v.start_time !== null &&
      (!editingOrderNumber || v.order_number !== editingOrderNumber)
    )
  }

  /** Draft assignments belonging to one team — hidden when viewing a non-primary date */
  function assignmentsForTeam(teamId: string): TeamAssignmentDraft[] {
    if (!showDraftBlocks) return []
    return assignments.filter((a) => a.teamId === teamId)
  }

  /** CSS left offset for a given hour */
  function hourLeft(h: number): number {
    return (h - HOURS[0]) * cellWidth
  }

  /**
   * Compute all blocks (visits + assignments) for a team, assign tracks,
   * and return the row height needed to fit them all.
   */
  function computeTeamLayout(teamId: string): {
    trackMap: Map<string, number>
    rowHeight: number
  } {
    const teamVisits = visitsForTeam(teamId)
    const teamAssignments = assignmentsForTeam(teamId)

    // Existing visits occupy the top tracks
    const visitBlocks: Block[] = []
    for (const v of teamVisits) {
      const start = parseHour(v.start_time)
      if (start === null) continue
      const rawEnd = v.end_time ? parseHour(v.end_time) : null
      const end = rawEnd !== null && rawEnd > start ? rawEnd : start + 1
      visitBlocks.push({ id: `v-${v.id}`, start, end })
    }
    const visitTrackMap = assignTracks(visitBlocks)
    const maxVisitTrack = visitBlocks.length === 0
      ? -1
      : Math.max(...Array.from(visitTrackMap.values()))

    // Draft assignments always go below all existing visit tracks
    const assignmentBlocks: Block[] = []
    for (const a of teamAssignments) {
      const start = parseHour(a.timeSlot)
      if (start === null) continue
      const end = assignmentEnd(a, start)
      assignmentBlocks.push({ id: `a-${a.id}`, start, end })
    }
    const assignmentTrackMap = assignTracks(assignmentBlocks)
    const draftOffset = maxVisitTrack + 1

    const trackMap = new Map<string, number>([
      ...visitTrackMap,
      ...Array.from(assignmentTrackMap.entries()).map(
        ([id, t]): [string, number] => [id, t + draftOffset],
      ),
    ])

    const allValues = Array.from(trackMap.values())
    const maxTrack = allValues.length === 0 ? 0 : Math.max(...allValues)
    const trackCount = allValues.length === 0 ? 1 : maxTrack + 1
    const rowHeight = trackCount * TRACK_H

    return { trackMap, rowHeight }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Previous day"
            onClick={() => onDateChange(format(subDays(date, 1), 'yyyy-MM-dd'))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[7rem] text-center text-sm font-medium">
            {format(date, 'EEE, MMM d')}
          </span>
          {primaryVisitDate && visitDate !== primaryVisitDate && (
            <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 font-medium">
              Availability view
            </span>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Next day"
            onClick={() => onDateChange(format(addDays(date, 1), 'yyyy-MM-dd'))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex gap-1">
          {(['normal', 'emergency', 'waitlist'] as OrderMode[]).map((m) => (
            <Button key={m} size="sm" variant={mode === m ? 'default' : 'outline'}
              className="h-7 capitalize text-xs" onClick={() => onModeChange(m)}>
              {m === 'normal' ? 'Normal' : m === 'emergency' ? 'Emergency' : 'Wait List'}
            </Button>
          ))}
          <Button
            size="sm"
            variant={fitMode ? 'default' : 'outline'}
            className="h-7 text-xs gap-1"
            title={fitMode ? 'Switch to scroll mode' : 'Fit all hours on screen'}
            onClick={() => setFitMode(f => !f)}
          >
            {fitMode ? <AlignJustify className="h-3.5 w-3.5" /> : <Columns2 className="h-3.5 w-3.5" />}
            {fitMode ? 'Scroll' : 'Fit'}
          </Button>
        </div>
      </div>

      {/* ── Grid ── */}
      <div ref={scrollContainerRef} className="flex-1 overflow-auto">
        <div className="flex min-w-max flex-col">

          {/* Hour header row */}
          <div className="flex border-b bg-slate-50 sticky top-0 z-10">
            <div className="w-32 shrink-0 border-r px-2 py-1 text-xs font-medium text-slate-500">
              Teams / Time
            </div>
            <div className="flex">
              {HOURS.map((h) => (
                <div
                  key={h}
                  style={{ width: cellWidth, minWidth: cellWidth }}
                  className="shrink-0 border-r border-slate-100 px-1 py-1 text-center text-[10px] text-slate-500"
                >
                  {formatHour(h)}
                </div>
              ))}
            </div>
          </div>

          {/* Team rows — grouped by division */}
          {divisionGroups.map((group) => {
            const sched = divisionSchedules.get(group.slug)
            const workStart = sched?.day_start ?? 0
            const workEnd   = sched?.day_end   ?? 24
            return (
              <div key={group.slug}>
                <DivisionHeaderRow name={group.name} scheduleLabel={sched?.label} cellW={cellWidth} />
                {group.teams.map((team: TeamRow) => {
                  const { trackMap, rowHeight } = computeTeamLayout(team.id)
                  return (
                    <div
                      key={team.id}
                      ref={(el) => { if (el) teamRowRefs.current.set(team.id, el); else teamRowRefs.current.delete(team.id) }}
                      className={cn('flex border-b', initialTeamId === team.id && 'ring-2 ring-inset ring-orange-400/60')}
                    >
                      {/* Team label */}
                      <div
                        style={{ height: rowHeight }}
                        className={cn(
                          'w-32 shrink-0 flex flex-col justify-center border-r px-2 gap-0.5',
                          draggingService && getSkillMatch(team.id) === false && 'opacity-40',
                        )}
                      >
                        <p className="max-w-[110px] truncate text-sm font-medium text-slate-900">
                          {teamDisplayName(team)}
                        </p>
                      </div>

                      {/* Hour cells + absolutely-positioned blocks */}
                      <div className="relative flex">
                        {HOURS.map((hour) => (
                          <DroppableCell
                            key={hour}
                            teamId={team.id}
                            hour={hour}
                            isOccupied={isOccupied(team.id, hour)}
                            isSkillMatch={draggingService ? getSkillMatch(team.id) : null}
                            rowHeight={rowHeight}
                            workStart={workStart}
                            workEnd={workEnd}
                            cellW={cellWidth}
                          />
                        ))}

                        {/* Existing calendar visits */}
                        {visitsForTeam(team.id).map((v) => (
                          <VisitBlock
                            key={v.id}
                            visit={v}
                            trackMap={trackMap}
                            hourLeftFn={hourLeft}
                            workStart={workStart}
                            workEnd={workEnd}
                            cellW={cellWidth}
                          />
                        ))}

                        {/* Draft assignments */}
                        {assignmentsForTeam(team.id).map((a) => (
                          <DraftBlock
                            key={a.id}
                            assignment={a}
                            draftServices={draftServices}
                            draftInfo={draftInfo}
                            trackMap={trackMap}
                            assignmentEndFn={assignmentEnd}
                            assignmentLabelFn={assignmentLabel}
                            hourLeftFn={hourLeft}
                            onRemove={onRemoveAssignment}
                            workStart={workStart}
                            workEnd={workEnd}
                            cellW={cellWidth}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Allocate Quantity Dialog ── */}
      {pendingDrop && (
        <AllocateQuantityDialog
          open
          onOpenChange={(v) => { if (!v) setPendingDrop(null) }}
          service={pendingDrop.service}
          teamId={pendingDrop.teamId}
          teamName={pendingDrop.teamName}
          timeSlot={pendingDrop.timeSlot}
          onConfirm={(allocs) => {
            allocs.forEach((a) =>
              onAssign({
                teamId: a.teamId,
                teamName: a.teamName,
                services: [{ serviceId: pendingDrop.service.serviceId, qty: a.qty }],
                timeSlot: a.timeSlot,
                toTime: pendingDrop.service.toTime ?? null,
                duration: pendingDrop.service.duration,
              }),
            )
            setPendingDrop(null)
          }}
        />
      )}
    </div>
  )
}
