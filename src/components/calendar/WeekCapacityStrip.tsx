'use client'

import { format, parseISO, isToday } from 'date-fns'
import { cn } from '@/lib/utils'
import type { DayCapacity } from '@/hooks/useWeekCapacity'

/** Returns the Tailwind bg class for a capacity percentage. */
export function getBarColor(percentage: number): string {
  if (percentage >= 100) return 'bg-red-500'
  if (percentage >= 80) return 'bg-amber-400'
  return 'bg-green-500'
}

/** Returns "+Nm" if overflowMinutes > 0, otherwise empty string. */
export function formatOverflow(overflowMinutes: number): string {
  return overflowMinutes > 0 ? `+${overflowMinutes}m` : ''
}

interface DayColumnProps {
  date: string
  capacity: DayCapacity
  isSelected: boolean
  onSelect: () => void
}

function DayColumn({ date, capacity, isSelected, onSelect }: DayColumnProps) {
  const parsed = parseISO(date)
  const dayLabel = format(parsed, 'EEE') // Mon, Tue, etc.
  const today = isToday(parsed)
  const barColor = getBarColor(capacity.percentage)
  const overflow = formatOverflow(capacity.overflowMinutes)
  const barWidth = capacity.isOff ? 0 : Math.min(capacity.percentage, 100)

  return (
    <button
      onClick={onSelect}
      className={cn(
        'flex flex-col items-center gap-1 flex-1 py-1.5 rounded transition-colors hover:bg-muted/40',
        isSelected && 'bg-muted/60',
      )}
      title={
        capacity.isOff
          ? 'Off day'
          : `${capacity.totalMinutes} / ${capacity.scheduledMinutes} min booked · ${capacity.visitCount} visits`
      }
    >
      {/* Day label */}
      <span
        className={cn(
          'text-[10px] uppercase tracking-wide leading-none',
          today ? 'font-bold text-primary' : 'text-muted-foreground',
        )}
      >
        {dayLabel}
      </span>

      {/* Capacity bar */}
      <div
        className={cn(
          'relative w-full h-3 rounded-sm overflow-visible',
          capacity.isOff ? 'border border-dashed border-muted-foreground/30' : 'bg-muted',
        )}
      >
        {!capacity.isOff && (
          <div
            className={cn('absolute left-0 top-0 h-full rounded-sm', barColor)}
            style={{ width: `${barWidth}%` }}
          />
        )}
      </div>

      {/* Percentage / Off label */}
      <span
        className={cn(
          'text-[10px] leading-none',
          capacity.isOff
            ? 'text-muted-foreground'
            : capacity.percentage >= 100
            ? 'text-red-500 font-medium'
            : 'text-muted-foreground',
        )}
      >
        {capacity.isOff ? 'Off' : overflow ? overflow : `${capacity.percentage}%`}
      </span>
    </button>
  )
}

const DEFAULT_CAPACITY: DayCapacity = {
  scheduledMinutes: 0,
  totalMinutes: 0,
  percentage: 0,
  overflowMinutes: 0,
  visitCount: 0,
  isOff: true,
}

interface WeekCapacityStripProps {
  weekDates: string[]
  capacityByDate: Record<string, DayCapacity>
  selectedDate: string
  onDateSelect: (date: string) => void
}

export function WeekCapacityStrip({
  weekDates,
  capacityByDate,
  selectedDate,
  onDateSelect,
}: WeekCapacityStripProps) {
  return (
    <div className="flex items-stretch gap-0.5 px-2 py-1 border-b bg-background">
      {weekDates.map(date => (
        <DayColumn
          key={date}
          date={date}
          capacity={capacityByDate[date] ?? DEFAULT_CAPACITY}
          isSelected={date === selectedDate}
          onSelect={() => onDateSelect(date)}
        />
      ))}
    </div>
  )
}
