'use client'

import { useState, useEffect } from 'react'
import { format, isToday, parseISO } from 'date-fns'

interface NowIndicatorProps {
  /** Schedule start hour (0–23) */
  dayStart: number
  /** Schedule end hour (0–23) */
  dayEnd: number
  /** Pixels per hour */
  cellWidth: number
  /** Height per team row in pixels */
  rowHeight: number
  /** Total number of team rows */
  rowCount: number
  /** The date currently displayed in the grid (ISO yyyy-MM-dd) */
  displayDate: string
}

function getCurrentMinutes(): number {
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes()
}

export function NowIndicator({
  dayStart,
  dayEnd,
  cellWidth,
  rowHeight,
  rowCount,
  displayDate,
}: NowIndicatorProps) {
  const [minutes, setMinutes] = useState(getCurrentMinutes)

  useEffect(() => {
    const id = setInterval(() => setMinutes(getCurrentMinutes()), 60_000)
    return () => clearInterval(id)
  }, [])

  // Only show when viewing today
  if (!isToday(parseISO(displayDate))) return null

  const startMinutes = dayStart * 60
  const endMinutes = dayEnd * 60

  // Only show when current time is within the schedule window
  if (minutes < startMinutes || minutes > endMinutes) return null

  const offsetMinutes = minutes - startMinutes
  const leftPx = (offsetMinutes / 60) * cellWidth

  const totalHeight = rowHeight * rowCount

  return (
    <div
      aria-hidden="true"
      className="absolute top-0 pointer-events-none z-[25]"
      style={{ left: leftPx, height: totalHeight, width: 0 }}
    >
      {/* Red dot at top */}
      <div className="absolute -top-1 -left-1 h-2 w-2 rounded-full bg-red-500" />
      {/* Vertical line */}
      <div className="absolute top-0 left-0 w-px h-full bg-red-500 opacity-70" />
    </div>
  )
}
