'use client'

import { useState, useMemo } from 'react'
import { Check, ChevronsUpDown, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useSuppliers } from '@/hooks/useSuppliers'

interface SupplierMultiSelectProps {
  value: string[]
  onChange: (ids: string[]) => void
  disabled?: boolean
}

export function SupplierMultiSelect({
  value,
  onChange,
  disabled = false,
}: SupplierMultiSelectProps) {
  const [open, setOpen] = useState(false)
  const { data: suppliers = [] } = useSuppliers()

  const supplierMap = useMemo(
    () => new Map(suppliers.map((s) => [s.id, s.name])),
    [suppliers],
  )

  function toggle(id: string) {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id))
    } else {
      onChange([...value, id])
    }
  }

  function remove(id: string) {
    onChange(value.filter((v) => v !== id))
  }

  const triggerLabel =
    value.length === 0
      ? 'Select suppliers…'
      : `${value.length} supplier${value.length > 1 ? 's' : ''} selected`

  return (
    <div className="flex flex-col gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className={cn(
            'h-9 w-full text-sm font-normal inline-flex items-center justify-between rounded-md border border-input bg-background px-3 shadow-xs hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            disabled && 'pointer-events-none opacity-50',
          )}
          render={(props) => (
            <button type="button" disabled={disabled} {...props} />
          )}
        >
          <span
            className={cn(
              'truncate',
              value.length === 0 && 'text-muted-foreground',
            )}
          >
            {triggerLabel}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
        </PopoverTrigger>

        <PopoverContent className="w-[var(--anchor-width)] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search suppliers…" />
            <CommandList>
              <CommandEmpty>No suppliers found.</CommandEmpty>
              <CommandGroup>
                {suppliers.map((supplier) => {
                  const isSelected = value.includes(supplier.id)
                  return (
                    <CommandItem
                      key={supplier.id}
                      value={supplier.name}
                      onSelect={() => toggle(supplier.id)}
                      data-checked={isSelected}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4 shrink-0',
                          isSelected ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      <span className="truncate">{supplier.name}</span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((id) => {
            const name = supplierMap.get(id)
            if (!name) return null
            return (
              <Badge
                key={id}
                variant="secondary"
                className="gap-1 pr-1"
              >
                <span className="truncate max-w-[160px]">{name}</span>
                <button
                  type="button"
                  className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                  onClick={() => remove(id)}
                  aria-label={`Remove ${name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )
          })}
        </div>
      )}
    </div>
  )
}
