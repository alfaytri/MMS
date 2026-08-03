'use client'

import { useState, useEffect } from 'react'
import { X, Plus, ChevronDown, ChevronRight, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { useCreateInventoryItem, useUpdateInventoryItem, useUpsertInventoryItemAttributes, type InventoryItem } from '@/hooks/useInventory'
import { useDivisions } from '@/hooks/useDivisions'
import { useItemStockByDivision } from '@/hooks/useItemStockByDivision'

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
  // D.12 — cross-division sharing. Empty list = no additional sharing (default).
  const [sharedWith, setSharedWith] = useState<string[]>([])
  const [shareOpen, setShareOpen] = useState(false)

  const { data: divisions = [] } = useDivisions()
  const { data: stockByDivision } = useItemStockByDivision(item?.id ?? null)

  useEffect(() => {
    if (open) {
      setNameEn(item?.name_en ?? '')
      setNameAr(item?.name_ar ?? '')
      setSku(item?.sku ?? '')
      setUnit(item?.unit ?? 'Piece')
      setChips([])
      setChipInput('')
      const shared = (item as unknown as { shared_with_division_ids?: string[] } | null | undefined)?.shared_with_division_ids ?? []
      setSharedWith(shared)
      setShareOpen(shared.length > 0)
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
      shared_with_division_ids: sharedWith,
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
              <Label htmlFor="item-name-en">Name (English) *</Label>
              <Input id="item-name-en" value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="e.g. Alfaheat" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="item-name-ar">Name (Arabic)</Label>
              <Input id="item-name-ar" value={nameAr} onChange={(e) => setNameAr(e.target.value)} dir="rtl" placeholder="الاسم بالعربية" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="item-sku">SKU *</Label>
              <Input id="item-sku" value={sku} onChange={(e) => setSku(e.target.value)} className="font-mono" placeholder="PRD-HT-001" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="item-unit">Unit</Label>
              <Select value={unit} onValueChange={(v) => { if (v !== null) setUnit(v) }}>
                <SelectTrigger id="item-unit"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-60 overflow-y-auto">
                  {UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="item-type">Item Type</Label>
            <Input id="item-type" value={categoryType} disabled className="bg-muted text-muted-foreground capitalize" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="item-attribute-input">Attributes (optional chips)</Label>
            <div className="flex gap-2">
              <Input
                id="item-attribute-input"
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

          {/* D.12 — Access & Sharing (collapsible, default collapsed unless already set) */}
          <div className="rounded-md border border-dashed border-border">
            <button
              type="button"
              onClick={() => setShareOpen((v) => !v)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors rounded-md"
            >
              {shareOpen
                ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium">Access &amp; Sharing</span>
              {sharedWith.length > 0 && (
                <Badge variant="outline" className="ml-auto text-[10px] h-4 px-1.5">
                  Shared with {sharedWith.length}
                </Badge>
              )}
            </button>
            {shareOpen && (
              <div className="px-3 pb-3 pt-1 space-y-2">
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Items don&apos;t belong to a division — ownership is derived from whichever divisions physically hold stock of the item. Below, an <span className="text-success font-medium">Owner</span> tag means that division can already sell (they have stock); ticking a division adds explicit share access so they can consume stock owned by another division without a transfer. One-way per item.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {divisions.map((div) => {
                    const checked = sharedWith.includes(div.id)
                    const naturalQty = stockByDivision?.get(div.id) ?? 0
                    const isOwner = naturalQty > 0
                    // Owner divisions can already sell — no checkbox, no
                    // toggling required. Render as a passive info row.
                    if (isOwner) {
                      return (
                        <div
                          key={div.id}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-success/30 bg-success/5 min-h-9"
                          title={`${naturalQty} units held in ${div.name}'s sub-container`}
                        >
                          <span className="text-xs flex-1 truncate">
                            {div.name}
                            {div.short_name && (
                              <span className="text-[10px] text-muted-foreground"> · {div.short_name}</span>
                            )}
                          </span>
                          <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-success/40 text-success flex-shrink-0">
                            Owned · {naturalQty}
                          </Badge>
                        </div>
                      )
                    }
                    // Non-owner: rendered as a tickable share row.
                    return (
                      <label
                        key={div.id}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-transparent hover:border-border hover:bg-muted/30 cursor-pointer min-h-9"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            setSharedWith((cur) =>
                              v ? [...cur, div.id] : cur.filter((id) => id !== div.id),
                            )
                          }}
                        />
                        <span className="text-xs flex-1 truncate">
                          {div.name}
                          {div.short_name && (
                            <span className="text-[10px] text-muted-foreground"> · {div.short_name}</span>
                          )}
                        </span>
                        {checked ? (
                          <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-primary/40 text-primary flex-shrink-0">
                            Shared
                          </Badge>
                        ) : (
                          <span className="text-[9px] text-muted-foreground flex-shrink-0">no stock</span>
                        )}
                      </label>
                    )
                  })}
                </div>
                {sharedWith.length === 0 && (
                  <p className="text-[10px] text-muted-foreground italic">
                    No extra shares — only <span className="text-success font-medium">Owner</span> divisions above can sell this item.
                  </p>
                )}
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
