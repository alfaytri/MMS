'use client'

import { useState } from 'react'
import {
  AlertTriangle, Calendar, ExternalLink, HandCoins, Package,
  Paperclip, Send, Users2, Warehouse,
} from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useConsumption,
  useConsumerLabel,
  useConsumptionAttachmentUrls,
  useConsumptionEditRequests,
  useCanApproveConsumptionEdit,
  type ConsumerType,
} from '@/hooks/useConsumption'
import { useHasPermission } from '@/hooks/usePermissions'
import { ConsumptionEditRequestBanner } from './ConsumptionEditRequestBanner'
import { RequestConsumptionEditDialog } from './RequestConsumptionEditDialog'

interface Props {
  open:         boolean
  onOpenChange: (open: boolean) => void
  consumptionId: string | null
}

const QAR = new Intl.NumberFormat('en-QA', {
  style: 'currency',
  currency: 'QAR',
  maximumFractionDigits: 2,
})

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('en-QA', { dateStyle: 'medium', timeStyle: 'short' })
}

function ConsumerIcon({ type }: { type: ConsumerType }) {
  if (type === 'custody') return <Users2 className="h-3.5 w-3.5" />
  return <Package className="h-3.5 w-3.5" />
}

function consumerTypeLabel(type: ConsumerType): string {
  if (type === 'custody') return 'Custody'
  return 'Internal'
}

function StatusBadge({ status }: { status: 'draft' | 'posted' | 'cancelled' }) {
  if (status === 'posted') {
    return <Badge className="text-[10px] h-4 px-1.5 bg-success/10 text-success border-success/30 hover:bg-success/10">Posted</Badge>
  }
  if (status === 'cancelled') {
    return <Badge className="text-[10px] h-4 px-1.5 bg-muted text-muted-foreground border-0 hover:bg-muted">Cancelled</Badge>
  }
  return <Badge variant="outline" className="text-[10px] h-4 px-1.5">Draft</Badge>
}

