'use client'

import { useRouter } from 'next/navigation'
import { FileText, User, MapPin, Phone, Calendar, CreditCard } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { STATUS_CONFIG } from '@/types/contracts'
import type { ContractQuotationSummary } from '@/types/contracts'

interface Props {
  quotation: ContractQuotationSummary
}

export function ContractQuotationCard({ quotation }: Props) {
  const router = useRouter()
  const statusConfig = STATUS_CONFIG[quotation.status]

  return (
    <div
      className="rounded-lg border bg-card p-4 hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => router.push(`/contracts/detail/${quotation.id}`)}
    >
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Status icon */}
        <div className="hidden sm:flex items-start">
          <div
            className={cn(
              'h-9 w-9 rounded-lg flex items-center justify-center shrink-0',
              statusConfig?.color || 'bg-gray-100 text-gray-700',
            )}
          >
            <FileText className="h-4 w-4" />
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold">{quotation.quotation_number}</span>
                <Badge className={cn('text-xs', statusConfig?.color)}>
                  {statusConfig?.label || quotation.status}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-1 mt-1">
                {quotation.divisions.map((d) => (
                  <Badge key={d} variant="secondary" className="text-xs">
                    {d}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <User className="h-3.5 w-3.5" />
              {quotation.customer_name}
            </span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {quotation.site_name}
            </span>
            {quotation.phone && (
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" />
                {quotation.phone}
              </span>
            )}
          </div>

          {quotation.services_summary && (
            <p className="text-xs text-muted-foreground truncate">
              {quotation.services_summary}
            </p>
          )}
        </div>

        {/* Right column - values */}
        <div className="flex flex-row sm:flex-col items-end gap-1 sm:min-w-[140px] text-right">
          <span className="text-lg font-bold">
            {quotation.total_value.toLocaleString('en-QA')} QAR
          </span>
          <span className="text-xs text-muted-foreground">
            {quotation.monthly_value.toLocaleString('en-QA')} QAR/mo
          </span>
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
            <Calendar className="h-3 w-3" />
            {quotation.start_date} — {quotation.end_date}
          </div>
          <span className="text-xs text-muted-foreground">
            {quotation.area_count} areas · {quotation.total_visits} visits
          </span>
        </div>
      </div>
    </div>
  )
}
