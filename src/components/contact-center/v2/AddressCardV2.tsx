'use client'

import { MapPin, GripVertical, Navigation, Pencil } from 'lucide-react'

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
  address:  AddressEntry
  index:    number
  onEdit:   (id: string) => void
}

function autoLabel(a: AddressEntry): string {
  const parts = [
    a.building ? `B${a.building}` : '',
    a.street   ? `S${a.street}`   : '',
    a.zone     ? `Z${a.zone}`     : '',
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : 'Address'
}

export function AddressCardV2({ address: a, index, onEdit }: Props) {
  const label = a.label ?? autoLabel(a)
  const coordText = a.lat != null && a.lng != null
    ? `${Number(a.lat).toFixed(5)}, ${Number(a.lng).toFixed(5)}`
    : null

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData('application/mms-address', JSON.stringify(a))
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <div
      data-snap-card
      draggable
      onDragStart={handleDragStart}
      className="snap-start flex-shrink-0 w-[240px] relative rounded-md border border-border bg-background p-2 group cursor-grab active:cursor-grabbing"
    >
      <span className={`absolute top-1.5 right-1.5 text-[10px] font-semibold rounded-full w-5 h-5 flex items-center justify-center ${
        a.is_primary
          ? 'bg-primary/10 text-primary border border-primary/30'
          : 'bg-muted text-muted-foreground border border-border'
      }`}>
        {index + 1}
      </span>

      <div className="flex items-start gap-1.5 pr-7">
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            <span className="text-xs font-medium truncate">{label}</span>
          </div>
          {(a.building || a.street || a.zone) && (
            <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
              {[a.unit ? `U${a.unit}` : '', a.building ? `B${a.building}` : '', a.street ? `S${a.street}` : '', a.zone ? `Z${a.zone}` : ''].filter(Boolean).join(' · ')}
            </p>
          )}
          {coordText && <p className="text-[11px] text-muted-foreground font-mono mt-0.5">{coordText}</p>}
          {a.waze_link && (
            <a
              href={a.waze_link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline mt-1"
            >
              <Navigation className="h-2.5 w-2.5" /> Waze
            </a>
          )}
        </div>
      </div>

      <button
        className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted"
        onClick={(e) => { e.stopPropagation(); onEdit(a.id) }}
        title="Edit address"
      >
        <Pencil className="h-3 w-3 text-muted-foreground" />
      </button>
    </div>
  )
}