export function ConsumptionDetailDialog({ open, onOpenChange, consumptionId }: Props) {
  const { data, isLoading }        = useConsumption(consumptionId)
  const { data: signedUrls = {} }  = useConsumptionAttachmentUrls(data?.attachments)
  const { data: editRequests = [] } = useConsumptionEditRequests(consumptionId)
  const { data: canApprove = false } = useCanApproveConsumptionEdit()
  const [requestOpen, setRequestOpen] = useState(false)
  // COGS is accounting-only — field users see items + quantities, not cost.
  const canSeeCost = useHasPermission('consumption.cost.view')
  // Resolve the consumer name from the cross-division master list so a viewer
  // outside the consumer team's division never sees "(team removed)".
  const consumerLabel = useConsumerLabel()

  const total = (data?.lines ?? []).reduce(
    (sum, l) => sum + (l.total_cost ?? (l.qty * (l.unit_cost ?? 0))),
    0,
  )

  const latestRequest = editRequests[0] ?? null
  const hasPending    = latestRequest?.status === 'pending'
  // Show the "Request Cancellation" trigger only when the entry is
  // posted AND there is no pending request already in flight.
  const canRequestEdit = data?.status === 'posted' && !hasPending

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-full h-full rounded-none sm:rounded-lg sm:w-[48rem] sm:h-[85vh] sm:max-w-[95vw] flex flex-col overflow-hidden p-0">
          <DialogHeader className="px-5 pt-5 pb-0">
            <DialogTitle className="text-sm font-semibold flex items-center gap-1.5">
              <HandCoins className="h-4 w-4 text-primary" />
              {isLoading || !data ? 'Consumption' : `${data.ce_number}`}
              {data && <StatusBadge status={data.status} />}
            </DialogTitle>
            {data && (
              <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
                <Calendar className="h-3 w-3" />
                {data.date}
                {data.division_name && (
                  <>
                    <span>·</span>
                    <span>{data.division_name}</span>
                  </>
                )}
                {data.posted_by_name && (
                  <>
                    <span>·</span>
                    <span>Posted by {data.posted_by_name}</span>
                  </>
                )}
              </p>
            )}
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5 pt-3 space-y-4">
            {isLoading || !data ? (
              <>
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-32 w-full" />
              </>
            ) : (
              <>
                {/* Source + Consumer */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="rounded-md border bg-muted/20 p-2.5 space-y-1">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium flex items-center gap-1">
                      <Warehouse className="h-3 w-3" /> Source
                    </div>
                    <div className="text-xs font-medium truncate">{data.source_warehouse_name ?? '—'}</div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {data.source_sub_container_name ?? '—'}
                    </div>
                  </div>
                  <div className="rounded-md border bg-muted/20 p-2.5 space-y-1">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium flex items-center gap-1">
                      <ConsumerIcon type={data.consumer_type} /> Consumer
                    </div>
                    <div className="text-xs font-medium truncate">{consumerLabel(data)}</div>
                    <div className="text-[11px] text-muted-foreground">{consumerTypeLabel(data.consumer_type)}</div>
                  </div>
                </div>

                {/* Cancelled banner */}
                {data.status === 'cancelled' && (
                  <div className="rounded-md border border-muted-foreground/30 bg-muted/40 p-2.5 flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="text-[11px] text-muted-foreground leading-snug">
                      <span className="font-medium">Cancelled</span>
                      {data.cancelled_by_name && <> by {data.cancelled_by_name}</>}
                      {data.cancelled_at && <> · {formatDate(data.cancelled_at)}</>}
                      . Stock has been restored to the source sub-container.
                    </div>
                  </div>
                )}

                {/* Edit-request banner — surfaces the most-recent request
                    (pending shows Approve/Decline to authorized users;
                    approved / rejected shows a compact status line). */}
                {latestRequest && (
                  <ConsumptionEditRequestBanner request={latestRequest} canReview={canApprove} />
                )}

                {/* Lines */}
                <div className="space-y-1.5">
                  <div className="text-[11px] font-medium">Lines ({data.lines.length})</div>
                  <div className="rounded-md border overflow-hidden">
                    <table className="w-full text-[11px]">
                      <thead className="bg-muted/40">
                        <tr>
                          <th className="text-left px-2.5 py-1.5 font-medium">Item</th>
                          <th className="text-right px-2.5 py-1.5 font-medium w-16">Qty</th>
                          {canSeeCost && <th className="text-right px-2.5 py-1.5 font-medium w-24">Unit cost</th>}
                          {canSeeCost && <th className="text-right px-2.5 py-1.5 font-medium w-28">Total</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {data.lines.map((l) => (
                          <tr key={l.id}>
                            <td className="px-2.5 py-1.5">
                              <div className="font-medium truncate max-w-[280px]">{l.item_name}</div>
                              {l.sku && <div className="text-[10px] text-muted-foreground">{l.sku}</div>}
                            </td>
                            <td className="px-2.5 py-1.5 text-right tabular-nums">{l.qty}</td>
                            {canSeeCost && (
                              <td className="px-2.5 py-1.5 text-right tabular-nums">
                                {l.unit_cost != null ? QAR.format(l.unit_cost) : '—'}
                              </td>
                            )}
                            {canSeeCost && (
                              <td className="px-2.5 py-1.5 text-right tabular-nums font-medium">
                                {l.total_cost != null ? QAR.format(l.total_cost) : '—'}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                      {canSeeCost && (
                        <tfoot className="bg-muted/20 border-t">
                          <tr>
                            <td colSpan={2} className="px-2.5 py-1.5 text-right text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Total</td>
                            <td colSpan={2} className="px-2.5 py-1.5 text-right tabular-nums font-semibold">{QAR.format(total)}</td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>

                {/* Notes */}
                {data.notes && (
                  <div className="space-y-1">
                    <div className="text-[11px] font-medium">Notes</div>
                    <div className="rounded-md border bg-muted/20 p-2.5 text-[11px] whitespace-pre-wrap">{data.notes}</div>
                  </div>
                )}

                {/* Attachments */}
                {data.attachments.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[11px] font-medium flex items-center gap-1">
                      <Paperclip className="h-3 w-3" /> Attachments ({data.attachments.length})
                    </div>
                    <div className="space-y-1">
                      {data.attachments.map((path) => {
                        const url = signedUrls[path]
                        const filename = path.split('/').pop() ?? path
                        return (
                          <a
                            key={path}
                            href={url ?? '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={
                              'flex items-center gap-1.5 rounded-md border bg-muted/20 px-2.5 py-1.5 text-[11px] hover:bg-muted/40 transition-colors ' +
                              (url ? '' : 'pointer-events-none opacity-60')
                            }
                          >
                            <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="truncate flex-1">{filename}</span>
                            <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
                          </a>
                        )
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter className="m-0 px-5 py-3 border-t bg-muted/30 rounded-b-lg gap-2 sm:gap-2 flex-row items-center justify-between sm:justify-between">
            <div>
              {canRequestEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-[11px] h-8 gap-1 border-warning/40 text-warning-foreground hover:bg-warning/10"
                  onClick={() => setRequestOpen(true)}
                >
                  <Send className="h-3 w-3" />
                  Request cancellation
                </Button>
              )}
              {hasPending && (
                <span className="text-[10px] text-muted-foreground italic">
                  A cancellation request is awaiting review
                </span>
              )}
            </div>
            <Button variant="outline" size="sm" className="text-[11px] h-8" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RequestConsumptionEditDialog
        open={requestOpen}
        onOpenChange={setRequestOpen}
        consumptionId={consumptionId}
        ceNumber={data?.ce_number ?? null}
      />
    </>
  )
}
