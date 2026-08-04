'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, ChevronsUpDown, HandCoins, Package, Paperclip,
  Plus, Trash2, Upload, X,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { WhItemPicker, type PickerItem } from '@/components/purchase/wh/WhItemPicker'
import { useWarehouses } from '@/hooks/useWarehouses'
import { useWarehouseSubContainers } from '@/hooks/useWarehouseSubContainers'
import { useWarehouseStock } from '@/hooks/useWarehouseOperations'
import { useTeams } from '@/hooks/useTeamSubContainers'
import { usePlaces } from '@/hooks/usePlaceSubContainers'
import {
  useCreateConsumption,
  uploadConsumptionAttachment,
  removeConsumptionAttachment,
  type ConsumerType,
} from '@/hooks/useConsumption'
import { useCanCreateConsumptionFor } from '@/hooks/usePermissions'
import { useDirtyDialogGuard } from '@/hooks/useDirtyDialogGuard'

// ─── Types ──────────────────────────────────────────────────────────────

interface Props {
  open:         boolean
  onOpenChange: (open: boolean) => void
  /**
   * When opened from a Custody card the source WH + sub are pre-filled and
   * locked. When opened from the /consumption page header they start empty.
   */
  presetSource?: {
    warehouseId: string
    subContainerId: string
    subContainerName: string
    kindLabel: 'Team' | 'Place' | 'Warehouse'
  } | null
  /**
   * Restrict which consumer types the operator can pick. When opened from a
   * Custody Team card pass `['team']`; from a Place card pass `['place']`;
   * from the /consumption page header omit to allow all three. The dialog
   * further filters to consumer types the caller has permission for.
   */
  restrictConsumerTypes?: ConsumerType[]
}

type LineRow = { brand_variant_id: string; qty: string }

const COOLDOWN_MS = 3000

// ─── Dialog ─────────────────────────────────────────────────────────────

/**
 * Posts a consumption via rpc_post_consumption. Draining is immediate and
 * COGS is booked to the picked consumer — the amber banner + 3-second
 * confirm cooldown is deliberate friction to prevent misfires.
 */
