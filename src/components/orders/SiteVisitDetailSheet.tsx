'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Sheet, SheetContent, SheetHeader } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
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
import { MapPin, Phone, FileText, Calendar, Clock, CheckCircle, XCircle, Pencil, Plus } from 'lucide-react'
import { format } from 'date-fns'
import { useSiteVisitDetail } from '@/hooks/useSiteVisitDetail'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const STATUS_STYLES: Record<string, string> = {
  scheduled:  'bg-blue-100 text-blue-800',
  confirmed:  'bg-green-100 text-green-800',
  completed:  'bg-green-100 text-green-800',
  cancelled:  'bg-red-100 text-red-800',
  waitlist:   'bg-yellow-100 text-yellow-800',
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
      const { error } = await (supabase as any)
        .from('site_visits')
        .update({ status: 'confirmed' })
        .eq('id', visitId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Site visit confirmed')
      queryClient.invalidateQueries({ queryKey: ['site-visit-detail', visitId] })
      queryClient.invalidateQueries({ queryKey: ['site-visits'] })
    },
    onError: () => toast.error('Failed to confirm site visit'),
  })

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from('site_visits')
        .update({ status: 'cancelled' })
        .eq('id', visitId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Site visit cancelled')
      setCancelOpen(false)
      queryClient.invalidateQueries({ queryKey: ['site-visit-detail', visitId] })
      queryClient.invalidateQueries({ queryKey: ['site-visits'] })
    },
    onError: () => toast.error('Failed to cancel site visit'),
  })

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(newOpen, _event, reason) => {
          if (cancelOpen && reason === 'outside-press') return
          onOpenChange(newOpen)
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-0">
          {isLoading || !visit ? (
            <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
              Loading…
            </div>
          ) : (
            <>
              <SheetHeader className="border-b px-4 py-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-slate-900 font-mono">{visit.visit_id}</span>
                  <span className="rounded border border-purple-200 bg-purple-100 px-2 py-0.5 text-[11px] font-semibold text-purple-700">
                    Site Visit
                  </span>
                  <Badge className={cn('text-xs capitalize', STATUS_STYLES[visit.status] ?? 'bg-slate-100 text-slate-600')}>
                    {visit.status}
                  </Badge>
                </div>

                <p className="text-sm text-slate-500">
                  {visit.customer_name} · {visit.customer_phone}
                </p>

                {visit.arrival_phone && visit.arrival_phone !== visit.customer_phone && (
                  <p className="flex items-center gap-1 text-xs text-slate-500">
                    <Phone className="h-3 w-3 text-orange-400" />
                    {visit.arrival_phone}
                    <span className="text-orange-500 font-medium">on arrival</span>
                  </p>
                )}

                {/* Action buttons */}
                <div className="flex items-center gap-2 flex-wrap pt-1">
                  {EDITABLE.includes(visit.status) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-11 sm:h-7 gap-1 text-xs"
                      onClick={() => {
                        onOpenChange(false)
                        router.push(`/orders/site-visits/${visitId}/edit`)
                      }}
                    >
                      <Pencil className="h-3 w-3" /> Edit
                    </Button>
                  )}
                  {CONFIRMABLE.includes(visit.status) && (
                    <Button
                      size="sm"
                      className="min-h-11 sm:h-7 gap-1 text-xs"
                      onClick={() => confirmMutation.mutate()}
                      disabled={confirmMutation.isPending}
                    >
                      <CheckCircle className="h-3 w-3" /> Confirm
                    </Button>
                  )}
                  {CANCELLABLE.includes(visit.status) && (
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
              </SheetHeader>

              {/* Info summary */}
              <div className="px-4 pt-3 space-y-2">
                {visit.scheduled_date && (
                  <div className="flex items-center gap-2 text-sm text-slate-700">
                    <Calendar className="h-4 w-4 shrink-0 text-slate-400" />
                    <span>{format(new Date(visit.scheduled_date), 'dd MMM yyyy')}</span>
                  </div>
                )}
                {visit.address && (
                  <div className="flex items-start gap-2 text-sm text-slate-700">
                    <MapPin className="h-4 w-4 shrink-0 text-slate-400 mt-0.5" />
                    <span>{visit.address}</span>
                  </div>
                )}
                {visit.notes && (
                  <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-100 px-3 py-2 text-sm text-slate-700">
                    <FileText className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
                    <span>{visit.notes}</span>
                  </div>
                )}

                {/* Team assignments */}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Team Assignments
                  </p>
                  {visit.assignments.length === 0 ? (
                    <p className="text-sm text-slate-400">No team assigned yet</p>
                  ) : (
                    visit.assignments.map((a) => (
                      <div key={a.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 space-y-0.5">
                        <p className="font-medium text-sm text-slate-900">{a.team_name}</p>
                        <div className="flex items-center gap-3 text-xs text-slate-500">
                          {a.scheduled_date && <span>{a.scheduled_date}</span>}
                          {a.time_slot && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {fmt12(a.time_slot)}
                            </span>
                          )}
                          <span>{a.duration}h</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 rounded-md bg-slate-50 p-3 text-center text-sm">
                  <div>
                    <p className="font-bold">{visit.assignments.length}</p>
                    <p className="text-xs text-slate-500">Teams</p>
                  </div>
                  <div>
                    <p className="font-bold capitalize">{visit.mode}</p>
                    <p className="text-xs text-slate-500">Mode</p>
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <Tabs defaultValue="followup" className="flex flex-1 flex-col overflow-hidden mt-2">
                <TabsList className="mx-4 w-auto justify-start rounded-none border-b bg-transparent p-0">
                  {(['followup', 'logs'] as const).map((tab) => (
                    <TabsTrigger
                      key={tab}
                      value={tab}
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-orange-500 capitalize px-3 py-1.5 text-sm"
                    >
                      {tab === 'followup' ? 'Follow-Up' : 'Logs'}
                    </TabsTrigger>
                  ))}
                </TabsList>

                <div className="flex-1 overflow-y-auto px-4 py-3">
                  <TabsContent value="followup" className="mt-0 space-y-2">
                    <p className="text-xs text-slate-500 mb-3">
                      Create an order directly from this site visit.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-2"
                      onClick={() =>
                        router.push(`/orders/new?customer_id=${visit.customer_id}&from_visit=${visit.id}`)
                      }
                    >
                      <Plus className="h-4 w-4" />
                      Create Order
                    </Button>
                  </TabsContent>

                  <TabsContent value="logs" className="mt-0">
                    <div className="space-y-3">
                      <div className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className="h-2 w-2 rounded-full bg-slate-300 mt-1" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">
                            Site visit created
                          </p>
                          <p className="text-xs text-slate-400">
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
        </SheetContent>
      </Sheet>

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
