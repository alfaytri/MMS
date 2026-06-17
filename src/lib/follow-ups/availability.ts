// src/lib/follow-ups/availability.ts

export interface TeamHours { working_from: string; working_to: string }
export interface Booking   { date: string; from: string; to: string }
export interface RequestedWindow { date: string; from: string; to: string }
export interface FreeSlot { date: string; from: string; to: string }

export type AvailabilityResult =
  | { ok: true }
  | { ok: false; free_slots: FreeSlot[] }

const MIN_SLOT_MINUTES = 60

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function toHHMM(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

function freeSlotsForDay(
  date: string,
  team: TeamHours,
  dayBookings: Booking[],
  earliestStart?: number
): FreeSlot[] {
  const workStart = toMin(team.working_from)
  const workEnd   = toMin(team.working_to)
  const minStart  = earliestStart !== undefined ? Math.max(workStart, earliestStart) : workStart

  // Sort + clip to working hours
  const sorted = dayBookings
    .map((b) => ({ from: Math.max(toMin(b.from), workStart), to: Math.min(toMin(b.to), workEnd) }))
    .filter((b) => b.to > b.from)
    .sort((a, b) => a.from - b.from)

  const slots: FreeSlot[] = []
  let cursor = workStart
  for (const b of sorted) {
    if (b.from > cursor) slots.push({ date, from: toHHMM(cursor), to: toHHMM(b.from) })
    cursor = Math.max(cursor, b.to)
  }
  if (cursor < workEnd) slots.push({ date, from: toHHMM(cursor), to: toHHMM(workEnd) })

  return slots
    // On the requested day, only surface slots starting at/after the requested window's start
    .filter((s) => toMin(s.from) >= minStart)
    .filter((s) => toMin(s.to) - toMin(s.from) >= MIN_SLOT_MINUTES)
}

function overlaps(a: { from: number; to: number }, b: { from: number; to: number }): boolean {
  return a.from < b.to && b.from < a.to
}

export function computeAvailability(input: {
  team: TeamHours
  bookings: Booking[]
  requested: RequestedWindow
}): AvailabilityResult {
  const { team, bookings, requested } = input

  const sameDayBookings = bookings.filter((b) => b.date === requested.date)
  const reqRange = { from: toMin(requested.from), to: toMin(requested.to) }
  const hasConflict = sameDayBookings.some((b) =>
    overlaps(reqRange, { from: toMin(b.from), to: toMin(b.to) })
  )

  if (!hasConflict) return { ok: true }

  const nextDate = nextDay(requested.date)
  const nextDayBookings = bookings.filter((b) => b.date === nextDate)

  return {
    ok: false,
    free_slots: [
      ...freeSlotsForDay(requested.date, team, sameDayBookings, toMin(requested.from)),
      ...freeSlotsForDay(nextDate,        team, nextDayBookings),
    ],
  }
}
