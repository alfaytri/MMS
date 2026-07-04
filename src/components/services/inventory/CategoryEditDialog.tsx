'use client'

import { useState, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useCreateInventoryCategory, useUpdateInventoryCategory, type InventoryCategory } from '@/hooks/useInventory'
import { useInventoryTree, breadcrumb, allDescendantIds } from '@/hooks/useInventoryTree'

const TYPE_LABELS: Record<string, string> = {
  'products': 'Products',
  'spare-parts': 'Spare Parts',
  'consumables': 'Consumables',
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
  const [parentId, setParentId] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setNameEn(category?.name_en ?? '')
      setNameAr(category?.name_ar ?? '')
      setSku(category?.sku ?? '')
      setDescription(category?.description ?? '')
      setParentId(
        isEdit
          ? (category?.parent_id ?? null)
          : (defaultParentId ?? null)
      )
    }
  }, [open, category, defaultParentId, isEdit])

  const parentOptions = useMemo(() => {
    if (!flat.length) return []
    const excludeIds = new Set<string>()
    if (isEdit && category) {
      excludeIds.add(category.id)
      for (const id of allDescendantIds(category.id, flat)) {
        excludeIds.add(id)
      }
    }
    return flat
      .filter((c) => !excludeIds.has(c.id))
      .map((c) => ({
        id: c.id,
        label: breadcrumb(c.id, flat),
      }))
  }, [flat, isEdit, category])

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
            {/* Parent Category */}
            <div className="space-y-1.5">
              <Label htmlFor="cat-parent" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Parent Category</Label>
              <Select
                value={parentId ?? '__none__'}
                onValueChange={(v) => setParentId(v === '__none__' ? null : v)}
              >
                <SelectTrigger id="cat-parent" className="h-10">
                  <SelectValue placeholder="None (top-level)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None (top-level)</SelectItem>
                  {parentOptions.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Names — side by side */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="cat-name-en" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Name (English) *</Label>
                <Input id="cat-name-en" value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="e.g. Water Heaters" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cat-name-ar" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Name (Arabic)</Label>
                <Input id="cat-name-ar" value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" placeholder="الاسم بالعربية" className="h-10" />
              </div>
            </div>

            {/* SKU + Type — side by side */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="cat-sku-prefix" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">SKU Prefix</Label>
                <Input id="cat-sku-prefix" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="e.g. WH" className="font-mono h-10" />
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
                placeholder="Optional notes about this category..."
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
