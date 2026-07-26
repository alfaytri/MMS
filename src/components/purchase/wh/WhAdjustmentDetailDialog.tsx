'use client'

import React, { useMemo, useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { ItemTreeCell } from './ItemTreeCell'
import {
  useActionStockAdjustmentStep,
  useForceApproveStockAdjustment,
  type StockAdjustmentApprovalStep,
} from '@/hooks/useWarehouseOperations'
import type { Profile } from '@/hooks/useProfiles'
import type { Warehouse } from '@/hooks/useWarehouses'
import { useMyApprovalSlotRoles } from '@/hooks/useRoles'
import { useWorkflowSteps } from '@/hooks/useWorkflowSteps'
import { useAllCategoriesFlat, breadcrumb as categoryBreadcrumb } from '@/hooks/useInventoryTree'

type AdjustmentRow = {
  id: string
  warehouse_id: string
  brand_variant_id: string
  adjustment_type: string
  qty: number
  reason: string
  notes: string | null
  status: string
  requested_by_name: string | null
  approved_by_name: string | null
  approved_at: string | null
  created_at: string
  warehouses?: { name: string } | null
  inventory_item_brand_variants?: {
    brand?: string | null
    inventory_items?: {
      name_en: string
      sku?: string | null
      inventory_categories?: { id: string | null; name_en: string | null; type: string | null } | null
    } | null
  } | null
  photo_urls?: string[] | null
  stock_adjustment_approvals?: StockAdjustmentApprovalStep[] | null
  source_check_id?: string | null
  source_check?: { id: string; check_number: string | null } | null
}

const TYPE_STYLES: Record<string, string> = {
  increase:  'bg-success/10 text-success',
  decrease:  'bg-warning/10 text-warning',
  damage:    'bg-destructive/10 text-destructive',
  write_off: 'bg-destructive/10 text-destructive',
}
const STATUS_STYLES: Record<string, string> = {
  pending_approval: 'bg-warning/10 text-warning',
  approved:         'bg-success/10 text-success',
  rejected:         'bg-destructive/10 text-destructive',
}

interface Props {
  adjustment: AdjustmentRow | null
  currentProfile: Profile | null
  warehouses: Warehouse[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function WhAdjustmentDetailDialog({ adjustment, currentProfile, warehouses, open, onOpenChange }: Props) {
  const action = useActionStockAdjustmentStep()
  const forceApprove = useForceApproveStockAdjustment()
  const { data: mySlots = [] } = useMyApprovalSlotRoles()
  const myApprovalRolesByName = useMemo(() => new Set(mySlots.map((s) => s.name)), [mySlots])
  const { data: workflowSteps = [] } = useWorkflowSteps()
  const { data: categoriesFlat = [] } = useAllCategoriesFlat()
  const [reviewNotes, setReviewNotes] = useState('')
  const [actioningId, setActioningId] = useState<string | null>(null)
  const [forceConfirmOpen, setForceConfirmOpen] = useState(false)
  const [forceComment, setForceComment] = useState('')

  // Owner detection — the DB force_approve_stock_adjustment RPC enforces this
  // gate server-side; this flag just controls whether the button appears.
  const isOwner = myApprovalRolesByName.has('Owner')

  const isFieldRpHere = useMemo(() => {
    if (!adjustment || !currentProfile) return false
    const wh = warehouses.find(w => w.id === adjustment.warehouse_id)
    return !!wh?.responsible_persons.some((rp: { profile_id: string }) => rp.profile_id === currentProfile.id)
  }, [adjustment, currentProfile, warehouses])

  // Strict per-step role gating — no Admin/Owner bypass here. Force Approve
  // is a separate button that clears every remaining pending step at once.
  function canActOnStep(stepRole: string): boolean {
    if (stepRole === 'responsible_person') return isFieldRpHere
    const step = workflowSteps.find((s) => s.step_key === stepRole)
    if (!step) return false
    const roleName = step.custom_roles?.name ?? step.step_label
    return myApprovalRolesByName.has(roleName)
  }

  const steps = useMemo(() => {
    const arr = adjustment?.stock_adjustment_approvals ?? []
    return [...arr].sort((a, b) => a.step_order - b.step_order)
  }, [adjustment])

  if (!adjustment) return null

  const item     = adjustment.inventory_item_brand_variants?.inventory_items
  const itemName = item?.name_en ?? '—'
  const brand    = adjustment.inventory_item_brand_variants?.brand ?? null
  const categoryId = item?.inventory_categories?.id ?? null
  const itemType   = item?.inventory_categories?.type ?? null
  const category   = categoryId && categoriesFlat.length
    ? categoryBreadcrumb(categoryId, categoriesFlat)
    : item?.inventory_categories?.name_en ?? null

  async function handleAction(stepId: string, verdict: 'approved' | 'rejected') {
    if (!currentProfile) return
    setActioningId(stepId)
    try {
      await action.mutateAsync({
        stepId,
        adjustmentId: adjustment!.id,
        action: verdict,
        profileId: currentProfile.id,
        profileName: currentProfile.full_name ?? 'Reviewer',
        notes: reviewNotes,
      })
      toast.success(verdict === 'approved' ? 'Step approved' : 'Adjustment rejected')
      setReviewNotes('')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setActioningId(null)
    }
  }

  const overallPending = adjustment.status === 'pending_approval'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm flex items-center gap-2 flex-wrap">
            <span>Stock Adjustment</span>
            <Badge className={`text-[10px] px-1.5 py-0 capitalize ${TYPE_STYLES[adjustment.adjustment_type] ?? ''}`}>
              {adjustment.adjustment_type?.replace(/_/g, ' ')}
            </Badge>
            <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_STYLES[adjustment.status] ?? 'bg-muted text-muted-foreground'}`}>
              {adjustment.status?.replace(/_/g, ' ')}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {adjustment.source_check_id && (
            <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-[11px] text-primary flex items-center gap-2">
              <span className="font-semibold">Auto-generated from inventory check</span>
              <span className="font-mono">{adjustment.source_check?.check_number ?? adjustment.source_check_id}</span>
            </div>
          )}

          {/* Item & quantity */}
          <div className="rounded-md border p-3 space-y-2">
            <ItemTreeCell category={category} itemType={itemType} itemName={itemName} brand={brand} />
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Warehouse</span>
              <span className="font-medium">{adjustment.warehouses?.name ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Quantity</span>
              <span className="font-medium">{adjustment.qty}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Requested by</span>
              <span className="font-medium">
                {adjustment.requested_by_name ?? '—'}
                {adjustment.created_at && (
                  <span className="text-muted-foreground ml-2">
                    {format(new Date(adjustment.created_at), 'dd MMM yyyy, HH:mm')}
                  </span>
                )}
              </span>
            </div>
          </div>

          {/* Reason & notes */}
          <div className="rounded-md border p-3 space-y-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Reason</div>
            <p className="text-xs">{adjustment.reason || '—'}</p>
            {adjustment.notes && (
              <>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground pt-2">Notes</div>
                <p className="text-xs">{adjustment.notes}</p>
              </>
            )}
          </div>

          {/* Photos */}
          {(adjustment.photo_urls?.length ?? 0) > 0 && (
            <div className="rounded-md border p-3 space-y-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Evidence Photos</div>
              <div className="grid grid-cols-3 gap-2">
                {(adjustment.photo_urls ?? []).map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`Evidence ${i + 1}`}
                      className="aspect-square w-full object-cover rounded-md border hover:opacity-80 transition"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Approval chain */}
          <div className="rounded-md border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Approval Chain</div>
              {isOwner && overallPending && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[10px] text-destructive border-destructive/40 hover:bg-destructive/10 gap-1"
                  disabled={forceApprove.isPending}
                  onClick={() => { setForceComment(''); setForceConfirmOpen(true) }}
                >
                  <ShieldAlert className="h-3 w-3" />
                  Force Approve
                </Button>
              )}
            </div>

            {steps.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">
                This adjustment was created before approval chains were introduced — no chain history is available.
              </p>
            )}

            {steps.length > 0 && (
              <div className="space-y-2">
                {steps.map((step) => {
                  const isPending = step.status === 'pending'
                  const userCanAct = overallPending && isPending && canActOnStep(step.step_role)
                  return (
                    <div
                      key={step.id}
                      className={`border rounded-md px-3 py-2.5 space-y-2 ${
                        step.status === 'approved' ? 'border-success/30 bg-success/5' :
                        step.status === 'rejected' ? 'border-destructive/30 bg-destructive/5' :
                        userCanAct ? 'border-primary/40 bg-primary/5' :
                        'border-border bg-muted/10'
                      }`}
                    >
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-[10px] text-muted-foreground w-5 text-right">{step.step_order}.</span>
                        <span className="font-semibold">{step.step_label}</span>
                        <Badge className={`text-[10px] px-1.5 py-0 ml-auto ${
                          step.status === 'approved' ? 'bg-success/10 text-success' :
                          step.status === 'rejected' ? 'bg-destructive/10 text-destructive' :
                          'bg-warning/10 text-warning'
                        }`}>
                          {step.status === 'approved' ? 'Approved'
                            : step.status === 'rejected' ? 'Rejected'
                            : 'Pending'}
                        </Badge>
                      </div>

                      {step.profile_name && (
                        <p className="text-[10px] text-muted-foreground pl-7 flex items-center gap-1.5">
                          <span>
                            {step.status === 'approved' ? 'Approved' : 'Reviewed'} by {step.profile_name}
                            {step.action_at ? ` · ${format(new Date(step.action_at), 'dd MMM yyyy, HH:mm')}` : ''}
                          </span>
                          {(step as StockAdjustmentApprovalStep & { force_approved?: boolean }).force_approved && (
                            <Badge className="text-[9px] px-1 py-0 bg-destructive/10 text-destructive gap-0.5">
                              <ShieldAlert className="h-2.5 w-2.5" />
                              Force
                            </Badge>
                          )}
                        </p>
                      )}
                      {step.notes && (
                        <p className="text-[10px] text-muted-foreground pl-7 italic">{step.notes}</p>
                      )}
                      {(step as StockAdjustmentApprovalStep & { force_comment?: string | null }).force_comment && (
                        <p className="text-[10px] text-destructive pl-7 italic">
                          Force reason: {(step as StockAdjustmentApprovalStep & { force_comment?: string | null }).force_comment}
                        </p>
                      )}

                      {userCanAct && (
                        <div className="pl-7 space-y-2">
                          <Textarea
                            placeholder="Reason (required for rejection)..."
                            className="text-xs min-h-[52px]"
                            value={reviewNotes}
                            onChange={(e) => setReviewNotes(e.target.value)}
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm" variant="outline"
                              className="h-7 text-[10px] text-destructive border-destructive/30 hover:bg-destructive/10"
                              disabled={!!actioningId || !reviewNotes.trim()}
                              onClick={() => handleAction(step.id, 'rejected')}
                            >
                              Reject
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 text-[10px] bg-success text-success-foreground hover:bg-success/90"
                              disabled={!!actioningId}
                              onClick={() => handleAction(step.id, 'approved')}
                            >
                              {actioningId === step.id ? 'Saving...' : 'Approve'}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>

      <Dialog open={forceConfirmOpen} onOpenChange={setForceConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-4 w-4" />
              Force-approve this adjustment?
            </DialogTitle>
            <DialogDescription>
              This bypasses every remaining pending step and applies the stock change immediately.
              Each skipped step is marked <span className="font-semibold">Force</span> in the audit
              trail. Owner-only. Cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason for bypassing the chain (recommended)…"
            className="text-xs min-h-[64px]"
            value={forceComment}
            onChange={(e) => setForceComment(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setForceConfirmOpen(false)} disabled={forceApprove.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={forceApprove.isPending}
              onClick={async () => {
                if (!adjustment) return
                try {
                  await forceApprove.mutateAsync({
                    adjustmentId: adjustment.id,
                    comment:      forceComment.trim() || undefined,
                  })
                  toast.success('Adjustment force-approved')
                  setForceConfirmOpen(false)
                  setForceComment('')
                } catch (e) {
                  toast.error((e as Error).message)
                }
              }}
            >
              {forceApprove.isPending ? 'Force-approving…' : 'Force approve'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}
