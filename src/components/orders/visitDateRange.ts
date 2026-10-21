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
