'use client'

import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useAgingDrillDown, type AgingBucket } from '@/hooks/useAgingDrillDown'
import { PoDetailDialog } from './PoDetailDialog'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import { FileText, ExternalLink } from 'lucide-react'

const BUCKET_LABELS: Record<AgingBucket, string> = {
  current: 'Current',
  '1_30':  '1–30 Days',
  '31_60': '31–60 Days',
  '61_90': '61–90 Days',
  over_90: '90+ Days',
  total:   'All Outstanding',
}

const BUCKET_COLORS: Record<AgingBucket, string> = {
  current: 'text-emerald-600',
  '1_30':  'text-amber-600',
  '31_60': 'text-orange-600',
  '61_90': 'text-red-500',
  over_90: 'text-red-700',
  total:   'text-foreground',
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  supplierId: string | null
  supplierName: string
  bucket: AgingBucket
}

export function AgingDrillDownDialog({ open, onOpenChange, supplierId, supplierName, bucket }: Props) {
  const { data: bills = [], isLoading } = useAgingDrillDown(
    open ? supplierId : null,
    open ? bucket : null,
  )

  const [selectedPoId, setSelectedPoId] = useState<string | null>(null)

  const total = bills.reduce((s, b) => s + b.outstanding, 0)

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-full max-w-full rounded-none sm:max-w-3xl sm:rounded-lg max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0 pb-3 border-b">
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <span>{supplierName}</span>
              <Badge variant="outline" className={cn('text-xs font-medium', BUCKET_COLORS[bucket])}>
                {BUCKET_LABELS[bucket]}
              </Badge>
            </DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {bills.length} bill{bills.length !== 1 ? 's' : ''} · Outstanding: <span className="font-semibold text-foreground">{formatCurrency(total, 'QAR')}</span>
            </p>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto min-h-0">
            {isLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-11 w-full rounded-lg" />)}
              </div>
            ) : bills.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">No bills in this bucket</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Bill #</TableHead>
                      <TableHead className="hidden sm:table-cell">PO #</TableHead>
                      <TableHead className="hidden md:table-cell">Issued</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right hidden sm:table-cell">Paid</TableHead>
                      <TableHead className="text-right">Outstanding</TableHead>
                      <TableHead className="text-center hidden md:table-cell">Overdue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bills.map((bill) => (
                      <TableRow key={bill.id} className="group">
                        <TableCell className="font-medium text-sm">{bill.invoice_id}</TableCell>
                        <TableCell className="hidden sm:table-cell">
                          {bill.po_number ? (
                            <button
                              type="button"
                              onClick={() => setSelectedPoId(bill.purchase_order_id)}
                              className="inline-flex items-center gap-1 text-primary hover:underline font-medium text-sm cursor-pointer"
                            >
                              {bill.po_number}
                              <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                          {formatDate(bill.issued_date)}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {formatDate(bill.due_date)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {formatCurrency(bill.total_amount, 'QAR')}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm text-emerald-600 hidden sm:table-cell">
                          {bill.paid_amount > 0 ? formatCurrency(bill.paid_amount, 'QAR') : '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm font-bold text-red-600">
                          {formatCurrency(bill.outstanding, 'QAR')}
                        </TableCell>
                        <TableCell className="text-center hidden md:table-cell">
                          {bill.days_overdue > 0 ? (
                            <Badge variant="outline" className={cn('text-xs', {
                              'border-amber-200 text-amber-700 bg-amber-50': bill.days_overdue <= 30,
                              'border-orange-200 text-orange-700 bg-orange-50': bill.days_overdue > 30 && bill.days_overdue <= 60,
                              'border-red-200 text-red-700 bg-red-50': bill.days_overdue > 60,
                            })}>
                              {bill.days_overdue}d
                            </Badge>
                          ) : (
                            <span className="text-xs text-emerald-600">Current</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <PoDetailDialog
        open={!!selectedPoId}
        onOpenChange={(v) => { if (!v) setSelectedPoId(null) }}
        poId={selectedPoId ?? undefined}
      />
    </>
  )
}
