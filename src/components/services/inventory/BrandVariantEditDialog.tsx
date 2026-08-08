'use client'

import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { GuardedDialog, type GuardedFormDialogHandle } from '@/components/shared/GuardedFormDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BrandCombobox } from './BrandCombobox'
import { OriginCombobox } from './OriginCombobox'
import { useCreateBrandVariant, useUpdateBrandVariant, useVariantWarehouseStock, type BrandVariant } from '@/hooks/useInventory'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  itemId: string
  variant?: BrandVariant | null
  // When provided (and `variant` is absent), the dialog is in "add-origin"
  // mode: brand is locked to this value and only the origin picker renders.
  // `id: null` represents the Unbranded group — the created variant gets
  // brand_id = null (an origin-only/generic leaf under "Unbranded").
  fixedBrand?: { id: string | null; name: string }
}

// Maps a raw mutation error to a readable message. Unique-violation on the
// (item, brand, origin) leaf gets a friendly message; every other error
// concatenates every available Postgres diagnostic field (per project rule —
// never hide a non-duplicate error behind a generic string; PostgrestError
// isn't an Error subclass, so `message` alone can be thin — code/details/hint
// often carry the actually-useful part).
function toReadableError(err: unknown): string {
  const e = err as { code?: string; message?: string; details?: string; hint?: string } | null
  const msg = e?.message ?? ''
  if (e?.code === '23505' || msg.includes('uq_iibv_item_brand_origin')) {
    return 'A variant with this brand and origin already exists for this item.'
  }
  const parts = [e?.code, e?.message, e?.details, e?.hint].filter(Boolean)
  return parts.length > 0 ? parts.join(' — ') : 'Something went wrong'
}

