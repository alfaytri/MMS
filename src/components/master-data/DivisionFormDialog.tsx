'use client'

import { useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { ImageIcon, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { useCreateDivision, useUpdateDivision, type Division } from '@/hooks/useDivisions'

// ─── Colour palette ────────────────────────────────────────────────────────────

const COLOR_PALETTE = [
  ['#2563eb', '#0ea5e9', '#06b6d4'],
  ['#10b981', '#22c55e', '#84cc16'],
  ['#eab308', '#f59e0b', '#f97316'],
  ['#ef4444', '#f43f5e', '#ec4899'],
  ['#a855f7', '#8b5cf6', '#6366f1'],
  ['#64748b', '#475569', '#334155', '#1e293b', '#0f172a'],
]

// ─── Schema ────────────────────────────────────────────────────────────────────

const divisionSchema = z.object({
  company_id:       z.string().uuid('Company is required'),
  name:             z.string().min(1, 'Name is required'),
  name_ar:          z.string().optional(),
  short_name:       z.string().optional(),
  slug:             z.string().min(1, 'Slug is required'),
  color:            z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a valid hex color'),
  address_en:       z.string().optional(),
  address_ar:       z.string().optional(),
  footer_motto:     z.string().max(120, 'Max 120 characters').optional(),
  logo_url:         z.string().url().optional().or(z.literal('')),
  stamp_url:        z.string().url().optional().or(z.literal('')),
  default_currency: z.string().min(1),
  default_tax_rate: z.string(),
  sort_order:       z.string(),
})

type DivisionFormValues = z.infer<typeof divisionSchema>

// ─── Props ─────────────────────────────────────────────────────────────────────

interface DivisionFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  division?: Division | null
  companyId?: string
  companies: { id: string; name_en: string }[]
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function DivisionFormDialog({
  open,
  onOpenChange,
  division,
  companyId,
  companies,
}: DivisionFormDialogProps) {
  const isEditing = !!division
  const create = useCreateDivision()
  const update = useUpdateDivision()
  const isPending = create.isPending || update.isPending

  const [isUploadingLogo, setIsUploadingLogo] = useState(false)
  const [isUploadingStamp, setIsUploadingStamp] = useState(false)

  const form = useForm<DivisionFormValues>({
    resolver: zodResolver(divisionSchema) as never,
    defaultValues: {
      company_id:       companyId ?? '',
      name:             '',
      name_ar:          '',
      short_name:       '',
      slug:             '',
      color:            '#2563eb',
      address_en:       '',
      address_ar:       '',
      footer_motto:     '',
      logo_url:         '',
      stamp_url:        '',
      default_currency: 'QAR',
      default_tax_rate: '0',
      sort_order:       '0',
    },
  })

  const currentColor = useWatch({ control: form.control, name: 'color' })
  const logoUrl = useWatch({ control: form.control, name: 'logo_url' })
  const stampUrl = useWatch({ control: form.control, name: 'stamp_url' })

  useEffect(() => {
    if (open && division) {
      form.reset({
        company_id:       division.company_id ?? '',
        name:             division.name,
        name_ar:          division.name_ar ?? '',
        short_name:       division.short_name ?? '',
        slug:             division.slug,
        color:            division.color,
        address_en:       division.address_en ?? '',
        address_ar:       division.address_ar ?? '',
        footer_motto:     division.footer_motto ?? '',
        logo_url:         division.logo_url ?? '',
        stamp_url:        division.stamp_url ?? '',
        default_currency: division.default_currency,
        default_tax_rate: String(division.default_tax_rate),
        sort_order:       String(division.sort_order),
      })
    } else if (open) {
      form.reset({
        company_id:       companyId ?? '',
        name:             '',
        name_ar:          '',
        short_name:       '',
        slug:             '',
        color:            '#2563eb',
        address_en:       '',
        address_ar:       '',
        footer_motto:     '',
        logo_url:         '',
        stamp_url:        '',
        default_currency: 'QAR',
        default_tax_rate: '0',
        sort_order:       '0',
      })
    }
  }, [open, division, companyId, form])

  async function handleUpload(
    file: File,
    field: 'logo_url' | 'stamp_url',
    setUploading: (v: boolean) => void
  ) {
    setUploading(true)
    try {
      const supabase = createClient()
      const safeName = `${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`
      const { error } = await supabase.storage
        .from('division-assets')
        .upload(safeName, file, { upsert: false })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage
        .from('division-assets')
        .getPublicUrl(safeName)
      form.setValue(field, publicUrl, { shouldValidate: true })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  function onSubmit(values: DivisionFormValues) {
    const payload = {
      ...values,
      company_id:       values.company_id,
      default_tax_rate: parseFloat(values.default_tax_rate) || 0,
      sort_order:       parseInt(values.sort_order, 10) || 0,
      short_name:       values.short_name || null,
      name_ar:          values.name_ar || null,
      address_en:       values.address_en || null,
      address_ar:       values.address_ar || null,
      logo_url:         values.logo_url || null,
      stamp_url:        values.stamp_url || null,
      footer_motto:     values.footer_motto || null,
    }

    if (isEditing && division) {
      update.mutate(
        { id: division.id, ...payload },
        {
          onSuccess: () => {
            toast.success('Division updated')
            onOpenChange(false)
          },
          onError: (err) => toast.error(err.message),
        }
      )
    } else {
      create.mutate(payload, {
        onSuccess: () => {
          toast.success('Division created')
          onOpenChange(false)
        },
        onError: (err) => toast.error(err.message),
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full md:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Division' : 'Add Division'}</DialogTitle>
          <DialogDescription>Create a new division with branding assets.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

            {/* ── 1. Company selector ─────────────────────────────────── */}
            <FormField
              control={form.control}
              name="company_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Company (Legal Entity) *</FormLabel>
                  {isEditing ? (
                    <p className="text-sm text-muted-foreground">
                      {companies.find((c) => c.id === field.value)?.name_en ?? field.value}
                    </p>
                  ) : (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select company" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {companies.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name_en}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* ── 2. Name + Short Name ─────────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name *</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="short_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Short Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. AFM" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* ── Slug ─────────────────────────────────────────────────── */}
            <FormField
              control={form.control}
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Slug *</FormLabel>
                  <FormControl>
                    <Input placeholder="alfaytri-maintenance" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* ── 3. Brand Color ───────────────────────────────────────── */}
            <FormField
              control={form.control}
              name="color"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Brand Color</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      placeholder="#2563eb"
                      maxLength={7}
                      {...field}
                      onChange={(e) => {
                        field.onChange(e)
                      }}
                    />
                  </FormControl>
                  {/* Swatch grid */}
                  <div className="flex flex-col gap-1 pt-1">
                    {COLOR_PALETTE.map((row, ri) => (
                      <div key={ri} className="flex gap-1 flex-wrap">
                        {row.map((hex) => (
                          <button
                            key={hex}
                            type="button"
                            title={hex}
                            style={{ backgroundColor: hex }}
                            className={`w-6 h-6 rounded cursor-pointer border-2 transition-colors ${
                              currentColor?.toLowerCase() === hex.toLowerCase()
                                ? 'border-foreground'
                                : 'border-transparent'
                            }`}
                            onClick={() =>
                              form.setValue('color', hex, { shouldValidate: true })
                            }
                          />
                        ))}
                        {/* Live preview swatch at end of first row */}
                        {ri === 0 && currentColor && /^#[0-9a-fA-F]{6}$/.test(currentColor) && (
                          <span
                            className="w-6 h-6 rounded border border-border ml-1"
                            style={{ backgroundColor: currentColor }}
                            title="Current color"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* ── 4. Division Name (AR) ────────────────────────────────── */}
            <FormField
              control={form.control}
              name="name_ar"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Division Name (Arabic)</FormLabel>
                  <FormControl>
                    <Input
                      dir="rtl"
                      placeholder="e.g. صيانة الفايتري"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* ── 5. Address EN + AR ───────────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="address_en"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address (EN)</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="address_ar"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address (AR)</FormLabel>
                    <FormControl>
                      <Input dir="rtl" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* ── 6. Footer Motto ──────────────────────────────────────── */}
            <FormField
              control={form.control}
              name="footer_motto"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Footer Motto</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Quality Service Since 2010"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* ── 7. Logo + Stamp upload ───────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Logo */}
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium leading-none">Logo</span>
                <label className="cursor-pointer">
                  <div className="border-2 border-dashed rounded-lg p-4 flex flex-col items-center justify-center gap-1 min-h-[100px]">
                    {isUploadingLogo ? (
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    ) : logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={logoUrl}
                        alt="Logo preview"
                        className="h-16 w-auto object-contain"
                      />
                    ) : (
                      <>
                        <ImageIcon className="h-6 w-6 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Upload Logo</span>
                      </>
                    )}
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={isUploadingLogo}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleUpload(file, 'logo_url', setIsUploadingLogo)
                    }}
                  />
                </label>
              </div>

              {/* Stamp */}
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium leading-none">Stamp</span>
                <label className="cursor-pointer">
                  <div className="border-2 border-dashed rounded-lg p-4 flex flex-col items-center justify-center gap-1 min-h-[100px]">
                    {isUploadingStamp ? (
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    ) : stampUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={stampUrl}
                        alt="Stamp preview"
                        className="h-16 w-auto object-contain"
                      />
                    ) : (
                      <>
                        <ImageIcon className="h-6 w-6 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Upload Stamp</span>
                      </>
                    )}
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={isUploadingStamp}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleUpload(file, 'stamp_url', setIsUploadingStamp)
                    }}
                  />
                </label>
              </div>
            </div>

            {/* ── 8. Currency + Tax Rate + Sort Order ──────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="default_currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Currency</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="default_tax_rate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tax Rate (%)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sort_order"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sort Order</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* ── 9. Footer ────────────────────────────────────────────── */}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPending || isUploadingLogo || isUploadingStamp}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-orange-500 hover:bg-orange-600 text-white"
                disabled={isPending || isUploadingLogo || isUploadingStamp}
              >
                {isPending ? 'Saving…' : isEditing ? 'Update Division' : 'Add Division'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
