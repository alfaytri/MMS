'use client'

import { useState, useEffect } from 'react'
import { X, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useCreateInventoryItem, useUpdateInventoryItem, useUpsertInventoryItemAttributes, type InventoryItem } from '@/hooks/useInventory'

const UNITS = ['Piece', 'Kg', 'Litre', 'Set', 'Box', 'Metre', 'Roll', 'Pair', 'Other']

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  categoryId: string
  categoryType: string
  item?: InventoryItem | null
}

export function ItemEditDialog({ open, onOpenChange, categoryId, categoryType, item }: Props) {
  const isEdit = !!item
  const create = useCreateInventoryItem()
  const update = useUpdateInventoryItem()
  const upsertAttributes = useUpsertInventoryItemAttributes()

  const [nameEn, setNameEn] = useState('')
  const [nameAr, setNameAr] = useState('')
  const [sku, setSku] = useState('')
  const [unit, setUnit] = useState('Piece')
  const [chips, setChips] = useState<string[]>([])
  const [chipInput, setChipInput] = useState('')

  useEffect(() => {
    if (open) {
      setNameEn(item?.name_en ?? '')
      setNameAr(item?.name_ar ?? '')
      setSku(item?.sku ?? '')
      setUnit(item?.unit ?? 'Piece')
      setChips([])
      setChipInput('')
    }
  }, [open, item])

  function addChip() {
    const val = chipInput.trim()
    if (val && !chips.includes(val)) setChips((c) => [...c, val])
    setChipInput('')
  }

  function removeChip(chip: string) {
    setChips((c) => c.filter((x) => x !== chip))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nameEn.trim()) { toast.error('Name (EN) is required'); return }
    if (!sku.trim()) { toast.error('SKU is required'); return }

    const payload = {
      name_en: nameEn.trim(),
      name_ar: nameAr.trim() || null,
      sku: sku.trim(),
      unit,
    }

    if (isEdit && item) {
      update.mutate(
        { id: item.id, ...payload },
        {
          onSuccess: () => {
            upsertAttributes.mutate({ itemId: item.id, attributes: chips })
            toast.success('Item updated')
            onOpenChange(false)
          },
          onError: (err) => toast.error(err.message),
        },
      )
    } else {
      create.mutate(
        { ...payload, category_id: categoryId },
        {
          onSuccess: (data) => {
            upsertAttributes.mutate({ itemId: data.id, attributes: chips })
            toast.success('Item created')
            onOpenChange(false)
          },
          onError: (err) => toast.error(err.message),
        },
      )
    }
  }

  const isPending = create.isPending || update.isPending || upsertAttributes.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full h-full rounded-none sm:h-auto sm:max-w-lg sm:rounded-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Item' : 'New Item'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Name (English) *</Label>
              <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="e.g. Alfaheat" />
            </div>
            <div className="space-y-1">
              <Label>Name (Arabic)</Label>
              <Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" placeholder="الاسم بالعربية" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>SKU *</Label>
              <Input value={sku} onChange={(e) => setSku(e.target.value)} className="font-mono" placeholder="PRD-HT-001" />
            </div>
            <div className="space-y-1">
              <Label>Unit</Label>
              <Select value={unit} onValueChange={(v) => { if (v !== null) setUnit(v) }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Item Type</Label>
            <Input value={categoryType} disabled className="bg-muted text-muted-foreground capitalize" />
          </div>
          <div className="space-y-2">
            <Label>Attributes (optional chips)</Label>
            <div className="flex gap-2">
              <Input
                value={chipInput}
                onChange={(e) => setChipInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addChip() } }}
                placeholder='e.g. "80 Gallon"'
                className="flex-1"
              />
              <Button type="button" variant="outline" size="icon" onClick={addChip}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {chips.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {chips.map((chip) => (
                  <Badge key={chip} variant="secondary" className="gap-1">
                    {chip}
                    <button type="button" onClick={() => removeChip(chip)} className="hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Item'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
