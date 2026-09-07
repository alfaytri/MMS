'use client'

import { useState } from 'react'
import { Check, ChevronsUpDown, User, Phone } from 'lucide-react'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useServiceCustomers, type ServiceCustomerRow } from '@/hooks/useServiceCustomers'
import { cn } from '@/lib/utils'

interface Props {
  value: string | null
  selectedName?: string
  onSelect: (customer: ServiceCustomerRow) => void
  id?: string
}

/** Searchable picker over the service-customer list (name or phone). */
export function ServiceCustomerCombobox({ value, selectedName, onSelect, id }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const { data, isLoading } = useServiceCustomers(search, 0, 20)
  const customers = data?.data ?? []

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        type="button"
        className={cn(
          'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          !value && 'text-muted-foreground',
        )}
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          <User className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{value ? (selectedName || 'Selected customer') : 'Select customer…'}</span>
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search by name or phone…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="max-h-64">
            <CommandEmpty>
              <span className="text-xs text-muted-foreground">
                {search.trim().length < 2
                  ? 'Type at least 2 characters to search.'
                  : isLoading
                    ? 'Searching…'
                    : 'No matching customer.'}
              </span>
            </CommandEmpty>
            <CommandGroup>
              {customers.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.id}
                  onSelect={() => { onSelect(c); setOpen(false); setSearch('') }}
                >
                  <Check className={cn('mr-2 h-4 w-4 shrink-0', value === c.id ? 'opacity-100' : 'opacity-0')} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{c.name}</div>
                    {c.primaryPhone && (
                      <div className="inline-flex items-center gap-1 truncate text-xs text-muted-foreground">
                        <Phone className="h-3 w-3" />
                        {c.primaryPhone.phone}
                      </div>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
