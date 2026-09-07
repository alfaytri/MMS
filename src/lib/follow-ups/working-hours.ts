// src/lib/follow-ups/working-hours.ts
import type { TeamHours } from './availability'

/** One config entry inside a schedule's `days` JSONB. */
export interface ScheduleDayConfig {
  enabled?: boolean
  start?: string
  end?: string
}

// getUTCDay() is 0=Sunday..6=Saturday, matching this order.
const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

// Historical default working window (the old teams.schedule_start/end defaulted
// to 8 and 18). Kept as the fallback so behaviour is unchanged when a team has
// no schedule or is off on the requested day — note the availability check gates
// on booking OVERLAPS, not on working hours, so an off-day never blocks a
// booking; the window only shapes the free-slot suggestions.
const DEFAULT_HOURS: TeamHours = { working_from: '08:00', working_to: '18:00' }

/**
 * Working hours for a team on a specific date, read from a schedule's `days`
 * JSONB (the single source of truth shared with the calendar). Returns the
 * matching weekday's start/end when that day is enabled and complete, otherwise
 * the default 08:00–18:00 window.
 *
 * @param days  a schedule's `days` JSONB (team's active schedule, or its
 *              division's calendar schedule), or null when none is assigned.
 * @param date  the requested date, "YYYY-MM-DD".
 */
export function workingHoursForDate(
  days: Record<string, ScheduleDayConfig> | null | undefined,
  date: string,
): TeamHours {
  if (!days) return DEFAULT_HOURS
  const key = WEEKDAY_KEYS[new Date(`${date}T00:00:00Z`).getUTCDay()]
  const cfg = days[key]
  if (!cfg?.enabled || !cfg.start || !cfg.end) return DEFAULT_HOURS
  return { working_from: cfg.start, working_to: cfg.end }
}
