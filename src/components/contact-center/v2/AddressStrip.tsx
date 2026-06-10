'use client'

import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { AddressCardV2 } from './AddressCardV2'
import { useScrollSnapArrows } from '@/hooks/contact-center/useScrollSnapArrows'

interface AddressEntry {
  id:            string
  label:         string | null
  address_type:  string
  building:      string | null
  street:        string | null
  zone:          string | null
  unit:          string | null
  lat:           number | null
  lng:           number | null
  waze_link:     string | null
  is_primary:    boolean
}

interface Props {
  addresses: AddressEntry[]
  onEdit:    (id: string) => void
  onAdd:     () => void
}

export function AddressStrip({ addresses, onEdit, onAdd }: Props) {
  const { ref, canLeft, canRight, scrollLeft, scrollRight } = useScrollSnapArrows<HTMLDivElement>()

  if (addresses.length === 0) {
    return (
      <div className="px-3 py-2">
        <button
          className="w-full text-xs text-primary hover:underline flex items-center justify-center gap-1 py-2 border border-dashed border-border rounded-md"
          onClick={onAdd}
        >
          <Plus className="h-3 w-3" /> Add first address
        </button>
      </div>
    )
  }

  return (
    <div className="relative group/strip">
      {canLeft && (
        <button
          onClick={scrollLeft}
          className="absolute left-1 top-1/2 -translate-y-1/2 z-10 hidden group-hover/strip:flex items-center justify-center h-6 w-6 rounded-full bg-background/95 border border-border shadow-sm hover:bg-muted"
          aria-label="Scroll addresses left"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
      )}
      {canRight && (
        <button
          onClick={scrollRight}
          className="absolute right-1 top-1/2 -translate-y-1/2 z-10 hidden group-hover/strip:flex items-center justify-center h-6 w-6 rounded-full bg-background/95 border border-border shadow-sm hover:bg-muted"
          aria-label="Scroll addresses right"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}

      <div
        ref={ref}
        className="flex gap-3 overflow-x-auto scroll-smooth snap-x snap-mandatory px-3 py-2"
        style={{ scrollbarWidth: 'thin' }}
      >
        {addresses.map((a, i) => (
          <AddressCardV2 key={a.id} address={a} index={i} onEdit={onEdit} />
        ))}
        <button
          onClick={onAdd}
          className="snap-start flex-shrink-0 w-[80px] flex items-center justify-center rounded-md border border-dashed border-border hover:bg-muted/40 transition-colors"
          aria-label="Add address"
        >
          <Plus className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    </div>
  )
}
