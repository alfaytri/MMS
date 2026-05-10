// src/components/orders/TeamCalendarPanel.tsx
'use client'
import { useState, useMemo, useRef } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Phone, ClipboardList, Clock, User } from 'lucide-react'
import { format, addDays, subDays } from 'date-fns'
import { useTeams } from '@/hooks/useTeams'
import { useCalendarVisits, type CalendarVisit } from '@/hooks/useCalendarVisits'
import { AllocateQuantityDialog } from './AllocateQuantityDialog'
import type { OrderServiceDraft, TeamAssignmentDraft, OrderMode } from '@/types/orders'
import { cn } from '@/lib/utils'

interface TeamRow {
  id: string
  name: string
  name_en: string | null
  name_ar: string | null
  members: Array<{ skills: string[] | null }>
}

/** Full day: 12 AM – 11 PM */
const HOURS = Array.from({ length: 24 }, (_, i) => i)
const CELL_W = 56   // px per hour column — w-14
const TRACK_H = 44  // px per stacking track

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
  customerName: string
  phone: string
  notes: string
  mode: OrderMode
}

interface Props {
  visitDate: string
  mode: OrderMode
  onModeChange: (mode: OrderMode) => void
  assignments: TeamAssignmentDraft[]
  draftServices: OrderServiceDraft[]
  draftInfo: DraftInfo
  draggingService: OrderServiceDraft | null
  onAssign: (assignment: Omit<TeamAssignmentDraft, 'id'>) => void
  onDateChange: (date: string) => void
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
}

function DroppableCell({ teamId, hour, isOccupied, isSkillMatch, rowHeight }: DroppableCellProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: `${teamId}-${hour}`,
    data: { teamId, hour },
    disabled: isOccupied,
  })

  return (
    <div
      ref={setNodeRef}
      style={{ width: CELL_W, minWidth: CELL_W, height: rowHeight }}
      className={cn(
        'shrink-0 border-r border-slate-100 transition-colors',
        isOccupied && 'bg-slate-100 cursor-not-allowed',
        !isOccupied && isOver && 'bg-orange-50 ring-1 ring-inset ring-orange-300',
        !isOccupied && isSkillMatch === true && 'bg-green-50',
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
}: DraftBlockProps) {
  const [hovered, setHovered] = useState(false)
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const start = parseHour(a.timeSlot)
  if (start === null) return null

  const end = assignmentEndFn(a, start)
  const track = trackMap.get(`a-${a.id}`) ?? 0
  const label = assignmentLabelFn(a)
  const blockW = (end - start) * CELL_W - 2

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
      <div className="h-full w-full overflow-hidden rounded bg-orange-200 border border-orange-300 px-1.5 text-[11px] text-orange-900 font-medium flex flex-col justify-center cursor-default">
        <span className="truncate leading-tight">{label}</span>
        {blockW >= 80 && (
          <span className="truncate text-[10px] text-orange-600 leading-tight">{timeLabel}</span>
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
          {/* Status badge */}
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
// TeamCalendarPanel
// ---------------------------------------------------------------------------

export function TeamCalendarPanel({
  visitDate,
  mode,
  onModeChange,
  assignments,
  draftServices,
  draftInfo,
  draggingService,
  onAssign,
  onDateChange,
}: Props) {
  const { data: teamsRaw } = useTeams()
  const teams = (teamsRaw ?? []) as unknown as TeamRow[]
  const { data: visits } = useCalendarVisits(visitDate, null)
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null)

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
      const end = v.end_time ? parseHour(v.end_time) : (start !== null ? start + 1 : null)
      if (start === null || end === null) return false
      return hour >= start && hour < end
    })
  }

  /** Visits belonging to one team */
  function visitsForTeam(teamId: string): CalendarVisit[] {
    return (visits ?? []).filter((v) => v.team_id === teamId && v.start_time !== null)
  }

  /** Draft assignments belonging to one team */
  function assignmentsForTeam(teamId: string): TeamAssignmentDraft[] {
    return assignments.filter((a) => a.teamId === teamId)
  }

  /** CSS left offset for a given hour */
  function hourLeft(h: number): number {
    return (h - HOURS[0]) * CELL_W
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

    const blocks: Block[] = []

    for (const v of teamVisits) {
      const start = parseHour(v.start_time)
      const end = v.end_time ? parseHour(v.end_time) : (start !== null ? start + 1 : null)
      if (start !== null && end !== null) {
        blocks.push({ id: `v-${v.id}`, start, end })
      }
    }

    for (const a of teamAssignments) {
      const start = parseHour(a.timeSlot)
      if (start === null) continue
      const end = assignmentEnd(a, start)
      blocks.push({ id: `a-${a.id}`, start, end })
    }

    const trackMap = assignTracks(blocks)
    const maxTrack = blocks.length === 0 ? 0 : Math.max(...Array.from(trackMap.values()))
    const trackCount = blocks.length === 0 ? 1 : maxTrack + 1
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
        </div>
      </div>

      {/* ── Grid ── */}
      <div className="flex-1 overflow-auto">
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
                  style={{ width: CELL_W, minWidth: CELL_W }}
                  className="shrink-0 border-r border-slate-100 px-1 py-1 text-center text-[10px] text-slate-500"
                >
                  {formatHour(h)}
                </div>
              ))}
            </div>
          </div>

          {/* Team rows */}
          {(teams ?? []).map((team: TeamRow) => {
            const { trackMap, rowHeight } = computeTeamLayout(team.id)

            return (
              <div key={team.id} className="flex border-b">
                {/* Team label */}
                <div
                  style={{ height: rowHeight }}
                  className={cn(
                    'w-32 shrink-0 flex items-center border-r px-2',
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
                    />
                  ))}

                  {/* Existing calendar visits */}
                  {visitsForTeam(team.id).map((v) => {
                    const start = parseHour(v.start_time)
                    const end = v.end_time ? parseHour(v.end_time) : (start !== null ? start + 1 : null)
                    if (start === null || end === null) return null
                    const track = trackMap.get(`v-${v.id}`) ?? 0
                    return (
                      <div
                        key={v.id}
                        title={v.customer_name ?? v.id}
                        className="absolute overflow-hidden rounded bg-blue-100 px-1 text-xs text-blue-800 flex items-center pointer-events-none"
                        style={{
                          left: hourLeft(start) + 1,
                          width: (end - start) * CELL_W - 2,
                          top: track * TRACK_H + 2,
                          height: TRACK_H - 4,
                        }}
                      >
                        <span className="truncate">{v.customer_name ?? '—'}</span>
                      </div>
                    )
                  })}

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
                    />
                  ))}
                </div>
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
