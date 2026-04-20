'use client'

import { useState, useEffect, useRef } from 'react'
import { Search, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type ToolAssetLookupResult = {
  tool_asset_item_id: string
  item_name: string
}

interface ToolAssetLookupProps {
  value: ToolAssetLookupResult | null
  onChange: (item: ToolAssetLookupResult | null) => void
  placeholder?: string
  className?: string
}

export function ToolAssetLookup({
  value,
  onChange,
  placeholder = 'Search tools & assets…',
  className,
}: ToolAssetLookupProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ToolAssetLookupResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!query || query.length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      setLoading(true)
      const supabase = createClient()
      const safe = query.replace(/%/g, '\\%')
      const { data, error } = await (supabase as any)
        .from('tool_asset_items')
        .select('id, name_en')
        .ilike('name_en', `%${safe}%`)
        .limit(20)
      if (error) {
        console.error('ToolAssetLookup query error:', error.message)
        setLoading(false)
        return
      }
      setResults(
        (data ?? []).map((r: any) => ({
          tool_asset_item_id: r.id,
          item_name: r.name_en,
        }))
      )
      setLoading(false)
    }, 250)
    return () => clearTimeout(t)
  }, [query])

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
      {open && query.length >= 2 && (
        <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-md border bg-popover shadow-md">
          {loading && (
            <div className="px-3 py-2 text-sm text-muted-foreground">Searching…</div>
          )}
          {!loading && results.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">No results</div>
          )}
          {results.map((item) => (
            <button
              key={item.tool_asset_item_id}
              type="button"
              className="flex w-full items-center px-3 py-2 text-sm hover:bg-accent"
              onClick={() => { onChange(item); setQuery(''); setOpen(false) }}
            >
              <span className="font-medium">{item.item_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
