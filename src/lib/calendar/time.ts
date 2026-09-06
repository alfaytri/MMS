// src/lib/calendar/time.ts
// The single source of truth for calendar time/layout math, shared by the
// /calendar monitoring grid and the order-booking grid (previously each
// re-authored fmt12, timeToMinutes, the 48-slot axis, block positioning,
// assignTracks, and overtime). Pure — no React, no side effects.

/** "14:30" → "2:30 PM". Accepts "HH:MM" (or "HH:MM:SS", uses HH:MM). */
export function fmt12(t: string): string {
  const [hStr, mStr] = t.split(':')
  const h = parseInt(hStr)
  const m = mStr ?? '00'
  const period = h < 12 ? 'AM' : 'PM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${m} ${period}`
}

/** "14:30" → 870. Assumes a valid time string. */
export function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m ?? 0)
}

/** Null-safe minute parse — returns null for null/invalid input. */
export function toMinutesSafe(t: string | null): number | null {
  if (!t) return null
  const [hStr, mStr] = t.split(':')
  const h = parseInt(hStr)
  const m = parseInt(mStr ?? '0')
  return isNaN(h) ? null : h * 60 + (isNaN(m) ? 0 : m)
}

/** Fractional hour — "09:30" → 9.5 (null-safe). */
export function toHours(t: string | null): number | null {
  const min = toMinutesSafe(t)
  return min === null ? null : min / 60
}

/** 48 half-hour slots: 0, 0.5, 1, … 23.5. */
export const HALF_HOUR_SLOTS: number[] = Array.from({ length: 48 }, (_, i) => i * 0.5)

/** Slot → axis label: 6 → "6AM", 6.5 → ":30", 0 → "12AM", 12 → "12PM". */
export function formatSlotLabel(slot: number): string {
  const hour = Math.floor(slot)
  if (slot % 1 !== 0) return ':30'
  if (hour === 0) return '12AM'
  if (hour === 12) return '12PM'
  return hour < 12 ? `${hour}AM` : `${hour - 12}PM`
}

/** Left offset (px) of a block, given its start (minutes) and the grid's start hour. */
export function blockLeftPx(startMin: number, dayStartHour: number, cellWidth: number): number {
  return ((startMin - dayStartHour * 60) / 30) * cellWidth
}

/** Width (px) of a block spanning [startMin, endMin), min `minPx`. */
export function blockWidthPx(startMin: number, endMin: number, cellWidth: number, minPx = 4): number {
  return Math.max(((endMin - startMin) / 30) * cellWidth, minPx)
}

export interface TrackBlock { id: string; start: number; end: number }

/**
 * Greedy interval scheduler → each block's stacking track (0 = top). Blocks
 * that don't overlap in time share a track.
 */
export function assignTracks(blocks: TrackBlock[]): Map<string, number> {
  const sorted = [...blocks].sort((a, b) => a.start - b.start)
  const trackEnds: number[] = []
  const result = new Map<string, number>()
  for (const b of sorted) {
    let placed = false
    for (let t = 0; t < trackEnds.length; t++) {
      if (trackEnds[t] <= b.start) {
        trackEnds[t] = b.end
        result.set(b.id, t)
        placed = true
        break
      }
    }
    if (!placed) {
      result.set(b.id, trackEnds.length)
      trackEnds.push(b.end)
    }
  }
  return result
}

export interface Overtime {
  isEarly: boolean
  isLate: boolean
  /** px width of the early-start overtime segment. */
  earlyPx: number
  /** px width of the late-end overtime segment. */
  latePx: number
}

/** Overtime segments (px) for a block vs the team's work window, all in minutes. */
export function computeOvertime(
  startMin: number,
  endMin: number,
  workStartMin: number,
  workEndMin: number,
  cellWidth: number,
): Overtime {
  const isEarly = startMin < workStartMin
  const isLate = endMin > workEndMin
  return {
    isEarly,
    isLate,
    earlyPx: isEarly ? ((workStartMin - startMin) / 30) * cellWidth : 0,
    latePx: isLate ? ((endMin - workEndMin) / 30) * cellWidth : 0,
  }
}
