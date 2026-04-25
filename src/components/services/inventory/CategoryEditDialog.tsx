'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateInventoryCategory, useUpdateInventoryCategory, type InventoryCategory } from '@/hooks/useInventory'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  categoryType: string
  category?: InventoryCategory | null
}

export function CategoryEditDialog({ open, onOpenChange, categoryType, category }: Props) {
  const isEdit = !!category
  const create = useCreateInventoryCategory()
  const update = useUpdateInventoryCategory()

  const [nameEn, setNameEn] = useState('')
  const [nameAr, setNameAr] = useState('')
  const [sku, setSku] = useState('')

  useEffect(() => {
    if (open) {
      setNameEn(category?.name_en ?? '')
      setNameAr(category?.name_ar ?? '')
      setSku((category as any)?.sku ?? '')
    }
  }, [open, category])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nameEn.trim()) { toast.error('Name (EN) is required'); return }

    const payload = { name_en: nameEn.trim(), name_ar: nameAr.trim() || null, sku: sku.trim() || null }

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full h-full rounded-none sm:h-auto sm:max-w-md sm:rounded-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Category' : 'New Category'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
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
              {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Category'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
