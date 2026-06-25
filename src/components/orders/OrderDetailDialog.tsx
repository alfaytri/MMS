// src/components/orders/OrderDetailDialog.tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { format } from 'date-fns'
import { CheckCircle, RotateCcw, XCircle, Pencil, ExternalLink, MessageSquare, Truck, FileText, FileDown } from 'lucide-react'
import { useOrderDetail } from '@/hooks/useOrderDetail'
import { useOrderActions, canTransition } from '@/hooks/useOrderActions'
import { OrderCancelDialog } from './OrderCancelDialog'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { OrderStatus, ConfirmationStatus } from '@/types/orders'
import { cn } from '@/lib/utils'

const STATUS_STYLES: Record<string, string> = {
  scheduled:              'bg-blue-100 text-blue-700',
  confirmed:              'bg-green-100 text-green-700',
  completed:              'bg-green-100 text-green-700',
  cancelled:              'bg-red-100 text-red-700',
  waitlist:               'bg-amber-100 text-amber-700',
  'in-progress':          'bg-violet-100 text-violet-700',
  'pending-confirmation': 'bg-amber-100 text-amber-700',
  'pending-approval':     'bg-amber-100 text-amber-700',
  tentative:              'bg-slate-100 text-slate-700',
}

const CONFIRMATION_TEXT: Record<ConfirmationStatus, { title: string; sub: string }> = {
  not_sent:           { title: 'Not Sent',         sub: '48hr auto-confirmation via WhatsApp before scheduled date' },
  msg_sent:           { title: 'Message Sent',     sub: 'Awaiting customer reply' },
  customer_confirmed: { title: 'Confirmed',        sub: 'Customer confirmed via WhatsApp' },
  agent_confirmed:    { title: 'Confirmed',        sub: 'Confirmed by agent' },
  manually_confirmed: { title: 'Confirmed',        sub: 'Manually confirmed' },
  no_response:        { title: 'No Response',      sub: 'Customer did not respond' },
}

interface Props {
  orderId: string | null
  open: boolean
  onOpenChange: (v: boolean) => void
}

