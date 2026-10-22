'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Check, ChevronsUpDown, User, Phone } from 'lucide-react'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

// Stage 5: searchable picker over the unified customers (service_customers is retired).
export interface CustomerPickRow {
  id: string
  name: string
  primaryPhone: { id: string; phone: string } | null
  allPhones: { id: string; phone: string; is_primary: boolean }[]
}

interface Props {
  value: string | null
  selectedName?: string
  onSelect: (customer: CustomerPickRow) => void
  id?: string
}

/** Searchable picker over customers (by name or phone). */
export function ServiceCustomerCombobox({ value, selectedName, onSelect, id }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const trimmed = search.trim()

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['contract-customer-search', trimmed],
    enabled: trimmed.length >= 2,
    staleTime: 60_000,
    queryFn: async (): Promise<CustomerPickRow[]> => {
      const supabase = createClient()
      const phoneIds = /\d/.test(trimmed)
        ? ((await supabase.from('customer_phones').select('customer_id').ilike('phone', `%${trimmed}%`)).data ?? [])
            .map((r) => (r as { customer_id: string }).customer_id)
        : []
      let q = supabase.from('customers').select('id, name').order('name').limit(20)
      q = phoneIds.length > 0
        ? q.or(`name.ilike.%${trimmed}%,id.in.(${phoneIds.join(',')})`)
        : q.ilike('name', `%${trimmed}%`)
      const { data: custs, error } = await q
      if (error) throw error
      const ids = (custs ?? []).map((c) => c.id)
      const phonesData = ids.length
        ? ((await supabase.from('customer_phones').select('id, customer_id, phone, is_primary').in('customer_id', ids)).data ?? [])
        : []
      const byCust = new Map<string, { id: string; phone: string; is_primary: boolean }[]>()
      for (const p of phonesData as { id: string; customer_id: string; phone: string; is_primary: boolean }[]) {
        const arr = byCust.get(p.customer_id) ?? []
        arr.push({ id: p.id, phone: p.phone, is_primary: p.is_primary })
        byCust.set(p.customer_id, arr)
      }
      return (custs ?? []).map((c) => {
        const ph = byCust.get(c.id) ?? []
        const primary = ph.find((p) => p.is_primary) ?? ph[0] ?? null
        return {
          id: c.id,
          name: c.name,
          primaryPhone: primary ? { id: primary.id, phone: primary.phone } : null,
          allPhones: ph,
        }
      })
    },
  })

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
                {trimmed.length < 2
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
