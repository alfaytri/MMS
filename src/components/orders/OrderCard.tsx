// src/components/orders/OrderCard.tsx
import { format } from 'date-fns'
import { Phone, ClipboardList, Clock, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OrderListItem, OrderStatus, ConfirmationStatus } from '@/types/orders'

const STATUS_STYLES: Record<OrderStatus, string> = {
  tentative:            'bg-slate-100 text-slate-600 border-slate-200',
  scheduled:            'bg-orange-100 text-orange-700 border-orange-200',
  confirmed:            'bg-green-100 text-green-700 border-green-200',
  'in-progress':        'bg-blue-100 text-blue-700 border-blue-200',
  completed:            'bg-green-100 text-green-800 border-green-300',
  cancelled:            'bg-red-100 text-red-700 border-red-200',
  waitlist:             'bg-yellow-100 text-yellow-700 border-yellow-200',
  'pending-confirmation': 'bg-orange-100 text-orange-700 border-orange-200',
  'pending-approval':   'bg-yellow-100 text-yellow-700 border-yellow-200',
}

const CONFIRMATION_LABELS: Record<ConfirmationStatus, string> = {
  not_sent:           'Not Sent',
  msg_sent:           'Msg Sent',
  customer_confirmed: 'Confirmed',
  agent_confirmed:    'Agent Confirmed',
  no_response:        'No Response',
  manually_confirmed: 'Manual Confirm',
}

function fmt12(t: string): string {
  const [hStr, mStr] = t.split(':')
  const h = parseInt(hStr)
  const m = mStr ?? '00'
  const period = h < 12 ? 'AM' : 'PM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${m} ${period}`
}

interface Props {
  order: OrderListItem
  onClick: () => void
}

export function OrderCard({ order, onClick }: Props) {
  const timeLabel = order.scheduled_time ? fmt12(order.scheduled_time) : null
  const arrivalDiffers =
    order.arrival_phone &&
    order.arrival_phone !== order.customer_phone

  return (
    <button
      onClick={onClick}
      className="w-full min-h-11 rounded-lg border border-slate-200 bg-white p-3 text-left transition-colors hover:border-slate-300 hover:bg-slate-50 space-y-2"
    >
      {/* Row 1: order ID + status + confirmation */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono font-semibold text-slate-900 text-sm">{order.order_id}</span>
        <span className={cn('rounded border px-1.5 py-0.5 text-[11px] font-semibold uppercase', STATUS_STYLES[order.status as OrderStatus] ?? 'bg-slate-100 text-slate-600')}>
          {order.status}
        </span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
          {CONFIRMATION_LABELS[order.confirmation_status as ConfirmationStatus] ?? order.confirmation_status}
        </span>
        <span className="ml-auto font-semibold text-slate-900 text-sm">
          QAR {(order.total_amount ?? 0).toLocaleString()}
        </span>
      </div>

      {/* Row 2: customer name + date + time */}
      <div className="flex items-center gap-3 text-xs text-slate-600 flex-wrap">
        <span className="font-medium">{order.customer_name}</span>
        {order.scheduled_date && (
          <span className="text-slate-400">{format(new Date(order.scheduled_date), 'dd MMM yyyy')}</span>
        )}
        {timeLabel && (
          <span className="flex items-center gap-1 text-slate-400">
            <Clock className="h-3 w-3" />
            {timeLabel}
          </span>
        )}
      </div>

      {/* Row 3: customer phone */}
      {order.customer_phone && (
        <div className="flex items-center gap-1.5 text-xs text-slate-600">
          <Phone className="h-3 w-3 shrink-0 text-slate-400" />
          <span>{order.customer_phone}</span>
        </div>
      )}

      {/* Row 3b: arrival phone — only when different from customer phone */}
      {arrivalDiffers && (
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <Phone className="h-3 w-3 shrink-0 text-orange-400" />
          <span>{order.arrival_phone}</span>
          <span className="text-[10px] text-orange-400 font-medium">on arrival</span>
        </div>
      )}

      {/* Row 4: address */}
      {order.address && (
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">{order.address}</span>
        </div>
      )}

      {/* Row 5: services */}
      {order.services_summary && (
        <div className="flex items-start gap-1.5 text-xs text-slate-600">
          <ClipboardList className="h-3 w-3 shrink-0 mt-0.5 text-slate-400" />
          <span className="leading-snug">{order.services_summary}</span>
        </div>
      )}
    </button>
  )
}
