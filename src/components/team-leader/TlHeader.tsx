// src/components/team-leader/TlHeader.tsx
'use client'

import { useRef } from 'react'
import { format, addDays, parseISO, isToday } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { TlTeamOption } from '@/types/team-leader'

interface Props {
  teamName: string
  isAdmin: boolean
  showTeamSelector?: boolean
  allTeams: TlTeamOption[]
  effectiveTeamId: string | null
  onTeamChange: (teamId: string) => void
  count: number
  selectedDate: string                       // YYYY-MM-DD
  onSelectedDateChange: (date: string) => void
}

export function TlHeader({
  teamName, isAdmin, showTeamSelector, allTeams, effectiveTeamId,
  onTeamChange, count, selectedDate, onSelectedDateChange,
}: Props) {
  const today = format(new Date(), 'EEEE, MMM d, yyyy')
  const viewingToday = isToday(parseISO(selectedDate))
  const countLabel = viewingToday
    ? `${count} today`
    : `${count} on ${format(parseISO(selectedDate), 'MMM d')}`

  const divisionNames = Array.from(new Set(allTeams.map((t) => t.division_name).filter(Boolean)))
  const hasManyDivisions = divisionNames.length > 1

  const dateInputRef = useRef<HTMLInputElement>(null)

  function shiftDate(days: number) {
    const next = format(addDays(parseISO(selectedDate), days), 'yyyy-MM-dd')
    onSelectedDateChange(next)
  }

  function openDatePicker() {
    // showPicker() lets us trigger the native date picker from anywhere on
    // the input (not just the small calendar icon). Chrome 99+, Edge, Safari 16+.
    const input = dateInputRef.current
    if (input && typeof input.showPicker === 'function') {
      try { input.showPicker() } catch { input.focus() }
    } else if (input) {
      input.focus()
    }
  }

  const dateLabel = isToday(parseISO(selectedDate))
    ? `Today — ${format(parseISO(selectedDate), 'EEE, MMM d')}`
    : format(parseISO(selectedDate), 'EEE, MMM d, yyyy')

  return (
    <div className="sticky top-0 z-10 bg-card border-b">
    <div className="max-w-2xl px-4 py-3 space-y-3">
      {/* Row 1: title + date + badges — fixed height to prevent layout shift */}
      <div className="flex items-center justify-between gap-2 min-h-[44px]">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold leading-tight truncate">{teamName}</h1>
          <p className="text-xs text-muted-foreground">{today}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isAdmin && (
            <Badge variant="secondary" className="text-xs">Admin</Badge>
          )}
          <Badge variant="outline" className="text-xs whitespace-nowrap">{countLabel}</Badge>
        </div>
      </div>

      {/* Row 2: team selector */}
      {(showTeamSelector ?? isAdmin) && (
        <Select value={effectiveTeamId ?? ''} onValueChange={(v) => { if (v) onTeamChange(v) }}>
          <SelectTrigger className="h-9 text-sm w-full">
            <SelectValue placeholder="Select team…" />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false} side="bottom">
            {allTeams.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}{hasManyDivisions && t.division_name ? ` — ${t.division_name}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Row 3: date selector — opens on today; the TL steps or picks another day when they want one */}
      <div className="flex items-center gap-2 min-h-[44px]">
        <Button
          type="button" variant="outline" size="icon"
          className="h-11 w-11 shrink-0"
          aria-label="Previous day"
          onClick={() => shiftDate(-1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <Input
          ref={dateInputRef}
          type="date"
          value={selectedDate}
          onChange={(e) => onSelectedDateChange(e.target.value)}
          onClick={openDatePicker}
          className="h-11 flex-1 min-w-0 cursor-pointer"
          aria-label="Pick a date"
        />

        <Button
          type="button" variant="outline" size="icon"
          className="h-11 w-11 shrink-0"
          aria-label="Next day"
          onClick={() => shiftDate(1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>

        {/* Quick jump back to the default (today) when the TL has navigated away */}
        {!viewingToday && (
          <Button
            type="button" variant="secondary"
            className="h-11 shrink-0 px-3 text-sm"
            onClick={() => onSelectedDateChange(format(new Date(), 'yyyy-MM-dd'))}
          >
            Today
          </Button>
        )}
      </div>

      {/* Read-only label below the date strip so the user sees the day-of-week even on tiny screens */}
      <p className="text-xs text-muted-foreground -mt-1">{dateLabel}</p>
    </div>
    </div>
  )
}
