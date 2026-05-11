import { format } from 'date-fns'
import { Phone, MapPin, MapPinned } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SiteVisitListItem } from '@/hooks/useSiteVisits'

const STATUS_STYLES: Record<string, string> = {
  scheduled:  'bg-orange-100 text-orange-700 border-orange-200',
  confirmed:  'bg-green-100 text-green-700 border-green-200',
  completed:  'bg-green-100 text-green-800 border-green-300',
  cancelled:  'bg-red-100 text-red-700 border-red-200',
  waitlist:   'bg-yellow-100 text-yellow-700 border-yellow-200',
}

interface Props {
  visit: SiteVisitListItem
  onClick: () => void
}

export function SiteVisitListCard({ visit, onClick }: Props) {
  const arrivalDiffers = visit.arrival_phone && visit.arrival_phone !== visit.customer_phone

  return (
    <button
      onClick={onClick}
      className="w-full min-h-11 rounded-lg border border-purple-200 bg-white p-3 text-left transition-colors hover:border-purple-300 hover:bg-purple-50 space-y-2"
    >
      {/* Row 1: visit ID + type badge + status */}
      <div className="flex items-center gap-2 flex-wrap">
        <MapPinned className="h-3.5 w-3.5 shrink-0 text-purple-500" />
        <span className="font-mono font-semibold text-slate-900 text-sm">{visit.visit_id}</span>
        <span className="rounded border border-purple-200 bg-purple-100 px-1.5 py-0.5 text-[11px] font-semibold text-purple-700">
          Site Visit
        </span>
        <span className={cn('rounded border px-1.5 py-0.5 text-[11px] font-semibold uppercase', STATUS_STYLES[visit.status] ?? 'bg-slate-100 text-slate-600 border-slate-200')}>
          {visit.status}
        </span>
      </div>

      {/* Row 2: customer name + date */}
      <div className="flex items-center gap-3 text-xs text-slate-600 flex-wrap">
        <span className="font-medium">{visit.customer_name}</span>
        {visit.scheduled_date && (
          <span className="text-slate-400">{format(new Date(visit.scheduled_date), 'dd MMM yyyy')}</span>
        )}
      </div>

      {/* Row 3: customer phone */}
      {visit.customer_phone && (
        <div className="flex items-center gap-1.5 text-xs text-slate-600">
          <Phone className="h-3 w-3 shrink-0 text-slate-400" />
          <span>{visit.customer_phone}</span>
        </div>
      )}

      {arrivalDiffers && (
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <Phone className="h-3 w-3 shrink-0 text-orange-400" />
          <span>{visit.arrival_phone}</span>
          <span className="text-[10px] text-orange-400 font-medium">on arrival</span>
        </div>
      )}

      {/* Row 4: address */}
      {visit.address && (
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">{visit.address}</span>
        </div>
      )}
    </button>
  )
}
