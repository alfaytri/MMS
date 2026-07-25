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
  exchange_rate?: number
  method: string
  reference: string | null
  notes?: string | null
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
  const isForeignCurrency = currency !== 'QAR'
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0)
  const totalPaidQar = isForeignCurrency
    ? payments.reduce((s, p) => s + (p.amount_qar ?? p.amount * (p.exchange_rate ?? 1)), 0)
    : totalPaid
  const pct = Math.min(100, (totalPaid / (totalAmount || 1)) * 100)

  return (
    <div className="space-y-4">
      {canRecord && onRecordPayment && totalPaid < totalAmount && (
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
                  {isForeignCurrency && <TableHead className="hidden sm:table-cell">Rate</TableHead>}
                  <TableHead className="hidden sm:table-cell">Method</TableHead>
                  <TableHead className="hidden md:table-cell">Reference</TableHead>
                  <TableHead className="hidden lg:table-cell">Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => {
                  const isStoreCredit = p.method === 'store_credit'
                  return (
                  <TableRow key={p.id} className={isStoreCredit ? 'bg-emerald-50/40 dark:bg-emerald-950/10' : undefined}>
                    <TableCell className="text-sm">{formatDate(p.date)}</TableCell>
                    <TableCell className="font-medium">
                      <span>{formatCurrency(p.amount, currency)}</span>
                      {isForeignCurrency && p.amount_qar != null && (
                        <span className="block text-xs text-muted-foreground font-normal">
                          = {formatCurrency(p.amount_qar, 'QAR')}
                        </span>
                      )}
                    </TableCell>
                    {isForeignCurrency && (
                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                        {p.exchange_rate != null && p.exchange_rate !== 1
                          ? p.exchange_rate.toFixed(4)
                          : '—'}
                      </TableCell>
                    )}
                    <TableCell className="hidden sm:table-cell text-sm">
                      {isStoreCredit
                        ? 'Credit Note Applied'
                        : <span className="capitalize">{p.method.replace(/_/g, ' ')}</span>}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                      {p.reference ?? '—'}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs text-muted-foreground max-w-[200px] truncate">
                      {p.notes ?? '—'}
                    </TableCell>
                  </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Paid: {formatCurrency(totalPaid, currency)}</span>
              <span>Total: {formatCurrency(totalAmount, currency)}</span>
            </div>
            {isForeignCurrency && (
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Paid (QAR): {formatCurrency(totalPaidQar, 'QAR')}</span>
              </div>
            )}
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
