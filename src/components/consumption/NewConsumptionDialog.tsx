'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, ChevronsUpDown, HandCoins, Package, Paperclip,
  Plus, Trash2, Upload, Users2, X,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { WhItemPicker, type PickerItem } from '@/components/purchase/wh/WhItemPicker'
import { useVariantItemMeta } from '@/hooks/useVariantCategoryPaths'
import { ItemLabel } from '@/components/shared/ItemLabel'
import { useWarehouseStock } from '@/hooks/useWarehouseOperations'
import { useCustodyLocations } from '@/hooks/useCustodyLocations'
import {
  useCreateConsumption,
  useMyConsumptionSources,
  useTeamItemVariantIds,
  uploadConsumptionAttachment,
  removeConsumptionAttachment,
  type ConsumerType,
} from '@/hooks/useConsumption'
import { useProjectMilestones, usePoolDisciplines } from '@/hooks/useProjectMilestones'
import { useCanCreateConsumptionFor, useHasPermission } from '@/hooks/usePermissions'
import { useUserDivisionScope } from '@/hooks/useUserDivisionScope'
import { useDirtyDialogGuard } from '@/hooks/useDirtyDialogGuard'
import { useIsSmUp } from '@/hooks/useIsSmUp'

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
    kindLabel: 'Custody' | 'Warehouse'
  } | null
  /**
   * Restrict which consumer types the operator can pick. When opened from a
   * Custody card pass `['custody']`; from the /consumption page header omit to
   * allow both. The dialog further filters to consumer types the caller has
   * permission for.
   */
  restrictConsumerTypes?: ConsumerType[]
  /**
   * Seeds the in-dialog Service/Team toggle when the dialog opens. 'service'
   * hides team-items from the item picker; 'team' shows ONLY team-items (and,
   * on the /consumption header where the source is pickable, restricts the
   * source to custody holdings). The operator flips it inside the dialog — this
   * is only the starting selection, re-read on every open. Defaults to 'service'.
   */
  initialMode?: 'service' | 'team'
}

type LineRow = { brand_variant_id: string; qty: string }

const COOLDOWN_MS = 3000
// A line consuming this share (or more) of the available stock is flagged in
// the confirmation modal as a likely fat-finger — the operator must eyeball it.
const HIGH_SHARE_RATIO = 0.9

/**
 * Consumption qty is a whole-unit integer (`consumption_lines.qty` is `int`).
 * Parse it the SAME way for validation and submission so a stray decimal can
 * never validate as one value and post as another.
 */
const parseQty = (s: string): number => parseInt(s, 10)

// Natural/numeric collation so "Team 2" sorts before "Team 10" in the picker.
const LOC_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

// ─── Dialog ─────────────────────────────────────────────────────────────

/**
 * Posts a consumption via rpc_post_consumption. Draining is immediate and
 * COGS is booked to the picked consumer. Confirming is a deliberate two-step:
 * the main dialog gathers the lines, then a confirmation modal highlights
 * exactly what is about to be consumed and holds a 3-second cooldown on its
 * confirm button before the post can fire.
 */
