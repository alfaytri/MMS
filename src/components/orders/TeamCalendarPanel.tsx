// src/components/orders/TeamCalendarPanel.tsx
'use client'
import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, AlignJustify, Columns2 } from 'lucide-react'
import { format, addDays, subDays, isToday, parseISO } from 'date-fns'
import { useTeams, type TeamFull } from '@/hooks/useTeams'
import { useCalendarVisits, type CalendarVisit } from '@/hooks/useCalendarVisits'
import { useAllDivisionSchedules } from '@/hooks/useCalendarSchedule'
import { AllocateQuantityDialog } from './AllocateQuantityDialog'
import {
  DroppableCell, DraftBlock, VisitBlock, DivisionHeaderRow,
  assignTracks, parseHour, parseMinutes,
  TRACK_H, SIDEBAR_W,
  type PendingDrop, type DraftInfo,
} from './CalendarBlocks'
import type { OrderServiceDraft, TeamAssignmentDraft, OrderMode } from '@/types/orders'
import { cn } from '@/lib/utils'
import { useTeamSkills } from '@/hooks/useTeamSkills'
import { useServiceTree } from '@/hooks/useServices'
import { useTeamServiceFilter } from '@/hooks/useTeamServiceFilter'
import { deriveCalendarScheduleRaw } from '@/hooks/useCalendarSchedule'


/** Full day: 48 half-hour slots: 0, 0.5, 1, 1.5, … 23.5 */
const SLOTS = Array.from({ length: 48 }, (_, i) => i * 0.5)
const DEFAULT_CELL_W  = 36
const FIT_MIN_CELL_W  = 24

function formatSlotLabel(slot: number): string {
  const hour = Math.floor(slot)
  const isHalf = slot % 1 !== 0
  if (isHalf) return ':30'
  if (hour === 0) return '12AM'
  if (hour < 12) return `${hour}AM`
  if (hour === 12) return '12PM'
  return `${hour - 12}PM`
}

interface Props {
  visitDate: string
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
  editingOrderNumber?: string | null
  divisionSlugs?: string[]
  initialTeamId?: string
  initialHour?: number
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
  const { data: teamsRaw } = useTeams(
    divisionSlugs && divisionSlugs.length > 0 ? { divisionIds: divisionSlugs } : undefined
  )
  const teams = (teamsRaw ?? []) as TeamFull[]

  const { data: teamSkillsMap = new Map<string, string[]>() } = useTeamSkills(null)
  const { data: serviceTreeAll } = useServiceTree('normal', [], draftServices.length > 0)

  const assignedTeamIds = useMemo(
    () => assignments.map(a => a.teamId),
    [assignments],
  )

  const capableTeamIds = useTeamServiceFilter(
    draftServices,
    serviceTreeAll,
    teamSkillsMap,
    assignedTeamIds,
  )

  const filteredTeams = useMemo(
    () => {
      const t = (teamsRaw ?? []) as TeamFull[]
      return capableTeamIds.size === 0
        ? t
        : t.filter(tm => capableTeamIds.has(tm.id))
    },
    [teamsRaw, capableTeamIds],
  )