export function OrderDetailDialog({ orderId, open, onOpenChange }: Props) {
  const [cancelOpen, setCancelOpen] = useState(false)
  const [pdfPending, setPdfPending] = useState(false)
  const { data: order, isLoading } = useOrderDetail(orderId)
  const { confirmManually, rollback, cancel } = useOrderActions(orderId)
  const router = useRouter()

  async function openConfirmationPdf() {
    if (!orderId) return
    setPdfPending(true)
    const toastId = toast.loading('Generating confirmation PDF…')
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not authenticated')
      const res = await fetch(`/api/orders/${orderId}/generate-confirmation-pdf?force=true`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.url) {
        throw new Error(body?.error ?? `HTTP ${res.status}`)
      }
      window.open(body.url, '_blank', 'noopener,noreferrer')
      toast.success(body.regenerated ? 'PDF generated' : 'PDF opened (cached)', { id: toastId })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`PDF failed: ${msg}`, { id: toastId })
    } finally {
      setPdfPending(false)
    }
  }

  const { data: followUps = [] } = useQuery<Array<{
    id: string; order_id: string; scheduled_date: string | null; status: string | null; total_amount: number | null
  }>>({
    queryKey: ['follow-ups-of', orderId],
    enabled: !!orderId,
    queryFn: async () => {
      if (!orderId) return []
      const supabase = createClient()
      const { data } = await supabase
        .from('orders')
        .select('id, order_id, scheduled_date, status, total_amount')
        .eq('parent_order_id', orderId)
        .order('scheduled_date', { ascending: false })
        .limit(20)
      return data ?? []
    },
  })

  const { data: pendingReqs = [] } = useQuery<Array<{
    id: string; request_number: string; requested_date: string | null
  }>>({
    queryKey: ['pending-follow-up-requests-for', orderId],
    enabled: !!orderId,
    queryFn: async () => {
      if (!orderId) return []
      const supabase = createClient()
      const { data } = await supabase
        .from('follow_up_requests')
        .select('id, request_number, requested_date')
        .eq('parent_order_id', orderId)
        .eq('status', 'pending')
        .limit(20)
      return data ?? []
    },
  })

  const EDITABLE_STATUSES: OrderStatus[] = ['scheduled', 'pending-confirmation', 'waitlist', 'tentative']

  if (!open) return null

  // Compute date range pill (for multi-day orders)
  const visitDates = order?.order_visit_dates ?? []
  const dateLabel = (() => {
    if (!order) return ''
    if (visitDates.length > 1) {
      const sorted = [...visitDates].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      const first = sorted[0]?.visit_date
      const last  = sorted[sorted.length - 1]?.visit_date
      if (first && last) return `Multi-Day: ${first} → ${last}`
    }
    return order.scheduled_date ?? ''
  })()
  const isMultiDay = visitDates.length > 1

  const confirmStatus = (order?.confirmation_status as ConfirmationStatus) ?? 'not_sent'
  // Banner copy is derived from the lifecycle status first — confirmation_status only matters
  // for orders that haven't yet been confirmed by any means.
  const confirmText = (() => {
    if (!order) return CONFIRMATION_TEXT.not_sent
    if (order.status === 'confirmed') {
      return { title: 'Confirmed', sub: 'Order confirmed and ready for service' }
    }
    if (order.status === 'in-progress') {
      return { title: 'In Progress', sub: 'Team is currently on this job' }
    }
    return CONFIRMATION_TEXT[confirmStatus] ?? CONFIRMATION_TEXT.not_sent
  })()
  // Hide the WhatsApp-confirmation banner for terminal statuses — it's irrelevant once the order is done
  const isTerminal = order?.status === 'completed' || order?.status === 'cancelled'
  const hasAnyAction =
    !isTerminal && order && (
      canTransition(order.status as OrderStatus, 'confirmed') ||
      order.status === 'confirmed' ||
      EDITABLE_STATUSES.includes(order.status as OrderStatus) ||
      canTransition(order.status as OrderStatus, 'cancelled')
    )

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(newOpen: boolean) => {
          if (!cancelOpen || newOpen) onOpenChange(newOpen)
        }}
      >
        <DialogContent className="w-[96vw] max-w-3xl p-0 gap-0 max-h-[90vh] flex flex-col overflow-hidden">
          {isLoading || !order ? (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              Loading…
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="px-5 pt-5 pb-4 border-b">
                <div className="flex items-start gap-3 flex-wrap pr-8">
                  <span className="font-bold text-lg text-foreground">{order.order_id}</span>
                  <span className={cn(
                    'rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize',
                    STATUS_STYLES[order.status] ?? 'bg-muted text-muted-foreground'
                  )}>
                    {order.status}
                  </span>
                  {dateLabel && (
                    <span className="rounded-full bg-muted text-muted-foreground px-2.5 py-0.5 text-xs font-medium">
                      {isMultiDay ? dateLabel : `Visit: ${dateLabel}`}
                    </span>
                  )}
                  <p className="text-sm text-muted-foreground ml-auto truncate">
                    {order.customer_name}
                    {order.customer_phone && (
                      <span className="text-orange-600"> · {order.customer_phone}</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Confirmation banner — hidden for terminal statuses, shown only when banner has content or actions */}
              {(!isTerminal || hasAnyAction) && (
              <div className="mx-5 mt-4 rounded-lg border bg-muted/40 p-3 flex items-start gap-3 flex-wrap">
                {!isTerminal && (
                  <div className="flex items-start gap-2.5 flex-1 min-w-[200px]">
                    <MessageSquare className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{confirmText.title}</p>
                      <p className="text-xs text-muted-foreground">{confirmText.sub}</p>
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 h-8 text-xs"
                    onClick={openConfirmationPdf}
                    disabled={pdfPending}
                  >
                    <FileDown className="h-3.5 w-3.5" /> Confirmation PDF
                  </Button>
                  {canTransition(order.status as OrderStatus, 'confirmed') && (
                    <Button
                      size="sm"
                      className="gap-1.5 h-8 text-xs"
                      onClick={async () => {
                        try {
                          await confirmManually.mutateAsync()
                          toast.success('Order confirmed')
                        } catch {
                          toast.error('Failed to confirm order')
                        }
                      }}
                      disabled={confirmManually.isPending}
                    >
                      <CheckCircle className="h-3.5 w-3.5" /> Confirm Manually
                    </Button>
                  )}
                  {order.status === 'confirmed' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 h-8 text-xs"
                      onClick={async () => {
                        try {
                          await rollback.mutateAsync()
                          toast.success('Rolled back to scheduled')
                        } catch {
                          toast.error('Failed to roll back order')
                        }
                      }}
                      disabled={rollback.isPending}
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Rollback
                    </Button>
                  )}
                  {EDITABLE_STATUSES.includes(order.status as OrderStatus) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 h-8 text-xs"
                      onClick={() => {
                        onOpenChange(false)
                        router.push(`/orders/${orderId}/edit`)
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit Order
                      <ExternalLink className="h-3 w-3 opacity-50" />
                    </Button>
                  )}
                  {canTransition(order.status as OrderStatus, 'cancelled') && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 h-8 text-xs border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                      onClick={() => setCancelOpen(true)}
                    >
                      <XCircle className="h-3.5 w-3.5" /> Cancel Order
                    </Button>
                  )}
                  {order.status === 'completed' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 h-8 text-xs"
                      onClick={() => {
                        onOpenChange(false)
                        router.push(`/orders/${orderId}/request-follow-up`)
                      }}
                    >
                      Request Follow-up
                    </Button>
                  )}
                </div>
              </div>
              )}

              {/* Tabs */}
              <Tabs defaultValue="services" className="flex flex-1 flex-col overflow-hidden mt-3">
                <TabsList className="mx-5 w-auto justify-start rounded-none border-b bg-transparent p-0 overflow-x-auto whitespace-nowrap scroll-x-fade gap-1">
                  <TabsTrigger
                    value="services"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:text-foreground text-muted-foreground px-3 py-1.5 text-sm font-medium"
                  >
                    Booked Services
                  </TabsTrigger>
                  <TabsTrigger
                    value="invoice"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:text-foreground text-muted-foreground px-3 py-1.5 text-sm font-medium"
                  >
                    Invoiced &amp; Report
                  </TabsTrigger>
                  <TabsTrigger
                    value="followup"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:text-foreground text-muted-foreground px-3 py-1.5 text-sm font-medium"
                  >
                    Follow-up &amp; Backwork
                  </TabsTrigger>
                  <TabsTrigger
                    value="logs"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:text-foreground text-muted-foreground px-3 py-1.5 text-sm font-medium"
                  >
                    Logs ({order.order_log.length})
                  </TabsTrigger>
                </TabsList>

                <div className="flex-1 overflow-y-auto px-5 py-4">
                  {/* Booked Services */}
                  <TabsContent value="services" className="mt-0 space-y-4">
                    {order.order_team_assignments.length === 0 ? (
                      <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                        No team assigned yet
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {order.order_team_assignments.map((a) => (
                          <div key={a.id} className="flex items-center gap-3 rounded-lg border bg-card p-3">
                            <div className="rounded-lg bg-blue-50 p-2 shrink-0">
                              <Truck className="h-4 w-4 text-blue-600" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-foreground">{a.team_name || 'Unassigned team'}</p>
                              <p className="text-xs text-muted-foreground">
                                {a.scheduled_date}
                                {a.time_slot && <> · {a.time_slot}</>}
                                {a.duration ? <> · {a.duration}h</> : null}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Order Summary */}
                    <div className="pt-2">
                      <h3 className="text-sm font-semibold text-foreground mb-2">Order Summary</h3>
                      <div className="grid grid-cols-3 gap-2">
                        <StatCard label="Services" value={order.order_services.length.toString()} />
                        <StatCard label="Teams" value={order.order_team_assignments.length.toString()} />
                        <StatCard
                          label="Total"
                          value={`${(order.total_amount ?? 0).toLocaleString()} QAR`}
                          accent
                        />
                      </div>
                    </div>

                    {/* Notes */}
                    {order.notes && (
                      <div className="rounded-lg border bg-card p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                          Notes
                        </p>
                        <p className="text-sm text-foreground whitespace-pre-wrap">{order.notes}</p>
                      </div>
                    )}
                  </TabsContent>

                  {/* Invoice */}
                  <TabsContent value="invoice" className="mt-0">
                    {order.has_invoice ? (
                      <div className="rounded-lg border bg-card p-4 flex items-center gap-3">
                        <FileText className="h-5 w-5 text-orange-500" />
                        <div>
                          <p className="text-sm font-medium text-foreground">Invoice {order.invoice_number}</p>
                          <p className="text-xs text-muted-foreground">Generated for this order</p>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                        No invoice generated yet
                      </div>
                    )}
                  </TabsContent>

                  {/* Follow-up & Backwork */}
                  <TabsContent value="followup" className="mt-0 space-y-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() =>
                        window.open(`/orders/create-follow-up?from=${orderId}`, '_blank')
                      }
                    >
                      + Follow-up
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full border-red-200 text-destructive hover:bg-destructive/10"
                      onClick={() =>
                        window.open(`/orders/create-backwork?from=${orderId}`, '_blank')
                      }
                    >
                      + Backwork
                    </Button>

                    {pendingReqs.length > 0 && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs">
                        {pendingReqs.length} pending follow-up request{pendingReqs.length === 1 ? '' : 's'} —
                        review in <span className="font-medium">Contact Centre → Tasks</span>.
                      </div>
                    )}

                    {followUps.length > 0 && (
                      <div className="space-y-1.5 pt-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Follow-ups on this order</p>
                        {followUps.map((f) => (
                          <div key={f.id} className="rounded-lg border bg-card p-2 text-xs flex items-center justify-between gap-2">
                            <span className="truncate">{f.order_id} · {f.scheduled_date ?? '—'} · {f.status}</span>
                            <span className="text-muted-foreground shrink-0">{f.total_amount ?? 0} QAR</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  {/* Logs */}
                  <TabsContent value="logs" className="mt-0">
                    {order.order_log.length === 0 ? (
                      <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                        No activity yet
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {order.order_log.map((log, i) => (
                          <div key={log.id} className="flex gap-3">
                            <div className="flex flex-col items-center">
                              <div className="h-2 w-2 rounded-full bg-orange-400 mt-1.5" />
                              {i < order.order_log.length - 1 && (
                                <div className="w-px flex-1 bg-slate-200 mt-1" />
                              )}
                            </div>
                            <div className="pb-3 min-w-0">
                              <p className="text-sm font-medium text-foreground">
                                {log.action}{' '}
                                <span className="font-normal text-muted-foreground">
                                  by {log.user_name}
                                </span>
                              </p>
                              {log.details && (
                                <p className="text-xs text-muted-foreground">{log.details}</p>
                              )}
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(log.created_at), 'MMM d, yyyy HH:mm')}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                </div>
              </Tabs>

              {/* Created-by footer — always visible at the dialog's bottom-right */}
              <div className="border-t bg-muted/30 px-5 py-2 flex justify-end">
                <span className="text-[11px] text-muted-foreground">
                  Created by{' '}
                  <span className="font-medium text-foreground">
                    {order.created_by_name ?? 'Unknown'}
                  </span>
                  {order.created_at && (
                    <> · {format(new Date(order.created_at), 'd MMM yyyy, HH:mm')}</>
                  )}
                </span>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {order && (
        <OrderCancelDialog
          open={cancelOpen}
          onOpenChange={setCancelOpen}
          orderId={orderId!}
          orderDisplayId={order.order_id}
          customerName={order.customer_name}
          isLoading={cancel.isPending}
          onConfirm={async (reason, notes) => {
            await cancel.mutateAsync({ reason, notes })
            toast.success('Order cancelled')
            setCancelOpen(false)
            onOpenChange(false)
          }}
        />
      )}
    </>
  )
}

function StatCard({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn(
        'mt-0.5 text-base font-bold',
        accent ? 'text-orange-600' : 'text-foreground'
      )}>
        {value}
      </p>
    </div>
  )
}
