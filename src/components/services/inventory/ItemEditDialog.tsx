'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { X, ChevronDown, ChevronRight, Users, Camera, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { ItemPhoto } from '@/components/shared/ItemPhoto'
import { useCreateInventoryItem, useUpdateInventoryItem, type InventoryItem } from '@/hooks/useInventory'
import { useUpsertItemAttributes } from '@/hooks/useAttributes'
import { useActiveWarrantyPolicies } from '@/hooks/useWarrantyPolicies'
import { useEffectiveWarranty } from '@/hooks/useEffectiveWarranty'
import { ItemAttributesSection } from '@/components/master-data/attributes/ItemAttributesSection'
import { useDivisions } from '@/hooks/useDivisions'
import { useItemStockByDivision } from '@/hooks/useItemStockByDivision'
import { compressImageBeforeUpload } from '@/lib/compressImage'
import { createClient } from '@/lib/supabase/client'
import { useDirtyDialogGuard } from '@/hooks/useDirtyDialogGuard'

const PHOTO_BUCKET = 'inventory-item-photos'

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
  const upsertItemAttributes = useUpsertItemAttributes()

  const [nameEn, setNameEn] = useState('')
  const [nameAr, setNameAr] = useState('')
  const [sku, setSku] = useState('')
  const [unit, setUnit] = useState('Piece')
  const [warrantyPolicyId, setWarrantyPolicyId] = useState<string | null>(null)
  const [attrValues, setAttrValues] = useState<Array<{ definition_id: string; option_id: string | null }>>([])
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const sessionUploadsRef = useRef<{ url: string; path: string }[]>([])
  const submittedRef      = useRef(false)
  // D.12 — cross-division sharing. Empty list = no additional sharing (default).
  const [sharedWith, setSharedWith] = useState<string[]>([])
  const [shareOpen, setShareOpen] = useState(false)

  const { data: divisions = [] } = useDivisions()
  const { data: stockByDivision } = useItemStockByDivision(item?.id ?? null)
  const { data: warrantyPolicies = [] } = useActiveWarrantyPolicies()
  const { data: effectiveWarranty } = useEffectiveWarranty(item?.id ?? null)

  useEffect(() => {
    if (open) {
      setNameEn(item?.name_en ?? '')
      setNameAr(item?.name_ar ?? '')
      setSku(item?.sku ?? '')
      setUnit(item?.unit ?? 'Piece')
      setWarrantyPolicyId(item?.warranty_policy_id ?? null)
      setAttrValues([])
      setImageUrl((item as unknown as { image_url?: string | null } | null | undefined)?.image_url ?? null)
      setUploading(false)
      const shared = (item as unknown as { shared_with_division_ids?: string[] } | null | undefined)?.shared_with_division_ids ?? []
      setSharedWith(shared)
      setShareOpen(shared.length > 0)
    }
  }, [open, item])

  async function handlePhotoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!ALLOWED.includes(file.type)) {
      toast.error('Unsupported type — JPG / PNG / WEBP / GIF only')
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Photo too large — maximum 10 MB')
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    setUploading(true)
    try {
      const compressed = await compressImageBeforeUpload(file)
      const supabase = createClient()
      const now = new Date()
      const year = now.getFullYear()
      const month = String(now.getMonth() + 1).padStart(2, '0')
      const folder = item?.id ?? 'pending'
      const sanitized = compressed.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `${year}/${month}/${folder}/${now.getTime()}-${sanitized}`
      const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, compressed)
      if (error) throw error
      const { data: pub } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path)

      const supersededPaths = sessionUploadsRef.current.map((u) => u.path)
      if (supersededPaths.length > 0) {
        void supabase.storage.from(PHOTO_BUCKET).remove(supersededPaths).catch(() => {})
      }
      sessionUploadsRef.current = [{ url: pub.publicUrl, path }]
      setImageUrl(pub.publicUrl)
    } catch (err) {
      toast.error(`Photo upload failed: ${(err as Error).message}`)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function handlePhotoRemove() {
    const sessionMatch = sessionUploadsRef.current.find((u) => u.url === imageUrl)
    if (sessionMatch) {
      const supabase = createClient()
      void supabase.storage.from(PHOTO_BUCKET).remove([sessionMatch.path]).catch(() => {})
      sessionUploadsRef.current = sessionUploadsRef.current.filter((u) => u.url !== imageUrl)
    }
    setImageUrl(null)
  }

  function sweepSessionUploads() {
    const paths = sessionUploadsRef.current.map((u) => u.path)
    if (paths.length === 0) return
    sessionUploadsRef.current = []
    const supabase = createClient()
    void supabase.storage.from(PHOTO_BUCKET).remove(paths).catch(() => {})
  }

  const isDirty = isEdit && item
    ? (
        nameEn !== (item.name_en ?? '') ||
        nameAr !== (item.name_ar ?? '') ||
        sku !== (item.sku ?? '') ||
        unit !== (item.unit ?? 'Piece') ||
        imageUrl !== ((item as unknown as { image_url?: string | null }).image_url ?? null) ||
        attrValues.length > 0 ||
        JSON.stringify(sharedWith.slice().sort()) !==
          JSON.stringify(
            ((item as unknown as { shared_with_division_ids?: string[] }).shared_with_division_ids ?? [])
              .slice().sort()
          )
      )
    : (
        nameEn.trim() !== '' ||
        nameAr.trim() !== '' ||
        sku.trim() !== '' ||
        unit !== 'Piece' ||
        imageUrl !== null ||
        attrValues.length > 0 ||
        sharedWith.length > 0
      )

  function handleOpenChange(next: boolean) {
    if (!next && !submittedRef.current) sweepSessionUploads()
    if (!next) submittedRef.current = false
    onOpenChange(next)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (!submittedRef.current) sweepSessionUploads() }, [])

  const { guardedOnOpenChange, confirmDialog } = useDirtyDialogGuard({
    isDirty,
    onOpenChange: handleOpenChange,
  })

  const handleAttrChange = useCallback(
    (values: Array<{ definition_id: string; option_id: string | null }>) => {
      setAttrValues(values)
    },
    [],
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nameEn.trim()) { toast.error('Name (EN) is required'); return }
    if (!sku.trim()) { toast.error('SKU is required'); return }

    const payload = {
      name_en: nameEn.trim(),
      name_ar: nameAr.trim() || null,
      sku: sku.trim(),
      unit,
      image_url: imageUrl,
      shared_with_division_ids: sharedWith,
      warranty_policy_id: warrantyPolicyId,
    }

    try {
      let itemId: string
      if (isEdit && item) {
        await update.mutateAsync({ id: item.id, ...payload })
        itemId = item.id
      } else {
        const data = await create.mutateAsync({ ...payload, category_id: categoryId })
        itemId = data.id
      }
      if (attrValues.length > 0) {
        await upsertItemAttributes.mutateAsync({ itemId, values: attrValues })
      }
      sessionUploadsRef.current = []
      submittedRef.current = true
      toast.success(isEdit ? 'Item updated' : 'Item created')
      handleOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    }
  }

  const isPending = create.isPending || update.isPending || upsertItemAttributes.isPending

  return (
    <><Dialog open={open} onOpenChange={guardedOnOpenChange}>
      <DialogContent className="w-full h-full rounded-none sm:h-auto sm:max-w-lg sm:rounded-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Item' : 'New Item'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Photo — thumbnail + change / remove */}
          <div className="flex items-start gap-3">
            <ItemPhoto url={imageUrl} name={nameEn} size={64} />
            <div className="flex-1 min-w-0 space-y-1.5">
              <Label className="text-xs">Photo</Label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoPick}
              />
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px] gap-1"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading || isPending}
                >
                  {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
                  {uploading ? 'Uploading…' : imageUrl ? 'Change photo' : 'Add photo'}
                </Button>
                {imageUrl && !uploading && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[11px] gap-1 text-muted-foreground hover:text-destructive"
                    onClick={handlePhotoRemove}
                    disabled={isPending}
                  >
                    <X className="h-3 w-3" />
                    Remove
                  </Button>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">
                JPG / PNG, up to 10 MB. Auto-compressed to ~1600 px on the longest edge.
              </p>
            </div>
          </div>

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

          {/* Warranty policy override */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Warranty Policy Override
            </Label>
            <Select
              value={warrantyPolicyId ?? '__inherit__'}
              onValueChange={(v) => setWarrantyPolicyId(v === '__inherit__' ? null : v)}
            >
              <SelectTrigger className="h-10 w-full min-w-0">
                <span className="truncate">
                  {warrantyPolicyId
                    ? warrantyPolicies.find((p) => p.id === warrantyPolicyId)?.name ?? 'Select'
                    : 'Use category default'}
                </span>
              </SelectTrigger>
              <SelectContent className="max-h-60 overflow-y-auto">
                <SelectItem value="__inherit__">Use category default</SelectItem>
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
            {isEdit && (
              <p className="text-[10px] text-muted-foreground">
                {effectiveWarranty?.policy
                  ? <>Effective policy: <span className="font-medium text-foreground">{effectiveWarranty.policy.name}</span>{effectiveWarranty.policy.duration_months > 0 ? ` — ${effectiveWarranty.policy.duration_months} months` : ''}. Save changes to preview a different override.</>
                  : 'Effective policy: no warranty. This item is uninsured unless a policy is set here or on an ancestor category.'}
              </p>
            )}
          </div>

          <ItemAttributesSection
            itemId={item?.id ?? null}
            categoryId={categoryId}
            onChange={handleAttrChange}
          />

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
            <Button type="button" variant="outline" onClick={() => guardedOnOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending || uploading}>
              {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Item'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>{confirmDialog}</>
  )
}