  const { data: visits } = useCalendarVisits(visitDate, null)
  const divisionSchedules = useAllDivisionSchedules()
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null)
  const [fitMode, setFitMode] = useState(false)
  const [containerWidth, setContainerWidth] = useState(0)
  const [nowMinutes, setNowMinutes] = useState<number | null>(null)

  useEffect(() => {
    const tick = () => {
      const n = new Date()
      setNowMinutes(n.getHours() * 60 + n.getMinutes())
    }
    tick()
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [])

  const dateIsToday = isToday(parseISO(visitDate))

  const isSlotPast = useCallback(
    (slot: number) => dateIsToday && nowMinutes !== null && slot * 60 < nowMinutes,
    [dateIsToday, nowMinutes],
  )

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const teamRowRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const hasScrolled = useRef(false)

  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const update = () => setContainerWidth(el.getBoundingClientRect().width)
    const ro = new ResizeObserver(update)
    ro.observe(el)
    update()
    return () => ro.disconnect()
  // scrollContainerRef is stable — intentional empty-dep here
  }, [])

  const cellWidth = fitMode && containerWidth > SIDEBAR_W
    ? Math.max(Math.floor((containerWidth - SIDEBAR_W) / SLOTS.length), FIT_MIN_CELL_W)
    : DEFAULT_CELL_W

  const divisionGroups = useMemo(() => {
    const groups = new Map<string, { slug: string; name: string; teams: TeamFull[] }>()
    for (const team of filteredTeams) {
      const slug = team.division?.slug ?? '__none__'
      const name = team.division?.name ?? team.division?.short_name ?? 'Unassigned'
      if (!groups.has(slug)) groups.set(slug, { slug, name, teams: [] })
      groups.get(slug)!.teams.push(team)
    }
    return Array.from(groups.values())
  }, [filteredTeams])

  useEffect(() => {
    if (hasScrolled.current || !initialTeamId || !teamsRaw?.length) return
    hasScrolled.current = true
    const container = scrollContainerRef.current
    if (!container) return
    if (typeof initialHour === 'number') {
      container.scrollLeft = Math.max(0, initialHour * 2 * cellWidth - SIDEBAR_W)
    }
    const row = teamRowRefs.current.get(initialTeamId)
    if (row) {
      const rowTop = row.offsetTop
      container.scrollTop = Math.max(0, rowTop - container.clientHeight / 3)
    }
  }, [initialTeamId, initialHour, teamsRaw, cellWidth])

  const date = useMemo(() => new Date(visitDate), [visitDate])

  const teamSkillMap = useMemo<Record<string, string[]>>(() => {
    const map: Record<string, string[]> = {}
    filteredTeams.forEach((t) => { map[t.id] = t.members.flatMap((e) => e.skills ?? []) })
    return map
  }, [filteredTeams])

  function getSkillMatch(teamId: string): boolean | null {
    if (!draggingService?.rootSkillId) return null
    return (teamSkillMap[teamId] ?? []).includes(draggingService.rootSkillId)
  }

  function teamDisplayName(team: TeamFull): string {
    return team.name_en ?? team.name
  }

  function assignmentLabel(a: TeamAssignmentDraft): string {
    return a.services.map((s) => {
      const draft = draftServices.find((ds) => ds.serviceId === s.serviceId)
      const name = draft?.serviceName ?? 'Service'
      return s.qty > 1 ? `${s.qty}× ${name}` : name
    }).join(', ')
  }

  function assignmentEnd(a: TeamAssignmentDraft, start: number): number {
    // toTime is the actual end of the window (e.g. "10:30" means ends at 10:30,
    // NOT "ends at 11"). Use minute-precise hours so 1h blocks render as 1h.
    const endHour = parseHour(a.toTime)
    if (endHour !== null && endHour > start) return endHour
    return start + Math.max(0.5, a.duration / 60)
  }

  function isSlotOccupied(teamId: string, slot: number): boolean {
    const slotMinutes = slot * 60
    const slotEndMinutes = slotMinutes + 30
    return (visits ?? []).some((v) => {
      if (v.team_id !== teamId || !v.start_time) return false
      const startMin = parseMinutes(v.start_time) ?? (parseHour(v.start_time)! * 60)
      const endMin = v.end_time
        ? (parseMinutes(v.end_time) ?? ((parseHour(v.end_time) ?? 0) * 60))
        : startMin + 60
      if (endMin <= startMin) return false
      return slotMinutes < endMin && slotEndMinutes > startMin
    })
  }

  function visitsForTeam(teamId: string): CalendarVisit[] {
    return (visits ?? []).filter((v) =>
      v.team_id === teamId &&
      v.start_time !== null &&
      (!editingOrderNumber || v.order_number !== editingOrderNumber)
    )
  }

  function assignmentsForTeam(teamId: string): TeamAssignmentDraft[] {
    return assignments.filter((a) => {
      if (a.teamId !== teamId) return false
      const assignmentDate = a.date ?? primaryVisitDate ?? visitDate
      return visitDate === assignmentDate
    })
  }

  function hourLeft(h: number): number {
    return (h - SLOTS[0]) * 2 * cellWidth
  }

  function computeTeamLayout(teamId: string): {
    trackMap: Map<string, number>
    rowHeight: number
  } {
    const teamVisits = visitsForTeam(teamId)
    const teamAssignments = assignmentsForTeam(teamId)

    const visitBlocks: { id: string; start: number; end: number }[] = []
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

    const assignmentBlocks: { id: string; start: number; end: number }[] = []
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
            <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground font-medium">
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
        <div className="relative flex min-w-max flex-col">
          {/* Now indicator */}
          {dateIsToday && nowMinutes !== null && (
            <div
              aria-hidden="true"
              className="absolute top-0 bottom-0 pointer-events-none z-[25]"
              style={{ left: SIDEBAR_W + (nowMinutes / 30) * cellWidth }}
            >
              <div className="absolute -top-1.5 -left-1.5 h-3 w-3 rounded-full bg-red-500 ring-2 ring-red-200" />
              <div className="absolute top-0 left-0 w-0.5 h-full bg-red-500/85" />
            </div>
          )}

          {/* Time header row */}
          <div className="flex border-b bg-muted sticky top-0 z-10">
            <div className="w-32 shrink-0 border-r px-2 py-1 text-xs font-medium text-muted-foreground">
              Teams / Time
            </div>
            <div className="flex">
              {SLOTS.map((slot) => {
                const isHalf = slot % 1 !== 0
                return (
                  <div
                    key={slot}
                    style={{ width: cellWidth, minWidth: cellWidth }}
                    className={cn(
                      'shrink-0 px-0.5 py-1 text-center text-[10px] text-muted-foreground',
                      isHalf ? 'border-r border-slate-100/50' : 'border-r border-slate-100',
                    )}
                  >
                    {formatSlotLabel(slot)}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Team rows — grouped by division */}
          {divisionGroups.map((group) => {
            const divSched = divisionSchedules.get(group.slug)
            return (
              <div key={group.slug}>
                <DivisionHeaderRow name={group.name} scheduleLabel={divSched?.label} cellW={cellWidth} slotCount={SLOTS.length} />
                {group.teams.map((team: TeamFull) => {
                  const teamSched = team.schedule?.days
                    ? deriveCalendarScheduleRaw(team.schedule.days as Record<string, { enabled: boolean; start: string; end: string }>)
                    : null
                  const workStart = teamSched?.day_start ?? 0
                  const workEnd   = teamSched?.day_end   ?? 24
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
                        <p className="max-w-[110px] truncate text-sm font-medium text-foreground">
                          {teamDisplayName(team)}
                        </p>
                      </div>

                      {/* Half-hour cells + absolutely-positioned blocks */}
                      <div className="relative flex">
                        {SLOTS.map((slot) => (
                          <DroppableCell
                            key={slot}
                            teamId={team.id}
                            slot={slot}
                            isOccupied={isSlotOccupied(team.id, slot)}
                            isPast={isSlotPast(slot)}
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
