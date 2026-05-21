'use client'

import { useState, useEffect } from 'react'
import { isToday, parseISO } from 'date-fns'

interface NowIndicatorProps {
  dayStart: number
  dayEnd: number
  cellWidth: number
  /** Sum of all team row heights — passed from TimelineGrid. */
  totalHeight: number
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
  totalHeight,
  displayDate,
}: NowIndicatorProps) {
  // null until mounted on client — avoids SSR (UTC) initialising the wrong time
  const [minutes, setMinutes] = useState<number | null>(null)

  useEffect(() => {
    setMinutes(getCurrentMinutes())
    const id = setInterval(() => setMinutes(getCurrentMinutes()), 60_000)
    return () => clearInterval(id)
  }, [])

  if (minutes === null) return null

  if (!isToday(parseISO(displayDate))) return null

  const startMinutes = dayStart * 60
  const endMinutes   = dayEnd * 60
  if (minutes < startMinutes || minutes > endMinutes) return null

  const leftPx = ((minutes - startMinutes) / 60) * cellWidth

  return (
    <div
      aria-hidden="true"
      className="absolute top-0 pointer-events-none z-[25]"
      style={{ left: leftPx, height: totalHeight, width: 0 }}
    >
      <div className="absolute -top-1 -left-1 h-2 w-2 rounded-full bg-red-500" />
      <div className="absolute top-0 left-0 w-px h-full bg-red-500 opacity-70" />
    </div>
  )
}
