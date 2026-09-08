'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useUnits, useCreateUnit } from '@/hooks/useUnits'
import { sameUnit } from '@/lib/inventory/unitNormalize'
import { cn } from '@/lib/utils'

type UnitComboboxProps = {
  value: string | null            // the unit NAME (items.unit is text)
  onChange: (name: string | null) => void
  allowCreate?: boolean
  disabled?: boolean
  id?: string
}

// Searchable unit picker (cmdk Popover+Command), mirroring BrandCombobox but
// name-keyed because items.unit stores the unit name as text.
export function UnitCombobox({
  value,
  onChange,
  allowCreate = true,
  disabled = false,
  id,
}: UnitComboboxProps) {
  const { data: units = [], isLoading: unitsLoading } = useUnits()
  const createUnit = useCreateUnit()

  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const triggerLabel = value == null || value === '' ? 'Select unit…' : value

  const filteredUnits = useMemo(() => {
    const q = search.trim().toLowerCase()
    const base = !q ? units : units.filter((u) => u.name.toLowerCase().includes(q))
    return [...base].sort((a, b) => a.name.localeCompare(b.name))
  }, [units, search])

  const exactMatch = useMemo(() => {
    const q = search.trim()
    if (!q) return null
    return units.find((u) => sameUnit(u.name, q)) ?? null
  }, [units, search])

  function selectUnit(name: string) {
    onChange(name)
    setOpen(false)
    setSearch('')
  }

  async function handleCreateUnit() {
    const name = search.trim()
    if (!name) return
    try {
      const { unit: newUnit, created } = await createUnit.mutateAsync({ name })
      toast.success(created ? `"${newUnit.name}" added` : `"${newUnit.name}" already exists — selected`)
      onChange(newUnit.name)
      setOpen(false)
      setSearch('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add unit')
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        type="button"
        disabled={disabled || unitsLoading}
        className={cn(
          'flex h-11 min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
          (value == null || value === '') && 'text-muted-foreground',
        )}
      >
        <span className="truncate">{triggerLabel}</span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search units, or type a new name to add…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="max-h-64">
            <CommandEmpty>
              <span className="text-xs text-muted-foreground">No matching unit — use “Add new unit” below.</span>
            </CommandEmpty>
            <CommandGroup>
              {filteredUnits.map((u) => (
                <CommandItem key={u.id} value={u.name} onSelect={() => selectUnit(u.name)}>
                  <Check className={cn('mr-2 h-4 w-4', value != null && sameUnit(value, u.name) ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate">{u.name}</span>
                </CommandItem>
              ))}
              {allowCreate && !exactMatch && (
                <CommandItem
                  value="__add_new_unit__"
                  onSelect={handleCreateUnit}
                  disabled={createUnit.isPending || search.trim().length === 0}
                  className="mt-1 rounded-none border-t border-border text-primary data-[disabled=true]:opacity-100 data-[disabled=true]:text-muted-foreground"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {search.trim().length > 0 ? (
                    <span>Add &ldquo;<span className="font-medium">{search.trim()}</span>&rdquo; as a new unit</span>
                  ) : (
                    <span>Type a name above to add a new unit</span>
                  )}
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