export function BrandVariantEditDialog({ open, onOpenChange, itemId, variant, fixedBrand }: Props) {
  const isEdit = !!variant
  // Three modes: edit (variant provided) / add-origin (fixedBrand provided,
  // no variant — brand picker hidden, brand locked) / add-brand (neither).
  const isAddOrigin = !isEdit && !!fixedBrand
  const create = useCreateBrandVariant()
  const update = useUpdateBrandVariant()

  const [brandId, setBrandId] = useState<string | null>(null)
  const [countryId, setCountryId] = useState<number | null>(null)
  const [code, setCode] = useState('')
  const [sellingPrice, setSellingPrice] = useState('')
  const [reorderPoint, setReorderPoint] = useState('0')
  const [avgCost, setAvgCost] = useState('')

  const guardRef = useRef<GuardedFormDialogHandle>(null)

  // Kept only for avgCostLocked/whStockLoading — the warehouse allocation UI
  // that used to read perWarehouse/unassigned here was removed; stock is now
  // receival-driven only (see handleSubmit — stock_level is never set here).
  const { data: whStockData, isLoading: whStockLoading } = useVariantWarehouseStock(isEdit && open ? variant?.id : undefined)

  // True only after a real PO receival has created FIFO layers with a receival_id.
  // Manual allocation (Odoo migration, opening stock) does NOT lock the field.
  const avgCostLocked = isEdit && (whStockData?.hasReceivals ?? false)

  useEffect(() => {
    if (open) {
      setBrandId(fixedBrand?.id ?? variant?.brand_id ?? null)
      setCountryId(variant?.country_id ?? null)
      setCode(variant?.code ?? '')
      setSellingPrice(variant?.selling_price != null ? String(variant.selling_price) : '')
      setReorderPoint(variant ? String(variant.reorder_point ?? 0) : '0')
      setAvgCost(variant?.average_cost != null ? String(Math.round(variant.average_cost * 100) / 100) : '')
    }
  }, [open, variant, fixedBrand])

  const isDirty =
    brandId !== (fixedBrand?.id ?? variant?.brand_id ?? null) ||
    countryId !== (variant?.country_id ?? null) ||
    code !== (variant?.code ?? '') ||
    sellingPrice !== (variant?.selling_price != null ? String(variant.selling_price) : '') ||
    reorderPoint !== (variant ? String(variant.reorder_point ?? 0) : '0') ||
    avgCost !== (variant?.average_cost != null ? String(Math.round(variant.average_cost * 100) / 100) : '')

  // Title reflects the active mode (see isAddOrigin above).
  const dialogTitle = isAddOrigin
    ? `Add Origin — ${fixedBrand!.name}`
    : isEdit
      ? 'Edit Variant'
      : 'Add Brand'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    // The BEFORE INSERT/UPDATE trigger fills the denormalized `brand` text
    // from brands.name whenever brand_id is set (non-null) — when brand_id
    // is null, the trigger leaves `brand` exactly as sent. We only need to
    // send `brand` ourselves in two cases:
    //  - create: the column is NOT NULL, and '' satisfies it for
    //    origin-only/generic variants (the trigger overwrites it once
    //    brand_id is set).
    //  - edit, where the user just CLEARED a previously-set brand
    //    (brand_id went non-null → null): that orphans the old text, so we
    //    blank it explicitly.
    // Editing a variant that was ALREADY brand-less must NOT send `brand` —
    // it may carry legacy text (e.g. "FLARE NUT") that's read elsewhere in
    // the app, and omitting the key preserves it untouched.
    const priorBrandId = variant?.brand_id ?? null
    const brandWasCleared = isEdit && priorBrandId !== null && brandId === null
    const includeBrandField = !isEdit || brandWasCleared

    // stock_level is deliberately never set here — stock is receival-driven
    // only. Omitting the key: on create, the column defaults to 0 (a fresh
    // variant starts at zero until a receival lands); on edit, an omitted
    // key leaves the existing stock_level untouched.
    const payload = {
      ...(includeBrandField && { brand: '' }),
      brand_id: brandId,
      country_id: countryId,
      code: code.trim() || null,
      selling_price: sellingPrice ? Number(sellingPrice) : 0,
      reorder_point: Number(reorderPoint),
      ...(!avgCostLocked && { average_cost: avgCost !== '' ? Number(avgCost) : null }),
    }

    if (isEdit && variant) {
      update.mutate(
        { id: variant.id, ...payload },
        {
          onSuccess: () => {
            toast.success('Variant updated')
            guardRef.current?.closeAfterSubmit()
          },
          onError: (err) => toast.error(toReadableError(err)),
        },
      )
    } else {
      create.mutate(
        { item_id: itemId, ...payload },
        {
          onSuccess: () => {
            toast.success('Variant added')
            guardRef.current?.closeAfterSubmit()
          },
          onError: (err) => toast.error(toReadableError(err)),
        },
      )
    }
  }

  const isPending = create.isPending || update.isPending

  return (
    <GuardedDialog open={open} onOpenChange={onOpenChange} isDirty={isDirty} ref={guardRef}>
      <DialogContent className="w-full h-full rounded-none sm:h-auto sm:max-w-md sm:rounded-lg overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Brand + Origin. add-origin mode locks brand as read-only context
              and shows a full-width origin picker; add-brand/edit modes use
              parallel side-by-side searchable comboboxes (never flyout). */}
          {isAddOrigin ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Brand</Label>
                <div className="flex h-11 min-h-11 w-full items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground">
                  <span className="truncate">{fixedBrand!.name}</span>
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="bv-origin">Origin</Label>
                <OriginCombobox id="bv-origin" value={countryId} onChange={setCountryId} />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="bv-brand">Brand</Label>
                <BrandCombobox
                  id="bv-brand"
                  value={brandId}
                  onChange={(b) => setBrandId(b?.id ?? null)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="bv-origin">Origin</Label>
                <OriginCombobox id="bv-origin" value={countryId} onChange={setCountryId} />
              </div>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="bv-sku">Code (optional)</Label>
            <Input
              id="bv-sku"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Auto-generated if blank"
              className="font-mono"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="bv-selling-price">Selling Price (QAR)</Label>
            <Input
              id="bv-selling-price"
              type="number" min="0" step="0.01"
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="bv-avg-cost">Avg Cost (QAR)</Label>
              {avgCostLocked ? (
                <div className="space-y-1">
                  <Input
                    value={avgCost ? Number(avgCost).toLocaleString('en-QA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''}
                    readOnly
                    className="bg-muted text-muted-foreground cursor-not-allowed"
                  />
                  <p className="text-xs text-muted-foreground">Auto-calculated from PO receivals</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <Input
                    type="number" min="0" step="0.01"
                    value={avgCost}
                    onChange={(e) => setAvgCost(e.target.value)}
                    placeholder="0.00"
                    // Guard the load-window race: in edit mode, whStockData
                    // resolves avgCostLocked async. Until it does, block
                    // typing here so a value can't be entered and submitted
                    // before we know whether this variant already has
                    // receival-backed FIFO layers (which would lock it).
                    disabled={isEdit && whStockLoading}
                  />
                  <p className="text-xs text-muted-foreground">
                    {isEdit && whStockLoading
                      ? 'Checking receival history…'
                      : 'Set initial cost — overwritten by first PO receival'}
                  </p>
                </div>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="bv-reorder-point">Reorder Point</Label>
              <Input
                id="bv-reorder-point"
                type="number" min="0" step="1"
                value={reorderPoint}
                onChange={(e) => setReorderPoint(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => guardRef.current?.requestClose()}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Variant'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </GuardedDialog>
  )
}
