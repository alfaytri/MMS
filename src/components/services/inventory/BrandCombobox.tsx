'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useBrands, useCreateBrand } from '@/hooks/useBrands'
import { cn } from '@/lib/utils'

type BrandComboboxProps = {
  value: string | null
  onChange: (brand: { id: string; name: string } | null) => void
  allowNone?: boolean
  allowCreate?: boolean
  disabled?: boolean
  id?: string
}

// Searchable brand picker (cmdk Popover+Command, same pattern as
// BrandVariantFormDialog). Plain <Select> is unusable with ~299 brands.
export function BrandCombobox({
  value,
  onChange,
  allowNone = true,
  allowCreate = true,
  disabled = false,
  id,
}: BrandComboboxProps) {
  const { data: brands = [], isLoading: brandsLoading } = useBrands()
  const createBrand = useCreateBrand()

  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  // Human-readable trigger label — never fall back to raw ids (dropdown UUID guard).
  const selectedBrand = value != null ? brands.find((b) => b.id === value) : undefined
  const triggerLabel = value == null
    ? 'Select brand…'
    : brandsLoading
      ? 'Loading…'
      : selectedBrand?.name ?? 'Select brand…'

  const filteredBrands = useMemo(() => {
    const q = search.trim().toLowerCase()
    const base = !q ? brands : brands.filter((b) => b.name.toLowerCase().includes(q))
    // Alphabetical by brand name (A–Z), regardless of the source order.
    return [...base].sort((a, b) => a.name.localeCompare(b.name))
  }, [brands, search])

  const exactMatch = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return null
    return brands.find((b) => b.name.toLowerCase() === q) ?? null
  }, [brands, search])

  function selectBrand(b: { id: string; name: string }) {
    onChange({ id: b.id, name: b.name })
    setOpen(false)
    setSearch('')
  }

  async function handleCreateBrand() {
    const name = search.trim()
    if (!name) return
    try {
      const { brand: newBrand, created } = await createBrand.mutateAsync({ name })
      toast.success(created ? `"${newBrand.name}" added` : `"${newBrand.name}" already exists — selected`)
      onChange({ id: newBrand.id, name: newBrand.name })
      setOpen(false)
      setSearch('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add brand')
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        type="button"
        disabled={disabled || brandsLoading}
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
            placeholder="Search brands, or type a new name to add…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="max-h-64">
            <CommandEmpty>
              <span className="text-xs text-muted-foreground">No matching brand — use “Add new brand” below.</span>
            </CommandEmpty>
            <CommandGroup>
              {allowNone && (
                <CommandItem value="__none__" onSelect={() => { onChange(null); setOpen(false); setSearch('') }}>
                  <Check className={cn('mr-2 h-4 w-4', value == null ? 'opacity-100' : 'opacity-0')} />
                  <span className="text-muted-foreground">— None —</span>
                </CommandItem>
              )}
              {filteredBrands.map((b) => (
                <CommandItem key={b.id} value={b.name} onSelect={() => selectBrand({ id: b.id, name: b.name })}>
                  <Check className={cn('mr-2 h-4 w-4', value === b.id ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate">{b.name}</span>
                </CommandItem>
              ))}
              {allowCreate && !exactMatch && (
                <CommandItem
                  value="__add_new_brand__"
                  onSelect={handleCreateBrand}
                  disabled={createBrand.isPending || search.trim().length === 0}
                  className="mt-1 rounded-none border-t border-border text-primary data-[disabled=true]:opacity-100 data-[disabled=true]:text-muted-foreground"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {search.trim().length > 0 ? (
                    <span>Add &ldquo;<span className="font-medium">{search.trim()}</span>&rdquo; as a new brand</span>
                  ) : (
                    <span>Type a name above to add a new brand</span>
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
