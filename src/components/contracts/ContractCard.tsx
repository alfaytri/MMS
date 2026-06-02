'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronDown, ChevronRight, User, MapPin, Calendar,
  CheckCircle, Clock, CreditCard, ExternalLink,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { STATUS_CONFIG } from '@/types/contracts'
import type { LiveContractSummary } from '@/types/contracts'

interface Props {
  contract: LiveContractSummary
  onCancel?: (contractId: string) => void
}

export function ContractCard({ contract, onCancel }: Props) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const statusConfig = STATUS_CONFIG[contract.status]

  const visitProgress = contract.total_visits > 0
    ? Math.round((contract.completed_visits / contract.total_visits) * 100)
    : 0
  const paymentProgress = contract.total_payments > 0
    ? Math.round((contract.paid_amount / contract.total_payments) * 100)
    : 0
  const balance = contract.total_payments - contract.paid_amount

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Collapsed header */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div
          className={cn(
            'h-9 w-9 rounded-lg flex items-center justify-center shrink-0',
            statusConfig?.color || 'bg-gray-100',
          )}
        >
          {contract.status === 'active' ? (
            <CheckCircle className="h-4 w-4" />
          ) : (
            <Clock className="h-4 w-4" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold">{contract.contract_id}</span>
            <Badge className={cn('text-xs', statusConfig?.color)}>
              {statusConfig?.label || contract.status}
            </Badge>
            {contract.divisions.map((d) => (
              <Badge key={d} variant="secondary" className="text-xs">{d}</Badge>
            ))}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
            <span className="inline-flex items-center gap-1">
              <User className="h-3 w-3" />{contract.customer_name}
            </span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" />{contract.site_name}
            </span>
          </div>
        </div>

        {/* Visit progress */}
        <div className="hidden md:block w-32">
          <div className="flex justify-between text-xs mb-1">
            <span>Visits</span>
            <span>{contract.completed_visits}/{contract.total_visits}</span>
          </div>
          <Progress value={visitProgress} className="h-1.5" />
        </div>

        {/* Payment progress */}
        <div className="hidden lg:block w-32">
          <div className="flex justify-between text-xs mb-1">
            <span>Paid</span>
            <span>{paymentProgress}%</span>
          </div>
          <Progress value={paymentProgress} className="h-1.5" />
        </div>

        <div className="text-right shrink-0">
          <span className="text-sm font-bold">{contract.monthly_value.toLocaleString()} QAR/mo</span>
          <div className="text-xs text-muted-foreground">{contract.end_date}</div>
        </div>

        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {/* Upcoming visits */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase">Upcoming Visits</h4>
              {contract.upcoming_visits.length === 0 ? (
                <p className="text-sm text-muted-foreground">No upcoming visits</p>
              ) : (
                <div className="space-y-1">
                  {contract.upcoming_visits.map((v, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span>{v.service_name}</span>
                      <span className="text-muted-foreground">
                        {v.date} {v.team_name && `· ${v.team_name}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Payment status */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase">Payment Status</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Total</span>
                  <span>{contract.total_payments.toLocaleString()} QAR</span>
                </div>
                <div className="flex justify-between text-green-600">
                  <span>Paid</span>
                  <span>{contract.paid_amount.toLocaleString()} QAR</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Balance</span>
                  <span className={balance > 0 ? 'text-red-600' : ''}>
                    {balance.toLocaleString()} QAR
                  </span>
                </div>
              </div>
            </div>

            {/* Contract details */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase">Details</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Period</span>
                  <span>{contract.start_date} — {contract.end_date}</span>
                </div>
                <div className="flex justify-between">
                  <span>Total Value</span>
                  <span>{contract.total_value.toLocaleString()} QAR</span>
                </div>
                <div className="flex justify-between">
                  <span>Areas</span>
                  <span>{contract.area_count}</span>
                </div>
                {contract.services_summary && (
                  <p className="text-xs text-muted-foreground">{contract.services_summary}</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-4 pt-3 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/contracts/detail/${contract.id}`)}
            >
              <ExternalLink className="h-3.5 w-3.5 mr-1" />
              View Details
            </Button>
            {contract.status === 'active' && onCancel && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => onCancel(contract.id)}
              >
                Cancel Contract
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
