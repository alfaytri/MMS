'use client'

import React, { useMemo, useState, useCallback, useEffect } from 'react'
import { ArrowRight, CheckCircle2, XCircle, Truck, PackageCheck, Ban, ChevronLeft, ChevronRight as ChevronRightIcon } from 'lucide-react'
import { WarehouseReportButton } from './WarehouseReportButton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { ItemTreeCell } from './ItemTreeCell'
import {
  useWarehouseTransfers,
  useDispatchTransfer,
  useReceiveTransfer,
  useCancelTransfer,
  useRejectTransfer,
  useWarehouseStock,
  type WarehouseTransfer,
} from '@/hooks/useWarehouseOperations'
import { useHasPermission } from '@/hooks/usePermissions'
import { shortenSubContainerName, useDivisionScopedVisibility } from '@/hooks/useWarehouseSubContainers'
import type { Warehouse } from '@/hooks/useWarehouses'
import type { Profile } from '@/hooks/useProfiles'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { getRecipientsForPermission, recipientsForNotification } from '@/lib/notify'

/* ─── Status badge styles ────────────────────────────────────────────────── */

const STATUS_STYLES: Record<string, string> = {
  pending:          'bg-muted text-muted-foreground',
  in_transit:       'bg-primary/10 text-primary',
  received:         'bg-success/10 text-success',
  rejected:         'bg-destructive/10 text-destructive',
  cancelled:        'bg-muted text-muted-foreground line-through',
  // Legacy statuses (kept for historical data)
  pending_approval: 'bg-warning/10 text-warning',
  approved:         'bg-success/10 text-success',
}

const SHRINKAGE_REASONS = [
  { value: 'damaged_in_transit', label: 'Damaged in Transit' },
  { value: 'missing',           label: 'Missing' },
  { value: 'wrong_item',        label: 'Wrong Item' },
  { value: 'other',             label: 'Other' },
] as const

/* ─── Props ──────────────────────────────────────────────────────────────── */

interface Props {
  warehouses: Warehouse[]
  currentProfile: Profile | null
}

/* ─── Component ──────────────────────────────────────────────────────────── */

