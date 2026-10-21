'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { DayPicker } from 'react-day-picker'
import { format, parseISO } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { datesInDragRange, mergeVisitDates } from './visitDateRange'
import 'react-day-picker/style.css'

interface Props {
  selected: string[]           // ISO date strings e.g. ['2026-05-13']
  onChange: (dates: string[]) => void
}

function formatSummary(dates: string[]): string {
  if (dates.length === 0) return 'Pick visit date(s)…'
  const sorted = [...dates].sort()
  if (dates.length === 1) {
    return `${format(parseISO(sorted[0]), 'd MMM yyyy')} · 1 day`
  }
  const first = format(parseISO(sorted[0]), 'd MMM yyyy')
  const last  = format(parseISO(sorted[sorted.length - 1]), 'd MMM yyyy')
  return `${first} – ${last} · ${dates.length} days`
}

export function VisitDatePicker({ selected, onChange }: Props) {
  const [open, setOpen] = useState(false)

  /**
   * Drag-to-select.
   *
   * A real drag presses on one day and releases on another, so the browser
   * fires no `click` — which means the range path and react-day-picker's own
   * click-to-toggle never collide, and neither has to suppress the other. A
   * press and release on the SAME day is a click, and is left entirely to the
   * library.
   *
   * Mouse and pen only: the anchor comes from the last day the pointer moved
   * over, and touch has no hover. Tapping dates one by one still works on a
   * phone, which is the natural interaction there anyway.
   */
  const [dragAnchor, setDragAnchor] = useState<Date | null>(null)
  const [dragHover, setDragHover]   = useState<Date | null>(null)
  /** Last day the pointer was over — pointerdown has no day of its own. */
  const hoveredDay = useRef<Date | null>(null)

  const minDate = useMemo(() => new Date(new Date().setHours(0, 0, 0, 0)), [])

  const dragRange = useMemo(
    () => datesInDragRange(dragAnchor, dragHover, minDate),
    [dragAnchor, dragHover, minDate],
  )

  function commitDrag() {
    // Only a real drag commits; a single day is the library's click to handle.
    if (dragAnchor && dragHover && dragRange.length > 1) {
      onChange(mergeVisitDates(selected, dragRange))
    }
    setDragAnchor(null)
    setDragHover(null)
  }

  // Releasing outside the calendar must still finish the drag, otherwise the
  // selection stays stuck to the pointer. Deliberately no dependency array:
  // commitDrag closes over dragHover, which changes on every day crossed, and
  // a stale closure here would commit the wrong range.
  useEffect(() => {
    if (!dragAnchor) return
    const up = () => commitDrag()
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  })

  const selectedDates: Date[] = selected.map((s) => parseISO(s))

  function handleSelect(dates: Date[] | undefined) {
    onChange((dates ?? []).map((d) => format(d, 'yyyy-MM-dd')))
  }

  return (
    <div className="space-y-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className="flex min-h-[44px] w-full items-center gap-2 rounded-md border border-border bg-white px-3 py-2 text-left text-sm transition-colors hover:border-border hover:bg-muted"
          render={(props) => (
            <button type="button" {...props}>
              <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className={selected.length === 0 ? 'text-muted-foreground' : 'text-foreground'}>
                {formatSummary(selected)}
              </span>
            </button>
          )}
        />

        <PopoverContent
          className="w-auto p-0"
          align="start"
          side="bottom"
          sideOffset={4}
        >
          <div
            onPointerDown={(e) => {
              // Ignore anything but a primary press, and presses that are not
              // over a day (month arrows, weekday headings).
              if (e.button !== 0 || !hoveredDay.current) return
              setDragAnchor(hoveredDay.current)
              setDragHover(hoveredDay.current)
            }}
            onPointerUp={commitDrag}
            // Dragging over day cells would otherwise start a text selection.
            className="select-none"
          >
            <DayPicker
              mode="multiple"
              selected={selectedDates}
              onSelect={handleSelect}
              numberOfMonths={2}
              disabled={{ before: minDate }}
              onDayMouseEnter={(day, modifiers) => {
                hoveredDay.current = modifiers.disabled ? null : day
                if (dragAnchor && !modifiers.disabled) setDragHover(day)
              }}
              onDayMouseLeave={() => { hoveredDay.current = null }}
              // Preview the range under the pointer before it is committed.
              modifiers={{ dragging: dragRange.map((iso) => parseISO(iso)) }}
              modifiersClassNames={{ dragging: 'bg-primary/20 rounded-none' }}
              className="p-3"
            />
          </div>
          <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
            Drag across days for a run, or click dates one by one.
          </p>
        </PopoverContent>
      </Popover>

    </div>
  )
}
