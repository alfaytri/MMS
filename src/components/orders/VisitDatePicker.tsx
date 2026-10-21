'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { DayPicker } from 'react-day-picker'
import { format, parseISO } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { datesInDragRange, dayIsoFromElement, mergeVisitDates } from './visitDateRange'
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
   * Works the same for mouse, pen and finger: the day under the pointer comes
   * from the DOM (`data-day`, which react-day-picker stamps on every cell),
   * not from hover — a finger has no hover, so a mouseenter-based anchor
   * would never fire on touch.
   */
  const [dragAnchor, setDragAnchor] = useState<Date | null>(null)
  const [dragHover, setDragHover]   = useState<Date | null>(null)
  /** True once the pointer has actually moved to another day. */
  const movedRef = useRef(false)

  const minDate = useMemo(() => new Date(new Date().setHours(0, 0, 0, 0)), [])

  /**
   * One month on a phone, two from tablet up.
   *
   * Two months never fitted a phone, and it matters more now: the day grid
   * sets `touch-action: none` so a drag is not swallowed as a page pan, which
   * also means a calendar taller than the screen could not be scrolled past.
   * Showing one month keeps it on screen.
   */
  const [months, setMonths] = useState(2)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const apply = () => setMonths(mq.matches ? 2 : 1)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  const dragRange = useMemo(
    () => datesInDragRange(dragAnchor, dragHover, minDate),
    [dragAnchor, dragHover, minDate],
  )

  function commitDrag() {
    // Only a real drag commits. On a mouse, a press and release on one day is
    // a click the library handles. On touch there is no click, so a tap that
    // never moved has to be applied here instead.
    if (dragAnchor && dragHover) {
      if (dragRange.length > 1) {
        onChange(mergeVisitDates(selected, dragRange))
      } else if (movedRef.current && dragRange.length === 1) {
        onChange(mergeVisitDates(selected, dragRange))
      }
    }
    movedRef.current = false
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
              if (e.button !== 0) return
              const iso = dayIsoFromElement(e.target as Element)
              if (!iso) return     // month arrows, weekday headings, gaps
              const day = parseISO(iso)
              movedRef.current = false
              setDragAnchor(day)
              setDragHover(day)
              // Keep receiving moves even once the finger leaves this element.
              try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* unsupported */ }
            }}
            onPointerMove={(e) => {
              if (!dragAnchor) return
              // With the pointer captured the event target stays this
              // container, so ask the document what is actually under the
              // finger. This is the part touch needs.
              const iso = dayIsoFromElement(
                document.elementFromPoint(e.clientX, e.clientY),
              )
              if (!iso) return
              const day = parseISO(iso)
              if (format(day, 'yyyy-MM-dd') !== format(dragAnchor, 'yyyy-MM-dd')) {
                movedRef.current = true
              }
              setDragHover(day)
            }}
            onPointerUp={commitDrag}
            // select-none: dragging over cells would start a text selection.
            // touch-action-none: without it the browser pans instead of
            // sending pointermove, and the drag never starts on a phone.
            className="touch-none select-none"
          >
            <DayPicker
              mode="multiple"
              selected={selectedDates}
              onSelect={handleSelect}
              numberOfMonths={months}
              disabled={{ before: minDate }}
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
