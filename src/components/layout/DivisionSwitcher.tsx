'use client'

import { useMemo, useState } from 'react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Building2, ChevronDown, Loader2 } from 'lucide-react'
import { useActiveDivision } from '@/components/providers/DivisionProvider'
import { useCompanies } from '@/hooks/useCompanies'
import { cn } from '@/lib/utils'

interface GroupedDivisions {
  companyId:   string | null
  companyName: string
  divisions:   { id: string; name: string }[]
}

function useGroupedDivisions(): GroupedDivisions[] {
  const { availableDivisions } = useActiveDivision()
  const { data: companies = [] } = useCompanies()

  return useMemo(() => {
    const byCompany = new Map<string | null, GroupedDivisions>()
    for (const d of availableDivisions) {
      const companyId = d.company_id
      if (!byCompany.has(companyId)) {
        const companyName =
          companies.find((c) => c.id === companyId)?.name_en ?? 'Other'
        byCompany.set(companyId, { companyId, companyName, divisions: [] })
      }
      byCompany.get(companyId)!.divisions.push({ id: d.id, name: d.name })
    }
    return Array.from(byCompany.values())
  }, [availableDivisions, companies])
}

function currentLabel(
  activeDivisionId: string | null,
  availableDivisions: { id: string; name: string }[],
  isSuperViewer: boolean,
): string {
  if (activeDivisionId === null) return isSuperViewer ? 'All Divisions' : 'Select…'
  const match = availableDivisions.find((d) => d.id === activeDivisionId)
  return match?.name ?? 'Unknown'
}

/** Native-radio-style circle indicator, filled when selected. */
function RadioDot({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
        selected ? 'border-primary' : 'border-muted-foreground/40',
      )}
    >
      {selected && <span className="h-2 w-2 rounded-full bg-primary" />}
    </span>
  )
}

interface RadioRowProps {
  selected: boolean
  label:    string
  onSelect: () => void
  inMenu?:  boolean
}

/**
 * A single radio-style row. When rendered inside a shadcn DropdownMenu we use
 * DropdownMenuItem so keyboard navigation and hover styling match the menu.
 * When rendered inside a Popover (TopNav chip) we use a plain button.
 */
function RadioRow({ selected, label, onSelect, inMenu = false }: RadioRowProps) {
  if (inMenu) {
    return (
      <DropdownMenuItem
        onClick={onSelect}
        closeOnClick={false}
        className="gap-2 pl-2 pr-2"
      >
        <RadioDot selected={selected} />
        <span className="truncate">{label}</span>
      </DropdownMenuItem>
    )
  }
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-sm text-left',
        'hover:bg-accent focus:bg-accent focus:outline-none',
      )}
    >
      <RadioDot selected={selected} />
      <span className="truncate">{label}</span>
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Menu-item variant — inline radio group inside the UserMenu dropdown.
// ─────────────────────────────────────────────────────────────────────────────

export function DivisionSwitcherMenuItem() {
  const {
    activeDivisionId, availableDivisions, isSuperViewer, isSwitching,
    setActiveDivision,
  } = useActiveDivision()
  const groups = useGroupedDivisions()

  // Regular user with 0 or 1 division: read-only label.
  if (!isSuperViewer && availableDivisions.length <= 1) {
    return (
      <DropdownMenuItem disabled className="gap-2 opacity-100 cursor-default">
        <Building2 className="h-4 w-4" />
        <span className="flex-1">Division</span>
        <span className="text-xs text-muted-foreground truncate max-w-[120px]">
          {availableDivisions[0]?.name ?? 'None'}
        </span>
      </DropdownMenuItem>
    )
  }

  return (
    <>
      <div className="px-2 pt-1.5 pb-1 flex items-center gap-2">
        {isSwitching
          ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          : <Building2 className="h-3.5 w-3.5 text-muted-foreground" />}
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
          Division
        </span>
      </div>

      {isSuperViewer && (
        <RadioRow
          inMenu
          selected={activeDivisionId === null}
          label="All Divisions"
          onSelect={() => { void setActiveDivision(null) }}
        />
      )}

      {groups.map((g) => (
        <div key={g.companyId ?? '__none__'}>
          {groups.length > 1 && (
            <div className="px-2 pt-1 pb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              {g.companyName}
            </div>
          )}
          {g.divisions.map((d) => (
            <RadioRow
              key={d.id}
              inMenu
              selected={activeDivisionId === d.id}
              label={d.name}
              onSelect={() => { void setActiveDivision(d.id) }}
            />
          ))}
        </div>
      ))}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Chip variant — compact trigger in the TopNav, opens a Popover of radios.
// Uses a native <button> as the PopoverTrigger to avoid nested-button issues
// with base-ui's Trigger.asChild handling.
// ─────────────────────────────────────────────────────────────────────────────

export function DivisionSwitcherChip({ className }: { className?: string }) {
  const {
    activeDivisionId, availableDivisions, isSuperViewer, isSwitching,
    setActiveDivision,
  } = useActiveDivision()
  const groups = useGroupedDivisions()
  const [open, setOpen] = useState(false)

  if (!isSuperViewer && availableDivisions.length <= 1) return null

  const label = currentLabel(activeDivisionId, availableDivisions, isSuperViewer)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={isSwitching}
        className={cn(
          'inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border bg-background',
          'text-xs font-medium max-w-[180px] hover:bg-accent transition-colors',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          'disabled:opacity-60 disabled:cursor-not-allowed',
          className,
        )}
        aria-label={`Active division: ${label}. Click to change.`}
      >
        {isSwitching
          ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
          : <Building2 className="h-3.5 w-3.5 shrink-0" />}
        <span className="truncate">{label}</span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-1">
        <div className="max-h-72 overflow-y-auto space-y-0.5">
          {isSuperViewer && (
            <RadioRow
              selected={activeDivisionId === null}
              label="All Divisions"
              onSelect={() => { void setActiveDivision(null); setOpen(false) }}
            />
          )}
          {groups.map((g) => (
            <div key={g.companyId ?? '__none__'}>
              {groups.length > 1 && (
                <div className="px-2 pt-1.5 pb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {g.companyName}
                </div>
              )}
              {g.divisions.map((d) => (
                <RadioRow
                  key={d.id}
                  selected={activeDivisionId === d.id}
                  label={d.name}
                  onSelect={() => { void setActiveDivision(d.id); setOpen(false) }}
                />
              ))}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
