'use client'

import React, { useState } from 'react'
import { Clock, CheckCircle2, XCircle, ClipboardCheck, Eye } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useInventoryChecks, useInventoryCheck } from '@/hooks/useWarehouseOperations'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Warehouse } from '@/hooks/useWarehouses'
import type { Profile } from '@/hooks/useProfiles'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { toast } from 'sonner'

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  draft:     { icon: <Clock className="h-4 w-4" />, color: 'text-muted-foreground', bg: 'bg-muted/20' },
  submitted: { icon: <Clock className="h-4 w-4" />, color: 'text-warning', bg: 'bg-warning/10' },
  approved:  { icon: <CheckCircle2 className="h-4 w-4" />, color: 'text-success', bg: 'bg-success/10' },
  rejected:  { icon: <XCircle className="h-4 w-4" />, color: 'text-destructive', bg: 'bg-destructive/10' },
}
const STATUS_BADGE: Record<string, string> = {
  draft:     'bg-muted text-muted-foreground',
  submitted: 'bg-warning/10 text-warning',
  approved:  'bg-success/10 text-success',
  rejected:  'bg-destructive/10 text-destructive',
}

interface Props {
  warehouses: Warehouse[]
  currentProfile: Profile | null
}

export const WhInventoryChecksTab = React.memo(function WhInventoryChecksTab({ warehouses, currentProfile }: Props) {
  const { data: checks = [] } = useInventoryChecks()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reviewNotes, setReviewNotes] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const qc = useQueryClient()

  // ONE argument only — hook has enabled: !!id built in
  const { data: checkDetail } = useInventoryCheck(selectedId ?? '')

  const reviewMutation = useMutation({
    mutationFn: async ({ id, status, reviewedByName, reviewNotes }: {
      id: string
      status: 'approved' | 'rejected'
      reviewedByName: string
      reviewNotes?: string | null
    }) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('inventory_checks')
        .update({
          status,
          reviewed_by_name: reviewedByName,
          reviewed_at: new Date().toISOString(),
          review_notes: reviewNotes ?? null,
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory_checks'] })
    },
  })

  async function handleReview(action: 'approve' | 'reject') {
    if (!selectedId) return
    setReviewing(true)
    try {
      await reviewMutation.mutateAsync({
        id: selectedId,
        status: action === 'approve' ? 'approved' : 'rejected',
        reviewedByName: currentProfile?.full_name ?? 'Reviewer',
        reviewNotes,
      })
      toast.success(action === 'approve' ? 'Inventory check approved' : 'Inventory check rejected')
      setSelectedId(null)
      setReviewNotes('')
    } catch (e: any) {
      toast.error(e.message ?? 'Something went wrong')
    } finally {
      setReviewing(false)
    }
  }

  if (checks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2">
        <ClipboardCheck className="h-10 w-10 text-muted-foreground/30" />
        <p className="text-xs text-muted-foreground">No inventory checks yet.</p>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-2">
      {checks.map((c) => {
        const cfg = STATUS_CONFIG[c.status] ?? STATUS_CONFIG.draft
        const isPending = c.status === 'submitted'
        return (
          <div
            key={c.id}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer hover:bg-muted/30 transition-colors ${isPending ? 'border-warning/30 bg-warning/5' : ''}`}
            onClick={() => setSelectedId(c.id)}
          >
            <div className={`h-9 w-9 rounded-md flex items-center justify-center flex-shrink-0 ${cfg.bg} ${cfg.color}`}>
              {cfg.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold">{c.check_number}</span>
                <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_BADGE[c.status] ?? ''}`}>
                  {c.status}
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {c.warehouse_name} · by {c.submitted_by_name ?? 'unknown'}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-[10px] text-muted-foreground">
                {c.submitted_at ? format(new Date(c.submitted_at), 'dd MMM') : ''}
              </span>
              <Eye className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </div>
        )
      })}

      {/* Detail Dialog */}
      <Dialog open={!!selectedId} onOpenChange={() => { setSelectedId(null); setReviewNotes('') }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              {checkDetail?.check_number}
              {checkDetail?.status && (
                <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_BADGE[checkDetail.status] ?? ''}`}>
                  {checkDetail.status}
                </Badge>
              )}
              <span className="text-xs font-normal text-muted-foreground">{checkDetail?.warehouse_name}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-4">
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Item</TableHead>
                    <TableHead className="text-xs">Brand</TableHead>
                    <TableHead className="text-xs">SKU</TableHead>
                    <TableHead className="text-xs text-right">System</TableHead>
                    <TableHead className="text-xs text-right">Counted</TableHead>
                    <TableHead className="text-xs text-right">Variance</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(checkDetail?.items ?? []).map((item) => {
                    const variance = item.variance ?? 0
                    const isCounted = item.is_counted
                    const rowBg = !isCounted ? 'bg-muted/30' : variance === 0 ? 'bg-success/5' : 'bg-warning/5'
                    return (
                      <TableRow key={item.id} className={rowBg}>
                        <TableCell className="text-xs">{item.item_name}</TableCell>
                        <TableCell className="text-xs">{item.brand ?? '—'}</TableCell>
                        <TableCell className="text-xs text-primary">{item.sku ?? '—'}</TableCell>
                        <TableCell className="text-xs text-right">{item.system_qty}</TableCell>
                        <TableCell className="text-xs text-right">{item.counted_qty ?? '—'}</TableCell>
                        <TableCell className="text-xs text-right">
                          {isCounted ? (
                            <span className={variance > 0 ? 'text-success' : variance < 0 ? 'text-destructive' : ''}>
                              {variance > 0 ? `+${variance}` : variance}
                            </span>
                          ) : '—'}
                        </TableCell>
                        <TableCell>
                          {!isCounted ? (
                            <Badge variant="outline" className="text-[10px]">Not counted</Badge>
                          ) : variance === 0 ? (
                            <Badge className="text-[10px] bg-success/10 text-success">Match</Badge>
                          ) : (
                            <Badge className="text-[10px] bg-warning/10 text-warning">Variance</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            {checkDetail?.notes && (
              <div className="p-3 rounded-md bg-muted/30 text-xs text-muted-foreground">
                {checkDetail.notes}
              </div>
            )}

            {/* Reviewer panel — only for submitted checks and admins */}
            {checkDetail?.status === 'submitted' && (
              <div className="space-y-2">
                <Textarea
                  placeholder="Review notes (optional)…"
                  className="text-xs min-h-[60px]"
                  value={reviewNotes}
                  onChange={e => setReviewNotes(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                    disabled={reviewing}
                    onClick={() => handleReview('reject')}
                  >
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    className="text-xs bg-success text-success-foreground hover:bg-success/90"
                    disabled={reviewing}
                    onClick={() => handleReview('approve')}
                  >
                    Approve
                  </Button>
                </div>
              </div>
            )}

            {/* Audit footer for resolved checks */}
            {(checkDetail?.status === 'approved' || checkDetail?.status === 'rejected') && (
              <p className="text-[10px] text-muted-foreground">
                {checkDetail.status === 'approved' ? 'Approved' : 'Rejected'} by {checkDetail.reviewed_by_name}
                {checkDetail.reviewed_at ? ` on ${format(new Date(checkDetail.reviewed_at), 'dd MMM yyyy')}` : ''}
                {checkDetail.review_notes ? ` — ${checkDetail.review_notes}` : ''}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setSelectedId(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
})
