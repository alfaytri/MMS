import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'

interface Payment {
  id: string
  date: string
  amount: number
  amount_qar?: number | null
  currency?: string
  method: string
  reference: string | null
}

interface PaymentSummaryTabProps {
  payments: Payment[]
  totalAmount: number
  currency?: string
  canRecord?: boolean
  onRecordPayment?: () => void
}

export function PaymentSummaryTab({
  payments, totalAmount, currency = 'QAR',
  canRecord, onRecordPayment,
}: PaymentSummaryTabProps) {
  const totalPaid = payments.reduce((s, p) => s + (p.amount_qar ?? p.amount), 0)
  const pct = Math.min(100, (totalPaid / (totalAmount || 1)) * 100)

  return (
    <div className="space-y-4">
      {canRecord && onRecordPayment && (
        <div className="flex justify-end">
          <Button size="sm" onClick={onRecordPayment}>+ Record Payment</Button>
        </div>
      )}
      {payments.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No payments yet</p>
      ) : (
        <>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead className="hidden sm:table-cell">Method</TableHead>
                  <TableHead className="hidden md:table-cell">Reference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm">{formatDate(p.date)}</TableCell>
                    <TableCell className="font-medium">
                      {formatCurrency(p.amount_qar ?? p.amount, currency)}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell capitalize">
                      {p.method.replace(/_/g, ' ')}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                      {p.reference ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Paid: {formatCurrency(totalPaid, currency)}</span>
              <span>Total: {formatCurrency(totalAmount, currency)}</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-success transition-all"
                style={{ width: `${pct}%` }}
                role="progressbar"
                aria-valuenow={Math.round(pct)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Payment progress"
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
