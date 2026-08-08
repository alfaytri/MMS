'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  GuardedDialog,
  type GuardedFormDialogHandle,
} from '@/components/shared/GuardedFormDialog'
import { useCreateInventoryCategory, useUpdateInventoryCategory, type InventoryCategory } from '@/hooks/useInventory'
import { useInventoryTree, allDescendantIds } from '@/hooks/useInventoryTree'
import { useWarehouses } from '@/hooks/useWarehouses'
import { useWarehouseSubContainers } from '@/hooks/useWarehouseSubContainers'
import { useCategorySubContainer } from '@/hooks/useCategorySubContainer'
import { useActiveWarrantyPolicies } from '@/hooks/useWarrantyPolicies'
import { createClient } from '@/lib/supabase/client'
import { buildLevels } from '@/lib/inventory/categoryLevels'

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
}

type Snapshot = {
  nameEn: string
  nameAr: string
  sku: string
  parentId: string | null
  subContainerId: string | null
  warrantyPolicyId: string | null
}

export function CategoryEditDialog({ open, onOpenChange, categoryType, category, parentId: defaultParentId }: Props) {
  const isEdit = !!category
  const create = useCreateInventoryCategory()
  const update = useUpdateInventoryCategory()
  const { flat } = useInventoryTree(categoryType)

  const [nameEn, setNameEn] = useState('')
  const [nameAr, setNameAr] = useState('')
  const [sku, setSku] = useState('')
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null)
  const [warehouseId, setWarehouseId] = useState<string | null>(null)
  const [subContainerId, setSubContainerId] = useState<string | null>(null)
  const [warrantyPolicyId, setWarrantyPolicyId] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const { data: warrantyPolicies = [] } = useActiveWarrantyPolicies()
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
      setNameEn(nextNameEn)
      setNameAr(nextNameAr)
      setSku(nextSku)
      setSubContainerId(nextSubContainerId)
      setWarrantyPolicyId(nextWarrantyPolicyId)

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
      })
    }
  }, [open, category, defaultParentId, isEdit, flat])

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
    warrantyPolicyId !== snapshot.warrantyPolicyId
  )

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nameEn.trim()) { toast.error('Name (EN) is required'); return }

    const payload = {
      name_en: nameEn.trim(),
      name_ar: nameAr.trim() || null,
      sku: sku.trim() || null,
      parent_id: parentId || null,
      default_sub_container_id: subContainerId || null,
      default_warranty_policy_id: warrantyPolicyId || null,
    }

    if (isEdit && category) {
      update.mutate(
        { id: category.id, ...payload },
        {
          onSuccess: () => { toast.success('Category updated'); guardRef.current?.closeAfterSubmit() },
          onError: (err) => toast.error(err.message),
        },
      )
    } else {
      create.mutate(
        { ...payload, type: categoryType },
        {
          onSuccess: () => { toast.success('Category created'); guardRef.current?.closeAfterSubmit() },
          onError: (err) => toast.error(err.message),
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
            <DialogTitle>{dialogTitle}</DialogTitle>
            {isEdit && (
              <Badge variant={category?.status === 'archived' ? 'destructive' : 'secondary'} className="text-[10px]">
                {category?.status === 'archived' ? 'Archived' : 'Active'}
              </Badge>
            )}
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
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

            {/* SKU + Type */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="cat-sku-prefix" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">SKU Prefix</Label>
                <Input id="cat-sku-prefix" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Optional" className="font-mono h-10" />
                <p className="text-[10px] text-muted-foreground">Optional — item SKUs are auto-generated if left empty</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cat-type" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Category Type</Label>
                <Input id="cat-type" value={TYPE_LABELS[categoryType] ?? categoryType} disabled className="bg-muted text-muted-foreground h-10" />
              </div>
            </div>

          </div>

          <DialogFooter className="pt-4 mt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => guardRef.current?.requestClose()}>Cancel</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Category'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </GuardedDialog>
  )
}
