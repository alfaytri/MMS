'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { format } from 'date-fns'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useCalendarSchedule } from '@/hooks/useCalendarSchedule'
import { useCalendarVisits, groupVisitsByTeam, filterVisitsByType } from '@/hooks/useCalendarVisits'
import {
  useWeekCapacity,
  computeDayCapacity,
  buildWeekDates,
  getWeekStart,
} from '@/hooks/useWeekCapacity'
import { useTeams } from '@/hooks/useTeams'
import { useTeamSkills } from '@/hooks/useTeamSkills'
import { useUserDivisionScope } from '@/hooks/useUserDivisionScope'
import { CalendarToolbar } from './CalendarToolbar'
import { WeekCapacityStrip } from './WeekCapacityStrip'
import { TimelineGrid } from './TimelineGrid'
import { TeamCardList } from './TeamCardList'
import { SwapTeamDialog } from './SwapTeamDialog'
import type { CalendarVisit } from '@/hooks/useCalendarVisits'
import { useRouter } from 'next/navigation'

// ---------------------------------------------------------------------------
// Permission hook
// ---------------------------------------------------------------------------

function useCalendarPermissions() {
  const { data: perms = [] } = useQuery({
    queryKey: ['calendar-permissions'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const supabase = createClient()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) return []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('user_custom_roles')
        .select('custom_roles(permissions)')
        .eq('user_id', session.user.id)
      const all: string[] = []
      for (const row of (data ?? []) as Array<{
        custom_roles: { permissions: string[] } | null
      }>) {
        if (row.custom_roles?.permissions) {
          all.push(...row.custom_roles.permissions)
        }
      }
      return all
    },
  })
  return {
    canView: perms.includes('calendar.view') || perms.length === 0,
    canEdit: perms.includes('calendar.edit-order'),
    canSwap: perms.includes('calendar.swap-teams'),
  }
}

// ---------------------------------------------------------------------------
// CalendarPage
// ---------------------------------------------------------------------------