export function NewConsumptionDialog({ open, onOpenChange, presetSource, restrictConsumerTypes, initialMode }: Props) {
  // Compute which consumer types this caller is actually allowed to pick.
  // Intersection of (caller permissions) and (restrictConsumerTypes ?? all).
  const canCreateCustody  = useCanCreateConsumptionFor('custody')
  const canCreateInternal = useCanCreateConsumptionFor('internal')
  // Cost is accounting-sensitive: field teams post consumption but must not see
  // COGS. Gate every money figure (unit cost, line cost, totals) behind the
  // dedicated consumption-cost permission (kept separate from item pricing).
  const canSeeCost = useHasPermission('consumption.cost.view')
  const allowedConsumerTypes = useMemo<ConsumerType[]>(() => {
    const permAllowed: ConsumerType[] = []
    if (canCreateCustody)  permAllowed.push('custody')
    if (canCreateInternal) permAllowed.push('internal')
    if (!restrictConsumerTypes) return permAllowed
    return permAllowed.filter((t) => restrictConsumerTypes.includes(t))
  }, [canCreateCustody, canCreateInternal, restrictConsumerTypes])

  const { data: sources = [] } = useMyConsumptionSources()
  const { data: locations = [] } = useCustodyLocations()
  // Team-item variant set — scopes the item picker per mode (Service excludes
  // team-items, Team shows only team-items). undefined while loading.
  const { data: teamVariantIds } = useTeamItemVariantIds()

  // Service vs Team split now lives INSIDE the dialog (operator: the switch must
  // be part of the consume flow, not a page-level tab). `initialMode` only seeds
  // the starting selection; this toggle owns it from here on.
  const [mode, setMode] = useState<'service' | 'team'>(initialMode ?? 'service')

  // Phones get a full-screen sheet for the item picker; sm+ keeps the popover.
  const isSmUp = useIsSmUp()

  // In Team mode the source must be a custody holding (a team consumes what it
  // holds); Service callers keep all assigned sources.
  const modeSources = useMemo(
    () => (mode === 'team' ? sources.filter((s) => s.warehouse_kind === 'custody') : sources),
    [sources, mode],
  )

  // Consumer scope: a regular user may only book COGS to custody locations in
  // the division(s) they belong to. Owner/Accountant (super-viewers) oversee
  // every division, so they see all.
  const { isSuperViewer, userDivisionIds } = useUserDivisionScope()

  // Distinct warehouses the user is allowed to consume from (assigned only —
  // the picker mirrors what rpc_post_consumption will actually accept).
  const srcWarehouses = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>()
    for (const s of modeSources) {
      if (!map.has(s.warehouse_id)) map.set(s.warehouse_id, { id: s.warehouse_id, name: s.warehouse_name })
    }
    return Array.from(map.values())
  }, [modeSources])

  // ── Source
  const [srcWhId,  setSrcWhId]   = useState(presetSource?.warehouseId ?? '')
  const [srcSubId, setSrcSubId]  = useState<string | null>(presetSource?.subContainerId ?? null)
  const sourceLocked             = !!presetSource

  const eligibleSrcSubs = useMemo(
    () => modeSources
      .filter((s) => s.warehouse_id === srcWhId)
      .map((s) => ({ id: s.sub_container_id, name: s.sub_container_name })),
    [modeSources, srcWhId],
  )

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
  const [consumerType, setConsumerType] = useState<ConsumerType>(allowedConsumerTypes[0] ?? 'custody')
  // When opened from a Custody card the consumer IS the same location as the
  // source sub — Team 2's custody feeds Team 2. Pre-fill accordingly.
  const initialConsumerSub = presetSource?.kindLabel === 'Custody' ? presetSource.subContainerId : ''
  const [consumerSub, setConsumerSub] = useState<string>(initialConsumerSub)

  const activeLocations = useMemo(() => locations.filter((l) => l.is_active), [locations])

  // Scope the consumer picker to the user's division(s). Super-viewers see all.
  const visibleLocations = useMemo(() => {
    if (isSuperViewer) return activeLocations
    const allowed = new Set(userDivisionIds)
    return activeLocations.filter((l) => allowed.has(l.division_id ?? ''))
  }, [activeLocations, isSuperViewer, userDivisionIds])

  // Cascade for the consumer picker: Type (custody warehouse) → Division (only
  // when the type spans 2+) → Location. Keeps a 100-team list out of one
  // dropdown. '' = unset; '__nodiv__' = a location carrying no division.
  const [custodyWhId, setCustodyWhId]   = useState<string>('')
  const [custodyDivId, setCustodyDivId] = useState<string>('')

  const custodyTypes = useMemo(() => {
    const m = new Map<string, string>()
    for (const l of visibleLocations) if (!m.has(l.warehouse_id)) m.set(l.warehouse_id, l.warehouse_name)
    return Array.from(m, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [visibleLocations])

  const divisionsForType = useMemo(() => {
    const m = new Map<string, string>()
    for (const l of visibleLocations) {
      if (l.warehouse_id !== custodyWhId) continue
      const id = l.division_id ?? '__nodiv__'
      if (!m.has(id)) m.set(id, l.division_name ?? 'Unassigned')
    }
    return Array.from(m, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [visibleLocations, custodyWhId])

  const needsDivisionStep = divisionsForType.length > 1

  const locationsForSelection = useMemo(() => (
    visibleLocations
      .filter((l) => l.warehouse_id === custodyWhId && (!custodyDivId || (l.division_id ?? '__nodiv__') === custodyDivId))
      .sort((a, b) => LOC_COLLATOR.compare(a.name, b.name))
  ), [visibleLocations, custodyWhId, custodyDivId])

  // Auto-pick the only type; clear a stale one. Skipped while opened from a
  // custody card (sourceLocked) — consumerSub is fixed to that card there.
  useEffect(() => {
    if (sourceLocked) return
    if (custodyTypes.length === 1) { if (custodyWhId !== custodyTypes[0].id) setCustodyWhId(custodyTypes[0].id) }
    else if (custodyWhId && !custodyTypes.some((t) => t.id === custodyWhId)) setCustodyWhId('')
  }, [sourceLocked, custodyTypes, custodyWhId])

  // Auto-pick the only division for the chosen type; clear a stale one.
  useEffect(() => {
    if (sourceLocked) return
    if (!custodyWhId) { if (custodyDivId) setCustodyDivId(''); return }
    if (divisionsForType.length === 1) { if (custodyDivId !== divisionsForType[0].id) setCustodyDivId(divisionsForType[0].id) }
    else if (custodyDivId && !divisionsForType.some((d) => d.id === custodyDivId)) setCustodyDivId('')
  }, [sourceLocked, custodyWhId, divisionsForType, custodyDivId])

  // Drop the chosen location when it falls outside the current type + division.
  useEffect(() => {
    if (sourceLocked) return
    if (consumerSub && !locationsForSelection.some((l) => l.id === consumerSub)) setConsumerSub('')
  }, [sourceLocked, locationsForSelection, consumerSub])

  // ── Discipline + Milestone (optional project spend tags) ──────────────
  // Both tie to consumerSub (the CONSUMER project pool), not the source. A
  // project pool carries disciplines; picking one scopes the milestone list
  // and tags the spend (mirrors rpc_post_consumption's p_discipline_id /
  // p_milestone_id guards). A non-project custody sub has neither → both
  // pickers stay hidden.
  const consumerPool = consumerType === 'custody' && consumerSub ? consumerSub : null
  const { data: poolDisciplines = [] } = usePoolDisciplines(consumerPool)
  // null = unselected. Base UI Select renders BLANK for a sentinel string that
  // matches no item (never falling back to the placeholder), so the unselected
  // state must be null for the "Select …" placeholder to show.
  const [disciplineId, setDisciplineId] = useState<string | null>(null)
  const resolvedDisciplineId = useMemo(
    () => (consumerType === 'custody' && disciplineId ? disciplineId : null),
    [consumerType, disciplineId],
  )
  // Milestones only load once a discipline is picked — a milestone belongs to
  // a (pool, discipline), so an unscoped list would mix disciplines.
  const { data: milestones = [] } = useProjectMilestones(
    resolvedDisciplineId ? consumerPool : null,
    resolvedDisciplineId,
  )
  const [milestoneId, setMilestoneId] = useState<string | null>(null)
  // Free-text project code (a cost / WO / drawing ref). Required for a
  // project-pool consumer; independent of discipline, so it survives a discipline
  // change — only a new consumer/type clears it.
  const [code, setCode] = useState('')
  // Reset the discipline (+ code) when the consumer/type changes; reset the
  // milestone when the discipline (or consumer/type) changes — a tag picked for a
  // previous discipline must never carry over.
  useEffect(() => {
    setDisciplineId(null)
    setCode('')
  }, [consumerSub, consumerType])
  useEffect(() => {
    setMilestoneId(null)
  }, [consumerSub, consumerType, disciplineId])

  // ── Lines
  const [rows, setRows] = useState<LineRow[]>([{ brand_variant_id: '', qty: '' }])
  const [openPickerIdx, setOpenPickerIdx] = useState<number | null>(null)

  // Seed the toggle from the caller each time the dialog (re)opens — the
  // /consumption tab can change between opens; a custody card seeds the same
  // value every time.
  useEffect(() => {
    if (open) setMode(initialMode ?? 'service')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // A picked line belongs to the current mode's item set. Switching Service⇄Team
  // clears the lines so a service item can't ride into a team post (the RPC also
  // guards this, but keep the UI honest) and closes any open picker.
  useEffect(() => {
    setRows([{ brand_variant_id: '', qty: '' }])
    setOpenPickerIdx(null)
  }, [mode])

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

  // Full category breadcrumbs for the picker header ("Root > … > Leaf"). One
  // bounded, cached read over the sub's stock variants — resolved client-side so
  // it works regardless of which columns warehouse_stock_summary carries.
  const stockVariantIds = useMemo(() => sourceStock.map((s) => s.brand_variant_id), [sourceStock])
  const variantMeta = useVariantItemMeta(stockVariantIds)

  // Dedupe by brand_variant_id — the picker is gated on a chosen sub (so stock is
  // normally single-sub), but stay defensive against a variant appearing in more
  // than one sub row, which would collide on its React key. availableQtyMap sums
  // the qty across subs.
  const pickerItems: PickerItem[] = useMemo(() => {
    const seen = new Set<string>()
    const out: PickerItem[] = []
    for (const s of sourceStock) {
      if (seen.has(s.brand_variant_id)) continue
      // Per-tab scoping: Service hides team-items, Team shows only team-items.
      // (Legacy callers pass no mode → no filtering.)
      if (mode === 'service' && teamVariantIds?.has(s.brand_variant_id)) continue
      if (mode === 'team'    && !teamVariantIds?.has(s.brand_variant_id)) continue
      seen.add(s.brand_variant_id)
      out.push({
        id:            s.brand_variant_id,
        name:          s.item_name ?? '(No name)',
        brand:         s.brand ?? null,
        countryName:   s.country_name ?? null,
        sku:           s.sku ?? null,
        category:      s.category_name ?? null,
        categoryPath:  variantMeta.get(s.brand_variant_id)?.tree ?? null,
        qty:           availableQtyMap.get(s.brand_variant_id) ?? 0,
        reorderPoint:  0,
        imageUrl:      s.image_url ?? null,
      })
    }
    return out
  }, [sourceStock, availableQtyMap, mode, teamVariantIds, variantMeta])

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
    code.trim() !== '' ||
    attachments.length > 0

  const { guardedOnOpenChange, confirmDialog } = useDirtyDialogGuard({
    isDirty,
    onOpenChange,
  })
  // Snapshot for cleanup — reset useEffect clears `attachments` before we
  // can read it in the close path, so mirror the list in a ref.
  const attachmentsRef = useRef<string[]>([])
  useEffect(() => { attachmentsRef.current = attachments }, [attachments])

  // ── Confirmation modal + cooldown ─────────────────────────────────────
  // The 3-second cooldown lives on the confirmation modal's confirm button,
  // not the main dialog: it starts when the modal opens and the button stays
  // disabled until it elapses.
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [cooldownEndsAt, setCooldownEndsAt] = useState<number>(0)
  const [now, setNow] = useState<number>(0)
  const cooldownRemaining = Math.max(0, cooldownEndsAt - now)
  const cooldownSecondsLeft = Math.ceil(cooldownRemaining / 1000)

  // The cooldown is armed synchronously in the "Review & Post" handler (see
  // openConfirm) so the modal's very first render already shows it disabled —
  // no one-frame window where the confirm button is live.

  // Tick the countdown 4×/second while the modal is open and it still matters.
  useEffect(() => {
    if (!confirmOpen || cooldownRemaining <= 0) return
    const interval = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(interval)
  }, [confirmOpen, cooldownRemaining])

  // Reset entire form on close.
  useEffect(() => {
    if (!open) {
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
      setMode(initialMode ?? 'service')
      setConsumerType(allowedConsumerTypes[0] ?? 'custody')
      setConsumerSub(presetSource?.kindLabel === 'Custody' ? presetSource.subContainerId : '')
      setCustodyWhId('')
      setCustodyDivId('')
      setDisciplineId(null)
      setMilestoneId(null)
      setCode('')
      setRows([{ brand_variant_id: '', qty: '' }])
      setOpenPickerIdx(null)
      setNotes('')
      setAttachments([])
      setUploading(false)
      setConfirmOpen(false)
      setCooldownEndsAt(0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // ── Row helpers
  function addRow() {
    setRows((prev) => [...prev, { brand_variant_id: '', qty: '' }])
  }
  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx))
  }
  function updateRow(idx: number, field: keyof LineRow, value: string) {
    setRows((prev) => prev.map((row, i) => {
      if (i !== idx) return row
      if (field === 'brand_variant_id') return { brand_variant_id: value, qty: '' }
      return { ...row, [field]: value }
    }))
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
  }

  // ── Row validation
  const rowErrors = useMemo(
    () => rows.map((row) => {
      if (!row.brand_variant_id || !row.qty) return null
      const requested = parseQty(row.qty)
      if (isNaN(requested) || requested <= 0) return null
      const available = availableQtyMap.get(row.brand_variant_id) ?? 0
      if (requested > available) return `Only ${available.toLocaleString()} available`
      return null
    }),
    [rows, availableQtyMap],
  )

  // ── Consumer validation
  const consumerResolved = useMemo(() => {
    if (consumerType === 'custody') return !!consumerSub
    return true // internal — no picker
  }, [consumerType, consumerSub])

  // ── Submit gate (opening the confirmation modal — no cooldown here)
  const hasValidRows        = rows.some((r) => r.brand_variant_id && r.qty && parseQty(r.qty) > 0)
  const hasValidationErrors = rowErrors.some((e) => e !== null)
  const srcSubResolved      = eligibleSrcSubs.length > 0 && (eligibleSrcSubs.length === 1 || !!srcSubId)
  const post                = useCreateConsumption()

  // A project-pool consumer REQUIRES a discipline + milestone — spend must be
  // attributed. (Non-project custody / internal have no disciplines → not required.)
  const projectTagsRequired  = consumerType === 'custody' && !!consumerSub && poolDisciplines.length > 0
  const projectTagsSatisfied = !projectTagsRequired || (!!resolvedDisciplineId && !!milestoneId && code.trim() !== '')
  // Custody consumption is a sale — the invoice/order/project ref (Notes) is mandatory.
  const notesSatisfied = consumerType !== 'custody' || notes.trim().length > 0

  const canOpenConfirm =
    !!srcWhId &&
    srcSubResolved &&
    !!srcSubId &&
    consumerResolved &&
    hasValidRows &&
    !hasValidationErrors &&
    projectTagsSatisfied &&
    notesSatisfied &&
    !uploading &&
    !post.isPending

  const consumerLabel = useMemo(() => {
    if (consumerType === 'custody') return activeLocations.find((l) => l.id === consumerSub)?.name ?? null
    return 'Internal use'
  }, [consumerType, consumerSub, activeLocations])

  const consumerTypeLabel = consumerType === 'custody' ? 'Custody' : 'Internal'

  // Resolved for the RPC payload — '__none__' (or any non-custody consumer)
  // always collapses to `null`, never a stray sentinel string.
  const resolvedMilestoneId = useMemo(
    () => (consumerType === 'custody' && resolvedDisciplineId && milestoneId ? milestoneId : null),
    [consumerType, resolvedDisciplineId, milestoneId],
  )
  // Code is a project-spend tag only — collapses to null for non-project consumers.
  const resolvedCode = useMemo(
    () => (projectTagsRequired ? (code.trim() || null) : null),
    [projectTagsRequired, code],
  )
  // Separate display-only lookup for the confirmation modal summary — a
  // `.find()` here is fine (unlike a Select trigger's rendered value) since
  // it's a one-off read surface, not a controlled component's display value.
  const selectedMilestoneLabel = useMemo(
    () => (resolvedMilestoneId ? milestones.find((m) => m.id === resolvedMilestoneId)?.label ?? null : null),
    [resolvedMilestoneId, milestones],
  )
  const selectedDisciplineLabel = useMemo(
    () => (resolvedDisciplineId ? poolDisciplines.find((d) => d.discipline_id === resolvedDisciplineId)?.discipline_name ?? null : null),
    [resolvedDisciplineId, poolDisciplines],
  )

  const srcWhName = useMemo(
    () => srcWarehouses.find((w) => w.id === srcWhId)?.name ?? '—',
    [srcWarehouses, srcWhId],
  )
  const srcSubName = useMemo(() => {
    if (sourceLocked) return presetSource?.subContainerName ?? '—'
    return eligibleSrcSubs.find((s) => s.id === srcSubId)?.name ?? '—'
  }, [sourceLocked, presetSource, eligibleSrcSubs, srcSubId])

  const linesTotal = useMemo(() => {
    return rows.reduce((sum, r) => {
      const qty = parseQty(r.qty)
      if (!r.brand_variant_id || isNaN(qty) || qty <= 0) return sum
      const cost = avgCostMap.get(r.brand_variant_id) ?? 0
      return sum + qty * cost
    }, 0)
  }, [rows, avgCostMap])

  // Resolved lines for the confirmation modal — with the share-of-stock each
  // line consumes, so fat-finger quantities are visible before posting.
  const confirmLines = useMemo(() => {
    return rows
      .filter((r) => r.brand_variant_id && r.qty && parseQty(r.qty) > 0)
      .map((r) => {
        const stock     = sourceStock.find((s) => s.brand_variant_id === r.brand_variant_id)
        const qty       = parseQty(r.qty)
        const available = availableQtyMap.get(r.brand_variant_id) ?? 0
        const unitCost  = avgCostMap.get(r.brand_variant_id) ?? 0
        const share     = available > 0 ? qty / available : 1
        const highShare = available > 0 && qty >= Math.ceil(available * HIGH_SHARE_RATIO)
        const shareLabel = available <= 0
          ? 'No recorded stock at this location'
          : qty >= available
            ? `Consuming the entire stock (${qty.toLocaleString()} of ${available.toLocaleString()})`
            : `${Math.round(share * 100)}% of stock (${qty.toLocaleString()} of ${available.toLocaleString()})`
        return {
          id:       r.brand_variant_id,
          name:     stock?.item_name ?? '(item)',
          brand:    stock?.brand ?? null,
          unit:     stock?.unit ?? '',
          qty, unitCost, lineCost: qty * unitCost, available, highShare, shareLabel,
        }
      })
  }, [rows, sourceStock, availableQtyMap, avgCostMap])

  const anyHighShare = confirmLines.some((l) => l.highShare)

  // Open the confirmation modal and arm its 3-second cooldown in the same
  // synchronous batch, so the confirm button renders disabled from frame one.
  function openConfirm() {
    const t = Date.now()
    setNow(t)
    setCooldownEndsAt(t + COOLDOWN_MS)
    setConfirmOpen(true)
  }

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
      .filter((r) => r.brand_variant_id && r.qty && parseQty(r.qty) > 0)
      .map((r) => ({ brand_variant_id: r.brand_variant_id, qty: parseQty(r.qty) }))
    if (lines.length === 0) {
      toast.error('Add at least one line')
      return
    }

    try {
      await post.mutateAsync({
        source_warehouse_id:       srcWhId,
        source_sub_container_id:   srcSubId,
        consumer_type:             consumerType,
        consumer_sub_container_id: consumerType === 'custody' ? consumerSub : null,
        milestone_id:              resolvedMilestoneId,
        discipline_id:             resolvedDisciplineId,
        code:                      resolvedCode,
        notes:                     notes.trim() || null,
        attachments:               attachments,
        lines,
      })
      submittedRef.current = true
      toast.success(`Consumption posted to ${consumerLabel ?? 'consumer'} — stock deducted`)
      setConfirmOpen(false)
      onOpenChange(false)
    } catch (err) {
      // Keep the confirmation modal open so the operator can retry or go back.
      toast.error(err instanceof Error ? err.message : 'Failed to post consumption')
    }
  }

  const QAR = new Intl.NumberFormat('en-QA', { style: 'currency', currency: 'QAR', maximumFractionDigits: 2 })

  return (
    <><Dialog open={open} onOpenChange={guardedOnOpenChange}>
      {/* Mobile: a content-height compact card (max 88dvh, scrolls) with side
          margins — not a full-screen sheet with a big empty gap. Desktop keeps
          the fixed 46rem / 90vh panel. */}
      <DialogContent className="flex flex-col overflow-hidden p-0 w-[calc(100vw-1.5rem)] max-h-[88dvh] rounded-lg sm:w-[46rem] sm:h-[90vh] sm:max-h-[90vh] sm:max-w-[95vw]">
        <DialogHeader className="px-4 pt-4 pb-0 sm:px-5 sm:pt-5">
          <DialogTitle className="text-sm font-semibold flex items-center gap-1.5">
            <HandCoins className="h-4 w-4 text-primary" />
            New Consumption
          </DialogTitle>
          {/* Redundant with the amber warning below — hide on phones to save height. */}
          <p className="hidden sm:block text-[11px] text-muted-foreground mt-1">
            Deducts stock from the source and books COGS to the picked consumer immediately.
          </p>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 pt-3 space-y-3 sm:px-5 sm:pb-5 sm:space-y-4">
          {/* Amber irreversibility warning */}
          <div className="rounded-md border border-warning/40 bg-warning/10 p-2.5 flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
            <div className="text-[11px] text-warning-foreground leading-snug">
              <span className="font-medium">Posting a consumption immediately deducts stock and books COGS.</span>{' '}
              <span className="hidden sm:inline">This is not reversible without a manual cancellation.</span>
            </div>
          </div>

          {/* Service vs Team-item consumption — the switch lives here in the
              consume flow (operator's ask), not as a page tab. It filters the
              item picker; Team mode also scopes a pickable source to custody. */}
          <div className="space-y-1.5">
            <Label className="text-[11px] font-medium">Consumption type</Label>
            <div className="grid grid-cols-2 gap-1 rounded-md border bg-muted/30 p-1">
              {([
                { key: 'service' as const, label: 'Service items', Icon: Package },
                { key: 'team'    as const, label: 'Team items',    Icon: Users2 },
              ]).map(({ key, label, Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMode(key)}
                  className={cn(
                    'flex h-8 items-center justify-center gap-1.5 rounded text-[11px] font-medium transition-colors',
                    mode === key
                      ? 'bg-background shadow-sm text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Opened from a Custody card: the source (this location) and consumer
              (the same location) are fixed — show a one-line summary instead of the
              pickers. The /consumption header (no presetSource) keeps the pickers. */}
          {sourceLocked && (
            <div className="rounded-md border bg-muted/30 px-3 py-2.5 text-[11px]">
              <span className="text-muted-foreground">Consuming from </span>
              <span className="font-medium text-foreground">{presetSource?.subContainerName}</span>
              <span className="hidden sm:inline text-muted-foreground"> — stock held by this custody location, booked back to it.</span>
            </div>
          )}
          {!sourceLocked && (<>
          {/* Source */}
          <div className="space-y-2">
            <Label className="text-[11px] font-medium">Source</Label>
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-[10px] text-muted-foreground">Warehouse</Label>
                {srcWarehouses.length === 0 ? (
                  <div className="h-9 flex items-center rounded-md border border-destructive/40 bg-destructive/5 px-2.5 text-[11px] italic text-destructive">
                    No warehouses assigned to you
                  </div>
                ) : (
                  <Select
                    value={srcWhId}
                    onValueChange={(v) => setSrcWhId(v ?? '')}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Pick source warehouse" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60 overflow-y-auto">
                      {srcWarehouses.map((wh) => (
                        <SelectItem key={wh.id} value={wh.id} className="text-xs">
                          {wh.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="flex-1 space-y-1">
                <Label className="text-[10px] text-muted-foreground">Sub-container</Label>
                {!srcWhId ? (
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
                  <Select value={srcSubId ?? ''} onValueChange={(v) => setSrcSubId(v || null)}>
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
                  label: k === 'custody' ? 'Custody' : 'Internal',
                }))).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setConsumerType(opt.key)}
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
            {/* Single-option — no pill or segmented control. The Custody /
                Internal picker rendered below the section header is enough
                context; the label + sub-picker implies the type. */}

            <div className="min-h-9">
              {consumerType === 'custody' && (
                visibleLocations.length === 0 ? (
                  <div className="h-9 flex items-center rounded-md border bg-muted/20 px-2.5 text-[11px] italic text-muted-foreground">
                    No custody locations in your division
                  </div>
                ) : (
                  // Cascade: Type → Division (only when the type spans 2+) → Location.
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                    {custodyTypes.length > 1 && (
                      <div className="flex-1 min-w-0 space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Type</Label>
                        <Select value={custodyWhId} onValueChange={(v) => setCustodyWhId(v ?? '')}>
                          <SelectTrigger className="h-9 w-full text-xs">
                            <SelectValue placeholder="Pick type" />
                          </SelectTrigger>
                          <SelectContent className="max-h-60 overflow-y-auto">
                            {custodyTypes.map((t) => (
                              <SelectItem key={t.id} value={t.id} className="text-xs">{t.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {custodyWhId && needsDivisionStep && (
                      <div className="flex-1 min-w-0 space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Division</Label>
                        <Select value={custodyDivId} onValueChange={(v) => setCustodyDivId(v ?? '')}>
                          <SelectTrigger className="h-9 w-full text-xs">
                            <SelectValue placeholder="Pick division" />
                          </SelectTrigger>
                          <SelectContent className="max-h-60 overflow-y-auto">
                            {divisionsForType.map((d) => (
                              <SelectItem key={d.id} value={d.id} className="text-xs">{d.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="flex-1 min-w-0 space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Location</Label>
                      <Select value={consumerSub} onValueChange={(v) => setConsumerSub(v ?? '')}>
                        <SelectTrigger
                          className="h-9 w-full text-xs"
                          disabled={!custodyWhId || (needsDivisionStep && !custodyDivId)}
                        >
                          <SelectValue placeholder={
                            !custodyWhId
                              ? 'Pick type first'
                              : (needsDivisionStep && !custodyDivId)
                                ? 'Pick division first'
                                : 'Pick a location…'
                          } />
                        </SelectTrigger>
                        <SelectContent className="max-h-60 overflow-y-auto">
                          {locationsForSelection.length === 0 ? (
                            <div className="px-2 py-1.5 text-[11px] italic text-muted-foreground">No locations here</div>
                          ) : (
                            locationsForSelection.map((l) => (
                              <SelectItem key={l.id} value={l.id} className="text-xs">{l.name}</SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )
              )}
              {consumerType === 'internal' && (
                <div className="h-9 flex items-center rounded-md border bg-muted/40 px-2.5 text-[11px] text-muted-foreground italic">
                  Internal use — office supplies, samples, tool wear, expiry write-off. No external recipient.
                </div>
              )}
            </div>

          </div>
          </>)}

          {/* Project spend tags — Discipline + Milestone, side by side and
              REQUIRED for a project-pool consumer (spend must be attributed).
              Rendered OUTSIDE the source/consumer split so they also show when
              opened from a custody card (sourceLocked = fixed project pool). */}
          {projectTagsRequired && (
            <div className="space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-start">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Discipline *</Label>
                <Select value={disciplineId} onValueChange={(v) => setDisciplineId(v)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select discipline" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    {poolDisciplines.map((d) => (
                      <SelectItem key={d.discipline_id} value={d.discipline_id} className="text-xs">{d.discipline_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Milestone *</Label>
                {!resolvedDisciplineId ? (
                  <div className="h-9 flex items-center rounded-md border bg-muted/20 px-2.5 text-[11px] italic text-muted-foreground">
                    Pick a discipline first
                  </div>
                ) : milestones.length === 0 ? (
                  <div className="h-9 flex items-center rounded-md border border-warning/40 bg-warning/10 px-2.5 text-[11px] italic text-warning-foreground">
                    No milestones — add one to this discipline first
                  </div>
                ) : (
                  <Select value={milestoneId} onValueChange={(v) => setMilestoneId(v)}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Select milestone" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60 overflow-y-auto">
                      {milestones.map((m) => (
                        <SelectItem key={m.id} value={m.id} className="text-xs">{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Code *</Label>
              <Input
                className="h-9 text-xs"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={64}
              />
            </div>
            </div>
          )}

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
                  const selected      = sourceStock.find((s) => s.brand_variant_id === row.brand_variant_id)
                  const available     = row.brand_variant_id ? (availableQtyMap.get(row.brand_variant_id) ?? 0) : null
                  const unitCost      = row.brand_variant_id ? (avgCostMap.get(row.brand_variant_id) ?? 0) : null
                  const qtyNum        = parseQty(row.qty)
                  const lineCost      = !isNaN(qtyNum) && unitCost != null ? qtyNum * unitCost : null
                  const error         = rowErrors[idx]
                  const remainingAfter = available != null && !isNaN(qtyNum) && qtyNum > 0
                    ? available - qtyNum
                    : null
                  // Trigger content shared by the desktop popover + mobile sheet.
                  const triggerContent = (
                    <>
                      {selected ? (
                        <ItemLabel
                          showBrandOrigin={false}
                          meta={variantMeta.get(row.brand_variant_id)}
                          name={<>
                            <span className="font-medium">{selected.item_name}</span>
                            {selected.brand && (
                              <span className="text-muted-foreground"> — {selected.brand}</span>
                            )}
                          </>}
                          nameClassName="truncate"
                        />
                      ) : (
                        <span className="text-muted-foreground">Search items…</span>
                      )}
                      <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50 ml-1.5" />
                    </>
                  )
                  const triggerCls =
                    'flex min-h-8 w-full items-center justify-between rounded-md border border-input bg-background px-2.5 py-1 text-[11px] hover:bg-accent/50 cursor-pointer'
                  return (
                    <div
                      key={idx}
                      className={`rounded-md border p-2.5 space-y-1.5 ${error ? 'border-destructive/50 bg-destructive/5' : 'bg-card'}`}
                    >
                      {isSmUp ? (
                        <Popover open={openPickerIdx === idx} onOpenChange={(o) => setOpenPickerIdx(o ? idx : null)}>
                          <PopoverTrigger className={triggerCls}>{triggerContent}</PopoverTrigger>
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
                      ) : (
                        <>
                          <button
                            type="button"
                            className={triggerCls}
                            onClick={() => setOpenPickerIdx(idx)}
                          >
                            {triggerContent}
                          </button>
                          {/* Phone: a full-screen bottom sheet instead of an anchored
                              popover, so the on-screen keyboard can't crush it. Search
                              is pinned at the top; results scroll above the keyboard;
                              the keyboard only opens when the search field is tapped. */}
                          <Sheet open={openPickerIdx === idx} onOpenChange={(o) => setOpenPickerIdx(o ? idx : null)}>
                            <SheetContent
                              side="bottom"
                              style={{ height: '90dvh' }}
                              className="flex flex-col gap-0 rounded-t-xl p-0"
                            >
                              <SheetHeader className="shrink-0 border-b p-3">
                                <SheetTitle className="text-sm">Select item</SheetTitle>
                              </SheetHeader>
                              <div className="min-h-0 flex-1">
                                <WhItemPicker
                                  items={pickerItems}
                                  selectedIds={selectedIds}
                                  currentValue={row.brand_variant_id}
                                  onSelect={(id) => { updateRow(idx, 'brand_variant_id', id); setOpenPickerIdx(null) }}
                                  showQty
                                  fill
                                />
                              </div>
                            </SheetContent>
                          </Sheet>
                        </>
                      )}

                      <div className="flex items-center gap-2 flex-wrap">
                        <Input
                          type="number"
                          inputMode="numeric"
                          className={`h-7 w-[80px] text-[11px] ${error ? 'border-destructive' : ''}`}
                          placeholder="Qty"
                          min="1"
                          step="1"
                          max={available != null ? available : undefined}
                          value={row.qty}
                          onChange={(e) => updateRow(idx, 'qty', e.target.value.replace(/[^\d]/g, ''))}
                          disabled={!row.brand_variant_id}
                        />
                        {available !== null && (
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                            / {available.toLocaleString()} {selected?.unit ?? ''}
                          </span>
                        )}
                        {remainingAfter !== null && !error && (
                          <span className={cn(
                            'text-[10px] whitespace-nowrap',
                            remainingAfter === 0 ? 'text-warning-foreground' : 'text-muted-foreground',
                          )}>
                            → {remainingAfter.toLocaleString()} left
                          </span>
                        )}
                        {canSeeCost && unitCost != null && unitCost > 0 && (
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                            @ {QAR.format(unitCost)}
                          </span>
                        )}
                        {canSeeCost && lineCost != null && lineCost > 0 && (
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

                {canSeeCost && linesTotal > 0 && (
                  <div className="flex items-center justify-end gap-2 pt-1 text-[11px]">
                    <span className="text-muted-foreground">Estimated cost:</span>
                    <span className="font-semibold tabular-nums">{QAR.format(linesTotal)}</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1 font-normal">preview</Badge>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Notes — required for custody consumption (the sale reference) */}
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">
              Notes{consumerType === 'custody' && <span className="text-destructive"> *</span>}
            </Label>
            <Textarea
              className="text-[11px] min-h-[48px] resize-none"
              placeholder={consumerType === 'custody'
                ? 'Enter invoice / order number / project code'
                : 'Optional context (job ref, site visit, WO number, etc.)'}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            {consumerType === 'custody' && notes.trim().length === 0 && (
              <p className="text-[10px] text-destructive">Required — enter the invoice / order number / project code.</p>
            )}
          </div>

          {/* Attachments */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Paperclip className="h-3 w-3" /> Attachments
              </Label>
              <span className="hidden sm:inline text-[10px] text-muted-foreground">Max 10 MB per file</span>
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

        <DialogFooter className="m-0 px-4 py-2.5 sm:px-5 sm:py-3 border-t bg-muted/30 rounded-b-lg gap-2 sm:gap-2 flex-row items-center justify-between sm:justify-between">
          <div className="hidden sm:block text-[10px] text-muted-foreground">
            {canOpenConfirm ? (
              <span className="text-success">Ready to review</span>
            ) : (
              <span>Fill required fields</span>
            )}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Button variant="outline" size="sm" className="text-[11px] h-11 sm:h-8" onClick={() => guardedOnOpenChange(false)} disabled={post.isPending}>
              Cancel
            </Button>
            <Button size="sm" className="text-[11px] h-11 sm:h-8 min-w-[130px]" disabled={!canOpenConfirm} onClick={openConfirm}>
              Review &amp; Post
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

    </Dialog>

    {/* Two-step confirm: highlight exactly what's about to be consumed, then
        hold a 3-second cooldown on the confirm button before the post fires. */}
    <AlertDialog open={confirmOpen} onOpenChange={(o) => { if (!post.isPending) setConfirmOpen(o) }}>
      <AlertDialogContent className="max-w-md w-[calc(100vw-1.5rem)] max-h-[90dvh] overflow-y-auto rounded-lg p-4 gap-3 sm:w-full sm:p-6 sm:gap-4">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-1.5 text-sm">
            <HandCoins className="h-4 w-4 text-primary" />
            Confirm consumption
          </AlertDialogTitle>
          <AlertDialogDescription className="text-[11px] leading-snug">
            This deducts stock and books COGS immediately. Check the quantities — it can only be undone by a manual cancellation.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* min-w-0 lets this grid item shrink to the modal width instead of
            forcing the AlertDialogContent grid track wider than max-w-md when a
            line carries a long item/consumer label. */}
        <div className="space-y-3 min-w-0">
          {/* Source + consumer summary */}
          <div className="rounded-md border bg-muted/30 p-2.5 text-[11px] space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground shrink-0">From</span>
              <span className="font-medium text-right truncate min-w-0">{srcWhName} — {srcSubName}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground shrink-0">Consumer</span>
              <span className="font-medium text-right truncate min-w-0">
                {consumerType === 'internal' ? 'Internal use' : `${consumerTypeLabel} — ${consumerLabel ?? ''}`}
              </span>
            </div>
            {selectedDisciplineLabel && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground shrink-0">Discipline</span>
                <span className="font-medium text-right truncate min-w-0">{selectedDisciplineLabel}</span>
              </div>
            )}
            {selectedMilestoneLabel && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground shrink-0">Milestone</span>
                <span className="font-medium text-right truncate min-w-0">{selectedMilestoneLabel}</span>
              </div>
            )}
            {resolvedCode && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground shrink-0">Code</span>
                <span className="font-medium text-right truncate min-w-0">{resolvedCode}</span>
              </div>
            )}
          </div>

          {anyHighShare && (
            <div className="rounded-md border border-warning/50 bg-warning/10 p-2 flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
              <span className="text-[11px] text-warning-foreground leading-snug">
                A line below consumes almost all — or all — of the available stock. Double-check the quantity before posting.
              </span>
            </div>
          )}

          {/* Line breakdown */}
          <div className="space-y-1 max-h-[38vh] overflow-y-auto">
            {confirmLines.map((l) => (
              <div
                key={l.id}
                className={cn(
                  'flex items-start justify-between gap-2 rounded-md border px-2.5 py-1.5 text-[11px]',
                  l.highShare ? 'border-warning/50 bg-warning/10' : 'bg-card',
                )}
              >
                <div className="min-w-0 flex-1">
                  <ItemLabel meta={variantMeta.get(l.id)} name={l.name} nameClassName="truncate font-medium" />
                  {l.highShare && (
                    <div className="mt-0.5 flex items-center gap-1 text-[10px] text-warning-foreground">
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      <span>{l.shareLabel}</span>
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-right tabular-nums">
                  <div className="flex justify-end">
                    <span
                      className={cn(
                        'inline-flex items-baseline gap-1 rounded px-1.5 py-0.5 font-semibold text-foreground',
                        l.available > 0 && l.qty >= l.available
                          ? 'bg-destructive/15'   // consuming the entire stock
                          : l.highShare
                            ? 'bg-warning/25'      // ≥90% of stock
                            : 'bg-primary/10',     // normal — draws the eye to the qty
                      )}
                    >
                      {l.qty.toLocaleString()}
                      <span className="text-[9px] font-normal opacity-60">{l.unit || 'pcs'}</span>
                    </span>
                  </div>
                  {canSeeCost && l.unitCost > 0 && (
                    <div className="mt-0.5 text-[10px] text-muted-foreground">{QAR.format(l.lineCost)}</div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Total (cost — accounting only) */}
          {canSeeCost && linesTotal > 0 && (
            <div className="flex items-center justify-between border-t pt-2 text-xs">
              <span className="text-muted-foreground">Estimated COGS</span>
              <span className="font-semibold tabular-nums">{QAR.format(linesTotal)}</span>
            </div>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={post.isPending} className="h-11 sm:h-8 text-[11px]">Back</AlertDialogCancel>
          <Button
            className="h-11 sm:h-8 text-[11px] w-full sm:w-auto sm:min-w-[150px]"
            disabled={cooldownRemaining > 0 || post.isPending}
            onClick={handleSubmit}
          >
            {post.isPending
              ? 'Posting…'
              : cooldownRemaining > 0
                ? `Confirm in ${cooldownSecondsLeft}s`
                : 'Confirm & Post'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    {confirmDialog}</>
  )
}
