'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ShieldAlert, FileText, Package, Hash, User, Building2, Calendar,
  CheckCircle2, XCircle, Undo2, Clock, RotateCcw, Receipt, Ban,
  AlertCircle, RefreshCw, ArrowRight,
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useWarrantyClaim,
  useAssessWarrantyClaim,
  useVoidWarrantyClaim,
  useStartWarrantyClaimResolution,
  type WarrantyClaimStatus,
  type WarrantyClaimResolutionType,
} from '@/hooks/useWarrantyClaims'
import { useHasPermission } from '@/hooks/usePermissions'
import { queryKeys } from '@/lib/queryKeys'
import { humanizeDbError } from '@/lib/dbErrors'
import { formatDateTime } from '@/lib/utils/formatters'
import { cn } from '@/lib/utils'

// ── Label / color helpers — mirror the small maps in the Warranties page ──
const RESOLUTION_TYPE_LABELS: Record<string, string> = {
  replacement: 'Replacement',
  credit:      'Credit',
  refund:      'Refund',
  repair:      'Repair',
}

function resolutionTypeLabel(value: WarrantyClaimResolutionType): string {
  if (!value) return '—'
  return RESOLUTION_TYPE_LABELS[value] ?? value
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

const CLAIM_STATUS_CONFIG: Record<WarrantyClaimStatus, { label: string; badgeClassName: string }> = {
  open:        { label: 'Open',        badgeClassName: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300' },
  covered:     { label: 'Covered',     badgeClassName: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300' },
  rejected:    { label: 'Rejected',    badgeClassName: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300' },
  in_progress: { label: 'In Progress', badgeClassName: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300' },
  resolved:    { label: 'Resolved',    badgeClassName: 'border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200' },
  void:        { label: 'Void',        badgeClassName: 'border-border bg-muted text-muted-foreground' },
}

function MetaCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <div className="h-9 w-9 rounded-lg bg-muted/50 flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider leading-none mb-0.5">{label}</p>
        <p className="text-sm font-medium truncate">{value}</p>
      </div>
    </div>
  )
}

type ActionMode = 'none' | 'assess' | 'void'

interface WarrantyClaimDetailDialogProps {
  claimId: string | null
  onClose: () => void
}

export function WarrantyClaimDetailDialog({ claimId, onClose }: WarrantyClaimDetailDialogProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const canManage = useHasPermission('sales.warranty_claims.manage')

  const { data: claim, isLoading, error, refetch, isFetching } = useWarrantyClaim(claimId ?? undefined)

  const [mode, setMode] = useState<ActionMode>('none')
  const [decision, setDecision] = useState<'covered' | 'rejected' | null>(null)
  const [reasonText, setReasonText] = useState('')
  // Set locally the instant `rpc_start_warranty_claim_resolution` succeeds so the
  // "Open Returns" success message renders immediately, without waiting on a refetch.
  const [justStartedReturnId, setJustStartedReturnId] = useState<string | null>(null)
  // Optimistic status: set the instant ANY mutation succeeds so the action panel
  // reflects the new state immediately, instead of briefly re-rendering the
  // pre-mutation buttons while the invalidated `warranty.claim(id)` query refetches.
  // Once that refetch lands, claim.status equals this value, so there's no conflict.
  const [optimisticStatus, setOptimisticStatus] = useState<WarrantyClaimStatus | null>(null)

  const assessClaim = useAssessWarrantyClaim()
  const voidClaim = useVoidWarrantyClaim()
  const startResolution = useStartWarrantyClaimResolution()

  // Reset all local/inline-form state whenever a different claim opens (or the
  // dialog closes) — mirrors the reset-on-open pattern used by other dialogs in
  // this codebase (mutation objects are intentionally excluded from deps: their
  // identity changes every render, which would otherwise re-run this on a loop).
  useEffect(() => {
    setMode('none')
    setDecision(null)
    setReasonText('')
    setJustStartedReturnId(null)
    setOptimisticStatus(null)
    assessClaim.reset()
    voidClaim.reset()
    startResolution.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimId])

  if (!claimId) return null

  // Prefer the optimistic status (set by each mutation's onSuccess) so the badge,
  // action panel, and void gate all reflect the just-applied change instantly;
  // fall back to the fetched claim status otherwise.
  const effectiveStatus: WarrantyClaimStatus | null =
    optimisticStatus ?? claim?.status ?? null

  const showActionPanel =
    effectiveStatus !== null &&
    effectiveStatus !== 'resolved' &&
    effectiveStatus !== 'void' &&
    (canManage || effectiveStatus === 'in_progress')

  function handleAssess() {
    if (!claim || !decision) return
    if (decision === 'rejected' && reasonText.trim() === '') return
    assessClaim.mutate(
      { claim_id: claim.id, decision, reason: reasonText.trim() ? reasonText.trim() : null },
      {
        onSuccess: () => {
          toast.success(decision === 'covered' ? 'Claim marked as covered' : 'Claim rejected')
          setOptimisticStatus(decision === 'covered' ? 'covered' : 'rejected')
          setMode('none')
          setDecision(null)
          setReasonText('')
        },
      }
    )
  }

  function handleVoid() {
    if (!claim || reasonText.trim() === '') return
    voidClaim.mutate(
      { claim_id: claim.id, reason: reasonText.trim() },
      {
        onSuccess: () => {
          toast.success('Claim voided')
          setOptimisticStatus('void')
          setMode('none')
          setReasonText('')
        },
      }
    )
  }

  function handleStartResolution() {
    if (!claim) return
    startResolution.mutate(
      { claim_id: claim.id },
      {
        onSuccess: (returnId) => {
          toast.success('Return created — resolve it in Returns')
          setJustStartedReturnId(returnId)
          setOptimisticStatus('in_progress')
          queryClient.invalidateQueries({ queryKey: queryKeys.warranty.claim(claim.id) })
        },
      }
    )
  }

  return (
    <Dialog open={!!claimId} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="w-full max-w-full rounded-none sm:max-w-2xl sm:rounded-lg p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300 shrink-0">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="font-mono text-lg tracking-tight">
                  {claim?.claim_number ?? 'Warranty Claim'}
                </DialogTitle>
                <p className="text-sm text-muted-foreground">Warranty Claim</p>
              </div>
            </div>
            {effectiveStatus && (
              <Badge className={cn('border text-xs shrink-0', CLAIM_STATUS_CONFIG[effectiveStatus].badgeClassName)}>
                {CLAIM_STATUS_CONFIG[effectiveStatus].label}
              </Badge>
            )}
          </div>
        </DialogHeader>

        <Separator />

        {/* Body — single scroll region */}
        <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <Skeleton className="h-9 w-9 rounded-lg shrink-0" />
                  <div className="space-y-1.5 flex-1">
                    <Skeleton className="h-2.5 w-16" />
                    <Skeleton className="h-3.5 w-24" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-8 flex flex-col items-center justify-center gap-2 text-center min-h-[200px]">
              <AlertCircle className="h-6 w-6 text-destructive" />
              <p className="text-sm font-medium text-destructive">Couldn&apos;t load this claim</p>
              <p className="text-xs text-muted-foreground max-w-sm">{humanizeDbError(error, 'load the warranty claim')}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 min-h-11 md:min-h-0"
                disabled={isFetching}
                onClick={() => refetch()}
              >
                <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', isFetching && 'animate-spin')} />
                {isFetching ? 'Retrying…' : 'Retry'}
              </Button>
            </div>
          ) : !claim ? (
            <div className="min-h-[200px] flex items-center justify-center text-sm text-muted-foreground">
              Claim not found.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <MetaCard icon={<FileText className="h-4 w-4 text-muted-foreground" />} label="Warranty #" value={claim.warranty_number} />
                <MetaCard icon={<Package className="h-4 w-4 text-muted-foreground" />} label="Item" value={claim.item_name} />
                <MetaCard icon={<Hash className="h-4 w-4 text-muted-foreground" />} label="SKU" value={claim.sku ?? '—'} />
                <MetaCard icon={<User className="h-4 w-4 text-muted-foreground" />} label="Customer" value={claim.customer_name} />
                <MetaCard icon={<Building2 className="h-4 w-4 text-muted-foreground" />} label="Division" value={claim.division_name} />
                <MetaCard icon={<Calendar className="h-4 w-4 text-muted-foreground" />} label="Reported" value={formatDateTime(claim.reported_at)} />
                <MetaCard icon={<CheckCircle2 className="h-4 w-4 text-muted-foreground" />} label="Decision" value={claim.decision ? capitalize(claim.decision) : '—'} />
                <MetaCard icon={<Undo2 className="h-4 w-4 text-muted-foreground" />} label="Resolution" value={resolutionTypeLabel(claim.resolution_type)} />
                <MetaCard icon={<Clock className="h-4 w-4 text-muted-foreground" />} label="Resolved" value={claim.resolved_at ? formatDateTime(claim.resolved_at) : '—'} />
                <MetaCard icon={<RotateCcw className="h-4 w-4 text-muted-foreground" />} label="Linked Return" value={claim.linked_return_id ? 'Return created' : '—'} />
                <MetaCard icon={<Receipt className="h-4 w-4 text-muted-foreground" />} label="Credit Note" value={claim.linked_credit_note_id ? 'Credit note issued' : '—'} />
              </div>

              <div className="rounded-lg border bg-muted/20 px-4 py-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Issue reported</p>
                <p className="text-sm whitespace-pre-wrap">{claim.issue_description}</p>
              </div>

              {claim.decision_reason && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/20">
                  <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wider mb-1">Decision reason</p>
                  <p className="text-sm whitespace-pre-wrap">{claim.decision_reason}</p>
                </div>
              )}

              {claim.void_reason && (
                <div className="rounded-lg border border-red-200 bg-red-50/50 px-4 py-3 dark:border-red-900 dark:bg-red-950/20">
                  <p className="text-[10px] font-semibold text-red-700 dark:text-red-300 uppercase tracking-wider mb-1">Void reason</p>
                  <p className="text-sm whitespace-pre-wrap">{claim.void_reason}</p>
                </div>
              )}
            </>
          )}
        </div>

        <Separator />

        {/* Footer — status-gated action buttons; normal flow, never sticky */}
        <div className="px-6 py-3 space-y-3">
          {showActionPanel && (
            /* min-h sized to the tallest state (the assess/void inline form ≈ 210px
               incl. mobile 44px touch targets) so switching between the button row
               and a form never shifts the Close button below — AGENTS.md §5. */
            <div className="min-h-56">
              {mode === 'assess' ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    {decision === 'covered' ? 'Mark this claim as covered' : 'Reject this claim'}
                  </p>
                  <Label htmlFor="claim-assess-reason" className="text-xs text-muted-foreground">
                    Reason{decision === 'rejected' ? ' *' : ' (optional)'}
                  </Label>
                  <Textarea
                    id="claim-assess-reason"
                    value={reasonText}
                    onChange={(e) => setReasonText(e.target.value)}
                    placeholder={decision === 'rejected' ? 'Explain why this claim is not covered…' : 'Optional notes about the coverage decision…'}
                    className="min-h-20"
                  />
                  <div className="min-h-5">
                    {assessClaim.error && (
                      <p className="text-xs text-destructive">{assessClaim.error.message}</p>
                    )}
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-11 md:min-h-0"
                      disabled={assessClaim.isPending}
                      onClick={() => { setMode('none'); setDecision(null); setReasonText('') }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={decision === 'rejected' ? 'destructive' : 'default'}
                      className="min-h-11 md:min-h-0"
                      loading={assessClaim.isPending}
                      disabled={assessClaim.isPending || (decision === 'rejected' && reasonText.trim() === '')}
                      onClick={handleAssess}
                    >
                      {assessClaim.isPending ? 'Saving…' : decision === 'rejected' ? 'Confirm Reject' : 'Confirm Cover'}
                    </Button>
                  </div>
                </div>
              ) : mode === 'void' ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Void this claim</p>
                  <Label htmlFor="claim-void-reason" className="text-xs text-muted-foreground">Void reason *</Label>
                  <Textarea
                    id="claim-void-reason"
                    value={reasonText}
                    onChange={(e) => setReasonText(e.target.value)}
                    placeholder="Explain why this claim is being voided…"
                    className="min-h-20"
                  />
                  <div className="min-h-5">
                    {voidClaim.error && (
                      <p className="text-xs text-destructive">{voidClaim.error.message}</p>
                    )}
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-11 md:min-h-0"
                      disabled={voidClaim.isPending}
                      onClick={() => { setMode('none'); setReasonText('') }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="min-h-11 md:min-h-0"
                      loading={voidClaim.isPending}
                      disabled={voidClaim.isPending || reasonText.trim() === ''}
                      onClick={handleVoid}
                    >
                      {voidClaim.isPending ? 'Voiding…' : 'Confirm Void'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {canManage && effectiveStatus === 'open' && (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          className="min-h-11 md:min-h-0 gap-1.5"
                          onClick={() => { setMode('assess'); setDecision('covered'); setReasonText('') }}
                        >
                          <CheckCircle2 className="h-4 w-4" /> Mark Covered
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="min-h-11 md:min-h-0 gap-1.5 text-destructive hover:text-destructive"
                          onClick={() => { setMode('assess'); setDecision('rejected'); setReasonText('') }}
                        >
                          <XCircle className="h-4 w-4" /> Reject
                        </Button>
                      </>
                    )}
                    {canManage && effectiveStatus === 'covered' && (
                      <Button
                        type="button"
                        size="sm"
                        className="min-h-11 md:min-h-0 gap-1.5"
                        loading={startResolution.isPending}
                        disabled={startResolution.isPending}
                        onClick={handleStartResolution}
                      >
                        <RotateCcw className="h-4 w-4" />
                        {startResolution.isPending ? 'Starting…' : 'Start Resolution'}
                      </Button>
                    )}
                    {effectiveStatus === 'in_progress' && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="min-h-11 md:min-h-0 gap-1.5"
                        onClick={() => router.push('/sales/returns')}
                      >
                        Open Returns <ArrowRight className="h-4 w-4" />
                      </Button>
                    )}
                    {canManage && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="min-h-11 md:min-h-0 gap-1.5 text-destructive hover:text-destructive ml-auto"
                        onClick={() => { setMode('void'); setReasonText('') }}
                      >
                        <Ban className="h-4 w-4" /> Void
                      </Button>
                    )}
                  </div>
                  {startResolution.error && (
                    <p className="text-xs text-destructive">{startResolution.error.message}</p>
                  )}
                  {effectiveStatus === 'in_progress' && (
                    <p className={cn(
                      'text-xs flex items-center gap-1.5',
                      justStartedReturnId ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'
                    )}>
                      {justStartedReturnId && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
                      {justStartedReturnId
                        ? 'Return created — resolve it in the Returns module. This claim auto-resolves once that return reaches a terminal state.'
                        : "This claim's return is being processed in the Returns module. It resolves automatically once that return reaches a terminal state."}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" className="min-h-11 md:min-h-0" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