export function CalendarPage() {
  const router = useRouter()
  const today = format(new Date(), 'yyyy-MM-dd')
  const [date, setDate] = useState(today)
  const [fitMode, setFitMode] = useState(false)
  const [activeVisitTypes, setActiveVisitTypes] = useState<Set<string>>(new Set())
  const [swapVisit, setSwapVisit] = useState<CalendarVisit | null>(null)
  const gridContainerRef = useRef<HTMLDivElement>(null)
  const [gridWidth, setGridWidth] = useState(0)

  const { isSuperViewer, divisions } = useUserDivisionScope()
  const defaultSlug = divisions[0]?.slug ?? null
  const [activeDivisionSlug, setActiveDivisionSlug] = useState<string | null>(defaultSlug)

  // Once divisions load, initialise the active slug if not yet set
  useEffect(() => {
    if (!activeDivisionSlug && divisions.length > 0) {
      setActiveDivisionSlug(divisions[0].slug)
    }
  }, [divisions, activeDivisionSlug])

  // Derived week window
  const weekStart = getWeekStart(new Date(date))
  const weekDates = buildWeekDates(weekStart)

  // Data hooks
  const { data: schedule } = useCalendarSchedule()
  const { data: rawVisits = [] } = useCalendarVisits(date, activeDivisionSlug)
  const { data: weekVisitsRaw = {} } = useWeekCapacity(weekStart, activeDivisionSlug, activeVisitTypes)
  const { data: allTeams = [] } = useTeams({ divisionId: activeDivisionSlug })
  const { data: teamSkills = new Map() } = useTeamSkills(activeDivisionSlug)
  const { canEdit, canSwap } = useCalendarPermissions()

  // Resolved schedule with safe fallback
  const scheduleData = schedule ?? {
    mode: 'normal' as const,
    day_start: 7,
    day_end: 18,
    scroll_to: 7,
    label: '',
  }

  // Filtered visits (empty Set = all types shown)
  const visits = useMemo(
    () => filterVisitsByType(rawVisits, activeVisitTypes),
    [rawVisits, activeVisitTypes],
  )
  const visitsByTeam = useMemo(() => groupVisitsByTeam(visits), [visits])

  // Non-QC teams only — QC rows have their own separate rendering path
  const teams = useMemo(() => allTeams.filter(t => !t.is_qc), [allTeams])

  // Division slug → hex/tailwind color for block colouring
  const divisionColors = useMemo(
    () =>
      Object.fromEntries(
        divisions.map(d => [d.slug, d.color ?? '#94a3b8']),
      ),
    [divisions],
  )

  // Week capacity — one DayCapacity per ISO date
  const capacityByDate = useMemo(() => {
    return weekDates.reduce<Record<string, ReturnType<typeof computeDayCapacity>>>((acc, d) => {
      const dayOfWeek = new Date(d).getDay()
      const daySchedule = {
        enabled: dayOfWeek !== 5, // Friday = day off
        start: `${String(scheduleData.day_start).padStart(2, '0')}:00`,
        end: `${String(scheduleData.day_end).padStart(2, '0')}:00`,
        break_minutes: 60,
      }
      acc[d] = computeDayCapacity(weekVisitsRaw[d] ?? [], daySchedule)
      return acc
    }, {})
  }, [weekDates, weekVisitsRaw, scheduleData.day_start, scheduleData.day_end])

  // Per-team capacity for the selected day (mobile card view)
  const capacityByTeam = useMemo(() => {
    const todayDayOfWeek = new Date(date).getDay()
    const daySchedule = {
      enabled: todayDayOfWeek !== 5,
      start: `${String(scheduleData.day_start).padStart(2, '0')}:00`,
      end: `${String(scheduleData.day_end).padStart(2, '0')}:00`,
      break_minutes: 60,
    }
    return new Map(
      teams.map(t => {
        const teamVisits = visitsByTeam.get(t.id) ?? []
        return [
          t.id,
          computeDayCapacity(
            teamVisits.map(v => ({ start_time: v.start_time, end_time: v.end_time })),
            daySchedule,
          ),
        ]
      }),
    )
  }, [teams, visitsByTeam, date, scheduleData.day_start, scheduleData.day_end])

  // Track grid container width for TimelineGrid body calculation
  useEffect(() => {
    if (!gridContainerRef.current) return
    const ro = new ResizeObserver(entries => {
      // Subtract the 192px team-label column from available width
      setGridWidth(entries[0].contentRect.width - 192)
    })
    ro.observe(gridContainerRef.current)
    return () => ro.disconnect()
  }, [])

  function toggleVisitType(type: string) {
    setActiveVisitTypes(prev => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  function handleEdit(visit: CalendarVisit) {
    router.push(`/orders/create-visit?edit=${visit.id}`)
  }

  // CalendarToolbar.onDivisionChange is typed as (slug: string) — wrap to satisfy
  // state setter which accepts string | null so we can clear on super-viewer
  function handleDivisionChange(slug: string) {
    setActiveDivisionSlug(slug || null)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] overflow-hidden">
      {/* Top toolbar: navigation, division picker, visit-type filters */}
      <CalendarToolbar
        date={date}
        onDateChange={setDate}
        schedule={scheduleData}
        isSuperViewer={isSuperViewer}
        activeDivisionSlug={activeDivisionSlug}
        divisions={divisions}
        onDivisionChange={handleDivisionChange}
        activeVisitTypes={activeVisitTypes}
        onVisitTypeToggle={toggleVisitType}
        fitMode={fitMode}
        onFitModeToggle={() => setFitMode(f => !f)}
        showFitToggle
      />

      {/* Week capacity strip — 7-day bar chart + date selector */}
      <WeekCapacityStrip
        weekDates={weekDates}
        capacityByDate={capacityByDate}
        selectedDate={date}
        onDateSelect={setDate}
      />

      {/* Main content area */}
      <div ref={gridContainerRef} className="flex-1 overflow-hidden">
        {/* Desktop: horizontal timeline grid */}
        <div className="hidden md:flex flex-col h-full">
          <TimelineGrid
            schedule={scheduleData}
            teams={teams}
            visitsByTeam={visitsByTeam}
            fitMode={fitMode}
            date={date}
            canEdit={canEdit}
            canSwap={canSwap}
            onEdit={handleEdit}
            onSwap={setSwapVisit}
            bodyWidth={gridWidth}
            divisionColors={divisionColors}
          />
        </div>

        {/* Mobile: vertical team card list */}
        <div className="md:hidden overflow-y-auto h-full">
          <TeamCardList
            teams={teams}
            visitsByTeam={visitsByTeam}
            capacityByTeam={capacityByTeam}
            date={date}
            canEdit={canEdit}
            canSwap={canSwap}
            onEdit={handleEdit}
            onSwap={setSwapVisit}
            divisionColors={divisionColors}
          />
        </div>
      </div>

      {/* Swap-team dialog — rendered outside scroll container to avoid clipping */}
      {swapVisit && (
        <SwapTeamDialog
          visit={swapVisit}
          assignmentId={swapVisit.id}
          teams={teams}
          allDayVisits={rawVisits}
          teamSkills={teamSkills}
          onClose={() => setSwapVisit(null)}
        />
      )}
    </div>
  )
}
