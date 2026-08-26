'use client'

import { humanizeDbError } from '@/lib/dbErrors'
import { useState, useEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import {
  GuardedDialog,
  type GuardedFormDialogHandle,
} from '@/components/shared/GuardedFormDialog'
import { useCreateInventoryCategory, useUpdateInventoryCategory, useCascadeCategoryTrackingMode, type InventoryCategory } from '@/hooks/useInventory'
import { useInventoryTree, allDescendantIds } from '@/hooks/useInventoryTree'
import { useWarehouses } from '@/hooks/useWarehouses'
import { useWarehouseSubContainers } from '@/hooks/useWarehouseSubContainers'
import { useCategorySubContainer } from '@/hooks/useCategorySubContainer'
import { useActiveWarrantyPolicies } from '@/hooks/useWarrantyPolicies'
import { useCategoryHasStockOrUnits } from '@/hooks/useCategoryHasStockOrUnits'
import { useDivisions } from '@/hooks/useDivisions'
import { useCategoryDivisions, useSetCategoryDivisions, useCascadeCategoryUnitsDivision } from '@/hooks/useCategoryDivisions'
import { createClient } from '@/lib/supabase/client'
import { buildLevels } from '@/lib/inventory/categoryLevels'
import { computeDivisionRows } from '@/lib/inventory/divisionRows'

const TYPE_LABELS: Record<string, string> = {
  'products': 'Products',
  'spare-parts': 'Spare Parts',
  'consumables': 'Consumables',
  'tools': 'Tools & Assets',
}

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  categoryType: string
  category?: InventoryCategory | null
  parentId?: string | null
  /** Read-only "view" mode — every field is disabled and the save button is
   *  replaced by Close. Opened by the eye button on a category row. */
  readOnly?: boolean
}

type Snapshot = {
  nameEn: string
  nameAr: string
  sku: string
  parentId: string | null
  subContainerId: string | null
  warrantyPolicyId: string | null
  trackingMode: 'serialized' | 'bulk'
  isTeamItem: boolean
}

