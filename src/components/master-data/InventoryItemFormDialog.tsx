'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Camera, Loader2, X } from 'lucide-react'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ItemPhoto } from '@/components/shared/ItemPhoto'
import {
  useCreateInventoryItem, useUpdateInventoryItem,
  type InventoryItem,
} from '@/hooks/useInventory'
import { useAllCategoriesFlat, breadcrumb as getBreadcrumb } from '@/hooks/useInventoryTree'
import { compressImageBeforeUpload } from '@/lib/compressImage'
import { createClient } from '@/lib/supabase/client'
import { useDirtyDialogGuard } from '@/hooks/useDirtyDialogGuard'

const PHOTO_BUCKET = 'inventory-item-photos'

const itemSchema = z.object({
  category_id: z.string().min(1, 'Category is required'),
  name_en: z.string().min(1, 'Name is required'),
  name_ar: z.string().optional().default(''),
  sku: z.string().min(1, 'SKU is required'),
  unit: z.string().min(1, 'Unit is required'),
  cost_price: z.coerce.number().min(0).default(0),
  warranty_months: z.coerce.number().int().min(0).optional(),
  sort_order: z.coerce.number().int().default(0),
  image_url: z.string().url().nullable().optional(),
})

type ItemFormValues = z.infer<typeof itemSchema>

interface InventoryItemFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item?: InventoryItem | null
  defaultCategoryId?: string
}

