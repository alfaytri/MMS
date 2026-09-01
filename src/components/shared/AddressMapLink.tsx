'use client'

import { MapPin, ExternalLink } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

/**
 * Renders a warehouse/customer location as a clickable pin that opens the place
 * in Google Maps or Waze. Prefers coordinates (an exact pin); falls back to an
 * address text search when no lat/lng is stored. Plain text when there's nothing.
 */
export function AddressMapLink({
  address,
  latitude,
  longitude,
  emptyLabel = 'No location set',
  className,
}: {
  address?: string | null
  latitude?: number | null
  longitude?: number | null
  emptyLabel?: string
  className?: string
}) {
  const hasCoords = latitude != null && longitude != null
  const text = (address ?? '').trim()
  const hasAddress = text.length > 0

  if (!hasCoords && !hasAddress) {
    return <span className={cn('inline-flex items-center gap-1', className)}><MapPin className="h-3 w-3 flex-shrink-0" />{emptyLabel}</span>
  }

  const gmaps = hasCoords
    ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}`
  const waze = hasCoords
    ? `https://www.waze.com/ul?ll=${latitude}%2C${longitude}&navigate=yes`
    : `https://www.waze.com/ul?q=${encodeURIComponent(text)}`

  const open = (url: string) => window.open(url, '_blank', 'noopener,noreferrer')
  const label = hasAddress ? text : `${latitude}, ${longitude}`

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        title="Open in maps"
        onClick={(e) => e.stopPropagation()}
        className={cn('inline-flex items-center gap-1 min-w-0 text-left hover:text-foreground hover:underline underline-offset-2 decoration-dotted transition-colors', className)}
      >
        <MapPin className="h-3 w-3 flex-shrink-0" />
        <span className="truncate">{label}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-44">
        <div className="px-2 py-1.5 text-[11px] font-normal text-muted-foreground truncate">{label}</div>
        <DropdownMenuItem onClick={() => open(gmaps)} className="gap-2 text-xs">
          <ExternalLink className="h-3.5 w-3.5" /> Open in Google Maps
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => open(waze)} className="gap-2 text-xs">
          <ExternalLink className="h-3.5 w-3.5" /> Open in Waze
        </DropdownMenuItem>
        {!hasCoords && (
          <div className="px-2 py-1 text-[10px] text-muted-foreground">No coordinates — opens a search, not an exact pin.</div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
