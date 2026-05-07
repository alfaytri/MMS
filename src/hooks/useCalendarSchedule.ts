import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

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

export function useCalendarSchedule() {
  return useQuery({
    queryKey: ['calendar-schedule'],
    queryFn: async (): Promise<CalendarSchedule> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'calendar_schedule')
        .single()
      if (error) throw error
      return parseCalendarSchedule(data?.value as CalendarScheduleRaw | null)
    },
    staleTime: 5 * 60 * 1000,
  })
}
