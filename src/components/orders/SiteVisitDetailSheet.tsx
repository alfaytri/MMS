'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  MessageSquare, MapPin, CheckCircle, XCircle, Pencil, Plus, Truck,
} from 'lucide-react'
import { format } from 'date-fns'
import { useSiteVisitDetail } from '@/hooks/useSiteVisitDetail'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { queryKeys } from '@/lib/queryKeys'

const STATUS_STYLES: Record<string, string> = {
  scheduled:  'bg-blue-100 text-blue-700',
  confirmed:  'bg-green-100 text-green-700',
  completed:  'bg-green-100 text-green-700',
  cancelled:  'bg-red-100 text-red-700',
  waitlist:   'bg-amber-100 text-amber-700',
}

function fmt12(t: string): string {
  const [hStr, mStr] = t.split(':')
  const h = parseInt(hStr)
  const m = mStr ?? '00'
  const period = h < 12 ? 'AM' : 'PM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${m} ${period}`
}

const CONFIRMABLE = ['scheduled', 'waitlist']
const CANCELLABLE = ['scheduled', 'confirmed', 'waitlist']
const EDITABLE    = ['scheduled', 'confirmed', 'waitlist']

interface Props {
  visitId: string | null
  open: boolean
  onOpenChange: (v: boolean) => void
}