export const WhTransfersTab = React.memo(function WhTransfersTab({ warehouses, currentProfile }: Props) {
  const { data: transfers = [] } = useWarehouseTransfers()
  const { data: fullStock = [] } = useWarehouseStock()
  const divVisible = useDivisionScopedVisibility()
  // Division-scoped: show a transfer if either end is in the active-division view.
  const scopedTransfers = useMemo(
    () => transfers.filter((t) => divVisible(t.from_sub_container_id) || divVisible(t.to_sub_container_id)),
    [transfers, divVisible],
  )

  const dispatchMutation = useDispatchTransfer()
  const receiveMutation  = useReceiveTransfer()
  const cancelMutation   = useCancelTransfer()
  const rejectMutation   = useRejectTransfer()

  const isInventoryManager = useHasPermission('warehouse.transfer.approve')

  // ── Receival inline form state ──
  const [expandedReceival, setExpandedReceival] = useState<string | null>(null)
  const [receivalQtys, setReceivalQtys] = useState<Record<string, number>>({})
  const [shrinkageReasons, setShrinkageReasons] = useState<Record<string, string>>({})

  // ── Cancel confirmation state ──
  const [cancelTarget, setCancelTarget] = useState<WarehouseTransfer | null>(null)

  // ── Variant meta for ItemTreeCell ──
  const variantMeta = useMemo(() => {
    const map = new Map<string, { categoryName: string | null; subcategoryName: string | null; itemType: string | null; itemName: string; brand: string | null; origin: string | null; sku: string | null }>()
    for (const s of fullStock) {
      if (!map.has(s.brand_variant_id)) {
        map.set(s.brand_variant_id, {
          categoryName: s.category_name ?? null,
          subcategoryName: s.subcategory_name ?? null,
          itemType: s.item_type ?? null,
          itemName: s.item_name,
          brand: s.brand ?? null,
          origin: s.country_name ?? null,
          sku: s.sku ?? null,
        })
      }
    }
    return map
  }, [fullStock])

  /* ── Authorization helpers ─────────────────────────────────────────────── */

  const isFieldRPOf = useCallback((warehouseId: string): boolean => {
    const wh = warehouses.find(w => w.id === warehouseId)
    return wh?.responsible_persons.some((rp: { profile_id: string }) => rp.profile_id === currentProfile?.id) ?? false
  }, [warehouses, currentProfile?.id])

  const canDispatch = useCallback((t: WarehouseTransfer): boolean => {
    return t.status === 'pending' && isFieldRPOf(t.from_warehouse_id)
  }, [isFieldRPOf])

  const canReceive = useCallback((t: WarehouseTransfer): boolean => {
    return t.status === 'in_transit' && isFieldRPOf(t.to_warehouse_id)
  }, [isFieldRPOf])

  const canCancel = useCallback((t: WarehouseTransfer): boolean => {
    return (t.status === 'pending' || t.status === 'in_transit') &&
      (t.created_by_profile_id === currentProfile?.id || isInventoryManager)
  }, [currentProfile?.id, isInventoryManager])

  const canReject = useCallback((t: WarehouseTransfer): boolean => {
    return t.status === 'pending' && isFieldRPOf(t.from_warehouse_id)
  }, [isFieldRPOf])

  /* ── Notification helpers ──────────────────────────────────────────────── */

  async function sendNotification(
    profileIds: string[],
    type: string,
    title: string,
    body: string,
    relatedId: string,
  ) {
    if (profileIds.length === 0) return
    const supabase = createClient()
    const rows = profileIds.map(pid => ({
      profile_id: pid,
      type,
      title,
      body,
      related_id: relatedId,
      related_type: 'warehouse_transfer',
    }))
    await supabase.from('notifications').insert(rows)
  }

  // Recipient resolution now flows through getRecipientsForPermission (Phase 2) —
  // the ad-hoc warehouse-RP and hardcoded inventory_manager queries were removed.

  /* ── Action handlers ───────────────────────────────────────────────────── */

  function handleDispatch(t: WarehouseTransfer) {
    if (!currentProfile) return
    dispatchMutation.mutate(
      { id: t.id, profileId: currentProfile.id, profileName: currentProfile.full_name ?? '' },
      {
        onSuccess: async () => {
          toast.success('Transfer dispatched')
          const destRPs = await recipientsForNotification('transfer_dispatched', { warehouseId: t.to_warehouse_id })
          sendNotification(
            destRPs,
            'transfer_dispatched',
            'Stock Transfer Dispatched',
            `Transfer ${t.transfer_number} has been dispatched by ${currentProfile.full_name ?? 'Source RP'}.`,
            t.id,
          )
        },
        onError: (e) => toast.error(e.message),
      },
    )
  }

  function handleStartReceival(t: WarehouseTransfer) {
    const items = t.transfer_items ?? []
    const qtys: Record<string, number> = {}
    for (const item of items) {
      qtys[item.id] = item.dispatched_qty ?? 0
    }
    setReceivalQtys(qtys)
    setShrinkageReasons({})
    setExpandedReceival(t.id)
  }

  function handleConfirmReceival(t: WarehouseTransfer) {
    if (!currentProfile) return
    const items = t.transfer_items ?? []
    const receivedItems = items.map(item => {
      const receivedQty = receivalQtys[item.id] ?? item.dispatched_qty ?? 0
      const dispatchedQty = item.dispatched_qty ?? 0
      return {
        transfer_item_id: item.id,
        received_qty: receivedQty,
        shrinkage_reason: receivedQty < dispatchedQty
          ? (shrinkageReasons[item.id] ?? 'missing')
          : undefined,
      }
    })

    const hasShrinkage = receivedItems.some(ri => ri.shrinkage_reason)

    receiveMutation.mutate(
      {
        id: t.id,
        profileId: currentProfile.id,
        profileName: currentProfile.full_name ?? '',
        receivedItems,
      },
      {
        onSuccess: async () => {
          toast.success('Transfer received')
          setExpandedReceival(null)

          // Notify creator
          const targets: string[] = []
          if (t.created_by_profile_id) targets.push(t.created_by_profile_id)

          if (hasShrinkage) {
            // Also notify transfer-override holders (Inventory Managers) on shrinkage
            const managers = await getRecipientsForPermission('warehouse.transfer.approve')
            for (const pid of managers) {
              if (!targets.includes(pid)) targets.push(pid)
            }
          }

          sendNotification(
            targets,
            hasShrinkage ? 'transfer_received_shrinkage' : 'transfer_received',
            hasShrinkage ? 'Transfer Received with Shrinkage' : 'Stock Transfer Received',
            hasShrinkage
              ? `Transfer ${t.transfer_number} was received with shrinkage by ${currentProfile.full_name ?? 'Destination RP'}.`
              : `Transfer ${t.transfer_number} has been received by ${currentProfile.full_name ?? 'Destination RP'}.`,
            t.id,
          )
        },
        onError: (e) => toast.error(e.message),
      },
    )
  }

  function handleReject(t: WarehouseTransfer) {
    if (!currentProfile) return
    rejectMutation.mutate(
      { id: t.id, profileId: currentProfile.id, profileName: currentProfile.full_name ?? '' },
      {
        onSuccess: () => {
          toast.success('Transfer rejected')
          if (t.created_by_profile_id) {
            sendNotification(
              [t.created_by_profile_id],
              'transfer_rejected',
              'Stock Transfer Rejected',
              `Your transfer ${t.transfer_number} was rejected by ${currentProfile.full_name ?? 'Source RP'}.`,
              t.id,
            )
          }
        },
        onError: (e) => toast.error(e.message),
      },
    )
  }

  function handleCancelConfirm() {
    if (!currentProfile || !cancelTarget) return
    const t = cancelTarget
    cancelMutation.mutate(
      { id: t.id, profileId: currentProfile.id, profileName: currentProfile.full_name ?? '' },
      {
        onSuccess: async () => {
          toast.success('Transfer cancelled')
          setCancelTarget(null)

          // Notify transfer-viewers who are RPs of either warehouse (+ override holders).
          const [srcRPs, destRPs] = await Promise.all([
            getRecipientsForPermission('warehouse.transfers.view', { warehouseId: t.from_warehouse_id, override: 'warehouse.transfer.approve' }),
            getRecipientsForPermission('warehouse.transfers.view', { warehouseId: t.to_warehouse_id, override: 'warehouse.transfer.approve' }),
          ])
          const allRPs = [...new Set([...srcRPs, ...destRPs])]
          sendNotification(
            allRPs,
            'transfer_cancelled',
            'Stock Transfer Cancelled',
            `Transfer ${t.transfer_number} has been cancelled by ${currentProfile.full_name ?? 'User'}.`,
            t.id,
          )
        },
        onError: (e) => {
          toast.error(e.message)
          setCancelTarget(null)
        },
      },
    )
  }

  const [page, setPage] = useState(1)
  const PAGE_SIZE = 25
  const totalPages = Math.max(1, Math.ceil(scopedTransfers.length / PAGE_SIZE))
  useEffect(() => { setPage(1) }, [scopedTransfers.length])
  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return scopedTransfers.slice(start, start + PAGE_SIZE)
  }, [scopedTransfers, page])

  /* ── Empty state ───────────────────────────────────────────────────────── */

  if (scopedTransfers.length === 0) {
    return (
      <div className="p-4 md:p-6 flex items-center justify-center h-40">
        <p className="text-xs text-muted-foreground">No transfers yet.</p>
      </div>
    )
  }

  /* ── Render ─────────────────────────────────────────────────────────────── */

  return (
    <>
      <div className="p-4 md:p-6 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-semibold">Transfers</h3>
          <div className="flex-shrink-0">
            <WarehouseReportButton reportType="transfers" label="Report" />
          </div>
        </div>
        {paged.map((t) => {
          const showDispatch = canDispatch(t)
          const showReceive  = canReceive(t)
          const showCancel   = canCancel(t)
          const showReject   = canReject(t)
          const isReceivalExpanded = expandedReceival === t.id

          return (
            <div
              key={t.id}
              className={`rounded-lg border p-4 ${
                t.status === 'pending' ? 'border-muted-foreground/20' :
                t.status === 'in_transit' ? 'border-primary/30 bg-primary/5' :
                ''
              }`}
            >
              {/* ── Header row ── */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className="text-xs font-semibold text-primary">{t.transfer_number}</span>
                  <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_STYLES[t.status] ?? 'bg-muted text-muted-foreground'}`}>
                    {t.status.replace(/_/g, ' ')}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {t.date ? format(new Date(t.date), 'dd MMM yyyy') : ''}
                  </span>
                </div>

                {/* ── Action buttons ── */}
                <div className="flex items-center gap-1 flex-shrink-0 flex-wrap">
                  {showDispatch && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 min-h-11 sm:min-h-0 text-[10px] gap-1 text-primary border-primary/30 hover:bg-primary/10"
                      onClick={() => handleDispatch(t)}
                      disabled={dispatchMutation.isPending}
                    >
                      <Truck className="h-3 w-3" /> Dispatch
                    </Button>
                  )}
                  {showReceive && !isReceivalExpanded && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 min-h-11 sm:min-h-0 text-[10px] gap-1 text-success border-success/30 hover:bg-success/10"
                      onClick={() => handleStartReceival(t)}
                    >
                      <PackageCheck className="h-3 w-3" /> Receive
                    </Button>
                  )}
                  {showReject && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 min-h-11 sm:min-h-0 text-[10px] gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                      onClick={() => handleReject(t)}
                      disabled={rejectMutation.isPending}
                    >
                      <XCircle className="h-3 w-3" /> Reject
                    </Button>
                  )}
                  {showCancel && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 min-h-11 sm:min-h-0 text-[10px] gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                      onClick={() => setCancelTarget(t)}
                      disabled={cancelMutation.isPending}
                    >
                      <Ban className="h-3 w-3" /> Cancel
                    </Button>
                  )}
                </div>
              </div>

              {/* ── Route ── */}
              <div className="text-xs mb-2 flex items-center gap-1.5 flex-wrap text-muted-foreground">
                <span className="text-foreground font-medium">{t.from_warehouse?.name ?? 'Unknown'}</span>
                {t.from_sub_container_name && (
                  <span className="text-[10px] text-muted-foreground border border-border rounded px-1 py-0.5">
                    {shortenSubContainerName(t.from_sub_container_name, t.from_warehouse?.name ?? '')}
                  </span>
                )}
                <ArrowRight className="h-3 w-3" />
                <span className="text-foreground font-medium">{t.to_warehouse?.name ?? 'Unknown'}</span>
                {t.to_sub_container_name && (
                  <span className="text-[10px] text-muted-foreground border border-border rounded px-1 py-0.5">
                    {shortenSubContainerName(t.to_sub_container_name, t.to_warehouse?.name ?? '')}
                  </span>
                )}
                {t.created_by_name && <span>· by {t.created_by_name}</span>}
              </div>

              {/* ── Timeline ── */}
              <div className="flex flex-col gap-0.5 mb-2">
                {t.dispatched_by_name && (
                  <span className="text-[10px] text-primary">
                    {'· Dispatched by '}
                    {t.dispatched_by_name}
                    {t.dispatched_at ? ` on ${format(new Date(t.dispatched_at), 'dd MMM')}` : ''}
                  </span>
                )}
                {t.received_by_name && (
                  <span className="text-[10px] text-success">
                    {'· Received by '}
                    {t.received_by_name}
                    {t.received_at ? ` on ${format(new Date(t.received_at), 'dd MMM')}` : ''}
                  </span>
                )}
                {t.cancelled_by_name && (
                  <span className="text-[10px] text-destructive">
                    {'· Cancelled by '}
                    {t.cancelled_by_name}
                    {t.cancelled_at ? ` on ${format(new Date(t.cancelled_at), 'dd MMM')}` : ''}
                  </span>
                )}
              </div>

              {/* ── Items ── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 mt-1">
                {(t.transfer_items ?? []).map((item) => {
                  const meta = variantMeta.get(item.brand_variant_id)
                  return (
                    <div key={item.id} className="flex items-start gap-2 border rounded px-2 py-1.5">
                      <Badge variant="outline" className="text-[10px] mt-0.5 shrink-0">
                        {item.requested_qty}&times;
                      </Badge>
                      <ItemTreeCell
                        category={meta?.categoryName}
                        subcategory={meta?.subcategoryName}
                        itemType={meta?.itemType}
                        itemName={meta?.itemName ?? item.item_name}
                        brand={meta?.brand}
                        origin={meta?.origin ?? null}
                        sku={meta?.sku ?? item.sku}
                        showSku
                      />
                      {item.shrinkage_qty > 0 && (
                        <Badge className="text-[9px] bg-destructive/10 text-destructive ml-auto shrink-0">
                          -{item.shrinkage_qty} shrinkage
                        </Badge>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* ── Notes ── */}
              {t.notes && (
                <p className="text-[10px] text-muted-foreground mt-1.5">{t.notes}</p>
              )}

              {/* ── Receival sub-form (inline expandable) ── */}
              {isReceivalExpanded && (
                <ReceivalSubForm
                  transfer={t}
                  receivalQtys={receivalQtys}
                  shrinkageReasons={shrinkageReasons}
                  onQtyChange={(itemId, qty) =>
                    setReceivalQtys(prev => ({ ...prev, [itemId]: qty }))
                  }
                  onReasonChange={(itemId, reason) =>
                    setShrinkageReasons(prev => ({ ...prev, [itemId]: reason }))
                  }
                  onConfirm={() => handleConfirmReceival(t)}
                  onCancel={() => setExpandedReceival(null)}
                  isPending={receiveMutation.isPending}
                  variantMeta={variantMeta}
                />
              )}
            </div>
          )
        })}
        {transfers.length > 0 && totalPages > 1 && (
          <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
            <span>{transfers.length} transfer{transfers.length !== 1 ? 's' : ''}</span>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" className="h-7 w-7 p-0 min-h-11 min-w-11 md:min-h-0 md:min-w-0" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} aria-label="Previous page">
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="tabular-nums min-w-[80px] text-center">Page {page} of {totalPages}</span>
              <Button variant="outline" size="sm" className="h-7 w-7 p-0 min-h-11 min-w-11 md:min-h-0 md:min-w-0" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} aria-label="Next page">
                <ChevronRightIcon className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Cancel confirmation AlertDialog ── */}
      <AlertDialog open={!!cancelTarget} onOpenChange={(open) => { if (!open) setCancelTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Transfer?</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel transfer <span className="font-semibold">{cancelTarget?.transfer_number}</span>.
              {cancelTarget?.status === 'in_transit' && ' The items are currently in transit and stock will be reversed.'}
              {' '}This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCancelTarget(null)}>Keep</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Cancel Transfer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
})

/* ─── Receival Sub-Form ──────────────────────────────────────────────────── */

function ReceivalSubForm({
  transfer,
  receivalQtys,
  shrinkageReasons,
  onQtyChange,
  onReasonChange,
  onConfirm,
  onCancel,
  isPending,
  variantMeta,
}: {
  transfer: WarehouseTransfer
  receivalQtys: Record<string, number>
  shrinkageReasons: Record<string, string>
  onQtyChange: (itemId: string, qty: number) => void
  onReasonChange: (itemId: string, reason: string) => void
  onConfirm: () => void
  onCancel: () => void
  isPending: boolean
  variantMeta: Map<string, { categoryName: string | null; subcategoryName: string | null; itemType: string | null; itemName: string; brand: string | null; origin: string | null; sku: string | null }>
}) {
  const items = transfer.transfer_items ?? []

  return (
    <div className="mt-3 border-t pt-3 space-y-2">
      <p className="text-xs font-semibold text-foreground">Confirm Receival</p>

      <div className="space-y-2">
        {items.map((item) => {
          const meta = variantMeta.get(item.brand_variant_id)
          const dispatchedQty = item.dispatched_qty ?? 0
          const receivedQty = receivalQtys[item.id] ?? dispatchedQty
          const hasShrinkage = receivedQty < dispatchedQty

          return (
            <div key={item.id} className="border rounded-lg p-2 space-y-1.5">
              <div className="flex items-start gap-2">
                <ItemTreeCell
                  category={meta?.categoryName}
                  itemType={meta?.itemType}
                  itemName={meta?.itemName ?? item.item_name}
                  brand={meta?.brand}
                  origin={meta?.origin ?? null}
                  sku={meta?.sku ?? item.sku}
                  showSku
                />
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">Dispatched:</span>
                  <span className="text-xs font-medium">{dispatchedQty}</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">Received:</span>
                  <Input
                    type="number"
                    min={0}
                    max={dispatchedQty}
                    value={receivedQty}
                    onChange={(e) => {
                      const val = Math.max(0, Math.min(dispatchedQty, Number(e.target.value) || 0))
                      onQtyChange(item.id, val)
                    }}
                    className="h-7 w-16 text-xs"
                  />
                </div>

                {hasShrinkage && (
                  <div className="flex items-center gap-1.5">
                    <Badge className="text-[9px] bg-destructive/10 text-destructive shrink-0">
                      -{dispatchedQty - receivedQty}
                    </Badge>
                    <Select
                      value={shrinkageReasons[item.id] ?? 'missing'}
                      onValueChange={(v) => v && onReasonChange(item.id, v)}
                    >
                      <SelectTrigger className="h-7 w-36 text-[10px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-60 overflow-y-auto">
                        {SHRINKAGE_REASONS.map((r) => (
                          <SelectItem key={r.value} value={r.value} className="text-xs">
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm"
          className="h-8 min-h-11 sm:min-h-0 text-xs gap-1"
          onClick={onConfirm}
          disabled={isPending}
        >
          <CheckCircle2 className="h-3.5 w-3.5" /> Confirm Receival
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 min-h-11 sm:min-h-0 text-xs"
          onClick={onCancel}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}
