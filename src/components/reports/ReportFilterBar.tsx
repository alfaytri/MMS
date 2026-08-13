'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { Check, ChevronsUpDown, Building2, Warehouse as WarehouseIcon } from 'lucide-react'
import { DateRangePicker, type DateRange } from './DateRangePicker'
import { useDivisions } from '@/hooks/useDivisions'
import { useWarehouses } from '@/hooks/useWarehouses'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

// ─── Shared filter shape consumed by every report page + hook ──────────────
export type ReportFilters = {
  start: string
  end: string
  divisionIds: string[]   // empty = all visible
  warehouseIds: string[]  // empty = all visible
}

type Option = { id: string; label: string }

// ─── A compact multi-select (Popover + check rows), "All" when nothing picked.
// Trigger height is fixed so toggling selection never shifts the bar.
function MultiSelect({
  label, icon, options, value, onChange, emptyLabel,
}: {
  label: string
  icon: ReactNode
  options: Option[]
  value: string[]
  onChange: (ids: string[]) => void
  emptyLabel: string
}) {
  const [open, setOpen] = useState(false)
  const selected = useMemo(() => new Set(value), [value])
  const triggerText =
    value.length === 0 ? emptyLabel
    : value.length === 1 ? (options.find((o) => o.id === value[0])?.label ?? '1 selected')
    : `${value.length} selected`

  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id); else next.add(id)
    onChange([...next])
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={(props) => (
          <Button
            {...props}
            type="button"
            variant="outline"
            className="h-9 min-h-11 md:min-h-0 min-w-[170px] justify-between gap-2 font-normal"
          >
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="shrink-0 text-muted-foreground">{icon}</span>
              <span className="truncate text-sm">{triggerText}</span>
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        )}
      />
      <PopoverContent className="w-64 p-1.5" align="start">
        <div className="px-1.5 pb-1.5 pt-1 text-[11px] font-medium text-muted-foreground">{label}</div>
        <button
          type="button"
          onClick={() => onChange([])}
          className={cn(
            'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors',
            value.length === 0 && 'font-medium',
          )}
        >
          <span>All {label.toLowerCase()}</span>
          {value.length === 0 && <Check className="h-3.5 w-3.5 text-primary" />}
        </button>
        <div className="my-1 border-t" />
        <div className="max-h-64 overflow-y-auto">
          {options.length === 0 && (
            <div className="px-2 py-1.5 text-[11px] italic text-muted-foreground">Nothing available</div>
          )}
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => toggle(o.id)}
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors text-left"
            >
              <span className="truncate">{o.label}</span>
              {selected.has(o.id) && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

type Props = {
  value: ReportFilters
  onChange: (f: ReportFilters) => void
  /** Show the date-range picker (reports 1.2/2.1/2.2/2.3/2.4). Snapshot reports (1.1) hide it. */
  showDate?: boolean
  /** Show the warehouse multi-select (stock-sourced reports 1.1/1.2/2.4). */
  showWarehouse?: boolean
  /** Per-report extra filters (customer, supplier, category…) rendered inline. */
  children?: ReactNode
}

export function ReportFilterBar({ value, onChange, showDate = true, showWarehouse = false, children }: Props) {
  const { data: divisions = [] } = useDivisions()
  const { data: warehouses = [] } = useWarehouses()

  const divisionOptions: Option[] = useMemo(
    () => divisions.map((d) => ({ id: d.id, label: d.short_name || d.name })),
    [divisions],
  )
  const warehouseOptions: Option[] = useMemo(
    () => warehouses.map((w) => ({ id: w.id, label: w.name })),
    [warehouses],
  )

  const activeCount = value.divisionIds.length + value.warehouseIds.length

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        {showDate && (
          <DateRangePicker
            value={{ start: value.start, end: value.end } satisfies DateRange}
            onChange={(r) => onChange({ ...value, start: r.start, end: r.end })}
          />
        )}
        <MultiSelect
          label="Divisions"
          icon={<Building2 className="h-3.5 w-3.5" />}
          options={divisionOptions}
          value={value.divisionIds}
          onChange={(ids) => onChange({ ...value, divisionIds: ids })}
          emptyLabel="All divisions"
        />
        {showWarehouse && (
          <MultiSelect
            label="Warehouses"
            icon={<WarehouseIcon className="h-3.5 w-3.5" />}
            options={warehouseOptions}
            value={value.warehouseIds}
            onChange={(ids) => onChange({ ...value, warehouseIds: ids })}
            emptyLabel="All warehouses"
          />
        )}
        {children}
        {activeCount > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 min-h-11 md:min-h-0 text-xs text-muted-foreground"
            onClick={() => onChange({ ...value, divisionIds: [], warehouseIds: [] })}
          >
            Clear
          </Button>
        )}
      </div>
      {activeCount > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {value.divisionIds.map((id) => {
            const label = divisionOptions.find((o) => o.id === id)?.label
            return label ? (
              <Badge key={`d-${id}`} variant="secondary" className="text-[10px] font-normal gap-1">
                <Building2 className="h-2.5 w-2.5" /> {label}
              </Badge>
            ) : null
          })}
          {value.warehouseIds.map((id) => {
            const label = warehouseOptions.find((o) => o.id === id)?.label
            return label ? (
              <Badge key={`w-${id}`} variant="secondary" className="text-[10px] font-normal gap-1">
                <WarehouseIcon className="h-2.5 w-2.5" /> {label}
              </Badge>
            ) : null
          })}
        </div>
      )}
    </div>
  )
}
