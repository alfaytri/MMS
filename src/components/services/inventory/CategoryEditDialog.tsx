'use client'

import { useState, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCreateInventoryCategory, useUpdateInventoryCategory, type InventoryCategory } from '@/hooks/useInventory'
import { useInventoryTree, breadcrumb, allDescendantIds } from '@/hooks/useInventoryTree'

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
  const [parentId, setParentId] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setNameEn(category?.name_en ?? '')
      setNameAr(category?.name_ar ?? '')
      setSku((category as any)?.sku ?? '')
      setParentId(
        isEdit
          ? ((category as any)?.parent_id ?? null)
          : (defaultParentId ?? null)
      )
    }
  }, [open, category, defaultParentId, isEdit])

  // Build parent options, excluding self + descendants when editing (cycle prevention)
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
      <DialogContent className="w-full h-full rounded-none sm:h-auto sm:max-w-md sm:rounded-lg">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label>Parent Category</Label>
            <Select
              value={parentId ?? '__none__'}
              onValueChange={(v) => setParentId(v === '__none__' ? null : v)}
            >
              <SelectTrigger className="text-xs">
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
          <div className="space-y-1">
            <Label>Name (English) *</Label>
            <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="e.g. Water Heaters" />
          </div>
          <div className="space-y-1">
            <Label>Name (Arabic)</Label>
            <Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" placeholder="الاسم بالعربية" />
          </div>
          <div className="space-y-1">
            <Label>SKU Prefix</Label>
            <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="e.g. WH" className="font-mono" />
          </div>
          <DialogFooter>
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