export function InventoryItemFormDialog({ open, onOpenChange, item, defaultCategoryId }: InventoryItemFormDialogProps) {
  const isEditing = !!item
  const create = useCreateInventoryItem()
  const update = useUpdateInventoryItem()
  const { data: allCategories } = useAllCategoriesFlat()
  const categories = useMemo(
    () => (allCategories ?? []).filter((c) => {
      const hasChildren = (allCategories ?? []).some((child) => child.parent_id === c.id)
      return !hasChildren
    }),
    [allCategories],
  )
  const isPending = create.isPending || update.isPending

  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Track paths uploaded THIS dialog session so we can sweep them on cancel.
  // Photo-replace within a session also removes the superseded upload here.
  const sessionUploadsRef = useRef<{ url: string; path: string }[]>([])
  const submittedRef      = useRef(false)

  const form = useForm<ItemFormValues>({
    resolver: zodResolver(itemSchema) as never,
    defaultValues: {
      category_id: defaultCategoryId ?? '', name_en: '', name_ar: '', sku: '', unit: 'pcs',
      cost_price: 0, warranty_months: undefined, sort_order: 0, image_url: null,
    },
  })

  const imageUrl = form.watch('image_url')

  useEffect(() => {
    if (open && item) {
      form.reset({
        category_id: item.category_id,
        name_en: item.name_en,
        name_ar: item.name_ar ?? '',
        sku: item.sku,
        unit: item.unit,
        cost_price: Number(item.cost_price ?? 0),
        warranty_months: (item as unknown as { warranty_months?: number | null }).warranty_months ?? undefined,
        sort_order: item.sort_order,
        image_url: (item as unknown as { image_url?: string | null }).image_url ?? null,
      })
    } else if (open) {
      form.reset({
        category_id: defaultCategoryId ?? '', name_en: '', name_ar: '', sku: '', unit: 'pcs',
        cost_price: 0, warranty_months: undefined, sort_order: 0, image_url: null,
      })
    }
  }, [open, item, defaultCategoryId, form])

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
      const { error: upErr } = await supabase.storage.from(PHOTO_BUCKET).upload(path, compressed)
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path)

      // Photo-replace within one session: drop the superseded upload NOW
      // rather than waiting for cancel — otherwise a user hitting Change 3×
      // leaves 3 orphans behind on save.
      const supersededPaths = sessionUploadsRef.current.map((u) => u.path)
      if (supersededPaths.length > 0) {
        void supabase.storage.from(PHOTO_BUCKET).remove(supersededPaths).catch(() => {})
      }
      sessionUploadsRef.current = [{ url: pub.publicUrl, path }]
      form.setValue('image_url', pub.publicUrl, { shouldDirty: true })
    } catch (err) {
      toast.error(`Photo upload failed: ${(err as Error).message}`)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function handlePhotoRemove() {
    const currentUrl = form.getValues('image_url')
    const sessionMatch = sessionUploadsRef.current.find((u) => u.url === currentUrl)
    if (sessionMatch) {
      const supabase = createClient()
      void supabase.storage.from(PHOTO_BUCKET).remove([sessionMatch.path]).catch(() => {})
      sessionUploadsRef.current = sessionUploadsRef.current.filter((u) => u.url !== currentUrl)
    }
    form.setValue('image_url', null, { shouldDirty: true })
  }

  function sweepSessionUploads() {
    const paths = sessionUploadsRef.current.map((u) => u.path)
    if (paths.length === 0) return
    sessionUploadsRef.current = []
    const supabase = createClient()
    void supabase.storage.from(PHOTO_BUCKET).remove(paths).catch(() => {})
  }

  function handleOpenChange(next: boolean) {
    if (!next && !submittedRef.current) sweepSessionUploads()
    if (!next) submittedRef.current = false
    onOpenChange(next)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (!submittedRef.current) sweepSessionUploads() }, [])

  // Subscribe to every field so this component re-renders on any keystroke.
  // Without this, only `form.watch('image_url')` triggers re-renders — typing
  // in other fields leaves `formState.isDirty` stale in the outer closure and
  // click-outside closes without prompting.
  useWatch({ control: form.control })

  const { guardedOnOpenChange, confirmDialog } = useDirtyDialogGuard({
    isDirty: form.formState.isDirty,
    onOpenChange: handleOpenChange,
  })

  function onSubmit(values: ItemFormValues) {
    const payload = {
      ...values,
      name_ar: values.name_ar || null,
      warranty_months: values.warranty_months ?? null,
      image_url: values.image_url ?? null,
    }
    const mutation = isEditing
      ? () => update.mutateAsync({ id: item!.id, ...payload })
      : () => create.mutateAsync(payload)

    mutation()
      .then(() => {
        sessionUploadsRef.current = []
        submittedRef.current = true
        toast.success(`Item ${isEditing ? 'updated' : 'created'}`)
        handleOpenChange(false)
      })
      .catch((err: Error) => toast.error(err.message))
  }

  return (
    <><Dialog open={open} onOpenChange={guardedOnOpenChange}>
      <DialogContent className="w-full max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit' : 'Add'} Inventory Item</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Photo — thumbnail + change / remove */}
            <div className="flex items-start gap-3">
              <ItemPhoto url={imageUrl} name={form.watch('name_en')} size={64} />
              <div className="flex-1 space-y-1.5">
                <FormLabel className="text-xs">Photo</FormLabel>
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

            <FormField control={form.control} name="category_id" render={({ field }) => (
              <FormItem><FormLabel>Category *</FormLabel><FormControl>
                <select {...field} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm">
                  <option value="">Select category</option>
                  {categories?.map((c) => <option key={c.id} value={c.id}>{getBreadcrumb(c.id, allCategories ?? [])}</option>)}
                </select>
              </FormControl><FormMessage /></FormItem>
            )} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="name_en" render={({ field }) => (
                <FormItem><FormLabel>Name (English) *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="name_ar" render={({ field }) => (
                <FormItem><FormLabel>Name (Arabic)</FormLabel><FormControl><Input dir="rtl" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField control={form.control} name="sku" render={({ field }) => (
                <FormItem><FormLabel>SKU *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="unit" render={({ field }) => (
                <FormItem><FormLabel>Unit *</FormLabel><FormControl><Input placeholder="pcs, kg, L" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="cost_price" render={({ field }) => (
                <FormItem><FormLabel>Cost Price</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </div>
            <FormField control={form.control} name="warranty_months" render={({ field }) => (
              <FormItem><FormLabel>Warranty (months)</FormLabel><FormControl><Input type="number" {...field} value={field.value ?? ''} /></FormControl><FormMessage /></FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => guardedOnOpenChange(false)} disabled={isPending}>Cancel</Button>
              <Button type="submit" disabled={isPending || uploading}>{isPending ? 'Saving…' : isEditing ? 'Update' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>{confirmDialog}</>
  )
}
