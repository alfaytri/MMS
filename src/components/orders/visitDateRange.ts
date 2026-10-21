/**
 * Pure helpers behind drag-to-select on the visit calendar.
 *
 * Kept out of the component so the range maths — backwards drags, month
 * boundaries, past days — is tested directly rather than through pointer
 * events on a third-party calendar.
 */
import { eachDayOfInterval, format, isBefore, startOfDay } from 'date-fns'

/**
 * Every ISO day from `anchor` to `hover` inclusive, in ascending order.
 *
 * The drag may run in either direction, and the two rendered months are one
 * continuous range, so a drag across the boundary is ordinary. Days before
 * `minDate` are dropped: the calendar disables the past and a drag must not
 * sneak past that.
 */
export function datesInDragRange(
  anchor: Date | null,
  hover: Date | null,
  minDate: Date,
): string[] {
  if (!anchor || !hover) return []

  const a = startOfDay(anchor)
  const h = startOfDay(hover)
  const min = startOfDay(minDate)
  const [start, end] = isBefore(a, h) ? [a, h] : [h, a]

  return eachDayOfInterval({ start, end })
    .filter((day) => !isBefore(day, min))
    .map((day) => format(day, 'yyyy-MM-dd'))
}

/**
 * Add a dragged range to the days already chosen.
 *
 * A drag extends the selection rather than replacing it, so a run of
 * consecutive days and odd dates picked one by one can live together — which
 * is the whole point of having both interactions.
 */
export function mergeVisitDates(existing: string[], added: string[]): string[] {
  if (added.length === 0) return existing
  return [...new Set([...existing, ...added])].sort()
}

/** `yyyy-MM-dd`, which is what react-day-picker stamps into `data-day`. */
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

/**
 * The ISO date of the calendar day under `el`, or null if there isn't one.
 *
 * react-day-picker stamps every day cell with `data-day="yyyy-MM-dd"` and marks
 * unavailable ones `data-disabled`. Reading that is what lets the drag work on
 * touch: a finger has no hover, so the day has to come from whatever element is
 * under the pointer rather than from a mouseenter that never fires.
 *
 * Returns null for a disabled day, so a drag cannot pass through the past, and
 * for anything that is not a day at all — month arrows, weekday headings, gaps.
 */
export function dayIsoFromElement(el: Element | null | undefined): string | null {
  const cell = el?.closest?.('[data-day]') as HTMLElement | null | undefined
  if (!cell) return null
  if (cell.hasAttribute('data-disabled')) return null
  const iso = cell.getAttribute('data-day')
  return iso && ISO_DAY.test(iso) ? iso : null
}