export function SiteVisitDetailSheet({ visitId, open, onOpenChange }: Props) {
  const [cancelOpen, setCancelOpen] = useState(false)
  const { data: visit, isLoading } = useSiteVisitDetail(visitId)
  const router = useRouter()
  const queryClient = useQueryClient()
  const supabase = createClient()

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('site_visits')
        .update({ status: 'confirmed' })
        .eq('id', visitId!)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Site visit confirmed')
      queryClient.invalidateQueries({ queryKey: queryKeys.siteVisits.detail(visitId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.siteVisits.all })
    },
    onError: () => toast.error('Failed to confirm site visit'),
  })

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('site_visits')
        .update({ status: 'cancelled' })
        .eq('id', visitId!)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Site visit cancelled')
      setCancelOpen(false)
      queryClient.invalidateQueries({ queryKey: queryKeys.siteVisits.detail(visitId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.siteVisits.all })
    },
    onError: () => toast.error('Failed to cancel site visit'),
  })

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(newOpen: boolean) => {
          if (cancelOpen) return
          onOpenChange(newOpen)
        }}
      >
        <DialogContent className="w-[96vw] max-w-3xl p-0 gap-0 max-h-[90vh] flex flex-col overflow-hidden">
          {isLoading || !visit ? (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
              Loading…
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="px-5 pt-5 pb-4 border-b">
                <div className="flex items-start gap-3 flex-wrap pr-8">
                  <span className="font-bold text-lg text-foreground font-mono">{visit.visit_id}</span>
                  <span className={cn(
                    'rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize',
                    STATUS_STYLES[visit.status] ?? 'bg-muted text-muted-foreground'
                  )}>
                    {visit.status}
                  </span>
                  <span className="rounded-full bg-purple-100 text-purple-700 px-2.5 py-0.5 text-xs font-semibold">
                    Site Visit
                  </span>
                  {visit.scheduled_date && (
                    <span className="rounded-full bg-muted text-muted-foreground px-2.5 py-0.5 text-xs font-medium">
                      Visit: {visit.scheduled_date}
                    </span>
                  )}
                  <p className="text-sm text-muted-foreground ml-auto truncate">
                    {visit.customer_name}
                    {visit.customer_phone && (
                      <span className="text-orange-600"> · {visit.customer_phone}</span>
                    )}
                  </p>
                </div>
                {visit.arrival_phone && visit.arrival_phone !== visit.customer_phone && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Arrival contact: <span className="text-orange-600">{visit.arrival_phone}</span>
                  </p>
                )}
              </div>

              {/* Confirmation banner — hidden for terminal statuses */}
              {(() => {
                const isTerminal = visit.status === 'completed' || visit.status === 'cancelled'
                const hasAnyAction =
                  !isTerminal &&
                  (CONFIRMABLE.includes(visit.status) ||
                    EDITABLE.includes(visit.status) ||
                    CANCELLABLE.includes(visit.status))
                if (isTerminal && !hasAnyAction) return null
                return (
              <div className="mx-5 mt-4 rounded-lg border bg-muted/40 p-3 flex items-start gap-3 flex-wrap">
                {!isTerminal && (
                  <div className="flex items-start gap-2.5 flex-1 min-w-[200px]">
                    <MessageSquare className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        {visit.status === 'confirmed' ? 'Confirmed' : 'Not Sent'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {visit.status === 'confirmed'
                          ? 'Site visit confirmed'
                          : '48hr auto-confirmation via WhatsApp before scheduled date'}
                      </p>
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {CONFIRMABLE.includes(visit.status) && (
                    <Button
                      size="sm"
                      className="gap-1.5 h-8 text-xs"
                      onClick={() => confirmMutation.mutate()}
                      disabled={confirmMutation.isPending}
                    >
                      <CheckCircle className="h-3.5 w-3.5" /> Confirm Manually
                    </Button>
                  )}
                  {EDITABLE.includes(visit.status) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 h-8 text-xs"
                      onClick={() => {
                        onOpenChange(false)
                        router.push(`/orders/site-visits/${visitId}/edit`)
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit Order
                    </Button>
                  )}
                  {CANCELLABLE.includes(visit.status) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 h-8 text-xs border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                      onClick={() => setCancelOpen(true)}
                    >
                      <XCircle className="h-3.5 w-3.5" /> Cancel Order
                    </Button>
                  )}
                </div>
              </div>
                )
              })()}

              {/* Tabs */}
              <Tabs defaultValue="services" className="flex flex-1 flex-col overflow-hidden mt-3">
                <TabsList className="mx-5 w-auto justify-start rounded-none border-b bg-transparent p-0 overflow-x-auto whitespace-nowrap gap-1">
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
                    Logs (0)
                  </TabsTrigger>
                </TabsList>

                <div className="flex-1 overflow-y-auto px-5 py-4">
                  {/* Booked Services */}
                  <TabsContent value="services" className="mt-0 space-y-4">
                    {visit.assignments.length === 0 ? (
                      <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                        No team assigned yet
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {visit.assignments.map((a) => (
                          <div key={a.id} className="flex items-center gap-3 rounded-lg border bg-card p-3">
                            <div className="rounded-lg bg-blue-50 p-2 shrink-0">
                              <Truck className="h-4 w-4 text-blue-600" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-foreground">{a.team_name}</p>
                              <p className="text-xs text-muted-foreground">
                                {a.scheduled_date ?? ''}
                                {a.time_slot && <> · {fmt12(a.time_slot)}</>}
                                {a.duration ? <> · {a.duration}h</> : null}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {visit.address && (
                      <div className="rounded-lg border bg-card p-3 flex items-start gap-2.5">
                        <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <p className="text-sm text-foreground">{visit.address}</p>
                      </div>
                    )}

                    {/* Order Summary */}
                    <div className="pt-2">
                      <h3 className="text-sm font-semibold text-foreground mb-2">Order Summary</h3>
                      <div className="grid grid-cols-3 gap-2">
                        <StatCard label="Services" value="0" />
                        <StatCard label="Teams" value={visit.assignments.length.toString()} />
                        <StatCard label="Total" value="0 QAR" accent />
                      </div>
                    </div>

                    {/* Notes */}
                    {visit.notes && (
                      <div className="rounded-lg border bg-card p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                          Notes
                        </p>
                        <p className="text-sm text-foreground whitespace-pre-wrap">{visit.notes}</p>
                      </div>
                    )}
                  </TabsContent>

                  {/* Invoice — site visits don't generate invoices directly */}
                  <TabsContent value="invoice" className="mt-0">
                    <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                      No invoice generated yet
                    </div>
                  </TabsContent>

                  {/* Follow-up & Backwork */}
                  <TabsContent value="followup" className="mt-0 space-y-2">
                    {visit.status === 'completed' ? (
                      <>
                        <p className="text-xs text-muted-foreground mb-3">
                          Create a follow-up order from this completed site visit.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full gap-2"
                          onClick={() => {
                            const params = new URLSearchParams({
                              customer_id: visit.customer_id,
                              ...(visit.customer_phone_id && { phone_id: visit.customer_phone_id }),
                            })
                            router.push(`/orders/create?${params.toString()}`)
                          }}
                        >
                          <Plus className="h-4 w-4" />
                          Create Order
                        </Button>
                      </>
                    ) : (
                      <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                        Available once the site visit is marked as completed.
                      </div>
                    )}
                  </TabsContent>

                  {/* Logs */}
                  <TabsContent value="logs" className="mt-0">
                    <div className="space-y-3">
                      <div className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className="h-2 w-2 rounded-full bg-orange-400 mt-1.5" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            Site visit created
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(visit.created_at), 'MMM d, yyyy HH:mm')}
                          </p>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                </div>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Cancel confirmation dialog */}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Site Visit</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel <span className="font-semibold">{visit?.visit_id}</span>?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelMutation.isPending}>Keep</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending ? 'Cancelling…' : 'Yes, Cancel'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
