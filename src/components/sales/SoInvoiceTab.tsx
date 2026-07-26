'use client'

import { useRouter } from 'next/navigation'
import { ExternalLink, Receipt } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  useInvoicesBySO,
  useGenerateInvoice,
} from '@/hooks/useCustomerInvoices'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'
import type { SaleOrder } from '@/hooks/useSaleOrders'

interface SoInvoiceTabProps {
  so: SaleOrder
  onClose?: () => void
}

const PAY_STATUS_STYLE: Record<string, string> = {
  unpaid:         'bg-red-100 text-red-700',
  partially_paid: 'bg-amber-100 text-amber-700',
  paid:           'bg-green-100 text-green-700',
  overdue:        'bg-red-200 text-red-800',
}

export function SoInvoiceTab({ so, onClose }: SoInvoiceTabProps) {
  const router = useRouter()
  const generateInvoice = useGenerateInvoice()
  const { data: soInvoice } = useInvoicesBySO(so.id)

  const canGenerateInvoice =
    soInvoice === null &&
    ['confirmed', 'partial_delivery', 'delivered'].includes(so.status)

  function handleGenerateInvoice() {
    generateInvoice.mutate(so.id, {
      onSuccess: () => toast.success('Invoice generated'),
      onError: (err) => {
        const msg = (err as Error).message
        if (msg === 'invoice_exists') toast.error('An invoice already exists for this order')
        else if (msg === 'so_not_invoiceable') toast.error('Invoice can only be generated for confirmed or delivered orders')
        else toast.error(msg)
      },
    })
  }

  if (soInvoice === null && !canGenerateInvoice) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Receipt className="h-10 w-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm font-medium text-muted-foreground">No invoice yet</p>
        <p className="text-xs text-muted-foreground mt-1">Invoices are available once the order is confirmed</p>
      </div>
    )
  }

  if (soInvoice === null && canGenerateInvoice) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <Receipt className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No invoice generated yet</p>
        <Button
          size="sm"
          disabled={generateInvoice.isPending}
          onClick={handleGenerateInvoice}
        >
          {generateInvoice.isPending ? 'Generating…' : 'Generate Invoice'}
        </Button>
      </div>
    )
  }

  if (!soInvoice) return null

  const paidAmount = soInvoice.paid_amount ?? 0
  const totalAmount = soInvoice.total_amount ?? 0

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
        <span>1 invoice</span>
        <span>
          Total billed:{' '}
          <span className="font-semibold text-foreground">
            {formatCurrency(totalAmount, so.currency ?? 'QAR')}
          </span>
        </span>
      </div>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice #</TableHead>
              <TableHead className="hidden sm:table-cell">Issued</TableHead>
              <TableHead className="hidden md:table-cell">Due Date</TableHead>
              <TableHead className="text-center hidden sm:table-cell">Payment</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right hidden sm:table-cell">Paid</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="group">
              <TableCell>
                <button
                  type="button"
                  onClick={() => {
                    onClose?.()
                    router.push(`/sales/invoices/${soInvoice.id}`)
                  }}
                  className="inline-flex items-center gap-1 text-primary hover:underline font-medium text-sm cursor-pointer"
                >
                  {soInvoice.invoice_id}
                  <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              </TableCell>
              <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                {soInvoice.issued_date ? formatDate(soInvoice.issued_date) : '—'}
              </TableCell>
              <TableCell className="hidden md:table-cell text-sm">
                {soInvoice.due_date ? formatDate(soInvoice.due_date) : '—'}
              </TableCell>
              <TableCell className="text-center hidden sm:table-cell">
                <span className={cn(
                  'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium',
                  PAY_STATUS_STYLE[soInvoice.payment_status] ?? 'bg-muted text-foreground',
                )}>
                  {soInvoice.payment_status.replace(/_/g, ' ')}
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums text-sm font-medium">
                {formatCurrency(totalAmount, so.currency ?? 'QAR')}
              </TableCell>
              <TableCell className="text-right tabular-nums text-sm hidden sm:table-cell">
                {paidAmount > 0 ? (
                  <span className="text-emerald-600">{formatCurrency(paidAmount, so.currency ?? 'QAR')}</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
