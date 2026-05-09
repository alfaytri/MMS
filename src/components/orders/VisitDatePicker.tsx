'use client'
import { useState } from 'react'
import { DayPicker } from 'react-day-picker'
import { format, parseISO } from 'date-fns'
import { CalendarIcon, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
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

  // Convert ISO strings ↔ Date objects
  const selectedDates: Date[] = selected.map((s) => parseISO(s))

  function handleSelect(dates: Date[] | undefined) {
    const isoStrings = (dates ?? []).map((d) => format(d, 'yyyy-MM-dd'))
    onChange(isoStrings)
  }

  function removeDate(iso: string) {
    onChange(selected.filter((s) => s !== iso))
  }

  return (
    <div className="space-y-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className="flex min-h-[44px] w-full items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
          render={(props) => (
            <button type="button" {...props}>
              <CalendarIcon className="h-4 w-4 shrink-0 text-slate-400" />
              <span className={selected.length === 0 ? 'text-slate-400' : 'text-slate-900'}>
                {formatSummary(selected)}
              </span>
            </button>
          )}
        />

        <PopoverContent
          className="w-auto p-0"
          align="start"
          sideOffset={4}
        >
          <DayPicker
            mode="multiple"
            selected={selectedDates}
            onSelect={handleSelect}
            numberOfMonths={2}
            disabled={{ before: new Date(new Date().setHours(0, 0, 0, 0)) }}
            className="p-3"
          />
        </PopoverContent>
      </Popover>

      {/* Selected date chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {[...selected].sort().map((iso) => (
            <span
              key={iso}
              className="flex items-center gap-1 rounded-full bg-orange-50 border border-orange-200 px-2.5 py-0.5 text-xs font-medium text-orange-700"
            >
              {format(parseISO(iso), 'd MMM yyyy')}
              <button
                type="button"
                onClick={() => removeDate(iso)}
                className="ml-0.5 rounded-full hover:bg-orange-200 p-0.5"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
