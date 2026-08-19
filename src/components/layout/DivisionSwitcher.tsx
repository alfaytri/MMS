'use client'

import { useMemo, useState } from 'react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Building2, Check, ChevronDown, Loader2 } from 'lucide-react'
import { useActiveDivision } from '@/components/providers/DivisionProvider'
import { useCompanies } from '@/hooks/useCompanies'
import { cn } from '@/lib/utils'

interface GroupedDivisions {
  companyId: string | null
  companyName: string
  divisions: { id: string; name: string }[]
}

function useGroupedDivisions(): GroupedDivisions[] {
  const { availableDivisions } = useActiveDivision()
  const { data: companies = [] } = useCompanies()

  return useMemo(() => {
    const byCompany = new Map<string | null, GroupedDivisions>()
    for (const d of availableDivisions) {
      const companyId = d.company_id
      if (!byCompany.has(companyId)) {
        const companyName = companies.find((c) => c.id === companyId)?.name_en ?? 'Other'
        byCompany.set(companyId, { companyId, companyName, divisions: [] })
      }
      byCompany.get(companyId)!.divisions.push({ id: d.id, name: d.name })
    }
    return Array.from(byCompany.values())
  }, [availableDivisions, companies])
}

/** Square checkbox indicator, filled when selected. */
function CheckBox({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors',
        selected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40',
      )}
    >
      {selected && <Check className="h-3 w-3" />}
    </span>
  )
}

function CheckRow({
  selected,
  label,
  onSelect,
}: {
  selected: boolean
  label: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full flex items-center gap-2 px-2 py-1.5 rounded-sm text-sm text-left min-h-9',
        'hover:bg-accent focus:bg-accent focus:outline-none',
      )}
    >
      <CheckBox selected={selected} />
      <span className="truncate">{label}</span>
    </button>
  )
}

/**
 * Multi-select division filter, rendered as a compact chip in the TopNav.
 * Empty selection = "All Divisions". Selecting one narrows server-side scope
 * (orders/stock/money) exactly like the old single switcher; selecting several
 * shows everything the user can access and filters list views (inventory)
 * client-side to the chosen divisions.
 */
export function DivisionSwitcherChip({ className }: { className?: string }) {
  const {
    viewDivisionIds,
    availableDivisions,
    isSuperViewer,
    isSwitching,
    toggleViewDivision,
    clearViewDivisions,
  } = useActiveDivision()
  const groups = useGroupedDivisions()
  const [open, setOpen] = useState(false)

  // No accessible divisions at all (e.g. a field RP with none assigned) — nothing to show.
  if (!isSuperViewer && availableDivisions.length === 0) return null

  // A regular user with exactly one division has nothing to switch, but should
  // still SEE which division they're operating in — render a read-only chip
  // (no popover, not clickable) with the division name instead of hiding it.
  if (!isSuperViewer && availableDivisions.length === 1) {
    const only = availableDivisions[0]!
    return (
      <div
        className={cn(
          'inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border bg-background',
          'text-xs font-medium max-w-[200px] text-muted-foreground',
          className,
        )}
        title={only.name}
        aria-label={`Division: ${only.name}`}
      >
        <Building2 className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{only.name}</span>
      </div>
    )
  }

  const count = viewDivisionIds.size
  const label =
    count === 0
      ? 'All Divisions'
      : count === 1
        ? availableDivisions.find((d) => viewDivisionIds.has(d.id))?.name ?? '1 division'
        : `${count} divisions`

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={isSwitching}
        className={cn(
          'inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border bg-background',
          'text-xs font-medium max-w-[200px] hover:bg-accent transition-colors',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          'disabled:opacity-60 disabled:cursor-not-allowed',
          className,
        )}
        aria-label={`Division filter: ${label}. Click to change.`}
      >
        {isSwitching ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
        ) : (
          <Building2 className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="truncate">{label}</span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-1">
        <div className="max-h-72 overflow-y-auto space-y-0.5">
          <CheckRow
            selected={count === 0}
            label="All Divisions"
            onSelect={() => clearViewDivisions()}
          />
          <div className="my-1 border-t border-border" />
          {groups.map((g) => (
            <div key={g.companyId ?? '__none__'}>
              {groups.length > 1 && (
                <div className="px-2 pt-1.5 pb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {g.companyName}
                </div>
              )}
              {g.divisions.map((d) => (
                <CheckRow
                  key={d.id}
                  selected={viewDivisionIds.has(d.id)}
                  label={d.name}
                  onSelect={() => toggleViewDivision(d.id)}
                />
              ))}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
