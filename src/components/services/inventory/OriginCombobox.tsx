'use client'

import { useMemo, useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useCountryCodes } from '@/hooks/useCountryCodes'
import { cn } from '@/lib/utils'

type OriginComboboxProps = {
  value: number | null
  onChange: (id: number | null) => void
  allowNone?: boolean
  disabled?: boolean
  id?: string
}

// Searchable country/origin picker — same Popover+Command pattern as
// BrandCombobox. Countries are fixed (no create flow).
export function OriginCombobox({
  value,
  onChange,
  allowNone = true,
  disabled = false,
  id,
}: OriginComboboxProps) {
  const { data: countryCodes = [], isLoading: countryCodesLoading } = useCountryCodes()

  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  // Human-readable trigger label — never fall back to raw ids (dropdown UUID guard).
  const selectedCountry = value != null ? countryCodes.find((c) => c.id === value) : undefined
  const triggerLabel = value == null
    ? 'Select origin…'
    : countryCodesLoading
      ? 'Loading…'
      : selectedCountry
        ? `${selectedCountry.flag} ${selectedCountry.name}`
        : 'Select origin…'

  const filteredCountries = useMemo(() => {
    const q = search.trim().toLowerCase()
    const base = !q
      ? countryCodes
      : countryCodes.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.iso.toLowerCase().includes(q) ||
            c.code.toLowerCase().includes(q),
        )
    // Alphabetical by country name (A–Z), regardless of the table's sort_order.
    return [...base].sort((a, b) => a.name.localeCompare(b.name))
  }, [countryCodes, search])

  function selectCountry(id: number) {
    onChange(id)
    setOpen(false)
    setSearch('')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        type="button"
        disabled={disabled || countryCodesLoading}
        className={cn(
          'flex h-11 min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
          value == null && 'text-muted-foreground',
        )}
      >
        <span className="truncate">{triggerLabel}</span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search country…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="max-h-64">
            <CommandEmpty>
              <span className="text-xs text-muted-foreground">No countries found.</span>
            </CommandEmpty>
            <CommandGroup>
              {allowNone && (
                <CommandItem value="__none__" onSelect={() => { onChange(null); setOpen(false); setSearch('') }}>
                  <Check className={cn('mr-2 h-4 w-4', value == null ? 'opacity-100' : 'opacity-0')} />
                  <span className="text-muted-foreground">— None —</span>
                </CommandItem>
              )}
              {filteredCountries.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`${c.name} ${c.iso} ${c.code}`}
                  onSelect={() => selectCountry(c.id)}
                >
                  <Check className={cn('mr-2 h-4 w-4', value === c.id ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate">{c.flag} {c.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