export function NewConsumptionDialog({ open, onOpenChange, presetSource, restrictConsumerTypes }: Props) {
  // Compute which consumer types this caller is actually allowed to pick.
  // Intersection of (caller permissions) and (restrictConsumerTypes ?? all).
  const canCreateTeam     = useCanCreateConsumptionFor('team')
  const canCreatePlace    = useCanCreateConsumptionFor('place')
  const canCreateInternal = useCanCreateConsumptionFor('internal')
  const allowedConsumerTypes = useMemo<ConsumerType[]>(() => {
    const permAllowed: ConsumerType[] = []
    if (canCreateTeam)     permAllowed.push('team')
    if (canCreatePlace)    permAllowed.push('place')
    if (canCreateInternal) permAllowed.push('internal')
    if (!restrictConsumerTypes) return permAllowed
    return permAllowed.filter((t) => restrictConsumerTypes.includes(t))
  }, [canCreateTeam, canCreatePlace, canCreateInternal, restrictConsumerTypes])

  const { data: warehouses = [] } = useWarehouses({ includeVirtual: true })
  const { data: teams   = [] }    = useTeams()
  const { data: places  = [] }    = usePlaces()

  // ── Source
  const [srcWhId,  setSrcWhId]   = useState(presetSource?.warehouseId ?? '')
  const [srcSubId, setSrcSubId]  = useState<string | null>(presetSource?.subContainerId ?? null)
  const sourceLocked             = !!presetSource

  const { data: srcSubs = [] } = useWarehouseSubContainers(srcWhId || null)
  const eligibleSrcSubs = useMemo(() => srcSubs.filter((s) => s.is_active), [srcSubs])

  // Auto-pick source sub when only one exists (skip when locked).
  useEffect(() => {
    if (sourceLocked) return
    if (eligibleSrcSubs.length === 1) setSrcSubId(eligibleSrcSubs[0].id)
    else if (eligibleSrcSubs.length === 0) setSrcSubId(null)
    else if (srcSubId && !eligibleSrcSubs.some((s) => s.id === srcSubId)) setSrcSubId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcWhId, eligibleSrcSubs.length, sourceLocked])

  // ── Consumer — default to the first allowed type; falls back to 'team'
  // (dialog won't open at all if the caller has zero allowed types since the
  // trigger button will be hidden upstream).
  const [consumerType,     setConsumerType]     = useState<ConsumerType>(allowedConsumerTypes[0] ?? 'team')
  // When opened from a Custody card the consumer IS the same team/place as
  // the source sub — Team 2's custody feeds Team 2. Pre-fill accordingly.
  const initialConsumerTeamSub  = presetSource?.kindLabel === 'Team'  ? presetSource.subContainerId : ''
  const initialConsumerPlaceSub = presetSource?.kindLabel === 'Place' ? presetSource.subContainerId : ''
  const [consumerTeamSub,  setConsumerTeamSub]  = useState<string>(initialConsumerTeamSub)
  const [consumerPlaceSub, setConsumerPlaceSub] = useState<string>(initialConsumerPlaceSub)

  const activeTeams  = useMemo(() => teams.filter((t) => t.is_active), [teams])
  const activePlaces = useMemo(() => places.filter((p) => p.is_active), [places])

  // ── Lines
  const [rows, setRows] = useState<LineRow[]>([{ brand_variant_id: '', qty: '' }])
  const [openPickerIdx, setOpenPickerIdx] = useState<number | null>(null)

  const { data: sourceStock = [] } = useWarehouseStock(srcWhId || undefined, srcSubId)

  const availableQtyMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of sourceStock) {
      map.set(row.brand_variant_id, (map.get(row.brand_variant_id) ?? 0) + (row.available_qty ?? 0))
    }
    return map
  }, [sourceStock])

  const avgCostMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of sourceStock) {
      if (row.qty && row.total_value != null && row.qty > 0) {
        map.set(row.brand_variant_id, row.total_value / row.qty)
      }
    }
    return map
  }, [sourceStock])

  const pickerItems: PickerItem[] = useMemo(
    () => sourceStock.map((s) => ({
      id:            s.brand_variant_id,
      name:          s.item_name ?? '(No name)',
      brand:         s.brand ?? null,
      sku:           s.sku ?? null,
      category:      s.category_name ?? null,
      qty:           availableQtyMap.get(s.brand_variant_id) ?? 0,
      reorderPoint:  0,
      imageUrl:      s.image_url ?? null,
    })),
    [sourceStock, availableQtyMap],
  )

  const selectedIds = useMemo(() => new Set(rows.map((r) => r.brand_variant_id).filter(Boolean)), [rows])

  // ── Notes + attachments
  const [notes, setNotes] = useState('')
  const [attachments, setAttachments] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const submittedRef  = useRef(false)

  const isDirty =
    (!presetSource && (srcWhId !== '' || srcSubId !== null)) ||
    rows.some((r) => r.brand_variant_id !== '' || r.qty !== '') ||
    notes.trim() !== '' ||
    attachments.length > 0

  const { guardedOnOpenChange, confirmDialog } = useDirtyDialogGuard({
    isDirty,
    onOpenChange,
  })
  // Snapshot for cleanup — reset useEffect clears `attachments` before we
  // can read it in the close path, so mirror the list in a ref.
  const attachmentsRef = useRef<string[]>([])
  useEffect(() => { attachmentsRef.current = attachments }, [attachments])

  // ── Cooldown timer — resets on open + on every edit that would change
  // the payload. Confirm button is disabled while remaining > 0.
  const [cooldownEndsAt, setCooldownEndsAt] = useState<number>(0)
  const [now, setNow] = useState<number>(0)
  const cooldownRemaining = Math.max(0, cooldownEndsAt - now)
  const cooldownSecondsLeft = Math.ceil(cooldownRemaining / 1000)

  function bumpCooldown() {
    // Use Date.now() at call-time via a small closure — the cooldown
    // math itself only reads it through the interval below.
    setCooldownEndsAt(Date.now() + COOLDOWN_MS)
  }

  // Reset entire form on close, kick off cooldown on open.
  useEffect(() => {
    if (open) {
      bumpCooldown()
    } else {
      // Close without submit → drop uploads. Consumer bucket has no pending/
      // prefix, so any orphaned file is indistinguishable from a committed
      // one — best to clean them up eagerly.
      if (!submittedRef.current) {
        const orphans = attachmentsRef.current
        if (orphans.length > 0) {
          void Promise.allSettled(orphans.map(removeConsumptionAttachment))
        }
      }
      submittedRef.current = false

      // Reset back to preset (if any) or empty state.
      setSrcWhId(presetSource?.warehouseId ?? '')
      setSrcSubId(presetSource?.subContainerId ?? null)
      setConsumerType(allowedConsumerTypes[0] ?? 'team')
      setConsumerTeamSub(presetSource?.kindLabel === 'Team'  ? presetSource.subContainerId : '')
      setConsumerPlaceSub(presetSource?.kindLabel === 'Place' ? presetSource.subContainerId : '')
      setRows([{ brand_variant_id: '', qty: '' }])
      setOpenPickerIdx(null)
      setNotes('')
      setAttachments([])
      setUploading(false)
      setCooldownEndsAt(0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Tick the countdown chip 4×/second while it matters.
  useEffect(() => {
    if (!open || cooldownRemaining <= 0) return
    const interval = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(interval)
  }, [open, cooldownRemaining])

  // ── Row helpers
  function addRow() {
    setRows((prev) => [...prev, { brand_variant_id: '', qty: '' }])
    bumpCooldown()
  }
  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx))
    bumpCooldown()
  }
  function updateRow(idx: number, field: keyof LineRow, value: string) {
    setRows((prev) => prev.map((row, i) => {
      if (i !== idx) return row
      if (field === 'brand_variant_id') return { brand_variant_id: value, qty: '' }
      return { ...row, [field]: value }
    }))
    bumpCooldown()
  }

  // ── Attachment helpers
  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    setUploading(true)
    try {
      const results = await Promise.allSettled(files.map((f) => uploadConsumptionAttachment(f)))
      const succeeded = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
      const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[]
      if (failed.length > 0) {
        // Roll back partial success so the batch is atomic — user asked for N,
        // gets all-or-nothing rather than a silent partial upload.
        await Promise.allSettled(succeeded.map((p) => removeConsumptionAttachment(p)))
        const firstErr = failed[0].reason
        throw firstErr instanceof Error
          ? firstErr
          : new Error(`${failed.length} of ${files.length} attachments failed to upload`)
      }
      setAttachments((prev) => [...prev, ...succeeded])
      bumpCooldown()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Attachment upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function removeAttachment(path: string) {
    setAttachments((prev) => prev.filter((p) => p !== path))
    // Best-effort background delete — don't block the UI on it.
    void removeConsumptionAttachment(path).catch(() => { /* ignore */ })
    bumpCooldown()
  }

  // ── Row validation
  const rowErrors = useMemo(
    () => rows.map((row) => {
      if (!row.brand_variant_id || !row.qty) return null
      const requested = parseFloat(row.qty)
      if (isNaN(requested) || requested <= 0) return null
      const available = availableQtyMap.get(row.brand_variant_id) ?? 0
      if (requested > available) return `Only ${available} available`
      return null
    }),
    [rows, availableQtyMap],
  )

  // ── Consumer validation
  const consumerResolved = useMemo(() => {
    if (consumerType === 'team')  return !!consumerTeamSub
    if (consumerType === 'place') return !!consumerPlaceSub
    return true // internal — no picker
  }, [consumerType, consumerTeamSub, consumerPlaceSub])

  // ── Submit gate
  const hasValidRows        = rows.some((r) => r.brand_variant_id && r.qty && parseFloat(r.qty) > 0)
  const hasValidationErrors = rowErrors.some((e) => e !== null)
  const srcSubResolved      = eligibleSrcSubs.length > 0 && (eligibleSrcSubs.length === 1 || !!srcSubId)
  const post                = useCreateConsumption()

  const canSubmit =
    !!srcWhId &&
    srcSubResolved &&
    !!srcSubId &&
    consumerResolved &&
    hasValidRows &&
    !hasValidationErrors &&
    !uploading &&
    !post.isPending &&
    cooldownRemaining <= 0

  const consumerLabel = useMemo(() => {
    if (consumerType === 'team')  return activeTeams.find((t)  => t.id === consumerTeamSub)?.name ?? null
    if (consumerType === 'place') return activePlaces.find((p) => p.id === consumerPlaceSub)?.name ?? null
    return 'Internal use'
  }, [consumerType, consumerTeamSub, consumerPlaceSub, activeTeams, activePlaces])

  const linesTotal = useMemo(() => {
    return rows.reduce((sum, r) => {
      const qty = parseFloat(r.qty)
      if (!r.brand_variant_id || isNaN(qty) || qty <= 0) return sum
      const cost = avgCostMap.get(r.brand_variant_id) ?? 0
      return sum + qty * cost
    }, 0)
  }, [rows, avgCostMap])

  async function handleSubmit() {
    if (!srcWhId || !srcSubId) {
      toast.error('Pick a source warehouse + sub-container')
      return
    }
    if (!consumerResolved) {
      toast.error('Pick a consumer')
      return
    }
    const lines = rows
      .filter((r) => r.brand_variant_id && r.qty && parseFloat(r.qty) > 0)
      .map((r) => ({ brand_variant_id: r.brand_variant_id, qty: parseInt(r.qty, 10) }))
    if (lines.length === 0) {
      toast.error('Add at least one line')
      return
    }

    try {
      await post.mutateAsync({
        source_warehouse_id:     srcWhId,
        source_sub_container_id: srcSubId,
        consumer_type:           consumerType,
        consumer_team_sub_id:    consumerType === 'team'  ? consumerTeamSub  : null,
        consumer_place_sub_id:   consumerType === 'place' ? consumerPlaceSub : null,
        notes:                   notes.trim() || null,
        attachments:             attachments,
        lines,
      })
      submittedRef.current = true
      toast.success(`Consumption posted to ${consumerLabel ?? 'consumer'} — stock deducted`)
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to post consumption')
    }
  }

  const QAR = new Intl.NumberFormat('en-QA', { style: 'currency', currency: 'QAR', maximumFractionDigits: 2 })

  return (
    <><Dialog open={open} onOpenChange={guardedOnOpenChange}>
      <DialogContent className="w-full h-full rounded-none sm:rounded-lg sm:w-[46rem] sm:h-[90vh] sm:max-w-[95vw] flex flex-col overflow-hidden p-0">
        <DialogHeader className="px-5 pt-5 pb-0">
          <DialogTitle className="text-sm font-semibold flex items-center gap-1.5">
            <HandCoins className="h-4 w-4 text-primary" />
            New Consumption
          </DialogTitle>
          <p className="text-[11px] text-muted-foreground mt-1">
            Deducts stock from the source and books COGS to the picked consumer immediately.
          </p>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5 pt-3 space-y-4">
          {/* Amber irreversibility warning */}
          <div className="rounded-md border border-warning/40 bg-warning/10 p-2.5 flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
            <div className="text-[11px] text-warning-foreground leading-snug">
              <span className="font-medium">Posting a consumption immediately deducts stock and books COGS.</span>{' '}
              This is not reversible without a manual cancellation.
            </div>
          </div>

          {/* Source */}
          <div className="space-y-2">
            <Label className="text-[11px] font-medium">Source</Label>
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-[10px] text-muted-foreground">Warehouse</Label>
                {sourceLocked ? (
                  <div className="h-9 flex items-center rounded-md border bg-muted/40 px-2.5 text-xs font-medium truncate">
                    {warehouses.find((w) => w.id === srcWhId)?.name ?? 'Warehouse'}
                  </div>
                ) : (
                  <Select
                    value={srcWhId}
                    onValueChange={(v) => { setSrcWhId(v ?? ''); bumpCooldown() }}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Pick source warehouse" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60 overflow-y-auto">
                      {warehouses.map((wh) => (
                        <SelectItem key={wh.id} value={wh.id} className="text-xs">
                          {wh.name}
                          {wh.warehouse_kind && wh.warehouse_kind !== 'general' && (
                            <Badge variant="outline" className="ml-1.5 text-[9px] h-3.5 px-1">{wh.warehouse_kind}</Badge>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="flex-1 space-y-1">
                <Label className="text-[10px] text-muted-foreground">Sub-container</Label>
                {sourceLocked ? (
                  <div className="h-9 flex items-center rounded-md border bg-muted/40 px-2.5 text-xs font-medium truncate">
                    {presetSource?.subContainerName ?? '—'}
                  </div>
                ) : !srcWhId ? (
                  <div className="h-9 flex items-center rounded-md border bg-muted/20 px-2.5 text-[11px] text-muted-foreground italic">
                    Pick warehouse first
                  </div>
                ) : eligibleSrcSubs.length === 0 ? (
                  <div className="h-9 flex items-center rounded-md border border-destructive/40 bg-destructive/5 px-2.5 text-[11px] italic text-destructive">
                    No active sub-container
                  </div>
                ) : eligibleSrcSubs.length === 1 ? (
                  <div className="h-9 flex items-center gap-1.5 rounded-md border bg-muted/40 px-2.5 text-xs font-medium truncate">
                    <span className="truncate">{eligibleSrcSubs[0].name}</span>
                    <Badge variant="outline" className="text-[9px] h-3.5 px-1 shrink-0">Auto</Badge>
                  </div>
                ) : (
                  <Select value={srcSubId ?? ''} onValueChange={(v) => { setSrcSubId(v || null); bumpCooldown() }}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Pick sub-container" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60 overflow-y-auto">
                      {eligibleSrcSubs.map((sc) => (
                        <SelectItem key={sc.id} value={sc.id} className="text-xs">{sc.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </div>

          {/* Consumer */}
          <div className="space-y-2">
            <Label className="text-[11px] font-medium">Consumer</Label>
            {allowedConsumerTypes.length > 1 && (
              <div
                className="grid gap-1 rounded-md border bg-muted/30 p-1"
                style={{ gridTemplateColumns: `repeat(${allowedConsumerTypes.length}, minmax(0, 1fr))` }}
              >
                {(allowedConsumerTypes.map((k) => ({
                  key: k,
                  label: k === 'team' ? 'Team' : k === 'place' ? 'Place' : 'Internal',
                }))).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => { setConsumerType(opt.key); bumpCooldown() }}
                    className={
                      'h-7 rounded text-[11px] font-medium transition-colors ' +
                      (consumerType === opt.key
                        ? 'bg-background shadow-sm text-foreground'
                        : 'text-muted-foreground hover:text-foreground')
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
            {/* Single-option — no pill or segmented control. The Team/Place/
                Internal picker rendered below the section header is enough
                context; the label + sub-picker implies the type. */}

            <div className="min-h-9">
              {consumerType === 'team' && (
                <Select value={consumerTeamSub} onValueChange={(v) => { setConsumerTeamSub(v ?? ''); bumpCooldown() }}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Pick a team…" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    {activeTeams.length === 0 && (
                      <div className="px-2 py-1.5 text-[11px] italic text-muted-foreground">No active teams</div>
                    )}
                    {activeTeams.map((t) => (
                      <SelectItem key={t.id} value={t.id} className="text-xs">
                        {t.name} <span className="text-muted-foreground">— {t.division_name}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {consumerType === 'place' && (
                <Select value={consumerPlaceSub} onValueChange={(v) => { setConsumerPlaceSub(v ?? ''); bumpCooldown() }}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Pick a place…" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    {activePlaces.length === 0 && (
                      <div className="px-2 py-1.5 text-[11px] italic text-muted-foreground">No active places</div>
                    )}
                    {activePlaces.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">
                        {p.name} <span className="text-muted-foreground">— {p.division_name}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {consumerType === 'internal' && (
                <div className="h-9 flex items-center rounded-md border bg-muted/40 px-2.5 text-[11px] text-muted-foreground italic">
                  Internal use — office supplies, samples, tool wear, expiry write-off. No external recipient.
                </div>
              )}
            </div>
          </div>

          {/* Lines */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-[11px] font-medium shrink-0">Items</Label>
              {srcWhId && srcSubId && (
                <span className="text-[10px] text-muted-foreground shrink-0">{sourceStock.length} in stock</span>
              )}
            </div>

            {!srcWhId || !srcSubId ? (
              <div className="flex flex-col items-center justify-center py-6 border border-dashed rounded-lg text-muted-foreground">
                <Package className="h-6 w-6 mb-1.5 opacity-30" />
                <p className="text-[11px]">Pick source warehouse + sub-container first</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {rows.map((row, idx) => {
                  const selected  = sourceStock.find((s) => s.brand_variant_id === row.brand_variant_id)
                  const available = row.brand_variant_id ? (availableQtyMap.get(row.brand_variant_id) ?? 0) : null
                  const unitCost  = row.brand_variant_id ? (avgCostMap.get(row.brand_variant_id) ?? 0) : null
                  const qtyNum    = parseFloat(row.qty)
                  const lineCost  = !isNaN(qtyNum) && unitCost != null ? qtyNum * unitCost : null
                  const error     = rowErrors[idx]
                  return (
                    <div
                      key={idx}
                      className={`rounded-md border p-2.5 space-y-1.5 ${error ? 'border-destructive/50 bg-destructive/5' : 'bg-card'}`}
                    >
                      <Popover open={openPickerIdx === idx} onOpenChange={(o) => setOpenPickerIdx(o ? idx : null)}>
                        <PopoverTrigger className="flex h-8 w-full items-center justify-between rounded-md border border-input bg-background px-2.5 text-[11px] hover:bg-accent/50 cursor-pointer">
                          {selected ? (
                            <span className="truncate">
                              <span className="font-medium">{selected.item_name}</span>
                              {selected.brand && (
                                <span className="text-muted-foreground"> — {selected.brand}</span>
                              )}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Search items…</span>
                          )}
                          <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50 ml-1.5" />
                        </PopoverTrigger>
                        <PopoverContent className="p-0 w-auto" align="start" side="bottom">
                          <WhItemPicker
                            items={pickerItems}
                            selectedIds={selectedIds}
                            currentValue={row.brand_variant_id}
                            onSelect={(id) => { updateRow(idx, 'brand_variant_id', id); setOpenPickerIdx(null) }}
                            showQty
                          />
                        </PopoverContent>
                      </Popover>

                      <div className="flex items-center gap-2 flex-wrap">
                        <Input
                          type="number"
                          className={`h-7 w-[80px] text-[11px] ${error ? 'border-destructive' : ''}`}
                          placeholder="Qty"
                          min="0"
                          value={row.qty}
                          onChange={(e) => updateRow(idx, 'qty', e.target.value)}
                          disabled={!row.brand_variant_id}
                        />
                        {available !== null && (
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                            / {available} {selected?.unit ?? ''}
                          </span>
                        )}
                        {unitCost != null && unitCost > 0 && (
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                            @ {QAR.format(unitCost)}
                          </span>
                        )}
                        {lineCost != null && lineCost > 0 && (
                          <span className="text-[10px] font-medium tabular-nums text-foreground whitespace-nowrap">
                            = {QAR.format(lineCost)}
                          </span>
                        )}
                        {error && <span className="text-[10px] text-destructive shrink-0 ml-auto">{error}</span>}
                        {rows.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive shrink-0 ml-auto"
                            onClick={() => removeRow(idx)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full h-8 text-[11px] gap-1 border-dashed"
                  onClick={addRow}
                >
                  <Plus className="h-3 w-3" /> Add Item
                </Button>

                {linesTotal > 0 && (
                  <div className="flex items-center justify-end gap-2 pt-1 text-[11px]">
                    <span className="text-muted-foreground">Estimated cost:</span>
                    <span className="font-semibold tabular-nums">{QAR.format(linesTotal)}</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1 font-normal">preview</Badge>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Notes</Label>
            <Textarea
              className="text-[11px] min-h-[48px] resize-none"
              placeholder="Optional context (job ref, site visit, WO number, etc.)"
              value={notes}
              onChange={(e) => { setNotes(e.target.value); bumpCooldown() }}
            />
          </div>

          {/* Attachments */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Paperclip className="h-3 w-3" /> Attachments
              </Label>
              <span className="text-[10px] text-muted-foreground">Max 10 MB per file</span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFilePick}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full h-8 text-[11px] gap-1 border-dashed"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="h-3 w-3" />
              {uploading ? 'Uploading…' : 'Add file(s)'}
            </Button>
            {attachments.length > 0 && (
              <div className="space-y-1 mt-1">
                {attachments.map((path) => (
                  <div key={path} className="flex items-center gap-1.5 rounded-md border bg-muted/30 px-2 py-1 text-[10px]">
                    <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="truncate flex-1">{path.split('/').pop()}</span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(path)}
                      className="text-muted-foreground hover:text-destructive shrink-0"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="m-0 px-5 py-3 border-t bg-muted/30 rounded-b-lg gap-2 sm:gap-2 flex-row items-center justify-between sm:justify-between">
          <div className="text-[10px] text-muted-foreground">
            {cooldownRemaining > 0 ? (
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-warning animate-pulse" />
                Confirm enabled in {cooldownSecondsLeft}s
              </span>
            ) : canSubmit ? (
              <span className="text-success">Ready to post</span>
            ) : (
              <span>Fill required fields</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="text-[11px] h-8" onClick={() => guardedOnOpenChange(false)} disabled={post.isPending}>
              Cancel
            </Button>
            <Button size="sm" className="text-[11px] h-8 min-w-[130px]" disabled={!canSubmit} onClick={handleSubmit}>
              {post.isPending
                ? 'Posting…'
                : cooldownRemaining > 0
                  ? `Confirm (${cooldownSecondsLeft}s)`
                  : 'Confirm & Post'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

    </Dialog>{confirmDialog}</>
  )
}
