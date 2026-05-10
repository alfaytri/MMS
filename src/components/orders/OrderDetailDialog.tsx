// src/components/orders/OrderDetailDialog.tsx
'use client'
import { useState } from 'react'
import { Sheet, SheetContent, SheetHeader } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import { CheckCircle, RotateCcw, XCircle, Pencil } from 'lucide-react'
import { useOrderDetail } from '@/hooks/useOrderDetail'
import { useOrderActions, canTransition } from '@/hooks/useOrderActions'
import { OrderCancelDialog } from './OrderCancelDialog'
import { OrderEditDialog } from './OrderEditDialog'
import { toast } from 'sonner'
import type { OrderStatus, ConfirmationStatus } from '@/types/orders'
import { cn } from '@/lib/utils'

const BANNER_STYLES: Record<ConfirmationStatus, string> = {
  not_sent:           'border-slate-200 bg-slate-50',
  msg_sent:           'border-blue-200 bg-blue-50',
  customer_confirmed: 'border-green-200 bg-green-50',
  agent_confirmed:    'border-green-200 bg-green-50',
  manually_confirmed: 'border-green-200 bg-green-50',
  no_response:        'border-red-200 bg-red-50',
}

interface Props {
  orderId: string | null
  open: boolean
  onOpenChange: (v: boolean) => void
}

export function OrderDetailDialog({ orderId, open, onOpenChange }: Props) {
  const [cancelOpen, setCancelOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const { data: order, isLoading } = useOrderDetail(orderId)
  const { confirmManually, rollback, cancel } = useOrderActions(orderId)

  const EDITABLE_STATUSES: OrderStatus[] = ['scheduled', 'pending-confirmation', 'waitlist', 'tentative']

  if (!open) return null

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-0">
          {isLoading || !order ? (
            <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
              Loading…
            </div>
          ) : (
            <>
              <SheetHeader className="border-b px-4 py-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-slate-900">{order.order_id}</span>
                  <Badge
                    className={cn(
                      'text-xs',
                      order.status === 'completed'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-blue-100 text-blue-800'
                    )}
                  >
                    {order.status}
                  </Badge>
                </div>
                <p className="text-sm text-slate-500">
                  {order.customer_name} · {order.customer_phone}
                </p>

                {/* Confirmation banner */}
                <div
                  className={cn(
                    'rounded-md border p-2 mt-2',
                    BANNER_STYLES[order.confirmation_status as ConfirmationStatus]
                  )}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-xs text-slate-600">
                      {order.confirmation_status === 'not_sent' &&
                        '48hr auto-confirmation via WhatsApp before visit'}
                      {order.confirmation_status === 'msg_sent' &&
                        'Message sent — awaiting customer reply'}
                      {(order.confirmation_status === 'customer_confirmed' ||
                        order.confirmation_status === 'agent_confirmed' ||
                        order.confirmation_status === 'manually_confirmed') &&
                        'Order confirmed ✓'}
                      {order.confirmation_status === 'no_response' && 'No response received'}
                    </p>
                    <div className="flex gap-1 flex-wrap">
                      {EDITABLE_STATUSES.includes(order.status as OrderStatus) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="min-h-11 sm:h-7 gap-1 text-xs"
                          onClick={() => setEditOpen(true)}
                        >
                          <Pencil className="h-3 w-3" /> Edit
                        </Button>
                      )}
                      {canTransition(order.status as OrderStatus, 'confirmed') && (
                        <Button
                          size="sm"
                          className="min-h-11 sm:h-7 gap-1 text-xs"
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
                          <CheckCircle className="h-3 w-3" /> Confirm
                        </Button>
                      )}
                      {(order.confirmation_status === 'manually_confirmed' ||
                        order.confirmation_status === 'customer_confirmed') && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="min-h-11 sm:h-7 gap-1 text-xs"
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
                          <RotateCcw className="h-3 w-3" /> Rollback
                        </Button>
                      )}
                      {canTransition(order.status as OrderStatus, 'cancelled') && (
                        <Button
                          size="sm"
                          variant="destructive"
                          className="min-h-11 sm:h-7 gap-1 text-xs"
                          onClick={() => setCancelOpen(true)}
                        >
                          <XCircle className="h-3 w-3" /> Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </SheetHeader>

              <Tabs defaultValue="services" className="flex flex-1 flex-col overflow-hidden">
                <TabsList className="mx-4 mt-3 w-auto justify-start rounded-none border-b bg-transparent p-0">
                  {(['services', 'invoice', 'followup', 'logs'] as const).map((tab) => (
                    <TabsTrigger
                      key={tab}
                      value={tab}
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 capitalize px-3 py-1.5 text-sm"
                    >
                      {tab === 'followup' ? 'Follow-up' : tab}
                    </TabsTrigger>
                  ))}
                </TabsList>

                <div className="flex-1 overflow-y-auto px-4 py-3">
                  <TabsContent value="services" className="mt-0 space-y-2">
                    {order.order_team_assignments.map((a) => (
                      <div key={a.id} className="rounded-lg border p-3">
                        <p className="font-medium text-sm">{a.team_name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {a.scheduled_date} · {a.time_slot} · {a.duration}min
                        </p>
                      </div>
                    ))}
                    <div className="grid grid-cols-3 gap-2 rounded-md bg-slate-50 p-3 text-center text-sm mt-3">
                      <div>
                        <p className="font-bold">{order.order_services.length}</p>
                        <p className="text-xs text-slate-500">Services</p>
                      </div>
                      <div>
                        <p className="font-bold">{order.order_team_assignments.length}</p>
                        <p className="text-xs text-slate-500">Teams</p>
                      </div>
                      <div>
                        <p className="font-bold">QAR {(order.total_amount ?? 0).toLocaleString()}</p>
                        <p className="text-xs text-slate-500">Total</p>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="invoice" className="mt-0">
                    {order.has_invoice ? (
                      <p className="text-sm">Invoice: {order.invoice_number}</p>
                    ) : (
                      <p className="text-sm text-slate-400">No invoice generated yet</p>
                    )}
                  </TabsContent>

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
                      className="w-full border-red-200 text-red-600 hover:bg-red-50"
                      onClick={() =>
                        window.open(`/orders/create-backwork?from=${orderId}`, '_blank')
                      }
                    >
                      + Backwork
                    </Button>
                  </TabsContent>

                  <TabsContent value="logs" className="mt-0">
                    <div className="space-y-3">
                      {order.order_log.map((log, i) => (
                        <div key={log.id} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <div className="h-2 w-2 rounded-full bg-slate-300 mt-1" />
                            {i < order.order_log.length - 1 && (
                              <div className="w-px flex-1 bg-slate-200 mt-1" />
                            )}
                          </div>
                          <div className="pb-3">
                            <p className="text-sm font-medium">
                              {log.action}{' '}
                              <span className="font-normal text-slate-500">
                                by {log.user_name}
                              </span>
                            </p>
                            {log.details && (
                              <p className="text-xs text-slate-500">{log.details}</p>
                            )}
                            <p className="text-xs text-slate-400">
                              {format(new Date(log.created_at), 'MMM d, yyyy HH:mm')}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </TabsContent>
                </div>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>

      {order && editOpen && (
        <OrderEditDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          order={order}
        />
      )}

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
