'use client'

import { useState, useEffect, useRef } from 'react'
import { Search, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type InventoryLookupResult = {
  brand_variant_id: string
  item_name: string
  item_name_ar: string | null
  sku: string | null
  unit: string
  cost_price: number
  selling_price: number
}

interface InventoryItemLookupProps {
  value: InventoryLookupResult | null
  onChange: (item: InventoryLookupResult | null) => void
  placeholder?: string
  className?: string
}

export function InventoryItemLookup({ value, onChange, placeholder = 'Search inventory…', className }: InventoryItemLookupProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<InventoryLookupResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!query || query.length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      setLoading(true)
      const supabase = createClient()
      const safe = query.replace(/%/g, '\\%')
      const { data } = await (supabase as any)
        .from('inventory_brand_variants')
        .select('id, code, cost_price, selling_price, inventory_items!inner(name_en, name_ar, sku, unit)')
        .or(`inventory_items.name_en.ilike.%${safe}%,code.ilike.%${safe}%`)
        .eq('inventory_items.status', 'active')
        .limit(20)

      setResults(
        (data ?? []).map((r: any) => ({
          brand_variant_id: r.id,
          item_name: r.inventory_items.name_en,
          item_name_ar: r.inventory_items.name_ar,
          sku: r.code ?? r.inventory_items.sku,
          unit: r.inventory_items.unit,
          cost_price: r.cost_price ?? 0,
          selling_price: r.selling_price ?? 0,
        }))
      )
      setLoading(false)
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  // Close dropdown on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  if (value) {
    return (
      <div className={cn('flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm', className)}>
        <span className="flex-1 font-medium">{value.item_name}</span>
        {value.sku && <span className="text-xs text-muted-foreground">{value.sku}</span>}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-5 w-5 shrink-0"
          onClick={() => onChange(null)}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    )
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder={placeholder}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
        />
      </div>
      {open && (query.length >= 2) && (
        <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-md border bg-popover shadow-md">
          {loading && (
            <div className="px-3 py-2 text-sm text-muted-foreground">Searching…</div>
          )}
          {!loading && results.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">No results</div>
          )}
          {results.map((item) => (
            <button
              key={item.brand_variant_id}
              type="button"
              className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-accent"
              onClick={() => { onChange(item); setQuery(''); setOpen(false) }}
            >
              <div className="text-left">
                <div className="font-medium">{item.item_name}</div>
                {item.sku && <div className="text-xs text-muted-foreground">{item.sku}</div>}
              </div>
              <div className="text-right text-xs text-muted-foreground">
                {item.unit}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
