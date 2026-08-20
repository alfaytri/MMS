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
import { useUpdateReturnStatus, useCreateCreditNoteForReturn, useReturnProgress, type SaleReturn } from '@/hooks/useSaleReturns'
import { useDeliveriesByReturnId } from '@/hooks/useSaleDeliveries'
import { useReturnReasons } from '@/hooks/useReturnReasons'
import { PackageIcon } from 'lucide-react'
import type { SaleOrder } from '@/hooks/useSaleOrders'
import { formatDate } from '@/lib/utils/formatters'
import { STAGGER_IN, staggerDelay } from '@/lib/motion'

function ReplacementChips({ returnId }: { returnId: string }) {
  const { data: deliveries = [] } = useDeliveriesByReturnId(returnId)
  if (deliveries.length === 0) return null
  return (
    <>
      {deliveries.map((d) => (
        <span
          key={d.id}
          className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
        >
          <PackageIcon className="h-3 w-3" />
          Replacement: {d.delivery_number}
        </span>
      ))}
    </>
  )
}

const RESOLUTION_LABEL: Record<string, string> = {
  replacement:  'replaced',
  refund:       'refunded',
  store_credit: 'store credit',
}

const DISPOSITION_LABEL: Record<string, string> = {
  write_off:          'write-off',
  restock_as_damaged: 'restock (damaged)',
  send_for_repair:    'sent for repair',
}

function ReturnLedgerSummary({ returnId }: { returnId: string }) {
  const { data: progress } = useReturnProgress(returnId)
  if (!progress) return null

  // Customer-side breakdown (always shown — every returned unit needs one).
  const custMix = progress.customer_resolutions_by_type ?? {}
  const customerParts: string[] = [`${progress.total_returned} returned`]
  for (const [type, qty] of Object.entries(custMix)) {
    if (qty > 0) customerParts.push(`${qty} ${RESOLUTION_LABEL[type] ?? type}`)
  }
  if (progress.customer_remaining > 0) {
    customerParts.push(`${progress.customer_remaining} remaining`)
  }

  // Inventory-side breakdown — only meaningful when the return had damaged
  // units. Renders as a compact second line so operators see both ledgers
  // at a glance.
  const showInventoryLine = progress.total_damaged > 0
  const invMix = progress.inventory_dispositions_by_type ?? {}
  const inventoryParts: string[] = []
  if (showInventoryLine) {
    inventoryParts.push(`${progress.total_damaged} damaged`)
    for (const [type, qty] of Object.entries(invMix)) {
      if (qty > 0) inventoryParts.push(`${qty} ${DISPOSITION_LABEL[type] ?? type}`)
    }
    if (progress.inventory_remaining > 0) {
      inventoryParts.push(`${progress.inventory_remaining} un-dispositioned`)
    }
  }

  return (
    <div className="space-y-0.5">
      <p className="text-[11px] text-muted-foreground tabular-nums">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mr-1">Customer</span>
        {customerParts.join(' · ')}
      </p>
      {showInventoryLine && (
        <p className="text-[11px] text-muted-foreground tabular-nums">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mr-1">Inventory</span>
          {inventoryParts.join(' · ')}
        </p>
      )}
    </div>
  )
}

function CompensationMissingChip({ returnId }: { returnId: string }) {
  const { data: progress } = useReturnProgress(returnId)
  if (!progress?.compensation_missing) return null
  return (
    <span
      title="Damaged units were dispositioned inventory-side but the customer received no matching refund / store credit / replacement. Open the credit note or use Resolve Remaining to record customer compensation."
      className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300"
    >
      Compensation not recorded
    </span>
  )
}

function ResolveRemainingButton({ returnId, onClick }: { returnId: string; onClick: () => void }) {
  const { data: progress } = useReturnProgress(returnId)
  if (!progress) return null
  // Phase 7: a return has "remaining work" if EITHER dimension is not fully
  // covered — customer side (refunds/store credits/replacements pending) or
  // inventory side (damaged units still un-dispositioned).
  const remainingTotal = (progress.customer_remaining ?? 0) + (progress.inventory_remaining ?? 0)
  if (remainingTotal <= 0) return null
  const label = progress.customer_remaining > 0 && progress.inventory_remaining > 0
    ? `Resolve Remaining (${progress.customer_remaining} customer · ${progress.inventory_remaining} inventory)`
    : progress.customer_remaining > 0
      ? `Resolve Remaining (${progress.customer_remaining})`
      : `Book Dispositions (${progress.inventory_remaining})`
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-7 text-xs"
      onClick={onClick}
    >
      {label}
    </Button>
  )
}

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
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm font-medium">{ret.return_number}</span>
                  <ReplacementChips returnId={ret.id} />
                  <CompensationMissingChip returnId={ret.id} />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
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
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    ret.status === 'restocked'          ? 'bg-green-100 text-green-700' :
                    ret.status === 'received'           ? 'bg-blue-100 text-blue-700' :
                    ret.status === 'pending_inspection' ? 'bg-purple-100 text-purple-700' :
                    ret.status === 'closed'             ? 'bg-muted text-muted-foreground' :
                                                          'bg-amber-100 text-amber-700'
                  }`}>{
                    ret.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
                  }</span>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">{formatDate(ret.date)} · {ret.reason}</p>

              <ReturnLedgerSummary returnId={ret.id} />

              {onSendReplacement && ret.status === 'restocked' && (
                <ResolveRemainingButton
                  returnId={ret.id}
                  onClick={() => onSendReplacement(ret)}
                />
              )}

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
                      <TableRow key={i} className={STAGGER_IN} style={staggerDelay(i)}>
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
                  {(() => {
                    // The mutation is shared across every return card; scope the
                    // pending state to the row actually being created by checking
                    // the mutation's current variables.
                    const isThisPending = createCreditNote.isPending && createCreditNote.variables?.id === ret.id
                    return (
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
                        {isThisPending ? 'Creating…' : 'Create Credit Note'}
                      </Button>
                    )
                  })()}
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
          existingReturns={soReturns}
        />
      )}
    </div>
  )
}
