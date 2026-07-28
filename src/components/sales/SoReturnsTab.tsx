'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { CreditDebitNoteDetailDialog } from '@/components/sales/CreditDebitNoteDetailDialog'
import { CreateReturnDialog } from '@/components/sales/CreateReturnDialog'
import { CompleteInspectionDialog } from '@/components/sales/CompleteInspectionDialog'
import type { CreditNote } from '@/hooks/useCreditNotes'
import { useUpdateReturnStatus, useCreateCreditNoteForReturn, type SaleReturn } from '@/hooks/useSaleReturns'
import { useReturnReasons } from '@/hooks/useReturnReasons'
import type { SaleOrder } from '@/hooks/useSaleOrders'
import { formatDate } from '@/lib/utils/formatters'

interface SoReturnsTabProps {
  so: SaleOrder
  fullSO: SaleOrder | null
  soReturns: SaleReturn[]
  invoiceId?: string
  onSendReplacement?: (ret: SaleReturn) => void
}

export function SoReturnsTab({ so, fullSO, soReturns, invoiceId, onSendReplacement }: SoReturnsTabProps) {
  const [returnOpen, setReturnOpen] = useState(false)
  const [inspectReturnId, setInspectReturnId] = useState<string | null>(null)
  const [cnDetailNote, setCnDetailNote] = useState<CreditNote | null>(null)

  const updateReturnStatus = useUpdateReturnStatus()
  const createCreditNote = useCreateCreditNoteForReturn()
  useReturnReasons('sale_return') // warm cache for the dialog

  const canCreateReturn = ['delivered', 'partial_delivery', 'invoiced', 'closed'].includes(so.status)
  const inspectReturn = soReturns.find((r) => r.id === inspectReturnId) ?? null

  return (
    <div className="space-y-3">
      {canCreateReturn && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={() => setReturnOpen(true)}>
            + Create Return
          </Button>
        </div>
      )}
      {soReturns.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No returns for this order</p>
      ) : (
        soReturns.map((ret) => {
          // Status transition table. pending_inspection has NO direct next
          // step here — the operator must open the CompleteInspection
          // dialog first (that RPC moves status → received).
          const nextStatus: Partial<Record<SaleReturn['status'], SaleReturn['status']>> = {
            pending:  'received',
            received: 'restocked',
          }
          const nextLabel: Partial<Record<SaleReturn['status'], string>> = {
            pending:  'Mark Received',
            received: 'Mark Restocked',
          }
          const canAdvance = ret.status === 'pending' || ret.status === 'received'
          const needsInspection = ret.status === 'pending_inspection'
          const needsCreditNote = !ret.credit_note_id &&
            (ret.status === 'restocked' || ret.status === 'closed')

          return (
            <div key={ret.id} className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm font-medium">{ret.return_number}</span>
                <div className="flex items-center gap-2">
                  {needsInspection && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => setInspectReturnId(ret.id)}
                    >
                      Complete Inspection
                    </Button>
                  )}
                  {canAdvance && nextStatus[ret.status] && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={updateReturnStatus.isPending}
                      onClick={() =>
                        updateReturnStatus.mutate(
                          { id: ret.id, status: nextStatus[ret.status]! },
                          { onSuccess: () => toast.success(`${ret.return_number} marked ${nextStatus[ret.status]}`) }
                        )
                      }
                    >
                      {updateReturnStatus.isPending ? '…' : nextLabel[ret.status]}
                    </Button>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                    ret.status === 'restocked'          ? 'bg-green-100 text-green-700' :
                    ret.status === 'received'           ? 'bg-blue-100 text-blue-700' :
                    ret.status === 'pending_inspection' ? 'bg-purple-100 text-purple-700' :
                    ret.status === 'closed'             ? 'bg-muted text-muted-foreground' :
                                                          'bg-amber-100 text-amber-700'
                  }`}>{ret.status.replace('_', ' ')}</span>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">{formatDate(ret.date)} · {ret.reason}</p>

              <div className="rounded border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Item</TableHead>
                      <TableHead className="text-xs text-right">Qty</TableHead>
                      <TableHead className="text-xs">Condition</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(ret.return_lines ?? []).map((item, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{item.item_name}</TableCell>
                        <TableCell className="text-xs text-right">{item.qty}</TableCell>
                        <TableCell className="text-xs">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            item.condition === 'good'       ? 'bg-green-100 text-green-700'  :
                            item.condition === 'damaged'    ? 'bg-red-100 text-red-700'      :
                            item.condition === 'inspection' ? 'bg-purple-100 text-purple-700':
                                                              'bg-muted text-muted-foreground'
                          }`}>{item.condition}</span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {ret.notes && <p className="text-xs text-muted-foreground italic">{ret.notes}</p>}

              {needsCreditNote ? (
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-muted-foreground">No credit note yet.</span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={createCreditNote.isPending}
                    onClick={() =>
                      createCreditNote.mutate(ret, {
                        onSuccess: () => toast.success(`Credit note created for ${ret.return_number}`),
                        onError: () => toast.error('Failed to create credit note'),
                      })
                    }
                  >
                    {createCreditNote.isPending ? 'Creating…' : 'Create Credit Note'}
                  </Button>
                </div>
              ) : ret.credit_note ? (
                <div className="flex items-center gap-1.5 pt-1">
                  <span className="text-xs text-muted-foreground">Credit note:</span>
                  <button
                    type="button"
                    className="font-mono text-xs font-medium text-primary hover:underline underline-offset-2"
                    onClick={() => setCnDetailNote(ret.credit_note!)}
                  >
                    {ret.credit_note.credit_note_id}
                  </button>
                  {onSendReplacement && !ret.credit_note.resolution_type && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs ml-2"
                      onClick={() => onSendReplacement(ret)}
                    >
                      Send Replacement
                    </Button>
                  )}
                </div>
              ) : null}
            </div>
          )
        })
      )}

      <CreditDebitNoteDetailDialog
        note={cnDetailNote}
        referenceNumber={invoiceId ?? '—'}
        open={!!cnDetailNote}
        onOpenChange={(v) => { if (!v) setCnDetailNote(null) }}
      />

      {inspectReturn && (
        <CompleteInspectionDialog
          open
          onOpenChange={(o) => { if (!o) setInspectReturnId(null) }}
          ret={inspectReturn}
        />
      )}

      {returnOpen && so && (
        <CreateReturnDialog
          open
          onOpenChange={(o) => { if (!o) setReturnOpen(false) }}
          so={so}
          fullSO={fullSO}
        />
      )}
    </div>
  )
}
