// src/components/purchase/BillPaymentsList.tsx
'use client'

import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { SupplierPaymentEditDialog, type EditablePayment } from './SupplierPaymentEditDialog'
import { useDeleteSupplierPayment } from '@/hooks/useSupplierPayments'
import type { BillPayment } from '@/hooks/useSupplierBills'
import { useHasPermission } from '@/hooks/usePermissions'
import { formatCurrency, formatDate } from '@/lib/utils/formatters'

type Props = {
  billId: string
  payments: BillPayment[]
}

export function BillPaymentsList({ billId, payments }: Props) {
  const canManage = useHasPermission('purchase.payments.manage')
  const deleteMut = useDeleteSupplierPayment()
  const [editTarget, setEditTarget] = useState<EditablePayment | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<BillPayment | null>(null)

  if (payments.length === 0) {
    return <p className="text-sm text-muted-foreground italic">No payments recorded.</p>
  }

  return (
    <>
      <ul className="divide-y rounded-md border">
        {payments.map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-3 py-2 min-h-11">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">
                {formatCurrency(p.amount, p.currency)}
                <span className="text-muted-foreground font-normal ml-1">
                  · {p.method.replace(/_/g, ' ')}
                </span>
              </p>
              <p className="text-[11px] text-muted-foreground truncate">
                {formatDate(p.date)}
                {p.reference ? ` · ${p.reference}` : ''}
                {' · '}<span className="font-mono">{p.payment_id}</span>
              </p>
            </div>
            {canManage && (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  onClick={() => setEditTarget({
                    id: p.payment_uuid,
                    amount: p.full_amount ?? p.amount,
                    method: p.method,
                    date: p.date,
                    reference: p.reference,
                    notes: p.notes,
                    currency: p.currency,
                    exchange_rate: p.exchange_rate,
                    bill_id: billId,
                  })}
                  aria-label="Edit payment"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setDeleteTarget(p)}
                  aria-label="Delete payment"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>

      <SupplierPaymentEditDialog
        open={!!editTarget}
        onOpenChange={(v) => { if (!v) setEditTarget(null) }}
        payment={editTarget}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(v) => { if (!v) setDeleteTarget(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this payment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove{' '}
              <span className="font-mono font-medium">
                {deleteTarget ? formatCurrency(deleteTarget.amount, deleteTarget.currency) : ''}
              </span>
              {deleteTarget && ` recorded on ${formatDate(deleteTarget.date)}`}.
              The bill&apos;s outstanding balance will be restored automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleteTarget) return
                try {
                  await deleteMut.mutateAsync({
                    payment_id: deleteTarget.payment_uuid,
                    bill_id: billId,
                    amount: deleteTarget.full_amount ?? deleteTarget.amount,
                    currency: deleteTarget.currency,
                  })
                  toast.success('Payment deleted')
                } catch (err: unknown) {
                  toast.error((err as Error).message ?? 'Delete failed')
                } finally {
                  setDeleteTarget(null)
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
