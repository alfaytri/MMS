'use client'

import { useState, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useCreateInventoryCategory, useUpdateInventoryCategory, type InventoryCategory } from '@/hooks/useInventory'
import { useInventoryTree, ancestors, allDescendantIds } from '@/hooks/useInventoryTree'

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

export function CategoryEditDialog({ open, onOpenChange, categoryType, category, parentId: defaultParentId }: Props) {
  const isEdit = !!category
  const create = useCreateInventoryCategory()
  const update = useUpdateInventoryCategory()
  const { flat } = useInventoryTree(categoryType)

  const [nameEn, setNameEn] = useState('')
  const [nameAr, setNameAr] = useState('')
  const [sku, setSku] = useState('')
  const [description, setDescription] = useState('')
  const [l1Id, setL1Id] = useState<string | null>(null)
  const [l2Id, setL2Id] = useState<string | null>(null)
  const [l3Id, setL3Id] = useState<string | null>(null)

  const parentId = l3Id ?? l2Id ?? l1Id ?? null

  useEffect(() => {
    if (open) {
      setNameEn(category?.name_en ?? '')
      setNameAr(category?.name_ar ?? '')
      setSku(category?.sku ?? '')
      setDescription(category?.description ?? '')

      const targetId = isEdit ? (category?.parent_id ?? null) : (defaultParentId ?? null)
      if (targetId && flat.length > 0) {
        const target = flat.find((c) => c.id === targetId)
        if (target) {
          const chain = [...ancestors(targetId, flat), target]
          setL1Id(chain[0]?.id ?? null)
          setL2Id(chain[1]?.id ?? null)
          setL3Id(chain[2]?.id ?? null)
          return
        }
      }
      setL1Id(null); setL2Id(null); setL3Id(null)
    }
  }, [open, category, defaultParentId, isEdit, flat])

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

  const sortedChildren = useMemo(() => {
    const byParent = new Map<string | null, InventoryCategory[]>()
    for (const c of flat) {
      if (excludeIds.has(c.id)) continue
      const key = c.parent_id ?? null
      const arr = byParent.get(key)
      if (arr) arr.push(c)
      else byParent.set(key, [c])
    }
    const sorter = (a: InventoryCategory, b: InventoryCategory) => {
      const ao = a.sort_order ?? 0, bo = b.sort_order ?? 0
      if (ao !== bo) return ao - bo
      return a.name_en.localeCompare(b.name_en)
    }
    for (const arr of byParent.values()) arr.sort(sorter)
    return (pid: string | null) => byParent.get(pid) ?? []
  }, [flat, excludeIds])

  const l1Options = useMemo(() => sortedChildren(null), [sortedChildren])
  const l2Options = useMemo(() => l1Id ? sortedChildren(l1Id) : [], [sortedChildren, l1Id])
  const l3Options = useMemo(() => l2Id ? sortedChildren(l2Id) : [], [sortedChildren, l2Id])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nameEn.trim()) { toast.error('Name (EN) is required'); return }

    const payload = {
      name_en: nameEn.trim(),
      name_ar: nameAr.trim() || null,
      sku: sku.trim() || null,
      description: description.trim() || null,
      parent_id: parentId || null,
    }

    if (isEdit && category) {
      update.mutate(
        { id: category.id, ...payload },
        {
          onSuccess: () => { toast.success('Category updated'); onOpenChange(false) },
          onError: (err) => toast.error(err.message),
        },
      )
    } else {
      create.mutate(
        { ...payload, type: categoryType },
        {
          onSuccess: () => { toast.success('Category created'); onOpenChange(false) },
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
    <Dialog open={open} onOpenChange={onOpenChange}>
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Select
                  value={l1Id ?? '__none__'}
                  onValueChange={(v) => { setL1Id(v === '__none__' ? null : v); setL2Id(null); setL3Id(null) }}
                >
                  <SelectTrigger className="h-10 w-full min-w-0">
                    <span className="truncate">
                      {l1Id ? l1Options.find((c) => c.id === l1Id)?.name_en ?? 'Select' : 'None (top)'}
                    </span>
                  </SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    <SelectItem value="__none__">None (top-level)</SelectItem>
                    {l1Options.map((c) => <SelectItem key={c.id} value={c.id}>{c.name_en}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select
                  value={l2Id ?? '__none__'}
                  onValueChange={(v) => { setL2Id(v === '__none__' ? null : v); setL3Id(null) }}
                  disabled={!l1Id || l2Options.length === 0}
                >
                  <SelectTrigger className="h-10 w-full min-w-0">
                    <span className="truncate">
                      {!l1Id ? '—' : l2Id ? l2Options.find((c) => c.id === l2Id)?.name_en ?? 'Select' : 'None'}
                    </span>
                  </SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    <SelectItem value="__none__">None</SelectItem>
                    {l2Options.map((c) => <SelectItem key={c.id} value={c.id}>{c.name_en}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select
                  value={l3Id ?? '__none__'}
                  onValueChange={(v) => { setL3Id(v === '__none__' ? null : v) }}
                  disabled={!l2Id || l3Options.length === 0}
                >
                  <SelectTrigger className="h-10 w-full min-w-0">
                    <span className="truncate">
                      {!l2Id ? '—' : l3Id ? l3Options.find((c) => c.id === l3Id)?.name_en ?? 'Select' : 'None'}
                    </span>
                  </SelectTrigger>
                  <SelectContent className="max-h-60 overflow-y-auto">
                    <SelectItem value="__none__">None</SelectItem>
                    {l3Options.map((c) => <SelectItem key={c.id} value={c.id}>{c.name_en}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-[10px] text-muted-foreground">Select the parent level — deeper levels appear as you select</p>
            </div>

            {/* Names — side by side */}
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

            {/* SKU + Type — side by side */}
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

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="cat-description" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Description</Label>
              <Textarea
                id="cat-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add notes or description"
                rows={3}
                className="resize-none"
              />
            </div>
          </div>

          <DialogFooter className="pt-4 mt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Category'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
