'use client'

import { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import {
  DndContext, DragOverlay, pointerWithin, useDraggable,
  PointerSensor, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { Loader2, AlignJustify, Columns2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useContractSchedule } from '@/hooks/useContractSchedule'
import { useTeams, type TeamFull } from '@/hooks/useTeams'
import { useCalendarVisits, type CalendarVisit } from '@/hooks/useCalendarVisits'
import { useAllDivisionSchedules, deriveCalendarScheduleRaw } from '@/hooks/useCalendarSchedule'
import {
  DroppableCell, VisitBlock, DivisionHeaderRow, TRACK_H, SIDEBAR_W,
} from '@/components/orders/CalendarBlocks'
import {
  HALF_HOUR_SLOTS as SLOTS, formatSlotLabel, fitCellWidth,
  toHours as parseHour, toMinutesSafe as parseMinutes, assignTracks,
} from '@/lib/calendar/time'
import type { ScheduleService } from '@/types/contracts'

interface Props {
  contractId: string
  divisions: string[]
}

const DEFAULT_CELL_W = 40

/** fractional hour → "HH:MM" (9.5 → "09:30"). */
function slotToTime(slot: number): string {
  const h = Math.floor(slot)
  const m = slot % 1 !== 0 ? 30 : 0
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
const HOUR_STEPS = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8]

// ── draggable service pill ───────────────────────────────────────────────────
function ServicePill({
  svc, hours, onHours,
}: { svc: ScheduleService; hours: number; onHours: (h: number) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: svc.visitId, data: { svc },
  })
  return (
    <div className={cn('flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-2 py-1.5', isDragging && 'opacity-40')}>
      <button
        ref={setNodeRef} {...listeners} {...attributes}
        type="button"
        className="flex min-w-0 flex-1 cursor-grab items-center gap-1 text-left"
        aria-label={`Drag ${svc.serviceName}`}
      >
        <span className="truncate text-xs font-medium text-blue-900">
          {svc.serviceName}{svc.qty > 1 && <span className="font-semibold"> ×{svc.qty}</span>}
        </span>
        {svc.location && <span className="shrink-0 text-[10px] text-blue-500">({svc.location})</span>}
      </button>
      <label className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
        <select
          value={hours}
          onChange={(e) => onHours(Number(e.target.value))}
          className="h-6 rounded border border-input bg-background px-1 text-[11px]"
          aria-label="Hours"
        >
          {HOUR_STEPS.map((h) => <option key={h} value={h}>{h}h</option>)}
        </select>
      </label>
    </div>
  )
}

export function ServiceScheduleSection({ contractId, divisions }: Props) {
  const { scheduleDates, isLoading, scheduleVisit, clearSchedule } = useContractSchedule(contractId)
  const [selectedDateIdx, setSelectedDateIdx] = useState(0)

  const selectedDate = scheduleDates[selectedDateIdx] || null
  const dateStr = selectedDate?.date ?? ''

  const { data: visits } = useCalendarVisits(dateStr, null)
  const { data: teamsRaw } = useTeams(divisions.length > 0 ? { divisionIds: divisions } : undefined)
  const divisionSchedules = useAllDivisionSchedules()

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const unplaced = useMemo(() => selectedDate?.services.filter((s) => !s.teamId || !s.startTime) ?? [], [selectedDate])
  const placed = useMemo(() => selectedDate?.services.filter((s) => s.teamId && s.startTime) ?? [], [selectedDate])

  const [hoursByVisit, setHoursByVisit] = useState<Record<string, number>>({})
  const hoursFor = (s: ScheduleService) => hoursByVisit[s.visitId] ?? s.defaultDurationHours

  const [dragging, setDragging] = useState<ScheduleService | null>(null)
  const [fitMode, setFitMode] = useState(true)
  const [containerWidth, setContainerWidth] = useState(0)
  const [nowMin, setNowMin] = useState<number | null>(null)
  // Callback ref: the calendar mounts AFTER the loading early-return, so a
  // useRef + [] effect would observe null and never re-run. A callback ref
  // attaches the ResizeObserver the moment the node actually mounts.
  const scrollElRef = useRef<HTMLDivElement | null>(null)
  const roRef = useRef<ResizeObserver | null>(null)
  const setScrollEl = useCallback((el: HTMLDivElement | null) => {
    if (roRef.current) { roRef.current.disconnect(); roRef.current = null }
    scrollElRef.current = el
    if (el) {
      const update = () => setContainerWidth(el.getBoundingClientRect().width)
      const ro = new ResizeObserver(update); ro.observe(el); roRef.current = ro; update()
    }
  }, [])

  const isToday = dateStr === new Date().toISOString().slice(0, 10)
  useEffect(() => {
    if (!isToday) { setNowMin(null); return }
    const tick = () => { const n = new Date(); setNowMin(n.getHours() * 60 + n.getMinutes()) }
    tick(); const id = setInterval(tick, 60_000); return () => clearInterval(id)
  }, [isToday])

  const teams = (teamsRaw ?? []) as TeamFull[]
  const divisionGroups = useMemo(() => {
    const groups = new Map<string, { slug: string; name: string; teams: TeamFull[] }>()
    for (const team of teams) {
      const slug = team.division?.slug ?? '__none__'
      const name = team.division?.name ?? team.division?.short_name ?? 'Unassigned'
      if (!groups.has(slug)) groups.set(slug, { slug, name, teams: [] })
      groups.get(slug)!.teams.push(team)
    }
    return Array.from(groups.values())
  }, [teams])

  const fitWindow = useMemo(() => {
    let start: number | null = null, end: number | null = null
    for (const g of divisionGroups) {
      const s = divisionSchedules.get(g.slug)
      if (!s) continue
      start = start === null ? s.day_start : Math.min(start, s.day_start)
      end = end === null ? s.day_end : Math.max(end, s.day_end)
    }
    return { start: start ?? 7, end: end ?? 18 }
  }, [divisionGroups, divisionSchedules])

  const cellWidth = fitMode
    ? fitCellWidth(containerWidth - SIDEBAR_W, fitWindow.start, fitWindow.end, { fallback: DEFAULT_CELL_W })
    : DEFAULT_CELL_W

  // Frame the work window (like the order grid) instead of opening at midnight.
  // rAF defers until the min-w-max grid has established its width, else scrollLeft clamps.
  useEffect(() => {
    const el = scrollElRef.current
    if (!el || containerWidth === 0) return
    const raf = requestAnimationFrame(() => {
      el.scrollLeft = Math.max(0, fitWindow.start * 2 * cellWidth)
    })
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateStr, fitMode, containerWidth, cellWidth, fitWindow.start])

  const isSlotPast = useCallback(
    (slot: number) => isToday && nowMin !== null && slot * 60 < nowMin,
    [isToday, nowMin],
  )

  const visitsForTeam = useCallback(
    (teamId: string) => (visits ?? []).filter((v) => v.team_id === teamId && v.start_time !== null),
    [visits],
  )

  const isSlotOccupied = useCallback((teamId: string, slot: number): boolean => {
    const slotMin = slot * 60, slotEnd = slotMin + 30
    return (visits ?? []).some((v) => {
      if (v.team_id !== teamId || !v.start_time) return false
      const s = parseMinutes(v.start_time) ?? 0
      const e = v.end_time ? (parseMinutes(v.end_time) ?? s + 60) : s + 60
      return e > s && slotMin < e && slotEnd > s
    })
  }, [visits])

  function computeTeamLayout(teamId: string) {
    const blocks = visitsForTeam(teamId).map((v) => {
      const s = parseHour(v.start_time)!
      const rawEnd = v.end_time ? parseHour(v.end_time) : null
      return { id: `v-${v.id}`, start: s, end: rawEnd !== null && rawEnd > s ? rawEnd : s + 1 }
    }).filter((b) => b.start !== null)
    const trackMap = assignTracks(blocks)
    const maxTrack = blocks.length === 0 ? 0 : Math.max(...Array.from(trackMap.values()))
    const rowHeight = (blocks.length === 0 ? 1 : maxTrack + 1) * TRACK_H
    return { trackMap, rowHeight }
  }

  const hourLeft = (h: number) => (h - SLOTS[0]) * 2 * cellWidth

  function place(svc: ScheduleService, teamId: string, slot: number) {
    const end = slot + hoursFor(svc)
    scheduleVisit.mutate(
      { visitId: svc.visitId, teamId, startTime: slotToTime(slot), endTime: slotToTime(Math.min(end, 23.5)) },
      {
        onSuccess: () => toast.success('Visit scheduled'),
        onError: (err: unknown) => toast.error(err instanceof Error ? err.message : String(err)),
      },
    )
  }

  function handleDragStart(e: DragStartEvent) {
    const svc = e.active.data.current?.svc as ScheduleService | undefined
    if (svc) setDragging(svc)
  }
  function handleDragEnd(e: DragEndEvent) {
    setDragging(null)
    const svc = e.active.data.current?.svc as ScheduleService | undefined
    const over = e.over?.data.current as { teamId: string; hour: number; minute: number } | undefined
    if (!svc || !over) return
    place(svc, over.teamId, over.hour + (over.minute ? 0.5 : 0))
  }

  function removePlaced(svc: ScheduleService) {
    clearSchedule.mutate(svc.visitId, {
      onSuccess: () => toast.success('Removed from schedule'),
      onError: (err: unknown) => toast.error(err instanceof Error ? err.message : String(err)),
    })
  }

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }
  if (scheduleDates.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No visits to schedule. Generate visits from the contract detail page first.</p>
  }

  return (
    <DndContext sensors={sensors} autoScroll={false} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[210px_1fr]">
        {/* Date list */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase text-muted-foreground">Schedule Dates</h4>
          <div className="max-h-[460px] space-y-1 overflow-y-auto">
            {scheduleDates.map((sd, idx) => (
              <button
                key={sd.date}
                onClick={() => setSelectedDateIdx(idx)}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors',
                  idx === selectedDateIdx ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                )}
              >
                <span>{sd.date}</span>
                <div className="flex items-center gap-1">
                  <span className={cn('inline-block h-2 w-2 rounded-full', sd.allAssigned ? 'bg-green-500' : 'bg-yellow-500')} />
                  <span className="text-xs">{sd.services.length}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Service list (to place / placed) + calendar */}
        <div className="min-w-0 space-y-3">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">{dateStr} — {placed.length}/{selectedDate?.services.length ?? 0} placed</h4>
            <Button size="sm" variant={fitMode ? 'default' : 'outline'} className="h-7 gap-1 text-xs" onClick={() => setFitMode((f) => !f)}>
              {fitMode ? <AlignJustify className="h-3.5 w-3.5" /> : <Columns2 className="h-3.5 w-3.5" />}
              {fitMode ? 'Scroll' : 'Fit'}
            </Button>
          </div>

          {/* Service list — drag onto the calendar; set hours per service */}
          {unplaced.length > 0 && (
            <div className="space-y-2 rounded-md border border-dashed p-3">
              <p className="text-xs font-medium text-muted-foreground">To place ({unplaced.length}) — set hours, then drag onto a team &amp; time</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {unplaced.map((svc) => (
                  <ServicePill key={svc.visitId} svc={svc} hours={hoursFor(svc)}
                    onHours={(h) => setHoursByVisit((p) => ({ ...p, [svc.visitId]: h }))} />
                ))}
              </div>
            </div>
          )}

          {/* Placed list — with remove */}
          {placed.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {placed.map((svc) => (
                <span key={svc.visitId} className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-[11px]">
                  <span className="font-medium">{svc.serviceName}{svc.qty > 1 && ` ×${svc.qty}`}</span>
                  <span className="text-muted-foreground">{svc.teamName} · {svc.startTime}–{svc.endTime}</span>
                  <button type="button" onClick={() => removePlaced(svc)} className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-destructive" aria-label="Remove">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Calendar */}
          <div ref={setScrollEl} className="max-h-[520px] overflow-auto rounded-lg border">
            <div className="relative flex min-w-max flex-col">
              {/* now line */}
              {isToday && nowMin !== null && (
                <div aria-hidden className="pointer-events-none absolute bottom-0 top-0 z-[25]" style={{ left: SIDEBAR_W + (nowMin / 30) * cellWidth }}>
                  <div className="absolute -left-1.5 -top-1.5 h-3 w-3 rounded-full bg-red-500 ring-2 ring-red-200" />
                  <div className="absolute left-0 top-0 h-full w-0.5 bg-red-500/85" />
                </div>
              )}

              {/* time header */}
              <div className="sticky top-0 z-10 flex border-b bg-muted">
                <div className="sticky left-0 z-20 w-32 shrink-0 border-r bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">Teams / Time</div>
                <div className="flex">
                  {SLOTS.map((slot) => (
                    <div key={slot} style={{ width: cellWidth, minWidth: cellWidth }}
                      className={cn('shrink-0 px-0.5 py-1 text-center text-[10px] text-muted-foreground', slot % 1 !== 0 ? 'border-r border-slate-100/50' : 'border-r border-slate-100')}>
                      {formatSlotLabel(slot)}
                    </div>
                  ))}
                </div>
              </div>

              {/* team rows grouped by division */}
              {divisionGroups.map((group) => {
                const divSched = divisionSchedules.get(group.slug)
                return (
                  <div key={group.slug}>
                    <DivisionHeaderRow name={group.name} scheduleLabel={divSched?.label} cellW={cellWidth} slotCount={SLOTS.length} />
                    {group.teams.map((team) => {
                      const teamSched = team.schedule?.days
                        ? deriveCalendarScheduleRaw(team.schedule.days as Record<string, { enabled: boolean; start: string; end: string }>)
                        : null
                      const workStart = teamSched?.day_start ?? fitWindow.start
                      const workEnd = teamSched?.day_end ?? fitWindow.end
                      const { trackMap, rowHeight } = computeTeamLayout(team.id)
                      return (
                        <div key={team.id} className="flex border-b">
                          <div style={{ height: rowHeight }} className="sticky left-0 z-30 flex w-32 shrink-0 flex-col justify-center border-r bg-background px-2">
                            <p className="max-w-[110px] truncate text-sm font-medium text-foreground">{team.name_en ?? team.name}</p>
                          </div>
                          <div className="relative flex">
                            {SLOTS.map((slot) => (
                              <DroppableCell key={slot} teamId={team.id} slot={slot}
                                isOccupied={isSlotOccupied(team.id, slot)} isPast={isSlotPast(slot)}
                                isSkillMatch={null} rowHeight={rowHeight} workStart={workStart} workEnd={workEnd} cellW={cellWidth} />
                            ))}
                            {visitsForTeam(team.id).map((v: CalendarVisit) => (
                              <VisitBlock key={v.id} visit={v} trackMap={trackMap} hourLeftFn={hourLeft}
                                workStart={workStart} workEnd={workEnd} cellW={cellWidth} />
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}

              {divisionGroups.length === 0 && (
                <p className="p-4 text-xs text-muted-foreground">No teams in this contract&apos;s division(s).</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Drag ghost */}
      <DragOverlay dropAnimation={null} style={{ zIndex: 9999 }}>
        {dragging ? (
          <div className="rounded-md border border-blue-300 bg-white px-2 py-1 text-xs font-medium text-blue-900 shadow-xl">
            {dragging.serviceName}{dragging.qty > 1 && ` ×${dragging.qty}`} · {hoursFor(dragging)}h
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
