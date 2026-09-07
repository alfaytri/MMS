'use client'

import { useRouter } from 'next/navigation'
import { User, MapPin, ChevronRight, FileText, FileCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { STATUS_CONFIG } from '@/types/contracts'
import type { ContractListRow } from '@/types/contracts'

interface Props {
  row: ContractListRow
}

export function ContractListCard({ row }: Props) {
  const router = useRouter()
  const config = STATUS_CONFIG[row.status]
  const isLive = row.phase === 'live'

  const balance = (row.total_payments ?? 0) - (row.paid_amount ?? 0)
  const visitPct =
    row.total_visits && row.total_visits > 0
      ? Math.round(((row.completed_visits ?? 0) / row.total_visits) * 100)
      : 0

  return (
    <button
      type="button"
      onClick={() => router.push(`/contracts/detail/${row.id}`)}
      className="group w-full text-left rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/40"
    >
      <div className="flex items-center gap-4">
        {/* Phase icon */}
        <div
          className={cn(
            'hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
            isLive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
          )}
        >
          {isLive ? <FileCheck className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
        </div>

        {/* Identity */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{row.number || '—'}</span>
            <Badge className={cn('text-xs', config?.color)}>{config?.label || row.status}</Badge>
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {isLive ? 'Contract' : 'Quotation'}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <User className="h-3 w-3" />
              {row.customer_name || '—'}
            </span>
            {row.site_name && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {row.site_name}
              </span>
            )}
            {row.divisions.slice(0, 3).map((d) => (
              <Badge key={d} variant="secondary" className="text-[10px]">
                {d}
              </Badge>
            ))}
          </div>
        </div>

        {/* Live: visit progress */}
        {isLive && (row.total_visits ?? 0) > 0 && (
          <div className="hidden lg:block w-28">
            <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
              <span>Visits</span>
              <span>
                {row.completed_visits}/{row.total_visits}
              </span>
            </div>
            <Progress value={visitPct} className="h-1.5" />
          </div>
        )}

        {/* Value / metric */}
        <div className="shrink-0 text-right">
          <div className="text-sm font-bold">
            {row.total_value.toLocaleString('en-QA')} QAR
          </div>
          {isLive ? (
            <div className={cn('text-xs', balance > 0 ? 'text-destructive' : 'text-muted-foreground')}>
              {balance > 0 ? `${balance.toLocaleString('en-QA')} QAR due` : 'Settled'}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              {row.monthly_value.toLocaleString('en-QA')} QAR/mo
            </div>
          )}
        </div>

        <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:block" />
      </div>
    </button>
  )
}
