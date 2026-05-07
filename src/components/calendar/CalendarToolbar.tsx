'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown, Filter } from 'lucide-react'
import { format, addDays, subDays, parseISO, isToday } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { CalendarSchedule } from '@/hooks/useCalendarSchedule'
import type { Division } from '@/hooks/useDivisions'

export type VisitTypeConfig = {
  key: string
  label: string
  color: string // tailwind bg class
}

export const VISIT_TYPES: VisitTypeConfig[] = [
  { key: 'normal_order',        label: 'Normal Order',          color: 'bg-blue-500' },
  { key: 'emergency',           label: 'Emergency',             color: 'bg-red-500' },
  { key: 'follow_up',           label: 'Follow Up',             color: 'bg-orange-400' },
  { key: 'backwork',            label: 'Backwork',              color: 'bg-yellow-500' },
  { key: 'site_visit',          label: 'Site Visit',            color: 'bg-green-500' },
  { key: 'site_visit_contract', label: 'Site Visit (Contract)', color: 'bg-teal-500' },
  { key: 'contract_visit',      label: 'Contract Visit',        color: 'bg-purple-500' },
  { key: 'qc_visit',            label: 'QC Visit',              color: 'bg-pink-500' },
]

interface CalendarToolbarProps {
  date: string
  onDateChange: (date: string) => void
  schedule: CalendarSchedule
  isSuperViewer: boolean
  activeDivisionSlug: string | null
  divisions: Division[]
  onDivisionChange: (slug: string) => void
  activeVisitTypes: Set<string>
  onVisitTypeToggle: (type: string) => void
  fitMode: boolean
  onFitModeToggle: () => void
  /** Hidden on mobile — only rendered at lg+ */
  showFitToggle?: boolean
}

export function CalendarToolbar({
  date,
  onDateChange,
  schedule,
  isSuperViewer,
  activeDivisionSlug,
  divisions,
  onDivisionChange,
  activeVisitTypes,
  onVisitTypeToggle,
  fitMode,
  onFitModeToggle,
  showFitToggle = false,
}: CalendarToolbarProps) {
  const [filtersOpen, setFiltersOpen] = useState(false)

  const parsed = parseISO(date)
  const dateLabel = format(parsed, 'EEE, MMM d')
  const onToday = !isToday(parsed)

  function prev() { onDateChange(format(subDays(parsed, 1), 'yyyy-MM-dd')) }
  function next() { onDateChange(format(addDays(parsed, 1), 'yyyy-MM-dd')) }
  function goToday() { onDateChange(format(new Date(), 'yyyy-MM-dd')) }

  return (
    <div className="flex flex-col gap-1 px-3 py-2 border-b bg-background">
      {/* Row 1 */}
      <div className="flex items-center gap-2 flex-wrap min-h-11 lg:min-h-0 lg:h-10">
        {/* Date navigation */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={prev}
            aria-label="previous day"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium w-28 text-center">{dateLabel}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={next}
            aria-label="next day"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {onToday && (
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={goToday}>
            Today
          </Button>
        )}

        {/* Active schedule badge — rendered in DOM at all breakpoints for testability */}
        <Badge variant="outline" className="text-xs font-normal h-6">
          {schedule.label}
        </Badge>

        <div className="flex-1" />

        {/* Division selector — owner only, single-select */}
        {isSuperViewer && divisions.length > 1 && (
          <Select
            value={activeDivisionSlug ?? ''}
            onValueChange={onDivisionChange}
          >
            <SelectTrigger className="h-7 w-36 text-xs gap-1">
              <SelectValue placeholder="All divisions" />
              <ChevronDown className="h-3 w-3 opacity-50" />
            </SelectTrigger>
            <SelectContent>
              {divisions.map(d => (
                <SelectItem key={d.id} value={d.slug} className="text-xs">
                  {d.short_name ?? d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Fit / Scroll toggle — lg+ only */}
        {showFitToggle && (
          <div className="hidden lg:flex border rounded-md overflow-hidden text-xs">
            <button
              onClick={() => !fitMode && onFitModeToggle()}
              className={cn('px-2 h-7', fitMode ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
            >
              Fit
            </button>
            <button
              onClick={() => fitMode && onFitModeToggle()}
              className={cn('px-2 h-7 border-l', !fitMode ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
            >
              Scroll
            </button>
          </div>
        )}
      </div>

      {/* Row 2 — Visit type chips */}
      <div className="hidden sm:flex items-center gap-1 flex-wrap" data-testid="visit-type-chips">
        {VISIT_TYPES.map(vt => {
          const active = activeVisitTypes.size === 0 || activeVisitTypes.has(vt.key)
          return (
            <button
              key={vt.key}
              onClick={() => onVisitTypeToggle(vt.key)}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-opacity',
                active ? 'opacity-100' : 'opacity-40',
              )}
            >
              <span className={cn('h-2 w-2 rounded-full', vt.color)} />
              {vt.label}
            </button>
          )
        })}
      </div>

      {/* Mobile: Filters button (visible only on < sm) */}
      <div className="flex sm:hidden">
        <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1 text-xs">
              <Filter className="h-3.5 w-3.5" />
              Filters
              {activeVisitTypes.size > 0 && (
                <Badge className="h-4 w-4 p-0 flex items-center justify-center text-[10px]">
                  {activeVisitTypes.size}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 p-3">
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Visit Types</p>
              <div className="flex flex-col gap-1">
                {VISIT_TYPES.map(vt => {
                  const active = activeVisitTypes.size === 0 || activeVisitTypes.has(vt.key)
                  return (
                    <button
                      key={vt.key}
                      onClick={() => onVisitTypeToggle(vt.key)}
                      className={cn(
                        'flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left transition-colors hover:bg-muted',
                        active ? 'font-medium' : 'opacity-50',
                      )}
                    >
                      <span className={cn('h-2 w-2 rounded-full shrink-0', vt.color)} />
                      {vt.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}
