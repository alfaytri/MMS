'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { X, ChevronDown, ChevronRight, Users, Camera, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { ItemPhoto } from '@/components/shared/ItemPhoto'
import { useCreateInventoryItem, useUpdateInventoryItem, useItemTeamItemContext, type InventoryItem } from '@/hooks/useInventory'
import { useUpsertItemAttributes } from '@/hooks/useAttributes'
import { useActiveWarrantyPolicies } from '@/hooks/useWarrantyPolicies'
import { useEffectiveWarranty } from '@/hooks/useEffectiveWarranty'
import { ItemAttributesSection } from '@/components/master-data/attributes/ItemAttributesSection'
import { useDivisions } from '@/hooks/useDivisions'
import { useItemEffectiveDivisions, useSetItemDivisions } from '@/hooks/useItemDivisions'
import { computeDivisionRows } from '@/lib/inventory/divisionRows'
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
  // Specification — an Inventory + Purchasing detail (never shown in Sales).
  // poSpecDefault = whether the spec shows on a PO line by default (default off).
  const [specification, setSpecification] = useState('')
  const [poSpecDefault, setPoSpecDefault] = useState(false)
  // Team-item override: null = inherit category, true = force team item, false = force normal.
  const [teamOverride, setTeamOverride] = useState<boolean | null>(null)
  const [attrValues, setAttrValues] = useState<Array<{ definition_id: string; option_id: string | null }>>([])
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const sessionUploadsRef = useRef<{ url: string; path: string }[]>([])
  const submittedRef      = useRef(false)
  const [assignedDivisionIds, setAssignedDivisionIds] = useState<string[]>([])
  const [assignOpen, setAssignOpen] = useState(true)

  const { data: divisions = [] } = useDivisions()
  // These per-item reads are gated on `open` — this dialog is mounted once per
  // ItemRow, so without the gate every row fires them while closed (a big N+1 on
  // the Inventory list). The seed effects below already key on `open` + data
  // arrival, so deferring the fetch to open changes nothing the operator sees.
  const { data: effDivs } = useItemEffectiveDivisions(open ? (item?.id ?? null) : null)
  const setItemDivisions = useSetItemDivisions()
  const { data: warrantyPolicies = [] } = useActiveWarrantyPolicies()
  const { data: effectiveWarranty } = useEffectiveWarranty(open ? (item?.id ?? null) : null)
  // Category default + item override for the team-item flag (fetched by id — the
  // list query that feeds `item` doesn't carry is_team_item).
  const { data: teamCtx } = useItemTeamItemContext(open ? categoryId : null, open ? (item?.id ?? null) : null)

  useEffect(() => {
    if (open) {
      setNameEn(item?.name_en ?? '')
      setNameAr(item?.name_ar ?? '')
      setSku(item?.sku ?? '')
      setUnit(item?.unit ?? 'Piece')
      setWarrantyPolicyId(item?.warranty_policy_id ?? null)
      setSpecification((item as unknown as { specification?: string | null } | null | undefined)?.specification ?? '')
      setPoSpecDefault((item as unknown as { po_specification_default?: boolean } | null | undefined)?.po_specification_default ?? false)
      setAttrValues([])
      setImageUrl((item as unknown as { image_url?: string | null } | null | undefined)?.image_url ?? null)
      setUploading(false)
    }
  }, [open, item])

  // Seed assigned divisions ONCE per open — either when the edit fetch first
  // resolves, or immediately for a create (no item, query disabled). A later
  // refetch must not clobber the operator's in-progress ticks. Only the
  // EXPLICIT (item-level) set seeds this state — inherited divisions are
  // rendered read-only from `effDivs.inherited` and never enter this array.
  const assignedSeededRef = useRef(false)
  useEffect(() => {
    if (!open) { assignedSeededRef.current = false; return }
    if (assignedSeededRef.current) return
    if (effDivs !== undefined) {
      setAssignedDivisionIds(effDivs.explicit)
      assignedSeededRef.current = true
    } else if (!item) {
      setAssignedDivisionIds([])
      assignedSeededRef.current = true
    }
  }, [open, effDivs, item])

  // Seed the team-item override ONCE per open — from the item's stored value on
  // edit (once teamCtx resolves), or null (inherit) on create.
  const teamSeededRef = useRef(false)
  useEffect(() => {
    if (!open) { teamSeededRef.current = false; return }
    if (teamSeededRef.current) return
    if (!isEdit) { setTeamOverride(null); teamSeededRef.current = true; return }
    if (teamCtx) { setTeamOverride(teamCtx.itemFlag); teamSeededRef.current = true }
  }, [open, isEdit, teamCtx])

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
        warrantyPolicyId !== (item?.warranty_policy_id ?? null) ||
        specification !== ((item as unknown as { specification?: string | null }).specification ?? '') ||
        poSpecDefault !== ((item as unknown as { po_specification_default?: boolean }).po_specification_default ?? false) ||
        imageUrl !== ((item as unknown as { image_url?: string | null }).image_url ?? null) ||
        attrValues.length > 0 ||
        JSON.stringify(assignedDivisionIds.slice().sort()) !==
          JSON.stringify((effDivs?.explicit ?? []).slice().sort()) ||
        teamOverride !== (teamCtx?.itemFlag ?? null)
      )
    : (
        nameEn.trim() !== '' ||
        nameAr.trim() !== '' ||
        sku.trim() !== '' ||
        unit !== 'Piece' ||
        specification.trim() !== '' ||
        poSpecDefault ||
        imageUrl !== null ||
        attrValues.length > 0 ||
        assignedDivisionIds.length > 0 ||
        teamOverride !== null
      )

  function handleOpenChange(next: boolean) {
    if (!next && !submittedRef.current) sweepSessionUploads()
    if (!next) submittedRef.current = false
    onOpenChange(next)
  }

   
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
      warranty_policy_id: warrantyPolicyId,
      specification: specification.trim() || null,
      po_specification_default: poSpecDefault,
      is_team_item: teamOverride,
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
      // Persist division assignments. On edit, only when the set changed AND the
      // current set has loaded — otherwise the seed is still the empty default and
      // saving a name-only edit before the fetch resolves would wipe real
      // assignments. On create, write whatever the user picked. `assignedDivisionIds`
      // only ever holds explicit ids (inherited rows are locked and can't be
      // toggled), so this never writes an inherited-only division id.
      const assignmentsChanged =
        JSON.stringify(assignedDivisionIds.slice().sort()) !==
        JSON.stringify((effDivs?.explicit ?? []).slice().sort())
      if (isEdit && item) {
        if (effDivs !== undefined && assignmentsChanged) {
          await setItemDivisions.mutateAsync({ itemId, divisionIds: assignedDivisionIds })
        }
      } else if (assignedDivisionIds.length > 0) {
        await setItemDivisions.mutateAsync({ itemId, divisionIds: assignedDivisionIds })
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
      <DialogContent className="w-full h-full rounded-none sm:h-auto sm:max-w-lg sm:rounded-lg max-h-[100vh] sm:max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Item' : 'New Item'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto min-h-0 space-y-4 py-1 pr-1">
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

          {/* Specification — an Inventory + Purchasing detail; never shown on sales documents. */}
          <div className="space-y-1.5">
            <Label htmlFor="item-specification">Specification</Label>
            <Textarea
              id="item-specification"
              value={specification}
              onChange={(e) => setSpecification(e.target.value)}
              rows={3}
              placeholder="Detailed specs — model, ratings, dimensions, material… (can be shown on POs; never on sales documents)"
              className="text-sm resize-y"
            />
            <label className="flex items-center gap-2 pt-0.5 cursor-pointer select-none">
              <Checkbox checked={poSpecDefault} onCheckedChange={(v) => setPoSpecDefault(v === true)} />
              <span className="text-[11px] text-muted-foreground">Show this specification on purchase orders by default</span>
            </label>
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

          {/* Team item — routes this item to the Team consumption tab (not for Tools) */}
          {categoryType !== 'tools' && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Team item</Label>
              <Select
                value={teamOverride === null ? '__inherit__' : teamOverride ? 'yes' : 'no'}
                onValueChange={(v) => { if (v === null) return; setTeamOverride(v === '__inherit__' ? null : v === 'yes') }}
              >
                <SelectTrigger className="h-10 w-full min-w-0">
                  <span className="truncate">
                    {teamOverride === null ? 'Inherit from category' : teamOverride ? 'Yes — team item' : 'No — not a team item'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__inherit__">Inherit from category</SelectItem>
                  <SelectItem value="yes">Yes — team item</SelectItem>
                  <SelectItem value="no">No — not a team item</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground leading-snug">
                {teamOverride === null
                  ? <>Inherits the category — currently <span className="font-medium text-foreground">{teamCtx?.categoryFlag ? 'a team item' : 'not a team item'}</span>. Team items are held by a team and consumed from the Team tab.</>
                  : teamOverride
                    ? 'Forced on — held by a team and consumed from the Team consumption tab.'
                    : 'Forced off — a normal Service item regardless of the category.'}
              </p>
            </div>
          )}

          <ItemAttributesSection
            itemId={item?.id ?? null}
            categoryId={categoryId}
            onChange={handleAttrChange}
          />

          {/* Assigned divisions (replaces the old D.12 Access & Sharing) */}
          <div className="rounded-md border border-dashed border-border">
            <button
              type="button"
              onClick={() => setAssignOpen((v) => !v)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors rounded-md"
            >
              {assignOpen
                ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium">Assigned divisions</span>
              {assignedDivisionIds.length > 0 && (
                <Badge variant="outline" className="ml-auto text-[10px] h-4 px-1.5">
                  Assigned to {assignedDivisionIds.length}
                </Badge>
              )}
            </button>
            {assignOpen && (
              <div className="px-3 pb-3 pt-1 space-y-2">
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Divisions that stock and work with this item. Each division keeps its own quantity pool; to move stock between divisions, use a transfer.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {computeDivisionRows(divisions.map((d) => d.id), {
                    editableIds: assignedDivisionIds,
                    lockedIds: effDivs?.inherited ?? [],
                  }).map((row) => {
                    const div = divisions.find((d) => d.id === row.id)
                    if (!div) return null
                    return (
                      <label
                        key={row.id}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded-md border border-transparent min-h-9 ${
                          row.locked ? 'opacity-70' : 'hover:border-border hover:bg-muted/30 cursor-pointer'
                        }`}
                      >
                        <Checkbox
                          checked={row.checked}
                          disabled={row.locked}
                          onCheckedChange={(v) => {
                            setAssignedDivisionIds((cur) =>
                              v ? [...cur, row.id] : cur.filter((id) => id !== row.id),
                            )
                          }}
                        />
                        <span className="text-xs flex-1 truncate">
                          {div.name}
                          {div.short_name && (
                            <span className="text-[10px] text-muted-foreground"> · {div.short_name}</span>
                          )}
                          {row.locked && (
                            <span className="text-[10px] text-muted-foreground"> · from category</span>
                          )}
                        </span>
                      </label>
                    )
                  })}
                </div>
                {assignedDivisionIds.length === 0 && (
                  <p className="text-[10px] text-muted-foreground italic">
                    Not assigned to any division yet — assign at least one so it appears in that division&apos;s pickers.
                  </p>
                )}
              </div>
            )}
          </div>
          </div>

          <DialogFooter className="bg-background pt-3 border-t">
            <Button type="button" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => guardedOnOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="min-h-11 sm:min-h-9" disabled={isPending || uploading}>
              {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Item'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>{confirmDialog}</>
  )
}
