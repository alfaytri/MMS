// src/components/quotations/QuotationListCard.tsx
import { format } from 'date-fns'
import { cn } from '@/lib/utils'
import type { QuotationListItem } from '@/types/quotations'

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600 border-slate-200',
  sent:  'bg-blue-100 text-blue-700 border-blue-200',
}

interface Props {
  quotation: QuotationListItem
  onClick: () => void
}

export function QuotationListCard({ quotation, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className="w-full min-h-11 rounded-lg border border-slate-200 bg-white p-3 text-left transition-colors hover:border-orange-300 hover:bg-orange-50 space-y-2"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono font-semibold text-slate-900 text-sm">
          {quotation.quotation_id}
        </span>
        <span className="rounded border border-orange-200 bg-orange-50 px-1.5 py-0.5 text-[11px] font-semibold text-orange-700">
          {quotation.division}
        </span>
        <span
          className={cn(
            'rounded border px-1.5 py-0.5 text-[11px] font-semibold uppercase',
            STATUS_STYLES[quotation.status] ?? 'bg-slate-100 text-slate-600 border-slate-200',
          )}
        >
          {quotation.status}
        </span>
      </div>

      <div className="flex items-center gap-3 text-xs text-slate-600 flex-wrap">
        <span className="font-medium">{quotation.customer_name}</span>
        <span className="text-slate-400">{quotation.customer_phone}</span>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>QAR {quotation.total_amount.toLocaleString()}</span>
        {quotation.created_date && (
          <span>{format(new Date(quotation.created_date), 'dd MMM yyyy')}</span>
        )}
      </div>
    </button>
  )
}
