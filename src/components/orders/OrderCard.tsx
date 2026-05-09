// src/components/orders/OrderCard.tsx
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import type { OrderListItem, OrderStatus, ConfirmationStatus } from '@/types/orders'

const STATUS_STYLES: Record<OrderStatus, string> = {
  tentative: 'bg-slate-100 text-slate-600',
  scheduled: 'bg-blue-100 text-blue-700',
  confirmed: 'bg-green-100 text-green-700',
  'in-progress': 'bg-orange-100 text-orange-700',
  completed: 'bg-green-100 text-green-800 font-semibold',
  cancelled: 'bg-red-100 text-red-700',
  waitlist: 'bg-yellow-100 text-yellow-700',
  'pending-confirmation': 'bg-orange-100 text-orange-700',
  'pending-approval': 'bg-yellow-100 text-yellow-700',
}

const CONFIRMATION_LABELS: Record<ConfirmationStatus, string> = {
  not_sent: 'Not Sent',
  msg_sent: 'Msg Sent',
  customer_confirmed: 'Confirmed',
  agent_confirmed: 'Agent Confirmed',
  no_response: 'No Response',
  manually_confirmed: 'Manual Confirm',
}

interface Props {
  order: OrderListItem
  onClick: () => void
}

export function OrderCard({ order, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className="w-full min-h-11 rounded-lg border border-slate-200 bg-white p-3 text-left transition-colors hover:border-slate-300 hover:bg-slate-50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-900">{order.order_id}</span>
            <span className={cn('rounded px-1.5 py-0.5 text-xs font-medium', STATUS_STYLES[order.status as OrderStatus])}>
              {order.status}
            </span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
              {CONFIRMATION_LABELS[order.confirmation_status as ConfirmationStatus]}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-slate-600">
            {order.customer_name} · {order.customer_phone}
          </p>
          {order.address && (
            <p className="text-xs text-slate-400 truncate mt-0.5">{order.address}</p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="font-semibold text-slate-900">QAR {(order.total_amount ?? 0).toLocaleString()}</p>
          {order.scheduled_date && (
            <p className="text-xs text-slate-500">{format(new Date(order.scheduled_date), 'dd MMM yyyy')}</p>
          )}
        </div>
      </div>
    </button>
  )
}
