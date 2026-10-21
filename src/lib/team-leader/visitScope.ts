// src/lib/team-leader/visitScope.ts
// Which team-leader visits each view of the TL screen shows, and how far back each view has to
// load to have them. Pure (the clock is a parameter) so the rules are unit-testable.
//
// get_team_leader_visits(p_from_date) returns every visit dated ON OR AFTER p_from_date and has no
// upper bound, so "how far back to load" is the only knob: a view needs the earliest day it shows.
import { format, isBefore, isSameDay, parseISO, startOfDay, subDays } from 'date-fns'
import type { TlVisit } from '@/types/team-leader'

/** How many days back the Today view looks for visits that were missed and are still open. */
export const OVERDUE_LOOKBACK_DAYS = 30

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Earliest date the pick-a-date view will fetch from. No visit predates it, and it stops a half-typed
 * year (a date input fires 0002-, 0020-, 0202- on the way to 2026-) from asking the unbounded RPC for
 * a team's entire history.
 */
const MIN_FETCH_DATE = '2000-01-01'

/** First day (YYYY-MM-DD) the Today view loads from: the start of the overdue lookback. */
export function overdueLookbackFrom(now: Date = new Date()): string {
  return format(subDays(now, OVERDUE_LOOKBACK_DAYS), 'yyyy-MM-dd')
}

/**
 * Today view: every visit dated today, plus any earlier visit that was missed - not completed and
 * not yet invoiced - so work that slipped past its day stays on the list instead of dropping out
 * the next morning (where it could never be completed or invoiced).
 */
export function isTodayOrOverdueOpen(
  visit: Pick<TlVisit, 'date' | 'status' | 'has_invoice'>,
  now: Date = new Date(),
): boolean {
  const day = parseISO(visit.date)
  if (isSameDay(day, now)) return true
  return isBefore(day, startOfDay(now)) && visit.status !== 'completed' && visit.has_invoice !== true
}

/**
 * `p_from_date` for the Upcoming (pick-a-date) view.
 *
 * The Today view already loads from the overdue lookback onward, which covers every future date and
 * the last 30 days, so any such date reuses that very fetch (same query key, no extra request - and
 * stepping through days stays instant). Only a date OLDER than the lookback needs a fetch of its
 * own, starting at that date. A cleared, malformed or implausibly old date never reaches the RPC.
 */
export function dateViewFromDate(selectedDate: string, now: Date = new Date()): string {
  const lookbackFrom = overdueLookbackFrom(now)
  const fetchable = ISO_DATE.test(selectedDate) && selectedDate >= MIN_FETCH_DATE
  return fetchable && selectedDate < lookbackFrom ? selectedDate : lookbackFrom
}