export function CategoryEditDialog({ open, onOpenChange, categoryType, category, parentId: defaultParentId, readOnly = false }: Props) {
  const isEdit = !!category
  const create = useCreateInventoryCategory()
  const update = useUpdateInventoryCategory()
  const cascadeMode = useCascadeCategoryTrackingMode()
  const { flat } = useInventoryTree(categoryType)
  const { data: divisions = [] } = useDivisions()
  // Gated on `open` (+ edit mode): this dialog is mounted once per CategoryRow
  // (outside the {expanded} guard), so without the gate every visible category
  // fires this recursive-CTE RPC (rpc_category_divisions) on page load while
  // the dialog is closed. The seed-once ref below (`ownDivisionsSeededRef`)
  // keeps the now-async resolution from clobbering in-progress ticks.
  const { data: catDivs } = useCategoryDivisions(open && isEdit ? (category?.id ?? null) : null)
  const setCategoryDivisions = useSetCategoryDivisions()
  const cascadeUnits = useCascadeCategoryUnitsDivision()

  const [nameEn, setNameEn] = useState('')
  const [nameAr, setNameAr] = useState('')
  const [sku, setSku] = useState('')
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null)
  const [warehouseId, setWarehouseId] = useState<string | null>(null)
  const [subContainerId, setSubContainerId] = useState<string | null>(null)
  const [warrantyPolicyId, setWarrantyPolicyId] = useState<string | null>(null)
  const [trackingMode, setTrackingMode] = useState<'serialized' | 'bulk'>('serialized')
  const [isTeamItem, setIsTeamItem] = useState(false)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  // Own (editable) division assignment for this category — seeded from
  // `catDivs.own` below. Inherited divisions are locked/checked but never
  // stored here (additive-only; see the "Assigned divisions" section).
  const [ownDivisionIds, setOwnDivisionIds] = useState<string[]>([])
  // Tools only: chosen physical-home division for the opt-in unit move.
  const [unitHomeId, setUnitHomeId] = useState<string>('')
  const { data: warrantyPolicies = [] } = useActiveWarrantyPolicies()
  // Gated on `open`: this dialog is mounted once per CategoryRow (outside the
  // {expanded} guard), so without the gate every visible category fires this
  // multi-table probe on page load while the dialog is closed.
  const { data: categoryHasStockOrUnits } = useCategoryHasStockOrUnits(open && isEdit ? (category?.id ?? null) : null)
  const guardRef = useRef<GuardedFormDialogHandle>(null)

  const parentId = selectedParentId

  const { data: warehouses = [] } = useWarehouses()
  const { data: subContainers = [] } = useWarehouseSubContainers(warehouseId)
  const activeSubs = useMemo(() => subContainers.filter((s) => s.is_active), [subContainers])

  const { data: inheritedResolved } = useCategorySubContainer(
    subContainerId ? null : parentId,
  )

  useEffect(() => {
    if (open) {
      const nextNameEn = category?.name_en ?? ''
      const nextNameAr = category?.name_ar ?? ''
      const nextSku = category?.sku ?? ''
      const nextSubContainerId = category?.default_sub_container_id ?? null
      const nextWarrantyPolicyId = category?.default_warranty_policy_id ?? null
      const nextTrackingMode = category?.tool_tracking_mode ?? 'serialized'
      const nextIsTeamItem = (category as unknown as { is_team_item?: boolean } | null)?.is_team_item ?? false
      setNameEn(nextNameEn)
      setNameAr(nextNameAr)
      setSku(nextSku)
      setSubContainerId(nextSubContainerId)
      setWarrantyPolicyId(nextWarrantyPolicyId)
      setTrackingMode(nextTrackingMode)
      setIsTeamItem(nextIsTeamItem)
      setUnitHomeId('')

      const targetId = isEdit ? (category?.parent_id ?? null) : (defaultParentId ?? null)
      const seededParent = targetId && flat.some((c) => c.id === targetId) ? targetId : null
      setSelectedParentId(seededParent)

      setSnapshot({
        nameEn: nextNameEn,
        nameAr: nextNameAr,
        sku: nextSku,
        parentId: seededParent,
        subContainerId: nextSubContainerId,
        warrantyPolicyId: nextWarrantyPolicyId,
        trackingMode: nextTrackingMode,
        isTeamItem: nextIsTeamItem,
      })
    }
  }, [open, category, defaultParentId, isEdit, flat])

  // Seed own-divisions ONCE per open — either when the edit fetch first
  // resolves, or immediately for a create (no category yet, query disabled
  // above). A later refetch must not clobber a checkbox the operator toggled
  // in between. Mirrors ItemEditDialog's `assignedSeededRef` pattern.
  const ownDivisionsSeededRef = useRef(false)
  useEffect(() => {
    if (!open) { ownDivisionsSeededRef.current = false; return }
    if (ownDivisionsSeededRef.current) return
    if (catDivs !== undefined) {
      setOwnDivisionIds(catDivs.own)
      ownDivisionsSeededRef.current = true
    } else if (!isEdit) {
      setOwnDivisionIds([])
      ownDivisionsSeededRef.current = true
    }
  }, [open, catDivs, isEdit])

  useEffect(() => {
    if (!open) return
    const seed = category?.default_sub_container_id ?? null
    if (!seed) {
      setWarehouseId(null)
      return
    }
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('warehouse_sub_containers')
        .select('warehouse_id')
        .eq('id', seed)
        .maybeSingle()
      if (!cancelled) setWarehouseId(data?.warehouse_id ?? null)
    })()
    return () => { cancelled = true }
  }, [open, category])

  const excludeIds = useMemo(() => {
    const set = new Set<string>()
    if (isEdit && category) {
      set.add(category.id)
      for (const id of allDescendantIds(category.id, flat)) {
        set.add(id)
      }
    }
    return set
  }, [flat, isEdit, category])

  // Pre-filtered (self + descendants excluded) and pre-sorted so buildLevels'
  // per-parent grouping yields correctly ordered, cycle-safe options at every depth.
  const filteredSortedFlat = useMemo(
    () => flat
      .filter((c) => !excludeIds.has(c.id))
      .slice()
      .sort((a, b) => ((a.sort_order ?? 0) - (b.sort_order ?? 0)) || a.name_en.localeCompare(b.name_en)),
    [flat, excludeIds],
  )

  const levels = useMemo(
    () => buildLevels(filteredSortedFlat, selectedParentId),
    [filteredSortedFlat, selectedParentId],
  )

  // Dirty when any editable field drifts from the snapshot captured on open.
  const isDirty = snapshot !== null && (
    nameEn.trim() !== snapshot.nameEn.trim() ||
    nameAr.trim() !== snapshot.nameAr.trim() ||
    sku.trim() !== snapshot.sku.trim() ||
    parentId !== snapshot.parentId ||
    subContainerId !== snapshot.subContainerId ||
    warrantyPolicyId !== snapshot.warrantyPolicyId ||
    trackingMode !== snapshot.trackingMode ||
    isTeamItem !== snapshot.isTeamItem ||
    JSON.stringify([...ownDivisionIds].sort()) !== JSON.stringify([...(catDivs?.own ?? [])].sort())
  )

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (readOnly) return
    if (!nameEn.trim()) { toast.error('Name (EN) is required'); return }

    const payload = {
      name_en: nameEn.trim(),
      name_ar: nameAr.trim() || null,
      sku: sku.trim() || null,
      parent_id: parentId || null,
      default_sub_container_id: subContainerId || null,
      default_warranty_policy_id: warrantyPolicyId || null,
      tool_tracking_mode: trackingMode,
      is_team_item: isTeamItem,
    }

    // The own-set to persist is ownDivisionIds directly: it is seeded from catDivs.own
    // (line ~144) and can only gain ACTIVE, non-locked ids (inherited rows render as
    // disabled checkboxes and cannot be toggled), so it never contains an inherited-only
    // id — additive-safe — while preserving own-divisions that are inactive or also
    // inherited (which the active-only computeDivisionRows re-derivation was dropping).
    const divisionIdsToSave = ownDivisionIds

    if (isEdit && category) {
      // Tools categories: a Bulk/Serialized change cascades to descendant
      // sub-categories (items follow their category). The normal update sets
      // this category's own mode; the cascade RPC then propagates to
      // descendants without stock and reports which were kept locked.
      const modeChanged = categoryType === 'tools' && !!snapshot && snapshot.trackingMode !== trackingMode
      update.mutate(
        { id: category.id, ...payload },
        {
          onSuccess: async () => {
            if (modeChanged) {
              try {
                const res = await cascadeMode.mutateAsync({ categoryId: category.id, mode: trackingMode })
                const label = trackingMode === 'bulk' ? 'Bulk' : 'Serialized'
                const parts: string[] = []
                if (res.changed.length) parts.push(`${res.changed.length} sub-categor${res.changed.length === 1 ? 'y' : 'ies'} set to ${label}`)
                if (res.locked.length) parts.push(`kept ${res.locked.length} that hold stock: ${res.locked.join(', ')}`)
                toast.success(parts.length ? `Category updated — ${parts.join('; ')}` : 'Category updated')
              } catch (err) {
                // The category's own mode already saved; surface only the cascade failure.
                toast.error(err instanceof Error ? err.message : 'Sub-category cascade failed')
              }
            } else {
              toast.success('Category updated')
            }
            try {
              await setCategoryDivisions.mutateAsync({ categoryId: category.id, divisionIds: divisionIdsToSave })
            } catch (err) {
              // The category itself already saved; surface only the divisions failure.
              toast.error(err instanceof Error ? err.message : 'Failed to save divisions')
            }
            guardRef.current?.closeAfterSubmit()
          },
          onError: (err) => toast.error(humanizeDbError(err)),
        },
      )
    } else {
      create.mutate(
        { ...payload, type: categoryType },
        {
          onSuccess: async (created) => {
            toast.success('Category created')
            try {
              await setCategoryDivisions.mutateAsync({ categoryId: created.id, divisionIds: divisionIdsToSave })
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'Failed to save divisions')
            }
            guardRef.current?.closeAfterSubmit()
          },
          onError: (err) => toast.error(humanizeDbError(err)),
        },
      )
    }
  }

  const isPending = create.isPending || update.isPending

  const dialogTitle = isEdit
    ? 'Edit Category'
    : defaultParentId
      ? 'New Subcategory'
      : 'New Category'

  return (
    <GuardedDialog open={open} onOpenChange={onOpenChange} isDirty={isDirty} ref={guardRef}>
      <DialogContent className="w-full h-full rounded-none sm:h-auto sm:max-w-lg sm:rounded-lg flex flex-col max-h-[90vh]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>{readOnly ? 'View Category' : dialogTitle}</DialogTitle>
            {isEdit && (
              <Badge variant={category?.status === 'archived' ? 'destructive' : 'secondary'} className="text-[10px]">
                {category?.status === 'archived' ? 'Archived' : 'Active'}
              </Badge>
            )}
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          {/* fieldset disabled cascades to every native control inside (inputs,
              and the Base UI selects/switch which render real <button>s), so
              read-only mode needs no per-field wiring. `contents` keeps the
              flex/scroll layout intact. */}
          <fieldset disabled={readOnly} className="contents">
          <div className="flex-1 overflow-y-auto space-y-5 pr-1">
            {/* Parent Category — cascading selects */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Parent Category</Label>
              <div className="flex flex-wrap gap-3">
                {levels.map((level, k) => (
                  <div key={k} className="flex-1 min-w-[150px]">
                    <Select
                      value={level.selectedId ?? '__none__'}
                      onValueChange={(v) => {
                        if (v === '__none__') {
                          setSelectedParentId(k === 0 ? null : (levels[k - 1].selectedId ?? null))
                        } else {
                          setSelectedParentId(v)
                        }
                      }}
                    >
                      <SelectTrigger className="h-10 w-full min-w-0">
                        <span className="truncate">
                          {levels[k].options.find((o) => o.id === levels[k].selectedId)?.name_en
                            ?? (k === 0 ? 'None (top)' : 'None')}
                        </span>
                      </SelectTrigger>
                      <SelectContent className="max-h-60 overflow-y-auto">
                        <SelectItem value="__none__">{k === 0 ? 'None (top-level)' : 'None'}</SelectItem>
                        {level.options.map((c) => <SelectItem key={c.id} value={c.id}>{c.name_en}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">Select the parent level — deeper levels appear as you select</p>
            </div>

            {/* Names */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="cat-name-en" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Name (English) *</Label>
                <Input id="cat-name-en" value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="Category name" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cat-name-ar" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Name (Arabic)</Label>
                <Input id="cat-name-ar" value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" placeholder="اسم الفئة" className="h-10" />
              </div>
            </div>

            {/* Default sub-container */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Default Sub-container
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Select
                  value={warehouseId ?? '__none__'}
                  onValueChange={(v) => {
                    if (v === '__none__') {
                      setWarehouseId(null)
                      setSubContainerId(null)
                    } else {
                      setWarehouseId(v)
                      setSubContainerId(null)
                    }
                  }}
                >
                  <SelectTrigger className="h-10 w-full min-w-0">
                    <span className="truncate">
                      {warehouseId
                        ? warehouses.find((w) => w.id === warehouseId)?.name ?? 'Select'
                        : 'Inherit from parent'}
                    </span>
                  </SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    <SelectItem value="__none__">Inherit from parent</SelectItem>
                    {warehouses.map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={subContainerId ?? '__none__'}
                  onValueChange={(v) => setSubContainerId(v === '__none__' ? null : v)}
                  disabled={!warehouseId || activeSubs.length === 0}
                >
                  <SelectTrigger className="h-10 w-full min-w-0">
                    <span className="truncate">
                      {!warehouseId
                        ? '—'
                        : subContainerId
                          ? activeSubs.find((s) => s.id === subContainerId)?.name ?? 'Select'
                          : 'Pick a sub-container'}
                    </span>
                  </SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    <SelectItem value="__none__">None</SelectItem>
                    {activeSubs.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                        {s.division_name ? ` — ${s.division_name}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {!subContainerId && inheritedResolved && (
                <p className="text-[10px] text-muted-foreground">
                  Inherits from parent chain: <span className="font-medium text-foreground">{inheritedResolved.warehouse_name} · {inheritedResolved.sub_container_name}</span>
                </p>
              )}
              {!subContainerId && !inheritedResolved && (
                <p className="text-[10px] text-muted-foreground">
                  Optional — used by the receival dialog to pre-fill the destination. If null anywhere in the chain, operator picks manually.
                </p>
              )}
            </div>

            {/* Default Warranty Policy */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Default Warranty Policy
              </Label>
              <Select
                value={warrantyPolicyId ?? '__inherit__'}
                onValueChange={(v) => setWarrantyPolicyId(v === '__inherit__' ? null : v)}
              >
                <SelectTrigger className="h-10 w-full min-w-0">
                  <span className="truncate">
                    {warrantyPolicyId
                      ? warrantyPolicies.find((p) => p.id === warrantyPolicyId)?.name ?? 'Select'
                      : 'Inherit from parent chain'}
                  </span>
                </SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  <SelectItem value="__inherit__">Inherit from parent chain</SelectItem>
                  {warrantyPolicies.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                      {p.duration_months === 0
                        ? ' — No warranty'
                        : ` — ${p.duration_months}mo`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                Items in this category inherit this policy unless they override it. Leave blank to inherit from a parent category.
              </p>
            </div>

            {/* Team item — routes items to the Team consumption tab (not for Tools/Assets) */}
            {categoryType !== 'tools' && (
              <div className="flex items-start justify-between gap-3 rounded-md border border-dashed border-border p-3">
                <div className="space-y-0.5 min-w-0">
                  <Label htmlFor="cat-team-item" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Team item category</Label>
                  <p className="text-[10px] text-muted-foreground leading-snug">
                    Items here are held by field teams and consumed from their custody — they show under the <span className="font-medium text-foreground">Team</span> consumption tab. Any single item can override this.
                  </p>
                </div>
                <Switch id="cat-team-item" checked={isTeamItem} onCheckedChange={setIsTeamItem} className="mt-0.5 shrink-0" />
              </div>
            )}

            {/* SKU + Type (+ Tracking Mode for tools) */}
            <div className={`grid grid-cols-1 sm:grid-cols-2 ${categoryType === 'tools' ? 'lg:grid-cols-3' : ''} gap-4`}>
              <div className="space-y-1.5">
                <Label htmlFor="cat-sku-prefix" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">SKU Prefix</Label>
                <Input id="cat-sku-prefix" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Optional" className="font-mono h-10" />
                <p className="text-[10px] text-muted-foreground">Optional — item SKUs are auto-generated if left empty</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cat-type" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Category Type</Label>
                <Input id="cat-type" value={TYPE_LABELS[categoryType] ?? categoryType} disabled className="bg-muted text-muted-foreground h-10" />
              </div>
              {categoryType === 'tools' && (
                <div className="space-y-1.5">
                  <Label htmlFor="cat-tracking-mode" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tracking Mode</Label>
                  <Select
                    value={trackingMode}
                    onValueChange={(v) => setTrackingMode(v as 'serialized' | 'bulk')}
                    disabled={isEdit && !!categoryHasStockOrUnits}
                  >
                    <SelectTrigger id="cat-tracking-mode" className="h-10 w-full min-w-0">
                      <span className="truncate">
                        {trackingMode === 'bulk' ? 'Bulk' : 'Serialized'}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="serialized">Serialized (per-unit)</SelectItem>
                      <SelectItem value="bulk">Bulk (qty tracking)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground break-words leading-snug">
                    {isEdit && categoryHasStockOrUnits
                      ? 'Locked — category holds stock/units. Empty it first to switch.'
                      : 'Serialized = per-unit asset tracking. Bulk = qty/FIFO like consumables.'}
                  </p>
                </div>
              )}
            </div>

            {/* Assigned divisions */}
            {(() => {
              const inherited = catDivs?.inherited ?? []
              const rows = computeDivisionRows(divisions.map((d) => d.id), { editableIds: ownDivisionIds, lockedIds: inherited })
              const divName = (id: string) => divisions.find((d) => d.id === id)?.name ?? '…'
              const effective = Array.from(new Set([...ownDivisionIds, ...inherited]))
              return (
                <div className="rounded-md border border-dashed border-border">
                  <div className="px-3 py-2 text-xs font-medium">Assigned divisions</div>
                  <div className="px-3 pb-3 pt-1 space-y-2">
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      Divisions this category (and everything under it) belongs to. Sub-categories and items inherit these. Locked = inherited from a parent category.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {rows.map((row) => (
                        <label
                          key={row.id}
                          className={`flex items-center gap-2 px-2 py-1.5 rounded-md border border-transparent min-h-9 ${row.locked ? 'opacity-70' : 'hover:border-border hover:bg-muted/30 cursor-pointer'}`}
                        >
                          <Checkbox
                            checked={row.checked}
                            disabled={row.locked || readOnly}
                            onCheckedChange={(v) => setOwnDivisionIds((cur) => (v ? [...cur, row.id] : cur.filter((id) => id !== row.id)))}
                          />
                          <span className="text-xs flex-1 truncate">
                            {divName(row.id)}
                            {row.locked && <span className="text-[10px] text-muted-foreground"> · inherited</span>}
                          </span>
                        </label>
                      ))}
                    </div>
                    {rows.length === 0 && (
                      <p className="text-[10px] text-muted-foreground italic">No active divisions configured yet.</p>
                    )}

                    {/* Tools only: opt-in unit move. Not part of the form's own
                        save — the checkbox grid above persists on submit like
                        every other field, but relocating already-issued serial
                        units is a separate, explicit action with its own
                        confirmation. The wrapper keeps a fixed min-h so the
                        select (which appears only once 2+ divisions apply)
                        popping in/out never shifts the footer below it. */}
                    {categoryType === 'tools' && (
                      <div className="pt-2 border-t border-border space-y-1.5 min-h-24">
                        {effective.length > 0 ? (
                          <>
                            <p className="text-[10px] text-muted-foreground">Physical home for serialized units:</p>
                            {effective.length > 1 && (
                              <select
                                className="text-xs border border-input bg-transparent dark:bg-input/30 rounded-md px-2 py-1 w-full max-w-xs disabled:opacity-50 disabled:cursor-not-allowed"
                                value={unitHomeId}
                                disabled={readOnly}
                                onChange={(e) => setUnitHomeId(e.target.value)}
                              >
                                <option value="">Select…</option>
                                {effective.map((id) => (
                                  <option key={id} value={id}>{divName(id)}</option>
                                ))}
                              </select>
                            )}
                            <Button
                              type="button"
                              variant="outline"
                              className="min-h-9"
                              disabled={readOnly || cascadeUnits.isPending || (effective.length > 1 && !unitHomeId) || !category}
                              onClick={async () => {
                                if (!category) return
                                const home = effective.length === 1 ? effective[0] : unitHomeId
                                if (!home) return
                                if (!confirm(`Move all units under this category to ${divName(home)}?`)) return
                                try {
                                  const res = await cascadeUnits.mutateAsync({ categoryId: category.id, divisionId: home })
                                  toast.success(`Moved ${res.moved} unit(s) to ${divName(home)}`)
                                } catch (err) {
                                  toast.error(err instanceof Error ? err.message : 'Unit move failed')
                                }
                              }}
                            >
                              Move all units to home division
                            </Button>
                          </>
                        ) : (
                          <p className="text-[10px] text-muted-foreground">Assign at least one division above to enable moving units.</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}

          </div>
          </fieldset>

          <DialogFooter className="pt-4 mt-4 border-t border-border">
            {readOnly ? (
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => guardRef.current?.requestClose()}>Cancel</Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Category'}
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </GuardedDialog>
  )
}
