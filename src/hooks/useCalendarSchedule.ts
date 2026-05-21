import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CalendarScheduleMode = 'normal' | 'ramadan'

export interface CalendarScheduleRaw {
  mode: CalendarScheduleMode
  day_start: number
  day_end: number
  scroll_to: number
}

export interface CalendarSchedule extends CalendarScheduleRaw {
  label: string
}

// ---------------------------------------------------------------------------
// Derivation helpers
// ---------------------------------------------------------------------------

interface DayConfig {
  enabled: boolean
  start: string
  end: string
}

/**
 * Derives a CalendarScheduleRaw from a schedule's `days` JSONB.
 * day_start = earliest enabled start hour, day_end = latest enabled end hour.
 */
export function deriveCalendarScheduleRaw(
  days: Record<string, DayConfig> | null | undefined,
): CalendarScheduleRaw {
  const defaults: CalendarScheduleRaw = { mode: 'normal', day_start: 7, day_end: 18, scroll_to: 7 }
  if (!days) return defaults

  const enabled = Object.values(days).filter(d => d?.enabled)
  if (enabled.length === 0) return defaults

  const starts = enabled.map(d => parseInt((d.start ?? '07:00').split(':')[0])).filter(n => !isNaN(n))
  const ends = enabled.map(d => {
    const [hStr, mStr] = (d.end ?? '18:00').split(':')
    const h = parseInt(hStr)
    const m = parseInt(mStr ?? '0')
    return isNaN(h) ? 18 : m > 0 ? h + 1 : h
  })

  if (starts.length === 0) return defaults
  const day_start = Math.min(...starts)
  const day_end   = Math.max(...ends)
  return { mode: 'normal', day_start, day_end, scroll_to: day_start }
}

function formatHour(h: number): string {
  if (h === 0 || h === 24) return '12 AM'
  if (h === 12) return '12 PM'
  return h < 12 ? `${h} AM` : `${h - 12} PM`
}

export function parseCalendarSchedule(raw: CalendarScheduleRaw | null | undefined): CalendarSchedule {
  const defaults: CalendarScheduleRaw = { mode: 'normal', day_start: 7, day_end: 18, scroll_to: 7 }
  const v: CalendarScheduleRaw = raw ?? defaults
  const modeLabel = v.mode === 'ramadan' ? 'Ramadan' : 'Normal'
  const label = `${formatHour(v.day_start)} – ${formatHour(v.day_end)} · ${modeLabel}`
  return { ...v, label }
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Global calendar schedule from app_settings. Used as fallback. */
export function useCalendarSchedule() {
  return useQuery({
    queryKey: ['calendar-schedule'],
    queryFn: async (): Promise<CalendarSchedule> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'calendar_schedule')
        .maybeSingle()
      if (error) throw error
      return parseCalendarSchedule(data?.value as CalendarScheduleRaw | null)
    },
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Fetches calendar schedules for ALL active divisions in one query.
 * Returns a Map<divisionSlug, CalendarSchedule> — only divisions that have a
 * schedule assigned appear in the map. Used for per-team dimming in TimelineGrid.
 */
export function useAllDivisionSchedules(): Map<string, CalendarSchedule> {
  const { data } = useQuery({
    queryKey: ['all-division-schedules'],
    queryFn: async (): Promise<Map<string, CalendarSchedule>> => {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rows, error } = await (supabase as any)
        .from('divisions')
        .select('slug, sched:calendar_schedule_id(id, name, days)')
        .eq('is_active', true)
      if (error) throw error
      const map = new Map<string, CalendarSchedule>()
      for (const row of (rows ?? []) as Array<{ slug: string; sched: { id: string; name: string; days: Record<string, DayConfig> } | null }>) {
        if (!row.sched) continue
        const raw = deriveCalendarScheduleRaw(row.sched.days)
        map.set(row.slug, parseCalendarSchedule(raw))
      }
      return map
    },
    staleTime: 5 * 60 * 1000,
  })
  return data ?? new Map()
}

/**
 * Fetches the calendar schedule for a specific division.
 * Derives day_start / day_end from the schedule's `days` JSONB.
 * Returns null when no schedule is assigned to the division.
 */
export function useDivisionSchedule(divisionSlug: string | null) {
  return useQuery({
    queryKey: ['division-schedule', divisionSlug],
    queryFn: async (): Promise<CalendarSchedule | null> => {
      if (!divisionSlug) return null
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('divisions')
        .select('calendar_schedule_id, sched:calendar_schedule_id(id, name, days)')
        .eq('slug', divisionSlug)
        .maybeSingle()
      if (error) throw error
      const schedule = data?.sched as { id: string; name: string; days: Record<string, DayConfig> } | null
      if (!schedule) return null
      const raw = deriveCalendarScheduleRaw(schedule.days)
      return parseCalendarSchedule({ ...raw, label: schedule.name } as CalendarScheduleRaw)
    },
    enabled: !!divisionSlug,
    staleTime: 5 * 60 * 1000,
  })
}
